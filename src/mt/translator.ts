import type { Cue } from '../core/contracts';
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
  subtitleTranslationSystemPrompt,
  type SubtitlePromptProfile,
} from './prompt';
import { formatSubtitleTranslation } from './subtitle-format';

export { subtitleTranslationSystemPrompt } from './prompt';

export interface TranslateBatchInput {
  readonly contentId: string;
  readonly trackId: string;
  readonly promptProfile: SubtitlePromptProfile;
  readonly targetLanguage: 'en' | 'zh-Hant';
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
  targetLanguage: 'en' | 'zh-Hant',
  config: TranslationConfig,
  dependencies: TranslatorDependencies,
): Promise<readonly string[] | 'aborted' | undefined> {
  const fetcher = dependencies.fetch ?? fetch;
  const sleep = dependencies.sleep ?? abortableSleep;
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
          translationRequestBody(cues, promptProfile, targetLanguage, config),
        ),
        signal: dependencies.signal,
      });
      if (response.ok) {
        const payload = await response.json() as unknown;
        const content = usesResponsesApi(config.provider)
          ? readResponsesText(payload)
          : readChatCompletionsText(payload);
        if (content === undefined) return undefined;
        const parsed = JSON.parse(content) as unknown;
        return readTranslations(parsed, cues.length);
      }
      if (response.status !== 429 && response.status < 500) return undefined;
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

function translationRequestBody(
  cues: readonly Cue[],
  promptProfile: SubtitlePromptProfile,
  targetLanguage: 'en' | 'zh-Hant',
  config: TranslationConfig,
): Record<string, unknown> {
  const messages = [
    {
      role: 'system',
      content: subtitleTranslationSystemPrompt(promptProfile, targetLanguage),
    },
    {
      role: 'user',
      content: JSON.stringify({
        cues: cues.map((cue, id) => ({
          id,
          start_ms: Math.round(cue.start),
          end_ms: Math.round(cue.end),
          duration_ms: Math.max(1, Math.round(cue.end - cue.start)),
          max_reading_units: maximumReadingUnits(
            cue,
            promptProfile,
            targetLanguage,
          ),
          text: cue.text,
        })),
      }),
    },
  ];
  return {
    model: config.model,
    temperature: 0,
    ...translationProviderOptions(config),
    ...(usesResponsesApi(config.provider)
      ? { input: messages }
      : { messages }),
  };
}

function translationProviderOptions(
  config: TranslationConfig,
): Record<string, unknown> {
  switch (config.provider) {
    case 'deepseek':
      return {
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        max_tokens: 4_096,
      };
    case 'qwen-cn':
    case 'qwen-sg':
      return {
        reasoning: {
          effort: config.webSearchEnabled ? 'low' : 'none',
        },
        store: false,
        ...(config.webSearchEnabled
          ? { tools: [{ type: 'web_search' }] }
          : {}),
      };
    case 'doubao':
      return {
        thinking: { type: 'disabled' },
        text: { format: { type: 'json_object' } },
        max_output_tokens: 4_096,
        store: false,
      };
    default:
      return {};
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function maximumReadingUnits(
  cue: Cue,
  promptProfile: SubtitlePromptProfile,
  targetLanguage: 'en' | 'zh-Hant',
): number {
  const durationSeconds = Math.max(1, (cue.end - cue.start) / 1_000);
  const hardLimitPerSecond = targetLanguage === 'zh-Hant'
    ? promptProfile === 'film-tv' ? 9 : 11
    : 20;
  return Math.floor(durationSeconds * hardLimitPerSecond);
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
  if (translations.every((item) => typeof item === 'string')) {
    return translations;
  }
  const items = translations.map((item, id) =>
    isRecord(item) && item.id === id && typeof item.text === 'string'
      ? item.text
      : undefined
  );
  return items.every((item): item is string => item !== undefined)
    ? items
    : undefined;
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
