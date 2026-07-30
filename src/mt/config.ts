export type TranslationProvider =
  | 'deepseek'
  | 'qwen-cn'
  | 'qwen-sg'
  | 'doubao'
  | 'openai-compatible'
  | 'local';

export interface TranslationConfig {
  readonly provider: TranslationProvider;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

export const TRANSLATION_CONFIG_STORAGE_KEY = 'duetsub:translation-config';
export const DEEPSEEK_MODELS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
] as const;
export const QWEN_MODELS = [
  'qwen3.6-flash',
  'qwen3.7-plus',
  'qwen3.7-max',
] as const;
export const DOUBAO_MODELS = [
  'doubao-seed-2-1-pro-260628',
  'doubao-seed-2-0-lite-260215',
  'doubao-seed-2-0-mini-260215',
  'doubao-seed-2-0-pro-260215',
] as const;
export const DEFAULT_TRANSLATION_CONFIG: TranslationConfig = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: DEEPSEEK_MODELS[0],
};
export const QWEN_CN_TRANSLATION_CONFIG: TranslationConfig = {
  provider: 'qwen-cn',
  baseUrl:
    'https://YOUR_WORKSPACE_ID.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
  apiKey: '',
  model: QWEN_MODELS[0],
};
export const QWEN_SG_TRANSLATION_CONFIG: TranslationConfig = {
  provider: 'qwen-sg',
  baseUrl:
    'https://YOUR_WORKSPACE_ID.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
  apiKey: '',
  model: QWEN_MODELS[0],
};
export const DOUBAO_TRANSLATION_CONFIG: TranslationConfig = {
  provider: 'doubao',
  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  apiKey: '',
  model: DOUBAO_MODELS[0],
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
  if (
    (input.provider === 'qwen-cn' || input.provider === 'qwen-sg') &&
    url.hostname.toLowerCase().includes('your_workspace_id')
  ) {
    return failure(
      '請將 Base URL 中的 YOUR_WORKSPACE_ID 替換為百煉業務空間 ID',
    );
  }
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

export function translationRequestUrl(config: TranslationConfig): string {
  return usesResponsesApi(config.provider)
    ? `${config.baseUrl.replace(/\/$/, '')}/responses`
    : chatCompletionsUrl(config);
}

export function usesResponsesApi(provider: TranslationProvider): boolean {
  return provider === 'qwen-cn' || provider === 'qwen-sg' ||
    provider === 'doubao';
}

export function translationProviderDefault(
  provider: TranslationProvider,
): TranslationConfig | undefined {
  switch (provider) {
    case 'deepseek':
      return DEFAULT_TRANSLATION_CONFIG;
    case 'qwen-cn':
      return QWEN_CN_TRANSLATION_CONFIG;
    case 'qwen-sg':
      return QWEN_SG_TRANSLATION_CONFIG;
    case 'doubao':
      return DOUBAO_TRANSLATION_CONFIG;
    default:
      return undefined;
  }
}

export function isTranslationProvider(
  value: unknown,
): value is TranslationProvider {
  return value === 'deepseek' ||
    value === 'qwen-cn' ||
    value === 'qwen-sg' ||
    value === 'doubao' ||
    value === 'openai-compatible' ||
    value === 'local';
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' ||
    hostname === '[::1]';
}

function failure(error: string): ConfigValidation {
  return { ok: false, error };
}
