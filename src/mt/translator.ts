import type { Cue } from '../core/contracts';
import {
  translationCacheKey,
  type IndexedDbTranslationCache,
} from './cache';
import {
  chatCompletionsUrl,
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
      const response = await fetcher(chatCompletionsUrl(config), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content: targetLanguage === 'zh-Hant'
                ? 'Translate each JSON array item to Traditional Chinese. Return only a JSON array of strings in the same order.'
                : 'Translate each JSON array item to English. Return only a JSON array of strings in the same order.',
            },
            { role: 'user', content: JSON.stringify(texts) },
          ],
        }),
        signal: dependencies.signal,
      });
      if (response.ok) {
        const payload = await response.json() as {
          choices?: Array<{ message?: { content?: unknown } }>;
        };
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== 'string') return undefined;
        const parsed = JSON.parse(content) as unknown;
        return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
          ? parsed
          : undefined;
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
