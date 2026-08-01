import { describe, expect, it } from 'vitest';

import type { Cue, TrackInfo } from '../src/core/contracts';
import {
  createBottomRetranslationPlan,
} from '../src/core/bottom-retranslation';

const TOP_CUES: readonly Cue[] = [
  {
    start: 1_000,
    end: 2_000,
    text: 'We have to go.',
    language: 'en',
  },
];

function track(id: string, language: string): TrackInfo {
  return {
    id,
    language,
    source: 'official',
    label: id,
    kind: 'subtitles',
  };
}

describe('createBottomRetranslationPlan', () => {
  it('translates the top track into Traditional Chinese for a zh-TW bottom', () => {
    expect(
      createBottomRetranslationPlan({
        topTrack: track('official-en', 'en-US'),
        bottomLanguage: 'zh-TW',
        topCues: TOP_CUES,
      }),
    ).toEqual({
      source: TOP_CUES,
      trackId: 'official-en',
      target: 'bottom',
      targetLanguage: 'zh-Hant',
    });
  });

  it('translates the top track into English for an English bottom', () => {
    expect(
      createBottomRetranslationPlan({
        topTrack: track('official-ja', 'ja'),
        bottomLanguage: 'en-GB',
        topCues: TOP_CUES,
      }),
    ).toMatchObject({
      trackId: 'official-ja',
      target: 'bottom',
      targetLanguage: 'en',
    });
  });

  it('translates the top track into Simplified Chinese for a zh-CN bottom', () => {
    expect(
      createBottomRetranslationPlan({
        topTrack: track('official-en', 'en'),
        bottomLanguage: 'zh-CN',
        topCues: TOP_CUES,
      }),
    ).toMatchObject({
      trackId: 'official-en',
      target: 'bottom',
      targetLanguage: 'zh-Hans',
    });
  });

  it('does not claim support for a bottom language the translator cannot target', () => {
    expect(
      createBottomRetranslationPlan({
        topTrack: track('official-en', 'en'),
        bottomLanguage: 'ja',
        topCues: TOP_CUES,
      }),
    ).toBeUndefined();
  });

  it('does not create an empty retranslation request', () => {
    expect(
      createBottomRetranslationPlan({
        topTrack: track('official-en', 'en'),
        bottomLanguage: 'zh-Hant',
        topCues: [],
      }),
    ).toBeUndefined();
  });
});
