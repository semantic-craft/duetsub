import {
  DEFAULT_TRANSLATION_CONFIG,
  TRANSLATION_CONFIG_STORAGE_KEY,
  type TranslationConfig,
} from '../mt/config';

export interface LocalStoragePort {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export async function loadTranslationConfig(
  storage: LocalStoragePort,
): Promise<TranslationConfig> {
  const stored = await storage.get(TRANSLATION_CONFIG_STORAGE_KEY);
  const value = stored[TRANSLATION_CONFIG_STORAGE_KEY];
  return isTranslationConfig(value) ? value : DEFAULT_TRANSLATION_CONFIG;
}

export async function saveTranslationConfig(
  storage: LocalStoragePort,
  config: TranslationConfig,
): Promise<void> {
  await storage.set({ [TRANSLATION_CONFIG_STORAGE_KEY]: config });
}

function isTranslationConfig(value: unknown): value is TranslationConfig {
  if (typeof value !== 'object' || value === null) return false;
  const config = value as Partial<TranslationConfig>;
  return (
    (config.provider === 'deepseek' ||
      config.provider === 'openai-compatible' ||
      config.provider === 'local') &&
    typeof config.baseUrl === 'string' &&
    typeof config.apiKey === 'string' &&
    typeof config.model === 'string'
  );
}
