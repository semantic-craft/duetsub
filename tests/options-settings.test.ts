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
});
