import type { Cue, TranslationTargetLanguage } from '../core/contracts';
import {
  translationCacheKey,
  type IndexedDbTranslationCache,
} from './cache';
import {
  translationRequestUrl,
  usesResponsesApi,
  validateTranslationConfig,
  type TranslationConfig,
} from './config';
import {
  SUBTITLE_PROMPT_VERSION,
  SUBTITLE_SEGMENT_SEPARATOR,
  subtitleTranslationSystemPrompt,
  subtitleTranslationUserPrompt,
  type SubtitleOutputProtocol,
  type SubtitlePromptProfile,
} from './prompt';
import { formatSubtitleTranslation } from './subtitle-format';

export { subtitleTranslationSystemPrompt } from './prompt';

export interface TranslateBatchInput {
  readonly contentId: string;
  readonly trackId: string;
  readonly promptProfile: SubtitlePromptProfile;
  readonly targetLanguage: TranslationTargetLanguage;
  readonly cues: readonly Cue[];
  readonly config: TranslationConfig;
  readonly skipCache?: boolean;
}

export interface TranslationCache {
  get(key: string): ReturnType<IndexedDbTranslationCache['get']>;
  put(key: string, value: string): Promise<void>;
}

export type TranslateBatchResult =
  | { readonly status: 'ok' | 'failed'; readonly cues: readonly Cue[] }
  | { readonly status: 'missing-key' | 'aborted'; readonly cues: readonly [] };

export interface TranslatorDependencies {
  readonly fetch?: typeof globalThis.fetch;
  readonly cache?: TranslationCache;
  readonly signal?: AbortSignal;
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

const RETRY_DELAYS_MS = [250, 750] as const;
const QWEN_TRANSLATION_FUNCTION = 'return_subtitle_translations';

export async function translateCueBatch(
  input: TranslateBatchInput,
  dependencies: TranslatorDependencies = {},
): Promise<TranslateBatchResult> {
  if (dependencies.signal?.aborted) return { status: 'aborted', cues: [] };
  const validation = validateTranslationConfig(input.config);
  if (
    !validation.ok &&
    input.config.provider !== 'local' &&
    input.config.apiKey === ''
  ) {
    return { status: 'missing-key', cues: [] };
  }
  if (!validation.ok) return failed(input);

  const translated = new Array<string | undefined>(input.cues.length);
  const missing: number[] = [];
  const keys = await Promise.all(input.cues.map((cue) =>
    translationCacheKey({
      contentId: input.contentId,
      trackId: input.trackId,
      sourceText: cue.text,
      sourceStartMs: cue.start,
      sourceEndMs: cue.end,
      targetLanguage: input.targetLanguage,
      promptProfile: input.promptProfile,
      promptVersion: SUBTITLE_PROMPT_VERSION,
      provider: validation.config.provider,
      endpoint: validation.config.baseUrl,
      model: validation.config.model,
      webSearchEnabled: validation.config.webSearchEnabled,
    })
  ));

  for (let index = 0; index < input.cues.length; index += 1) {
    const cached = !input.skipCache && dependencies.cache
      ? await dependencies.cache.get(keys[index]!)
      : { hit: false as const };
    if (cached.hit) translated[index] = cached.value;
    else missing.push(index);
  }

  if (missing.length > 0) {
    const response = await requestTranslations(
      missing.map((index) => input.cues[index]!),
      input.promptProfile,
      input.targetLanguage,
      validation.config,
      dependencies,
    );
    if (response === 'aborted') return { status: 'aborted', cues: [] };
    if (response === undefined || response.length !== missing.length) {
      return failed(input);
    }
    for (let offset = 0; offset < missing.length; offset += 1) {
      if (dependencies.signal?.aborted) return { status: 'aborted', cues: [] };
      const cueIndex = missing[offset]!;
      const rawText = response[offset]?.trim();
      const text = rawText
        ? formatSubtitleTranslation(
            rawText,
            input.promptProfile,
            input.targetLanguage,
          )
        : undefined;
      if (!text) return failed(input);
      translated[cueIndex] = text;
      await dependencies.cache?.put(keys[cueIndex]!, text);
    }
  }

  return {
    status: 'ok',
    cues: input.cues.map((cue, index) => ({
      ...cue,
      text: translated[index]!,
      language: input.targetLanguage,
    })),
  };
}

async function requestTranslations(
  cues: readonly Cue[],
  promptProfile: SubtitlePromptProfile,
  targetLanguage: TranslationTargetLanguage,
  config: TranslationConfig,
  dependencies: TranslatorDependencies,
): Promise<readonly string[] | 'aborted' | undefined> {
  const translationUnits = expandDisplayedLines(cues);
  const fetcher = dependencies.fetch ?? fetch;
  const sleep = dependencies.sleep ?? abortableSleep;
  let formatRepair:
    | { readonly receivedSegments: number }
    | undefined;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (dependencies.signal?.aborted) return 'aborted';
    try {
      const response = await fetcher(translationRequestUrl(config), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify(
          translationRequestBody(
            translationUnits.cues,
            promptProfile,
            targetLanguage,
            config,
            formatRepair,
          ),
        ),
        signal: dependencies.signal,
      });
      if (response.ok) {
        const payload = await response.json() as unknown;
        const content = usesResponsesApi(config.provider)
          ? readResponsesText(payload)
          : readChatCompletionsText(payload);
        const translations = usesResponsesApi(config.provider)
          ? readResponsesTranslations(payload, translationUnits.cues.length)
          : content === undefined
          ? undefined
          : readTranslationContent(content, translationUnits.cues.length);
        if (translations !== undefined) {
          return collapseDisplayedLines(
            translations,
            translationUnits.lineCounts,
          );
        }
        formatRepair = {
          receivedSegments: usesResponsesApi(config.provider)
            ? countResponsesTranslationSegments(payload)
            : content === undefined
            ? 0
            : countTranslationSegments(content),
        };
      }
      if (
        !response.ok &&
        response.status !== 429 &&
        response.status < 500
      ) {
        return undefined;
      }
    } catch (error) {
      if (dependencies.signal?.aborted || isAbortError(error)) return 'aborted';
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) break;
    try {
      await sleep(delay, dependencies.signal);
    } catch {
      return 'aborted';
    }
  }
  return undefined;
}

