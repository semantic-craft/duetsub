import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Cue, TrackInfo } from '../src/core/contracts';
import { resolveOfficialPair } from '../src/core/official-pair-selection';
import {
  acceptPrimeTtmlObservation,
  acceptPrimeTimelineOffset,
  acquirePrimeVideoTracks,
  applyPrimeVideoPairAlignmentPolicy,
  createPrimeVideoAdapter,
  ensurePrimeSubtitleMenuOpen,
  parsePrimeVideoSubtitleTrack,
  restorePrimeSubtitleState,
} from '../src/adapters/primevideo';
import { primeTtmlResponseMessage } from '../src/core/messages';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function cues(text: string, language: string): Cue[] {
  return [{ start: 0, end: 1_000, text, language }];
}

describe('Prime official subtitle metadata', () => {
  it('opens a hidden subtitle group before switching the next track', async () => {
    let open = false;
    const group = {
      getClientRects: () => (open ? [{}] : []),
    };
    const button = {
      click: vi.fn(() => {
        open = true;
      }),
    };

    vi.stubGlobal('getComputedStyle', () => ({
      display: open ? 'block' : 'none',
      visibility: 'visible',
    }));
    vi.stubGlobal('document', {
      querySelector: (selector: string) =>
        selector ===
        'div[id^="dv-web-player"].dv-player-fullscreen .atvwebplayersdk-subtitle-radio-group'
          ? group
          : null,
    });

    await expect(
      ensurePrimeSubtitleMenuOpen(button as unknown as HTMLButtonElement),
    ).resolves.toBe(group);
    expect(button.click).toHaveBeenCalledOnce();
  });

  it('verifies restoration against the replacement radio rendered by Prime', async () => {
    vi.useFakeTimers();
    let open = true;
    let currentRadio = {
      checked: false,
      id: 'zh-hant_Subtitle_Dialog',
      click: () => {
        currentRadio = {
          checked: true,
          id: 'zh-hant_Subtitle_Dialog',
          click: currentRadio.click,
        };
        open = false;
      },
    };
    const group = {
      getClientRects: () => (open ? [{}] : []),
      querySelectorAll: () => [currentRadio],
    };
    const button = {
      click: vi.fn(() => {
        open = !open;
      }),
    };

    vi.stubGlobal('window', {
      setTimeout,
    });
    vi.stubGlobal('getComputedStyle', () => ({
      display: open ? 'block' : 'none',
      visibility: 'visible',
    }));
    vi.stubGlobal('document', {
      querySelector: (selector: string) =>
        selector ===
        'div[id^="dv-web-player"].dv-player-fullscreen .atvwebplayersdk-subtitle-radio-group'
          ? group
          : null,
    });

    const restored = restorePrimeSubtitleState(
      button as unknown as HTMLButtonElement,
      currentRadio.id,
      false,
    );
    await vi.advanceTimersByTimeAsync(8_100);

    await expect(restored).resolves.toBe(true);
  });

  it('enumerates the visible fullscreen player when Prime keeps a stale hidden player', async () => {
    vi.useFakeTimers();
    const activeVideo = {
      readyState: 4,
      getClientRects: () => [{}],
    };
    const staleVideo = {
      readyState: 0,
      getClientRects: () => [],
    };
    const button = {
      getClientRects: () => [{}],
    };
    const radio = {
      checked: true,
      id: 'en-us_Caption_Dialog',
      getAttribute: (name: string) =>
        name === 'aria-label' ? 'English [CC]' : null,
    };
    const group = {
      getClientRects: () => [{}],
      querySelectorAll: (selector: string) =>
        selector === 'input[type="radio"][name="subtitle"]' ? [radio] : [],
    };

    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      setTimeout,
      clearTimeout,
    });
    vi.stubGlobal('getComputedStyle', (element: unknown) => ({
      display: element === staleVideo ? 'none' : 'block',
      visibility: 'visible',
    }));
    vi.stubGlobal('document', {
      querySelector: (selector: string) => {
        if (selector === '#dv-web-player video') return staleVideo;
        if (
          selector ===
          'div[id^="dv-web-player"].dv-player-fullscreen video'
        ) {
          return activeVideo;
        }
        if (
          selector ===
          'div[id^="dv-web-player"].dv-player-fullscreen button[aria-label="Subtitles and Audio Menu"]'
        ) {
          return button;
        }
        if (
          selector ===
          'div[id^="dv-web-player"].dv-player-fullscreen .atvwebplayersdk-subtitle-radio-group'
        ) {
          return group;
        }
        return null;
      },
    });

    const adapter = createPrimeVideoAdapter();
    let observedTracks: TrackInfo[] | undefined;
    adapter.onTracks((tracks) => {
      observedTracks = tracks;
    });
    adapter.start();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(observedTracks).toEqual([
      {
        id: 'en-us_Caption_Dialog',
        language: 'en-US',
        source: 'official',
        label: 'English [CC]',
        kind: 'closed-captions',
      },
    ]);
  });

  it('builds canonical tracks from machine ids without guessing localized labels', () => {
    expect(
      parsePrimeVideoSubtitleTrack({
        id: 'ja-jp_Subtitle_Dialog_39',
        label: '日本語',
      }),
    ).toEqual({
      id: 'ja-jp_Subtitle_Dialog_39',
      language: 'ja-JP',
      source: 'official',
      label: '日本語',
      kind: 'subtitles',
    });
    expect(
      parsePrimeVideoSubtitleTrack({
        id: 'en-us_Sdh_Dialog_3',
        label: 'English [CC]',
      }),
    ).toMatchObject({
      language: 'en-US',
      kind: 'closed-captions',
    });
    expect(
      parsePrimeVideoSubtitleTrack({
        id: 'en-us_Caption_Dialog',
        label: 'English [CC]',
      }),
    ).toMatchObject({
      language: 'en-US',
      kind: 'closed-captions',
    });
    expect(
      parsePrimeVideoSubtitleTrack({
        id: 'fr-fr_ForcedNarrative_Dialog',
        label: 'Français',
      }),
    ).toMatchObject({
      language: 'fr-FR',
      forcedOnly: true,
    });

    expect(
      parsePrimeVideoSubtitleTrack({
        id: 'subtitle-option-42',
        label: '日本語',
      }),
    ).toBeUndefined();
    expect(
      parsePrimeVideoSubtitleTrack({
        id: 'ja-jp_Unknown_Dialog',
        label: '日本語',
      }),
    ).toBeUndefined();
  });

  it('lets the shared pair resolver prefer Prime subtitles over CC variants', () => {
    const japaneseCc = parsePrimeVideoSubtitleTrack({
      id: 'ja-jp_Sdh_Dialog_1',
      label: '日本語 [CC]',
    });
    const japanese = parsePrimeVideoSubtitleTrack({
      id: 'ja-jp_Subtitle_Dialog_2',
      label: '日本語',
    });
    const simplifiedChinese = parsePrimeVideoSubtitleTrack({
      id: 'zh-hans_Subtitle_Dialog_3',
      label: '中文（简体）',
    });

    expect(
      resolveOfficialPair({
        siteId: 'primevideo',
        tracks: [japaneseCc, japanese, simplifiedChinese].filter(
          (track): track is TrackInfo => track !== undefined,
        ),
        preference: { version: 1, top: 'ja', bottom: 'zh-Hans' },
      }),
    ).toMatchObject({
      kind: 'ready',
      top: { id: 'ja-jp_Subtitle_Dialog_2' },
      bottom: { id: 'zh-hans_Subtitle_Dialog_3' },
    });
  });
});

