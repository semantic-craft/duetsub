import { describe, expect, it } from 'vitest';

import type { SiteAdapter } from '../src/core/contracts';
import { resolvePlaybackTimeMs } from '../src/content/playback-clock';

describe('playback clock selection', () => {
  it('prefers a site program clock over a segment-local video clock', () => {
    const adapter = {
      getPlaybackTimeMs: () => 991_000,
    } as SiteAdapter;
    const video = { currentTime: 300 } as HTMLVideoElement;

    expect(resolvePlaybackTimeMs(adapter, video)).toBe(991_000);
  });
});