function expandDisplayedLines(
  cues: readonly Cue[],
): {
  readonly cues: readonly Cue[];
  readonly lineCounts: readonly number[];
} {
  const lineCounts: number[] = [];
  const expanded: Cue[] = [];
  for (const cue of cues) {
    const lines = cue.text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line !== '');
    const translationLines = lines.length > 0 ? lines : [cue.text];
    lineCounts.push(translationLines.length);
    expanded.push(
      ...translationLines.map((text) => ({ ...cue, text })),
    );
  }
  return { cues: expanded, lineCounts };
}

function collapseDisplayedLines(
  translations: readonly string[],
  lineCounts: readonly number[],
): readonly string[] {
  const collapsed: string[] = [];
  let offset = 0;
  for (const lineCount of lineCounts) {
    collapsed.push(
      translations.slice(offset, offset + lineCount).join('\n'),
    );
    offset += lineCount;
  }
  return collapsed;
}

function translationRequestBody(
  cues: readonly Cue[],
  promptProfile: SubtitlePromptProfile,
  targetLanguage: TranslationTargetLanguage,
  config: TranslationConfig,
  formatRepair?: { readonly receivedSegments: number },
): Record<string, unknown> {
  const outputProtocol = qwenFunctionOutput(config)
    ? 'qwen-function'
    : 'separator';
  const messages = [
    {
      role: 'system',
      content: subtitleTranslationSystemPrompt(
        promptProfile,
        targetLanguage,
        outputProtocol,
      ),
    },
    {
      role: 'user',
      content: translationUserContent(
        cues,
        targetLanguage,
        formatRepair,
        outputProtocol,
      ),
    },
  ];
  return {
    model: config.model,
    temperature: 0,
    ...translationProviderOptions(config, cues.length),
    ...(usesResponsesApi(config.provider)
      ? { input: messages }
      : { messages }),
  };
}

