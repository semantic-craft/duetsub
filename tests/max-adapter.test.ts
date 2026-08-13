import { DOMParser } from '@xmldom/xmldom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMaxAdapter } from '../src/adapters/max';
import type { TrackInfo } from '../src/core/contracts';
import {
  isDuetSubMessage,
  maxObserverReadyMessage,
  maxSubtitleResponseMessage,
} from '../src/core/messages';

const EPISODE =
  '/video/watch/b8a64f23-c654-4be6-829a-1cb5fb0b7c8e';
const ENGLISH_ID = 'en-US-subtitles';
const CHINESE_ID = 'zh-Hant-TW-subtitles';
const PLAYBACK_INFO_URL =
  'https://default.any-any.prd.api.hbomax.com/any/playback/v1/playbackInfo';
const MANIFEST_URL = 'https://akm.cf.prd.media.h264.io/title/dash.mpd';
const ENGLISH_ONE_URL =
  'https://akm.cf.prd.media.h264.io/title/t/en-0/1.vtt';
const ENGLISH_TWO_URL =
  'https://akm.cf.prd.media.h264.io/title/t/en-1/1.vtt';

const PLAYBACK_INFO = JSON.stringify({
  manifest: { url: MANIFEST_URL },
  videos: [{
    textTracks: [{
      type: 'subtitles',
      language: 'en-US',
      displayName: 'English',
      format: 'webvtt',
    }],
  }],
});

const DUPLICATE_ENGLISH_MPD = `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period start="PT0S" duration="PT30M">
    <AdaptationSet lang="en-US" contentType="text">
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
      <SegmentTemplate timescale="1000" startNumber="1" media="t/en-0/$Number$.vtt">
        <SegmentTimeline><S t="0" d="1000"/></SegmentTimeline>
      </SegmentTemplate>
      <Representation mimeType="text/vtt" id="en-0"/>
    </AdaptationSet>
    <AdaptationSet lang="en-US" contentType="text">
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
      <SegmentTemplate timescale="1000" startNumber="1" media="t/en-1/$Number$.vtt">
        <SegmentTimeline><S t="0" d="1000"/></SegmentTimeline>
      </SegmentTemplate>
      <Representation mimeType="text/vtt" id="en-1"/>
    </AdaptationSet>
  </Period>
</MPD>`;

