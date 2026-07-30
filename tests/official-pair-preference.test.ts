import { describe, expect, it, vi } from 'vitest';

import {
  OFFICIAL_LANGUAGE_PAIR_STORAGE_KEY,
  loadLanguagePairPreference,
  resetLanguagePairPreference,
  saveLanguagePairPreference,
} from '../src/core/official-pair-preference';
import { DEFAULT_LANGUAGE_PAIR_PREFERENCE } from '../src/core/official-pair-selection';

describe('official language pair preference storage', () => {
  it('uses the in-memory default without writing when no valid value exists', async () => {
    const storage = {
      get: vi.fn(async (key: string) => ({ [key]: undefined })),
      set: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };

    expect(await loadLanguagePairPreference(storage)).toEqual({
      preference: DEFAULT_LANGUAGE_PAIR_PREFERENCE,
      stored: false,
    });
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('canonicalizes valid saves, rejects invalid pairs, and removes on reset', async () => {
    const values: Record<string, unknown> = {};
    const storage = {
      get: vi.fn(async (key: string) => ({ [key]: values[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(values, items);
      }),
      remove: vi.fn(async (key: string) => {
        delete values[key];
      }),
    };

    expect(
      await saveLanguagePairPreference(storage, {
        version: 1,
        top: 'JA',
        bottom: 'zh-hans',
      }),
    ).toBe(true);
    expect(values[OFFICIAL_LANGUAGE_PAIR_STORAGE_KEY]).toEqual({
      version: 1,
      top: 'ja',
      bottom: 'zh-Hans',
    });
    expect(await loadLanguagePairPreference(storage)).toEqual({
      preference: { version: 1, top: 'ja', bottom: 'zh-Hans' },
      stored: true,
    });

    expect(
      await saveLanguagePairPreference(storage, {
        version: 1,
        top: 'en-us',
        bottom: 'en-US',
      }),
    ).toBe(false);
    expect(storage.set).toHaveBeenCalledTimes(1);

    await resetLanguagePairPreference(storage);
    expect(values[OFFICIAL_LANGUAGE_PAIR_STORAGE_KEY]).toBeUndefined();
    expect(await loadLanguagePairPreference(storage)).toEqual({
      preference: DEFAULT_LANGUAGE_PAIR_PREFERENCE,
      stored: false,
    });
  });
});
