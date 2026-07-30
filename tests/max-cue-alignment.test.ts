import { describe, expect, it } from 'vitest';

import {
  resolveMaxOfficialPairCues,
} from '../src/adapters/max-cue-alignment';
import type { Cue, TrackInfo } from '../src/core/contracts';

const cue = (
  start: number,
  end: number,
  text: string,
  language: string,
): Cue => ({ start, end, text, language });

function alignMaxChineseCuesToEnglish(
  topCues: readonly Cue[],
  bottomCues: readonly Cue[],
): readonly Cue[] {
  const result = resolveMaxOfficialPairCues({
    top: {
      id: 'en-US-closedcaptions',
      language: 'en-US',
      source: 'official',
      label: 'English CC',
      kind: 'closed-captions',
    },
    bottom: {
      id: 'zh-Hant-TW-subtitles',
      language: 'zh-Hant-TW',
      source: 'official',
      label: 'Traditional Chinese',
      kind: 'subtitles',
    },
    topCues,
    bottomCues,
  });
  return result.kind === 'ready' ? result.bottomCues : [];
}

describe('alignMaxChineseCuesToEnglish', () => {
  it('shows a delayed Chinese cue for the full English cue that contains its original start', () => {
    const english = [
      cue(9_100, 11_300, 'English question', 'en-US'),
      cue(11_400, 12_700, 'English answer', 'en-US'),
    ];
    const chinese = [
      cue(11_090, 12_100, '中文問題', 'zh-Hant-TW'),
      cue(12_200, 13_300, '中文答案', 'zh-Hant-TW'),
    ];

    expect(alignMaxChineseCuesToEnglish(english, chinese)).toEqual([
      cue(9_100, 11_300, '中文問題', 'zh-Hant-TW'),
      cue(11_400, 12_700, '中文答案', 'zh-Hant-TW'),
    ]);
  });

  it('fails closed when fewer than 95% of Chinese cues have a unique English candidate', () => {
    const english = [
      cue(1_000, 2_000, 'First English cue', 'en-US'),
      cue(4_000, 5_000, 'Second English cue', 'en-US'),
    ];
    const chinese = [
      cue(1_500, 2_500, '可驗證', 'zh-Hant-TW'),
      cue(3_000, 3_500, '無候選', 'zh-Hant-TW'),
    ];

    expect(alignMaxChineseCuesToEnglish(english, chinese)).toEqual([]);
  });

  it('moves an explicit overflow dialogue line to the next English cue covered by the source interval', () => {
    const english = [
      cue(20_100, 21_700, 'Current sentence.', 'en-US'),
      cue(21_800, 24_100, 'Next answer.', 'en-US'),
    ];
    const chinese = [
      cue(20_900, 23_200, '-目前這句\n-下一個回答', 'zh-Hant-TW'),
    ];

    expect(alignMaxChineseCuesToEnglish(english, chinese)).toEqual([
      cue(20_100, 21_700, '-目前這句', 'zh-Hant-TW'),
      cue(21_800, 24_100, '-下一個回答', 'zh-Hant-TW'),
    ]);
  });

  it('does not show the next translated line before its English cue', () => {
    const english = [
      cue(
        742_366,
        743_797,
        "I mean,\nit's not just comedy fans.",
        'en-US',
      ),
      cue(743_797, 745_069, "It's everybody, you know?", 'en-US'),
    ];
    const chinese = [
      cue(
        742_366,
        745_069,
        '來的不只是喜劇愛好者\n各種人都有',
        'zh-Hant-TW',
      ),
    ];

    expect(alignMaxChineseCuesToEnglish(english, chinese)).toEqual([
      cue(742_366, 743_797, '來的不只是喜劇愛好者', 'zh-Hant-TW'),
      cue(743_797, 745_069, '各種人都有', 'zh-Hant-TW'),
    ]);
  });

  it('pins a slightly early Chinese cue to the following English cue', () => {
    const english = [
      cue(10_100, 12_000, 'English starts next.', 'en-US'),
    ];
    const chinese = [
      cue(10_000, 11_900, '中文稍早', 'zh-Hant-TW'),
    ];

    expect(alignMaxChineseCuesToEnglish(english, chinese)).toEqual([
      cue(10_100, 12_000, '中文稍早', 'zh-Hant-TW'),
    ]);
  });

  it('fails closed when Chinese leads every English cue by over 250 ms', () => {
    const english = [
      cue(10_300, 12_000, 'English starts too late.', 'en-US'),
    ];
    const chinese = [
      cue(10_000, 11_900, '無法可靠對齊', 'zh-Hant-TW'),
    ];

    expect(alignMaxChineseCuesToEnglish(english, chinese)).toEqual([]);
  });

  it('keeps wrapped text together when no later English cue can own it', () => {
    const english = [
      cue(30_000, 32_000, 'One English cue.', 'en-US'),
    ];
    const chinese = [
      cue(30_500, 33_000, '同一句字幕\n只是視覺換行', 'zh-Hant-TW'),
    ];

    expect(alignMaxChineseCuesToEnglish(english, chinese)).toEqual([
      cue(30_000, 32_000, '同一句字幕\n只是視覺換行', 'zh-Hant-TW'),
    ]);
  });
});

