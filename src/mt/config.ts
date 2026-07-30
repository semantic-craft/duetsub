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
  readonly webSearchEnabled: boolean;
}

export const TRANSLATION_CONFIG_STORAGE_KEY = 'duetsub:translation-config';
export const DEEPSEEK_MODELS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
] as const;
export const QWEN_MODELS = [
  'qwen3.7-flash',
  'qwen3.7-plus',
  'qwen3.7-max',
  'qwen3.6-flash',
] as const;
export const QWEN_WORKSPACE_ID_PLACEHOLDER = 'YOUR_WORKSPACE_ID';
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
  webSearchEnabled: false,
};
export const QWEN_CN_TRANSLATION_CONFIG: TranslationConfig = {
  provider: 'qwen-cn',
  baseUrl: qwenBaseUrl('qwen-cn', QWEN_WORKSPACE_ID_PLACEHOLDER),
  apiKey: '',
  model: QWEN_MODELS[0],
  webSearchEnabled: false,
};
export const QWEN_SG_TRANSLATION_CONFIG: TranslationConfig = {
  provider: 'qwen-sg',
  baseUrl: qwenBaseUrl('qwen-sg', QWEN_WORKSPACE_ID_PLACEHOLDER),
  apiKey: '',
  model: QWEN_MODELS[0],
  webSearchEnabled: false,
};
export const DOUBAO_TRANSLATION_CONFIG: TranslationConfig = {
  provider: 'doubao',
  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  apiKey: '',
  model: DOUBAO_MODELS[0],
  webSearchEnabled: false,
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
  if (isQwenProvider(input.provider) && qwenWorkspaceId(input) === '') {
    return failure('請填寫有效的百煉 Workspace ID');
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
  return isQwenProvider(provider) || provider === 'doubao';
}

export function qwenBaseUrl(
  provider: Extract<TranslationProvider, 'qwen-cn' | 'qwen-sg'>,
  workspaceId: string,
): string {
  return `https://${workspaceId.trim()}.${
    qwenDomain(provider)
  }/compatible-mode/v1`;
}

export function qwenWorkspaceId(config: TranslationConfig): string {
  if (!isQwenProvider(config.provider)) return '';
  let url: URL;
  try {
    url = new URL(config.baseUrl);
  } catch {
    return '';
  }
  const suffix = `.${qwenDomain(config.provider)}`;
  const hostname = url.hostname.toLowerCase();
  if (
    !hostname.endsWith(suffix) ||
    url.pathname.replace(/\/$/, '') !== '/compatible-mode/v1'
  ) {
    return '';
  }
  const workspaceId = hostname.slice(0, -suffix.length);
  return /^ws-[a-z0-9-]+$/.test(workspaceId) ? workspaceId : '';
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

function isQwenProvider(
  provider: TranslationProvider,
): provider is Extract<TranslationProvider, 'qwen-cn' | 'qwen-sg'> {
  return provider === 'qwen-cn' || provider === 'qwen-sg';
}

function qwenDomain(
  provider: Extract<TranslationProvider, 'qwen-cn' | 'qwen-sg'>,
): string {
  return provider === 'qwen-cn'
    ? 'cn-beijing.maas.aliyuncs.com'
    : 'ap-southeast-1.maas.aliyuncs.com';
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' ||
    hostname === '[::1]';
}

function failure(error: string): ConfigValidation {
  return { ok: false, error };
}
