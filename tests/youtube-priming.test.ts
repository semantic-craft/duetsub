import { describe, expect, it } from 'vitest';

import {
  isYoutubeCaptionStateRestored,
  nextYoutubeEmptyBodyAction,
  readRestorableYoutubeCaptionState,
} from '../src/adapters/youtube-priming';

describe('YouTube caption priming decisions', () => {
  it('allows only explicit off or a JSON-safe selected track to be restored', () => {
    const off = readRestorableYoutubeCaptionState({});
    const on = readRestorableYoutubeCaptionState({
      languageCode: 'en',
      kind: 'asr',
      name: 'Speaker one',
    });

    expect(off).toEqual({ enabled: false, track: {} });
    expect(on).toEqual({
      enabled: true,
      track: {
        languageCode: 'en',
        kind: 'asr',
        name: 'Speaker one',
      },
    });
    expect(readRestorableYoutubeCaptionState(null)).toBeUndefined();
    expect(
      readRestorableYoutubeCaptionState({
        languageCode: 'en',
        unsafe: () => undefined,
      }),
    ).toBeUndefined();

    expect(isYoutubeCaptionStateRestored(off!, {})).toBe(true);
    expect(isYoutubeCaptionStateRestored(on!, on!.track)).toBe(true);
    expect(
      isYoutubeCaptionStateRestored(on!, { languageCode: 'zh-TW' }),
    ).toBe(false);
  });

  it('allows exactly one re-prime after an empty 200 response', () => {
    expect(nextYoutubeEmptyBodyAction(0)).toBe('reprime');
    expect(nextYoutubeEmptyBodyAction(1)).toBe('fail-closed');
    expect(nextYoutubeEmptyBodyAction(2)).toBe('fail-closed');
  });
});