const OLD_VTT = 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nOld';
const SELECTED_VTT =
  'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nSelected';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Max adapter duplicate-track ownership', () => {
  it('announces its current content identity to MAIN on construction', () => {
    const harness = installMaxHarness({ emitSelectedVtt: true });

    createMaxAdapter();

    expect(harness.postedMessages).toEqual([
      maxObserverReadyMessage(EPISODE),
    ]);
    expect(isDuetSubMessage(harness.postedMessages[0])).toBe(true);
  });

  it('ignores an older VTT and binds the duplicate selected by the probe', async () => {
    vi.useFakeTimers();
    const harness = installMaxHarness({ emitSelectedVtt: true });
    const { adapter, english } = await startAdapter();
    harness.emit('old-vtt', 'vtt', ENGLISH_ONE_URL, OLD_VTT);
    harness.emit(
      'playback',
      'playback-info',
      PLAYBACK_INFO_URL,
      PLAYBACK_INFO,
    );
    harness.emit('manifest', 'manifest', MANIFEST_URL, DUPLICATE_ENGLISH_MPD);

    const fetched = adapter.fetchTrack(english);
    await vi.advanceTimersByTimeAsync(500);
    await expect(fetched).resolves.toEqual([
      { start: 0, end: 1_000, text: 'Selected', language: 'en-US' },
    ]);
    expect(harness.selections).toEqual([ENGLISH_ID, CHINESE_ID]);
    expect(harness.selected()).toBe(CHINESE_ID);
    expect(harness.menuOpen()).toBe(false);
  });

  it('starts a probe when complete metadata maps no duplicate track', async () => {
    const harness = installMaxHarness({ emitSelectedVtt: true });
    const { adapter, english } = await startAdapter();
    harness.emit(
      'playback',
      'playback-info',
      PLAYBACK_INFO_URL,
      PLAYBACK_INFO,
    );
    harness.emit('manifest', 'manifest', MANIFEST_URL, DUPLICATE_ENGLISH_MPD);

    await expect(adapter.fetchTrack(english)).resolves.toHaveLength(1);
    expect(harness.selections).toEqual([ENGLISH_ID, CHINESE_ID]);
  });

  it('rejects a VTT request that started before selection but completed after it', async () => {
    vi.useFakeTimers();
    const harness = installMaxHarness({
      emitLateOldVtt: true,
      emitSelectedVtt: false,
    });
    const { adapter, english } = await startAdapter();
    harness.emit(
      'playback',
      'playback-info',
      PLAYBACK_INFO_URL,
      PLAYBACK_INFO,
    );
    harness.emit('manifest', 'manifest', MANIFEST_URL, DUPLICATE_ENGLISH_MPD);
    await vi.advanceTimersByTimeAsync(100);

    const result = adapter.fetchTrack(english);
    const rejection = expect(result).rejects.toThrow('mapping unavailable');
    await vi.advanceTimersByTimeAsync(16_000);

    await rejection;
    expect(harness.selected()).toBe(CHINESE_ID);
    expect(harness.menuOpen()).toBe(false);
  });

  it('fails closed when request start and selection have equal timestamps', async () => {
    vi.useFakeTimers();
    const harness = installMaxHarness({
      emitEqualTimestampVtt: true,
      emitSelectedVtt: true,
    });
    const { adapter, english } = await startAdapter();
    harness.emit(
      'playback',
      'playback-info',
      PLAYBACK_INFO_URL,
      PLAYBACK_INFO,
    );
    harness.emit('manifest', 'manifest', MANIFEST_URL, DUPLICATE_ENGLISH_MPD);

    const result = adapter.fetchTrack(english);
    const rejection = expect(result).rejects.toThrow('mapping unavailable');
    await vi.advanceTimersByTimeAsync(16_000);

    await rejection;
    expect(harness.selected()).toBe(CHINESE_ID);
    expect(harness.menuOpen()).toBe(false);
  });

  it('restores the native track and menu on the replacement player', async () => {
    const harness = installMaxHarness({
      emitSelectedVtt: true,
      replaceOnEnglish: true,
    });
    const { adapter, english } = await startAdapter();
    harness.emit(
      'playback',
      'playback-info',
      PLAYBACK_INFO_URL,
      PLAYBACK_INFO,
    );
    harness.emit('manifest', 'manifest', MANIFEST_URL, DUPLICATE_ENGLISH_MPD);

    await expect(adapter.fetchTrack(english)).resolves.toHaveLength(1);
    expect(harness.replaced()).toBe(true);
    expect(harness.selected()).toBe(CHINESE_ID);
    expect(harness.menuOpen()).toBe(false);
  });

  it('restores the native state and fails closed when no VTT follows selection', async () => {
    vi.useFakeTimers();
    const harness = installMaxHarness({ emitSelectedVtt: false });
    const { adapter, english } = await startAdapter();
    harness.emit(
      'playback',
      'playback-info',
      PLAYBACK_INFO_URL,
      PLAYBACK_INFO,
    );
    harness.emit('manifest', 'manifest', MANIFEST_URL, DUPLICATE_ENGLISH_MPD);

    const result = adapter.fetchTrack(english);
    const rejection = expect(result).rejects.toThrow('mapping unavailable');
    await vi.advanceTimersByTimeAsync(16_000);

    await rejection;
    expect(harness.selected()).toBe(CHINESE_ID);
    expect(harness.menuOpen()).toBe(false);
  });
});

interface HarnessOptions {
  readonly emitEqualTimestampVtt?: boolean;
  readonly emitLateOldVtt?: boolean;
  readonly emitSelectedVtt: boolean;
  readonly replaceOnEnglish?: boolean;
}

interface MaxHarness {
  readonly postedMessages: unknown[];
  readonly selections: string[];
  emit(
    responseId: string,
    kind: 'playback-info' | 'manifest' | 'vtt',
    url: string,
    raw: string,
    requestStartedAtMs?: number,
  ): void;
  menuOpen(): boolean;
  replaced(): boolean;
  selected(): string;
}