function translationUserContent(
  cues: readonly Cue[],
  targetLanguage: TranslationTargetLanguage,
  formatRepair?: { readonly receivedSegments: number },
  outputProtocol: SubtitleOutputProtocol = 'separator',
): string {
  const source = subtitleTranslationUserPrompt(
    cues.map((cue) => cue.text),
    targetLanguage,
  );
  if (formatRepair === undefined) return source;
  const expectedSegments = cues.length;
  if (outputProtocol === 'qwen-function') {
    return [
      'FUNCTION ARGUMENT CORRECTION REQUIRED',
      `The previous function call contained ${formatRepair.receivedSegments} translation objects, but this source requires exactly ${expectedSegments}.`,
      `Call ${QWEN_TRANSLATION_FUNCTION} exactly once with IDs 0 through ${expectedSegments - 1}, in order, and one non-empty text value for every ID.`,
      'Do not merge positions, omit meaning, add commentary, or output assistant text.',
      '',
      source,
    ].join('\n');
  }
  const separatorCount = Math.max(0, expectedSegments - 1);
  return [
    'FORMAT CORRECTION REQUIRED',
    `The previous response contained ${formatRepair.receivedSegments} output segments, but this source requires exactly ${expectedSegments} non-empty output segments.`,
    `Retry with exactly ${separatorCount} standalone %% separator lines. Keep one non-empty output position for every source position, even when several positions form one sentence.`,
    'Do not merge positions, omit meaning, add commentary, or output numbering.',
    '',
    source,
  ].join('\n');
}

function translationProviderOptions(
  config: TranslationConfig,
  expectedSegments: number,
): Record<string, unknown> {
  switch (config.provider) {
    case 'deepseek':
      return {
        thinking: { type: 'disabled' },
        max_tokens: 4_096,
      };
    case 'qwen-cn':
    case 'qwen-sg':
      return {
        reasoning: {
          effort: 'none',
        },
        store: false,
        ...(qwenFunctionOutput(config)
          ? {
              tools: [qwenTranslationTool(expectedSegments)],
              tool_choice: 'required',
            }
          : { tools: [{ type: 'web_search' }] }),
      };
    case 'doubao':
      return {
        thinking: { type: 'disabled' },
        max_output_tokens: 4_096,
        store: false,
      };
    default:
      return {};
  }
}

function qwenFunctionOutput(config: TranslationConfig): boolean {
  return (
    config.provider === 'qwen-cn' ||
    config.provider === 'qwen-sg'
  ) && !config.webSearchEnabled;
}

function qwenTranslationTool(
  expectedSegments: number,
): Record<string, unknown> {
  return {
    type: 'function',
    name: QWEN_TRANSLATION_FUNCTION,
    description:
      `Return exactly ${expectedSegments} ordered subtitle translations without merging or omitting source positions.`,
    parameters: {
      type: 'object',
      properties: {
        translations: {
          type: 'array',
          minItems: expectedSegments,
          maxItems: expectedSegments,
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'integer',
                minimum: 0,
                maximum: Math.max(0, expectedSegments - 1),
              },
              text: {
                type: 'string',
                minLength: 1,
              },
            },
            required: ['id', 'text'],
            additionalProperties: false,
          },
        },
      },
      required: ['translations'],
      additionalProperties: false,
    },
  };
}

function readChatCompletionsText(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.choices)) return undefined;
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return undefined;
  return typeof choice.message.content === 'string'
    ? choice.message.content
    : undefined;
}

