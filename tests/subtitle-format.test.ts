import { describe, expect, it } from 'vitest';

import { formatSubtitleTranslation } from '../src/mt/subtitle-format';

describe('subtitle translation formatting', () => {
  it('wraps film/TV Chinese at a semantic boundary', () => {
    expect(
      formatSubtitleTranslation(
        '雷耶斯醫生，237號房。十點半。別遲到。',
        'film-tv',
        'zh-Hant',
      ),
    ).toBe('雷耶斯醫生，237號房。\n十點半。別遲到。');
  });

  it('wraps English on whitespace without changing words', () => {
    expect(
      formatSubtitleTranslation(
        'Run `npm ci`, not `npm install`. This keeps the lockfile authoritative.',
        'youtube',
        'en',
      ),
    ).toBe(
      'Run `npm ci`, not `npm install`.\nThis keeps the lockfile authoritative.',
    );
  });

  it('keeps an English product name on one line', () => {
    expect(
      formatSubtitleTranslation(
        "I'm using an M3 MacBook Air with Blender 4.3 here.",
        'youtube',
        'en',
      ),
    ).toBe("I'm using an M3 MacBook Air\nwith Blender 4.3 here.");
  });

  it('normalizes three-dot pauses to a subtitle ellipsis', () => {
    expect(
      formatSubtitleTranslation(
        'Wait...\nSomeone is outside.',
        'film-tv',
        'en',
      ),
    ).toBe('Wait… Someone is outside.');
  });

  it.each([
    [
      '雷耶斯醫生，237號房。十點半。別遲到。',
      'film-tv',
      '雷耶斯醫生，237號房。\n十點半。別遲到。',
    ],
    [
      '執行 `npm ci`——而非 `npm install`——以確保鎖定檔為準。',
      'youtube',
      '執行 `npm ci`——而非 `npm install`——\n以確保鎖定檔為準。',
    ],
    [
      '這顆鏡頭售價 799 美元，但轉接環還要再加 129 美元。',
      'youtube',
      '這顆鏡頭售價 799 美元，\n但轉接環還要再加 129 美元。',
    ],
    [
      '我以為這是 USB 3.2——抱歉，其實是 USB4。',
      'youtube',
      '我以為這是 USB 3.2——\n抱歉，其實是 USB4。',
    ],
  ] as const)(
    'does not split inline code, product tokens, room numbers, or units',
    (input, profile, expected) => {
      expect(
        formatSubtitleTranslation(input, profile, 'zh-Hant'),
      ).toBe(expected);
    },
  );
});
