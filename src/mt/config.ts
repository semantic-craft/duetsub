export type TranslationProvider =
  | 'deepseek'
  | 'openai-compatible'
  | 'local';

export interface TranslationConfig {
  readonly provider: TranslationProvider;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

export const TRANSLATION_CONFIG_STORAGE_KEY = 'duetsub:translation-config';
export const DEFAULT_TRANSLATION_CONFIG: TranslationConfig = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
};

export type ConfigValidation =
  | { readonly ok: true; readonly config: TranslationConfig }
  | { readonly ok: false; readonly error: string };

export function validateTranslationConfig(
  input: TranslationConfig,
): ConfigValidation {
  if (!input.model.trim()) return failure('請填寫模型名稱');
  let url: URL;
  try {
    url = new URL(input.baseUrl.trim());
  } catch {
    return failure('Base URL 無效');
  }
  if (url.username || url.password) return failure('Base URL 不得包含憑據');
  if (url.search || url.hash) return failure('Base URL 不得包含查詢或片段');
  const loopback = isLoopback(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    return failure('雲端服務必須使用 HTTPS；HTTP 僅限本機 loopback');
  }
  if (input.provider === 'local' && !loopback) {
    return failure('本地服務必須使用 localhost 或 loopback 位址');
  }
  if (input.provider !== 'local' && !input.apiKey) {
    return failure('雲端服務需要 API key');
  }
  return {
    ok: true,
    config: {
      ...input,
      baseUrl: url.href.replace(/\/$/, ''),
      model: input.model.trim(),
    },
  };
}

export function configPermissionOrigin(config: TranslationConfig): string {
  const url = new URL(config.baseUrl);
  return `${url.protocol}//${url.hostname}/*`;
}

export function chatCompletionsUrl(config: TranslationConfig): string {
  return `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' ||
    hostname === '[::1]';
}

function failure(error: string): ConfigValidation {
  return { ok: false, error };
}