function installMaxHarness(options: HarnessOptions): MaxHarness {
  let onMessage: ((event: MessageEvent<unknown>) => void) | undefined;
  let menuOpen = false;
  let selected = CHINESE_ID;
  let replaced = false;
  const postedMessages: unknown[] = [];
  const selections: string[] = [];
  const visible = { getClientRects: () => [{}] };

  const emit = (
    responseId: string,
    kind: 'playback-info' | 'manifest' | 'vtt',
    url: string,
    raw: string,
    requestStartedAtMs = performance.timeOrigin + performance.now(),
  ) => {
    onMessage?.({
      source: fakeWindow,
      data: maxSubtitleResponseMessage(
        responseId,
        kind,
        url,
        raw,
        EPISODE,
        requestStartedAtMs,
      ),
    } as unknown as MessageEvent<unknown>);
  };

  const trackButton = (id: string, label: string) => ({
    ...visible,
    getAttribute(name: string) {
      if (name === 'aria-label') return label;
      if (name === 'aria-checked') return String(selected === id);
      return null;
    },
    querySelectorAll() {
      return [{
        getAttribute(name: string) {
          return name === 'data-testid'
            ? `player-ux-text-track-check-${id}`
            : null;
        },
      }];
    },
    click() {
      selected = id;
      selections.push(id);
      if (id !== ENGLISH_ID) return;
      queueMicrotask(() => {
        if (options.replaceOnEnglish) {
          currentPlayer.isConnected = false;
          currentPlayer = makePlayer();
          replaced = true;
        }
        if (options.emitLateOldVtt) {
          emit('late-old-vtt', 'vtt', ENGLISH_ONE_URL, OLD_VTT, 0);
        }
        if (options.emitSelectedVtt) {
          emit(
            'selected-vtt',
            'vtt',
            ENGLISH_TWO_URL,
            SELECTED_VTT,
            performance.timeOrigin + performance.now() +
              (options.emitEqualTimestampVtt ? 0 : 1),
          );
        }
      });
    },
  });
  const buttons = [
    trackButton('off', 'Off'),
    trackButton(CHINESE_ID, 'Traditional Chinese'),
    trackButton(ENGLISH_ID, 'English'),
    trackButton(ENGLISH_ID, 'English'),
  ];
  const openButton = {
    ...visible,
    click() {
      menuOpen = true;
    },
  };
  const dismissButton = {
    ...visible,
    click() {
      menuOpen = false;
    },
  };
  const makePlayer = () => ({
    isConnected: true,
    querySelectorAll(selector: string) {
      if (selector.includes('player-ux-track-selector-button')) {
        return [openButton];
      }
      if (selector.includes('player-ux-track-dismiss-button')) {
        return menuOpen ? [dismissButton] : [];
      }
      if (selector.includes('player-ux-text-track-button')) {
        return menuOpen ? buttons : [];
      }
      return [];
    },
  });
  let currentPlayer = makePlayer();
  const video = {
    ...visible,
    readyState: 4,
    currentTime: 0,
    closest() {
      return currentPlayer;
    },
  };
  const fakeWindow = {
    addEventListener(
      type: string,
      callback: (event: MessageEvent<unknown>) => void,
    ) {
      if (type === 'message') onMessage = callback;
    },
    setInterval,
    setTimeout,
    clearTimeout,
    postMessage(message: unknown) {
      postedMessages.push(message);
    },
    location: {
      href: `https://play.hbomax.com${EPISODE}`,
      origin: 'https://play.hbomax.com',
    },
  } as unknown as Window & typeof globalThis;

  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('document', {
    querySelectorAll(selector: string) {
      return selector.includes('VideoElement') ? [video] : [];
    },
    querySelector(selector: string) {
      return selector.includes('VideoElement') ? video : null;
    },
  });
  vi.stubGlobal('getComputedStyle', () => ({
    display: 'block',
    visibility: 'visible',
  }));
  vi.stubGlobal('DOMParser', DOMParser);

  return {
    postedMessages,
    selections,
    emit,
    menuOpen: () => menuOpen,
    replaced: () => replaced,
    selected: () => selected,
  };
}

async function startAdapter(): Promise<{
  readonly adapter: ReturnType<typeof createMaxAdapter>;
  readonly english: TrackInfo;
}> {
  const adapter = createMaxAdapter();
  let tracks: TrackInfo[] = [];
  adapter.onTracks((emitted) => {
    tracks = emitted;
  });
  adapter.start();
  await vi.waitFor(() => {
    expect(tracks).toHaveLength(2);
  });
  const english = tracks.find(({ id }) => id === ENGLISH_ID);
  if (english === undefined) throw new Error('English track missing');
  return { adapter, english };
}
