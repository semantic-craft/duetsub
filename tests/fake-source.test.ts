import { describe, expect, it } from 'vitest';

import { resolveOfficialPair } from '../src/core/official-pair-selection';
import {
  createFakeOfficialPair,
  FIXED_OFFICIAL_PAIR_PREFERENCE,
} from '../src/main/fake-source';

describe('fixed official pair smoke tracer', () => {
  it('provides official Japanese and Simplified Chinese cues on the video clock', () => {
    const fake = createFakeOfficialPair(1_234, {
      version: 1,
      top: 'ja',
      bottom: 'zh-Hans',
    })!;
    const pair = resolveOfficialPair({
      siteId: 'youtube',
      tracks: fake.tracks,
      preference: FIXED_OFFICIAL_PAIR_PREFERENCE,
    });

    expect(pair).toMatchObject({
      kind: 'ready',
      top: { id: fake.top.trackId, language: 'ja', source: 'official' },
      bottom: {
        id: fake.bottom.trackId,
        language: 'zh-Hans',
        source: 'official',
      },
    });
    expect(fake.top.cues[0]).toMatchObject({
      start: 1_234,
      language: 'ja',
    });
    expect(fake.bottom.cues[0]).toMatchObject({
      start: 1_234,
      language: 'zh-Hans',
    });
    expect(fake.top.translation).toBe('official');
    expect(fake.bottom.translation).toBe('official');
  });

  it('swaps roles from the chosen catalog pair and fails closed on a missing track', () => {
    const swapped = createFakeOfficialPair(2_000, {
      version: 1,
      top: 'zh-Hans',
      bottom: 'ja',
    })!;

    expect(swapped.top).toMatchObject({
      trackId: 'official-tracer-zh-Hans',
      role: 'top',
    });
    expect(swapped.bottom).toMatchObject({
      trackId: 'official-tracer-ja',
      role: 'bottom',
    });
    expect(
      createFakeOfficialPair(2_000, {
        version: 1,
        top: 'de',
        bottom: 'ja',
      }),
    ).toBeUndefined();
  });
});