describe('Prime pair acquisition ownership', () => {
  const japanese: TrackInfo = {
    id: 'ja-jp_Subtitle_Dialog_39',
    language: 'ja-JP',
    source: 'official',
    label: '日本語',
    kind: 'subtitles',
  };
  const simplifiedChinese: TrackInfo = {
    id: 'zh-hans_Subtitle_Dialog_37',
    language: 'zh-Hans',
    source: 'official',
    label: '中文（简体）',
    kind: 'subtitles',
  };

  it('captures exactly the requested top and bottom tracks serially', async () => {
    const events: string[] = [];
    let active = 0;
    let maxActive = 0;
    const restore = vi.fn().mockResolvedValue(true);

    const captured = await acquirePrimeVideoTracks({
      tracks: [japanese, simplifiedChinese],
      isCurrent: () => true,
      capture: async (track) => {
        events.push(track.id);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        return cues(track.label, track.language);
      },
      restore,
    });

    expect(events).toEqual([japanese.id, simplifiedChinese.id]);
    expect(maxActive).toBe(1);
    expect([...captured.keys()]).toEqual([japanese.id, simplifiedChinese.id]);
    expect(captured.get(simplifiedChinese.id)?.[0]?.text).toBe('中文（简体）');
    expect(restore).toHaveBeenCalledOnce();
  });

  it('stops the old pair, restores native state, and never starts its second track', async () => {
    let current = true;
    const capture = vi.fn(async (track: TrackInfo) => {
      current = false;
      return cues(track.label, track.language);
    });
    const restore = vi.fn().mockResolvedValue(true);

    await expect(
      acquirePrimeVideoTracks({
        tracks: [japanese, simplifiedChinese],
        isCurrent: () => current,
        capture,
        restore,
      }),
    ).rejects.toThrow('Prime track request became stale');

    expect(capture).toHaveBeenCalledOnce();
    expect(restore).toHaveBeenCalledOnce();
  });

  it('reports restoration failure even when capture already failed', async () => {
    const restore = vi.fn().mockResolvedValue(false);

    await expect(
      acquirePrimeVideoTracks({
        tracks: [japanese, simplifiedChinese],
        isCurrent: () => true,
        capture: vi.fn().mockRejectedValue(new Error('capture failed')),
        restore,
      }),
    ).rejects.toThrow('Could not restore Prime subtitle state');

    expect(restore).toHaveBeenCalledOnce();
  });

  it('keeps arbitrary pairs on original timing and limits alignment to the verified compatibility policy', () => {
    const raw = new Map<string, Cue[]>([
      [japanese.id, cues('日本語', japanese.language)],
      [
        simplifiedChinese.id,
        [{
          start: 2_000,
          end: 3_000,
          text: '简体中文',
          language: simplifiedChinese.language,
        }],
      ],
    ]);

    expect(
      applyPrimeVideoPairAlignmentPolicy(
        [japanese, simplifiedChinese],
        raw,
      ).get(simplifiedChinese.id),
    ).toEqual(raw.get(simplifiedChinese.id));

    const englishCc: TrackInfo = {
      id: 'en-us_Sdh_Dialog_3',
      language: 'en-US',
      source: 'official',
      label: 'English [CC]',
      kind: 'closed-captions',
    };
    const traditionalChinese: TrackInfo = {
      id: 'zh-hant_Subtitle_Dialog_38',
      language: 'zh-Hant',
      source: 'official',
      label: '中文（繁體）',
      kind: 'subtitles',
    };
    const compatibilityInput = new Map<string, Cue[]>([
      [englishCc.id, cues('English', englishCc.language)],
      [
        traditionalChinese.id,
        [
          ...cues('對齊', traditionalChinese.language),
          {
            start: 2_000,
            end: 3_000,
            text: '不對齊',
            language: traditionalChinese.language,
          },
        ],
      ],
    ]);

    expect(
      applyPrimeVideoPairAlignmentPolicy(
        [englishCc, traditionalChinese],
        compatibilityInput,
      ).get(traditionalChinese.id)?.map(({ text }) => text),
    ).toEqual(['對齊']);

    const traditionalChineseCc = {
      ...traditionalChinese,
      id: 'zh-hant_Sdh_Dialog_38',
      kind: 'closed-captions' as const,
    };
    expect(
      applyPrimeVideoPairAlignmentPolicy(
        [englishCc, traditionalChineseCc],
        new Map([
          [englishCc.id, compatibilityInput.get(englishCc.id) ?? []],
          [
            traditionalChineseCc.id,
            compatibilityInput.get(traditionalChinese.id) ?? [],
          ],
        ]),
      ).get(traditionalChineseCc.id)?.map(({ text }) => text),
    ).toEqual(['對齊', '不對齊']);
  });

  it('rejects a timeline offset owned by the previous selection generation', () => {
    const current = {
      contentGeneration: 4,
      clockGeneration: 7,
      selectionGeneration: 2,
    };

    expect(
      acceptPrimeTimelineOffset({
        current,
        pending: {
          requestId: 'old-selection',
          generation: { ...current, selectionGeneration: 1 },
        },
        response: {
          requestId: 'old-selection',
          timelineOffsetMs: 6_000,
        },
      }),
    ).toBeUndefined();
    expect(
      acceptPrimeTimelineOffset({
        current,
        pending: { requestId: 'current-selection', generation: current },
        response: {
          requestId: 'current-selection',
          timelineOffsetMs: 6_000,
        },
      }),
    ).toBe(6_000);
  });

  it('rejects a late TTML observation instead of relabeling it as the current selection', () => {
    const previous = {
      contentGeneration: 4,
      clockGeneration: 7,
      selectionGeneration: 1,
    };
    const current = { ...previous, selectionGeneration: 2 };
    const currentPending = {
      observationRequestId: 'current-request',
      track: simplifiedChinese,
      generation: current,
    };
    const late = primeTtmlResponseMessage(
      'late-previous-selection',
      'https://cf-timedtext.aux.pv-cdn.net/example/previous.ttml2',
      '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xml:lang="ja-JP"/>',
      {
        requestId: 'previous-request',
        trackId: japanese.id,
        generation: previous,
      },
    );
    const owned = primeTtmlResponseMessage(
      'current-selection',
      'https://cf-timedtext.aux.pv-cdn.net/example/current.ttml2',
      '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xml:lang="zh-Hans"/>',
      {
        requestId: currentPending.observationRequestId,
        trackId: simplifiedChinese.id,
        generation: current,
      },
    );

    expect(
      acceptPrimeTtmlObservation({
        current,
        pending: currentPending,
        response: late,
      }),
    ).toBeUndefined();
    expect(
      acceptPrimeTtmlObservation({
        current,
        pending: currentPending,
        response: owned,
      }),
    ).toEqual({
      trackId: simplifiedChinese.id,
      generation: current,
    });
  });
});
