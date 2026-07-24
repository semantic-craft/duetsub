import {
  chatCompletionsUrl,
  validateTranslationConfig,
  type TranslationConfig,
} from './config';

export async function testTranslationConnection(
  config: TranslationConfig,
  fetcher: typeof fetch = fetch,
): Promise<{ readonly ok: boolean; readonly message: string }> {
  const validation = validateTranslationConfig(config);
  if (!validation.ok) return { ok: false, message: validation.error };
  const url = new URL(chatCompletionsUrl(validation.config));
  url.pathname = `${url.pathname.replace(/\/chat\/completions$/, '')}/models`;
  try {
    const response = await fetcher(url, {
      headers: validation.config.apiKey
        ? { Authorization: `Bearer ${validation.config.apiKey}` }
        : {},
    });
    return response.ok
      ? { ok: true, message: '連線成功' }
      : { ok: false, message: `連線失敗（HTTP ${response.status}）` };
  } catch {
    return { ok: false, message: '連線失敗（網路或 CORS）' };
  }
}
