import { afterEach, describe, expect, it, vi } from 'vitest';

import { youtubePlayerCommand } from '../src/core/messages';
import { startYoutubeMainHook } from '../src/main/youtube-hook';

class FakeXmlHttpRequest {
  withCredentials = false;

  open(): void {}
  setRequestHeader(): void {}
  send(): void {}
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('YouTube MAIN-world POT observation', () => {
  it('returns the set-caption-track generation with the resulting timedtext request', async () => {
    const videoId = 'video-one';
    const generation = {
      contentGeneration: 3,
      clockGeneration: 4,
      selectionGeneration: 5,
    };
    const postMessage = vi.fn();
    const windowListeners = new Map<string, (event: MessageEvent<unknown>) => void>();
    const documentListeners = new Map<string, () => void>();
    let selectedTrack: Record<string, string> = {};
    const originalFetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response('{}', { status: 200 }),
    );
    const location = {
      href: `https://www.youtube.com/watch?v=${videoId}`,
      origin: 'https://www.youtube.com',
    };

    vi.stubGlobal('window', {
      fetch: originalFetch,
      location,
      postMessage,
      setTimeout,
      addEventListener(
        type: string,
        listener: (event: MessageEvent<unknown>) => void,
      ) {
        windowListeners.set(type, listener);
      },
    });
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);
    vi.stubGlobal('document', {
      addEventListener(type: string, listener: () => void) {
        documentListeners.set(type, listener);
      },
      querySelector(selector: string) {
        if (selector !== '#movie_player') return null;
        return {
          getPlayerResponse: () => ({
            videoDetails: { videoId },
            captions: {
              playerCaptionsTracklistRenderer: { captionTracks: [] },
            },
          }),
          getOption: () => selectedTrack,
          setOption: async (
            _module: string,
            _option: string,
            value: Record<string, string>,
          ) => {
            selectedTrack = value;
            await window.fetch(
              `https://www.youtube.com/api/timedtext?v=${videoId}` +
                '&lang=ja&pot=POT_PLACEHOLDER&fmt=json3',
            );
          },
        };
      },
    });

    startYoutubeMainHook();
    windowListeners.get('message')?.({
      source: window,
      data: youtubePlayerCommand(
        'set-ja',
        videoId,
        generation,
        'set-caption-track',
        { languageCode: 'ja' },
      ),
    } as unknown as MessageEvent<unknown>);

    await vi.waitFor(() => {
      expect(
        postMessage.mock.calls.some(
          ([message]) =>
            message.type === 'youtube-player-command-result' &&
            message.requestId === 'set-ja',
        ),
      ).toBe(true);
    });

    const timedText = postMessage.mock.calls
      .map(([message]) => message)
      .find((message) => message.type === 'youtube-timedtext-request');
    expect(timedText).toMatchObject({
      videoId,
      generation,
      request: {
        method: 'GET',
        url:
          `https://www.youtube.com/api/timedtext?v=${videoId}` +
          '&lang=ja&pot=POT_PLACEHOLDER&fmt=json3',
      },
    });

    documentListeners.get('yt-navigate-start')?.();
    await window.fetch(
      `https://www.youtube.com/api/timedtext?v=${videoId}` +
        '&lang=ja&pot=NEXT_POT&fmt=json3',
    );
    const afterNavigation = postMessage.mock.calls.at(-1)?.[0];
    expect(afterNavigation).toMatchObject({
      type: 'youtube-timedtext-request',
      videoId,
    });
    expect(afterNavigation.generation).toBeUndefined();
  });
});
