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
      webSearchEnabled: false,
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
      webSearchEnabled: false,
    });
  });

  it('keeps an existing Qwen config and defaults the new search option off', async () => {
    const storage = {
      get: vi.fn(async (key: string) => ({
        [key]: {
          provider: 'qwen-cn',
          baseUrl:
            'https://ws-legacy-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
          apiKey: 'preserve-qwen-key',
          model: 'qwen3.6-flash',
        },
      })),
      set: vi.fn(async () => undefined),
    };

    expect(await loadTranslationConfig(storage)).toEqual({
      provider: 'qwen-cn',
      baseUrl:
        'https://ws-legacy-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
      apiKey: 'preserve-qwen-key',
      model: 'qwen3.6-flash',
      webSearchEnabled: false,
    });
  });

  it.each([
    {
      provider: 'qwen-cn' as const,
      baseUrl:
        'https://ws-cn-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
      apiKey: 'qwen-cn-test-token',
      model: 'qwen3.7-flash',
      webSearchEnabled: true,
    },
    {
      provider: 'qwen-sg' as const,
      baseUrl:
        'https://ws-sg-test.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
      apiKey: 'qwen-sg-test-token',
      model: 'qwen3.7-plus',
      webSearchEnabled: false,
    },
    {
      provider: 'doubao' as const,
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'doubao-test-token',
      model: 'doubao-seed-2-1-pro-260628',
      webSearchEnabled: false,
    },
  ])('loads a saved $provider config', async (config) => {
    const storage = {
      get: vi.fn(async (key: string) => ({ [key]: config })),
      set: vi.fn(async () => undefined),
    };

    expect(await loadTranslationConfig(storage)).toEqual(config);
  });
});
