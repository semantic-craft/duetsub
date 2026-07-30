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

export interface TranslateBatchInput {
  readonly contentId: string;
  readonly trackId: string;
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
      targetLanguage: input.targetLanguage,
      provider: validation.config.provider,
      endpoint: validation.config.baseUrl,
      model: validation.config.model,
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
      missing.map((index) => input.cues[index]!.text),
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
      const text = response[offset]?.trim();
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
  texts: readonly string[],
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
          translationRequestBody(texts, targetLanguage, config),
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
        const translations = readTranslations(parsed);
        return translations?.length === texts.length ? translations : undefined;
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
  texts: readonly string[],
  targetLanguage: 'en' | 'zh-Hant',
  config: TranslationConfig,
): Record<string, unknown> {
  const messages = [
    {
      role: 'system',
      content: translationSystemPrompt(targetLanguage),
    },
    {
      role: 'user',
      content: JSON.stringify({ texts }),
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
        reasoning: { effort: 'none' },
        store: false,
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

function translationSystemPrompt(
  targetLanguage: 'en' | 'zh-Hant',
): string {
  const target = targetLanguage === 'zh-Hant'
    ? 'natural Traditional Chinese (zh-Hant), never Simplified Chinese'
    : 'natural English';
  return [
    'You are a professional audiovisual subtitle translator.',
    `Translate every item in the input JSON object's "texts" array into ${target}.`,
    'Preserve meaning, tone, proper nouns, punctuation, and line breaks.',
    'Write concise subtitles. Do not merge, split, omit, annotate, or reorder items.',
    'Return only valid JSON. Do not add Markdown or explanations.',
    'The "translations" array must contain exactly one string for each input item, in the same order.',
    'JSON OUTPUT EXAMPLE:',
    '{"translations":["translated item 1","translated item 2"]}',
  ].join('\n');
}

function readTranslations(value: unknown): readonly string[] | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('translations' in value)
  ) {
    return undefined;
  }
  const translations = value.translations;
  return Array.isArray(translations) &&
      translations.every((item) => typeof item === 'string')
    ? translations
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
