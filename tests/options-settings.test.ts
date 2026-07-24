import { describe, expect, it, vi } from 'vitest';

import type { TranslationConfig } from '../src/mt/config';
import {
  loadTranslationConfig,
  saveTranslationConfig,
} from '../src/options/settings';

describe('options storage seam', () => {
  it('saves and reloads the config while leaving masking to the password input', async () => {
    const values: Record<string, unknown> = {};
    const storage = {
      get: vi.fn(async (key: string) => ({ [key]: values[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(values, items);
      }),
    };
    const config: TranslationConfig = {
      provider: 'local',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'local-test-token',
      model: 'qwen',
    };
    await saveTranslationConfig(storage, config);
    expect(await loadTranslationConfig(storage)).toEqual(config);
  });

  it('migrates the retired DeepSeek defaults while preserving the API key', async () => {
    const storage = {
      get: vi.fn(async (key: string) => ({
        [key]: {
          provider: 'deepseek',
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: 'preserve-this-key',
          model: 'deepseek-chat',
        },
      })),
      set: vi.fn(async () => undefined),
    };

    expect(await loadTranslationConfig(storage)).toEqual({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'preserve-this-key',
      model: 'deepseek-v4-flash',
    });
  });
});