function readResponsesText(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.output)) return undefined;
  const parts = value.output.flatMap((item) => {
    if (
      !isRecord(item) ||
      item.type !== 'message' ||
      !Array.isArray(item.content)
    ) {
      return [];
    }
    return item.content.flatMap((content) =>
      isRecord(content) &&
        content.type === 'output_text' &&
        typeof content.text === 'string'
        ? [content.text]
        : []
    );
  });
  return parts.length > 0 ? parts.join('') : undefined;
}

function readResponsesTranslations(
  value: unknown,
  expectedLength: number,
): readonly string[] | undefined {
  const argumentsText = readResponsesFunctionArguments(value);
  if (argumentsText !== undefined) {
    try {
      const translations = readTranslations(
        JSON.parse(argumentsText) as unknown,
        expectedLength,
      );
      if (translations !== undefined) return translations;
    } catch {
      // Fall through to a message response or a bounded format retry.
    }
  }
  const content = readResponsesText(value);
  return content === undefined
    ? undefined
    : readTranslationContent(content, expectedLength);
}

function readResponsesFunctionArguments(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.output)) return undefined;
  const call = value.output.find((item) =>
    isRecord(item) &&
    item.type === 'function_call' &&
    item.name === QWEN_TRANSLATION_FUNCTION &&
    typeof item.arguments === 'string'
  );
  return isRecord(call) && typeof call.arguments === 'string'
    ? call.arguments
    : undefined;
}

function countResponsesTranslationSegments(value: unknown): number {
  const argumentsText = readResponsesFunctionArguments(value);
  if (argumentsText !== undefined) {
    try {
      const parsed = JSON.parse(argumentsText) as unknown;
      if (isRecord(parsed) && Array.isArray(parsed.translations)) {
        return parsed.translations.length;
      }
    } catch {
      return 0;
    }
  }
  const content = readResponsesText(value);
  return content === undefined ? 0 : countTranslationSegments(content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readTranslations(
  value: unknown,
  expectedLength: number,
): readonly string[] | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('translations' in value)
  ) {
    return undefined;
  }
  const translations = value.translations;
  if (!Array.isArray(translations) || translations.length !== expectedLength) {
    return undefined;
  }
  if (
    translations.every((item) =>
      typeof item === 'string' && item.trim() !== ''
    )
  ) {
    return translations;
  }
  const items = translations.map((item, id) =>
    isRecord(item) &&
      item.id === id &&
      typeof item.text === 'string' &&
      item.text.trim() !== ''
      ? item.text
      : undefined
  );
  return items.every((item): item is string => item !== undefined)
    ? items
    : undefined;
}

function readTranslationContent(
  content: string,
  expectedLength: number,
): readonly string[] | undefined {
  const trimmed = content.trim();
  if (trimmed === '') return undefined;

  try {
    const legacy = readTranslations(
      JSON.parse(trimmed) as unknown,
      expectedLength,
    );
    if (legacy !== undefined) return legacy;
  } catch {
    // Current subtitle prompts use %% separators; legacy JSON remains readable.
  }

  if (expectedLength === 1) return [trimmed];
  const separator = SUBTITLE_SEGMENT_SEPARATOR.trim();
  const translations = trimmed
    .split(new RegExp(`\\r?\\n\\s*${separator}\\s*\\r?\\n`, 'u'))
    .map((text) => text.trim());
  return translations.length === expectedLength &&
      translations.every((text) => text !== '')
    ? translations
    : undefined;
}

function countTranslationSegments(content: string): number {
  const trimmed = content.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/\r?\n\s*%%\s*\r?\n/u).length;
}

function failed(input: TranslateBatchInput): TranslateBatchResult {
  return {
    status: 'failed',
    cues: input.cues.map((cue) => ({
      ...cue,
      text: '翻譯失敗',
      language: input.targetLanguage,
    })),
  };
}

function abortableSleep(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
