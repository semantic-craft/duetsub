import { describe, expect, it } from 'vitest';

import { parseYoutubeJson3 } from '../src/core/youtube-json3';
import englishFixture from '../research/findings/site-samples/youtube-timedtext-en.json3.json?raw';
import traditionalChineseFixture from '../research/findings/site-samples/youtube-timedtext-zh-TW.json3.json?raw';

describe('parseYoutubeJson3', () => {
  it('maps the sanitized live English fixture to millisecond cues', () => {
    const cues = parseYoutubeJson3(englishFixture, 'en');

    expect(cues).toHaveLength(14);
    expect(cues[0]).toEqual({
      start: 27_103,
      end: 29_678,
      text: 'Good morning. How are you?',
      language: 'en',
    });
    expect(cues[6]).toEqual({
      start: 43_096,
      end: 46_663,
      text: 'There have been three themes\nrunning through the conference,',
      language: 'en',
    });
  });

  it('filters window, append, missing-segment, and whitespace-only events', () => {
    const raw = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 500, wpWinPosId: 1 },
        { tStartMs: 500, dDurationMs: 500 },
        {
          tStartMs: 1_000,
          dDurationMs: 500,
          aAppend: 1,
          segs: [{ utf8: 'rolling text' }],
        },
        {
          tStartMs: 1_500,
          dDurationMs: 500,
          segs: [{ utf8: ' \n ' }],
        },
        {
          tStartMs: 2_000,
          dDurationMs: 750,
          segs: [{ utf8: 'Keep ' }, { utf8: 'this\nline' }],
        },
      ],
    });

    expect(parseYoutubeJson3(raw, 'en')).toEqual([
      {
        start: 2_000,
        end: 2_750,
        text: 'Keep this\nline',
        language: 'en',
      },
    ]);
  });

  it('parses the sanitized live Traditional Chinese fixture independently', () => {
    const cues = parseYoutubeJson3(traditionalChineseFixture, 'zh-Hant');

    expect(cues).toHaveLength(14);
    expect(cues[0]).toEqual({
      start: 0,
      end: 7_000,
      text: '譯者: Dxm Online大小媒體\n審譯者: Bill Hsiung',
      language: 'zh-Hant',
    });
    expect(cues[1]).toMatchObject({ start: 25_000, end: 32_000 });
  });
});
