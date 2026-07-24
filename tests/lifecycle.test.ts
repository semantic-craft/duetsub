import { describe, expect, it } from 'vitest';

import {
  acceptPlaybackGeneration,
  bindPlaybackGeneration,
  INITIAL_PLAYBACK_LIFECYCLE,
  isPlaybackOverlayActive,
  needsTrackAcquisition,
  reducePlaybackLifecycle,
  shouldHideNativeCaptions,
} from '../src/core/lifecycle';

function readyLifecycle(state = INITIAL_PLAYBACK_LIFECYCLE) {
  const enabled = reducePlaybackLifecycle(state, {
    type: 'hydrate',
    enabled: true,
  });
  return reducePlaybackLifecycle(enabled, { type: 'tracks-ready' });
}

describe('playback lifecycle', () => {
  it('flushes on seek and resumes the existing tracks without disabling the toggle', () => {
    const ready = readyLifecycle();
    const seeking = reducePlaybackLifecycle(ready, { type: 'seeking' });

    expect(seeking.enabled).toBe(true);
    expect(seeking.suspension).toBe('seek-flush');
    expect(isPlaybackOverlayActive(seeking)).toBe(false);
    expect(shouldHideNativeCaptions(seeking)).toBe(false);

    const resumed = reducePlaybackLifecycle(seeking, { type: 'seeked' });
    expect(isPlaybackOverlayActive(resumed)).toBe(true);
    expect(needsTrackAcquisition(resumed)).toBe(false);
    expect(resumed.contentGeneration).toBe(ready.contentGeneration);
  });

  it('rejects a response that belongs to the generation before reset', () => {
    const ready = readyLifecycle();
    const response = bindPlaybackGeneration(ready, ['old cue']);
    const reset = reducePlaybackLifecycle(ready, { type: 'reset-content' });

    expect(acceptPlaybackGeneration(reset, response)).toBeUndefined();
    expect(isPlaybackOverlayActive(reset)).toBe(false);
  });

  it('rejects the previous episode response after the verified content identity changes', () => {
    const episodeOne = readyLifecycle(
      reducePlaybackLifecycle(INITIAL_PLAYBACK_LIFECYCLE, {
        type: 'content-observed',
        identity: '指环王：力量之戒\n第 1 季，第 3 集 阿达尔',
      }),
    );
    const previousEpisodeResponse = bindPlaybackGeneration(episodeOne, [
      'episode three cue',
    ]);

    const episodeFour = reducePlaybackLifecycle(episodeOne, {
      type: 'content-observed',
      identity: '指环王：力量之戒\n第 1 季，第 4 集 惊涛骇浪',
    });

    expect(acceptPlaybackGeneration(episodeFour, previousEpisodeResponse)).toBeUndefined();
    expect(episodeFour.contentGeneration).toBe(
      episodeOne.contentGeneration + 1,
    );
    expect(needsTrackAcquisition(episodeFour)).toBe(true);
  });

  it('suspends the overlay for ads without disabling the user toggle', () => {
    const ready = readyLifecycle();
    const suspended = reducePlaybackLifecycle(ready, { type: 'ad-entered' });

    expect(suspended.enabled).toBe(true);
    expect(suspended.suspension).toBe('ad-suspended');
    expect(isPlaybackOverlayActive(suspended)).toBe(false);
    expect(shouldHideNativeCaptions(suspended)).toBe(false);
  });

  it('resumes after an ad only when the exit signal and program clock are reliable', () => {
    const suspended = reducePlaybackLifecycle(readyLifecycle(), {
      type: 'ad-entered',
    });
    const uncertainExit = reducePlaybackLifecycle(suspended, {
      type: 'ad-exited',
      programClockContinuous: false,
    });

    expect(isPlaybackOverlayActive(uncertainExit)).toBe(false);
    expect(uncertainExit.suspension).toBe('ad-suspended');

    const verifiedExit = reducePlaybackLifecycle(suspended, {
      type: 'ad-exited',
      programClockContinuous: true,
    });
    expect(isPlaybackOverlayActive(verifiedExit)).toBe(true);
  });

  it('suspends for a replacement video without treating it as new content', () => {
    const ready = readyLifecycle();
    const replaced = reducePlaybackLifecycle(ready, {
      type: 'video-replaced',
    });

    expect(isPlaybackOverlayActive(replaced)).toBe(false);
    expect(replaced.contentGeneration).toBe(ready.contentGeneration);
    expect(replaced.clockGeneration).toBe(ready.clockGeneration + 1);

    const rebound = reducePlaybackLifecycle(replaced, { type: 'video-ready' });
    expect(isPlaybackOverlayActive(rebound)).toBe(false);
    expect(needsTrackAcquisition(rebound)).toBe(true);
  });
});