describe('resolveMaxOfficialPairCues', () => {
  const officialTrack = (
    id: string,
    language: string,
    kind: TrackInfo['kind'] = 'subtitles',
  ): TrackInfo => ({
    id,
    language,
    source: 'official',
    label: id,
    kind,
  });

  it('preserves both original timelines for a non-whitelisted language pair', () => {
    const topCues = [
      cue(1_000, 2_000, '日本語', 'ja'),
    ];
    const bottomCues = [
      cue(1_500, 2_500, '简体中文', 'zh-Hans-SG'),
    ];

    const result = resolveMaxOfficialPairCues({
      top: officialTrack('ja-subtitles', 'ja'),
      bottom: officialTrack('zh-Hans-SG-subtitles', 'zh-Hans-SG'),
      topCues,
      bottomCues,
    });

    expect(result).toEqual({
      kind: 'ready',
      policy: 'original-timing',
      topCues,
      bottomCues,
    });
    if (result.kind === 'ready') {
      expect(result.topCues).toBe(topCues);
      expect(result.bottomCues).toBe(bottomCues);
    }
  });

  it('applies only the verified English CC and Traditional Chinese compatibility policy', () => {
    const topCues = [
      cue(9_100, 11_300, 'English question', 'en-US'),
    ];
    const bottomCues = [
      cue(11_090, 12_100, '中文問題', 'zh-Hant-TW'),
    ];

    expect(
      resolveMaxOfficialPairCues({
        top: officialTrack(
          'en-US-closedcaptions',
          'en-US',
          'closed-captions',
        ),
        bottom: officialTrack(
          'zh-Hant-TW-subtitles',
          'zh-Hant-TW',
        ),
        topCues,
        bottomCues,
      }),
    ).toEqual({
      kind: 'ready',
      policy: 'english-cc-traditional-chinese',
      topCues,
      bottomCues: [
        cue(9_100, 11_300, '中文問題', 'zh-Hant-TW'),
      ],
    });

    expect(
      resolveMaxOfficialPairCues({
        top: officialTrack('en-US-subtitles', 'en-US'),
        bottom: officialTrack(
          'zh-Hant-TW-subtitles',
          'zh-Hant-TW',
        ),
        topCues,
        bottomCues,
      }),
    ).toMatchObject({
      kind: 'ready',
      policy: 'original-timing',
      bottomCues,
    });
  });

  it('fails the whole verified pair when unique alignment coverage is too low', () => {
    expect(
      resolveMaxOfficialPairCues({
        top: officialTrack(
          'en-US-closedcaptions',
          'en-US',
          'closed-captions',
        ),
        bottom: officialTrack(
          'zh-Hant-TW-subtitles',
          'zh-Hant-TW',
        ),
        topCues: [
          cue(1_000, 2_000, 'First English cue', 'en-US'),
          cue(4_000, 5_000, 'Second English cue', 'en-US'),
        ],
        bottomCues: [
          cue(1_500, 2_500, '可驗證', 'zh-Hant-TW'),
          cue(3_000, 3_500, '無候選', 'zh-Hant-TW'),
        ],
      }),
    ).toEqual({
      kind: 'unavailable',
      reason: 'alignment-coverage',
    });
  });

  it('fails the verified pair instead of dropping an unmappable overflow line', () => {
    expect(
      resolveMaxOfficialPairCues({
        top: officialTrack(
          'en-US-closedcaptions',
          'en-US',
          'closed-captions',
        ),
        bottom: officialTrack(
          'zh-Hant-TW-subtitles',
          'zh-Hant-TW',
        ),
        topCues: [
          cue(1_000, 2_000, 'One English cue.', 'en-US'),
        ],
        bottomCues: [
          cue(
            1_000,
            2_500,
            '-第一行\n-無法承接的第二行',
            'zh-Hant-TW',
          ),
        ],
      }),
    ).toEqual({
      kind: 'unavailable',
      reason: 'alignment-coverage',
    });
  });
});
