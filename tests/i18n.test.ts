import { describe, expect, it, vi } from 'vitest';

import {
  loadUiLanguage,
  resolveUiLanguage,
  saveUiLanguage,
  translate,
  translateRuntimeMessage,
  UI_LANGUAGE_STORAGE_KEY,
} from '../src/i18n';

describe('interface language', () => {
  it('prefers the saved language and otherwise follows supported browser locales', () => {
    expect(resolveUiLanguage('en', ['zh-TW'])).toBe('en');
    expect(resolveUiLanguage(undefined, ['ja', 'zh-TW'])).toBe('zh-Hant');
    expect(resolveUiLanguage(undefined, ['zh-CN'])).toBe('zh-Hans');
    expect(resolveUiLanguage(undefined, ['fr-FR'])).toBe('en');
  });

  it('persists only the explicit interface language choice', async () => {
    const values: Record<string, unknown> = {};
    const storage = {
      get: vi.fn(async (key: string) => ({ [key]: values[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(values, items);
      }),
    };

    expect(await loadUiLanguage(storage, ['zh-HK'])).toBe('zh-Hant');
    await saveUiLanguage(storage, 'zh-Hans');

    expect(values[UI_LANGUAGE_STORAGE_KEY]).toBe('zh-Hans');
    expect(await loadUiLanguage(storage, ['en-US'])).toBe('zh-Hans');
  });

  it('translates settings, player controls, and runtime feedback in all three languages', () => {
    expect(translate('zh-Hans', 'options.interfaceLanguage')).toBe('界面语言');
    expect(translate('zh-Hant', 'toggle.openSettings')).toBe('打開設定');
    expect(translate('en', 'status.waitingContent', { site: 'Netflix' }))
      .toBe('On · waiting for a verified Netflix title');
    expect(translateRuntimeMessage('en', '連線失敗（HTTP 503）')).toBe(
      'Connection failed (HTTP 503)',
    );
  });
});
