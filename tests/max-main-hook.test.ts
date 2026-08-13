import { afterEach, describe, expect, it, vi } from 'vitest';

import { startMaxMainHook } from '../src/main/max-hook';
import { maxObserverReadyMessage } from '../src/core/messages';

const EPISODE_ONE =
  '/video/watch/b8a64f23-c654-4be6-829a-1cb5fb0b7c8e';
const EPISODE_TWO =
  '/video/watch/41c7eddd-2eea-4ed3-a299-474d693063f4';
const PLAYBACK_INFO_URL =
  'https://default.any-any.prd.api.hbomax.com/any/playback/v1/playbackInfo';
const MANIFEST_URL =
  'https://edge.cf.prd.media.h264.io/title/dash.mpd';
const VTT_URL =
  'https://edge.cf.prd.media.h264.io/title/t/en/1.vtt';

class FakeXmlHttpRequest {
  status = 0;
  response: unknown = '';
  readonly #listeners: Array<() => void> = [];

  open(
    _method: string,
    _url: string | URL,
    _async?: boolean,
    _username?: string | null,
    _password?: string | null,
  ): void {}

  send(_body?: Document | XMLHttpRequestBodyInit | null): void {}

  addEventListener(type: string, callback: EventListener): void {
    if (type === 'load') this.#listeners.push(() => callback(new Event('load')));
  }

  finish(): void {
    for (const listener of this.#listeners) listener();
  }
}

const originalFakeOpen = FakeXmlHttpRequest.prototype.open;
const originalFakeSend = FakeXmlHttpRequest.prototype.send;

afterEach(() => {
  FakeXmlHttpRequest.prototype.open = originalFakeOpen;
  FakeXmlHttpRequest.prototype.send = originalFakeSend;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Max MAIN-world response observation', () => {
  it('binds a response to the episode active when it completes', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(10);
    let resolveFetch:
      | ((response: Response) => void)
      | undefined;
    const originalFetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const postMessage = vi.fn();
    const location = {
      href: `https://play.hbomax.com${EPISODE_ONE}`,
      origin: 'https://play.hbomax.com',
    };

    vi.stubGlobal('window', {
      fetch: originalFetch,
      location,
      postMessage,
      addEventListener() {},
    });
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);

    startMaxMainHook();
    const response = window.fetch(PLAYBACK_INFO_URL);
    now.mockReturnValue(20);
    location.href = `https://play.hbomax.com${EPISODE_TWO}`;
    resolveFetch?.(
      new Response(
        JSON.stringify({
          manifest: {
            url: 'https://edge.prd.media.h264.io/title/dash.mpd',
          },
          videos: [],
        }),
        { status: 200 },
      ),
    );
    await response;

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledOnce();
    });
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: 'max-subtitle-response',
      kind: 'playback-info',
      contentIdentity: EPISODE_TWO,
      requestStartedAtMs: performance.timeOrigin + 10,
    });
  });

  it('preserves the XHR send time when a VTT completes later', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(30);
    const postMessage = vi.fn();
    const location = {
      href: `https://play.hbomax.com${EPISODE_ONE}`,
      origin: 'https://play.hbomax.com',
    };

    vi.stubGlobal('window', {
      fetch: vi.fn(),
      location,
      postMessage,
      addEventListener() {},
    });
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);

    startMaxMainHook();
    const xhr = new FakeXmlHttpRequest();
    xhr.open('GET', VTT_URL);
    xhr.send();
    now.mockReturnValue(40);
    xhr.status = 200;
    xhr.response = 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nOfficial';
    xhr.finish();

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledOnce();
    });
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: 'max-subtitle-response',
      kind: 'vtt',
      requestStartedAtMs: performance.timeOrigin + 30,
    });
  });

  it('replays only same-content startup metadata after ISOLATED announces readiness', async () => {
    let onMessage: ((event: MessageEvent<unknown>) => void) | undefined;
    const postMessage = vi.fn();
    const location = {
      href: `https://play.hbomax.com${EPISODE_ONE}`,
      origin: 'https://play.hbomax.com',
    };
    const playbackInfo = JSON.stringify({
      manifest: { url: 'https://edge.prd.media.h264.io/title/dash.mpd' },
      videos: [],
    });
    const manifest = '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"/>';
    const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nOfficial';
    const fakeWindow = {
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const raw = url === MANIFEST_URL
          ? manifest
          : url === VTT_URL
            ? vtt
            : playbackInfo;
        return new Response(raw, { status: 200 });
      }),
      location,
      postMessage,
      addEventListener(
        type: string,
        callback: (event: MessageEvent<unknown>) => void,
      ) {
        if (type === 'message') onMessage = callback;
      },
    } as unknown as Window & typeof globalThis;

    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);

    startMaxMainHook();
    await window.fetch(PLAYBACK_INFO_URL);
    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledOnce();
    });
    const episodeOnePlaybackInfo = postMessage.mock.calls[0]?.[0];
    await window.fetch(MANIFEST_URL);
    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledTimes(2);
    });
    const episodeOneManifest = postMessage.mock.calls[1]?.[0];
    await window.fetch(VTT_URL);
    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledTimes(3);
    });
    location.href = `https://play.hbomax.com${EPISODE_TWO}`;
    await window.fetch(PLAYBACK_INFO_URL);
    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledTimes(4);
    });
    location.href = `https://play.hbomax.com${EPISODE_ONE}`;
    postMessage.mockClear();

    onMessage?.({
      source: fakeWindow,
      data: maxObserverReadyMessage(EPISODE_ONE),
    } as unknown as MessageEvent<unknown>);

    expect(postMessage.mock.calls.map(([message]) => message)).toEqual([
      episodeOnePlaybackInfo,
      episodeOneManifest,
    ]);
  });
});
