import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  NETFLIX_TRACK_REQUEST_ATTRIBUTE,
  netflixTrackRequest,
} from '../src/core/messages';
import {
  isNetflixCachedTimedTextUrl,
  matchesNetflixTimedTextKind,
  startNetflixMainHook,
} from '../src/main/netflix-hook';

const TTML =
  '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" ' +
  'xml:lang="ja"><body><div><p begin="0s" end="1s">字幕</p></div></body></tt>';
const ENGLISH_SUBS =
  '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" ' +
  'xml:lang="en" nttm:textType="SUBS"><body><div>' +
  '<p begin="0s" end="1s">English</p></div></body></tt>';
const ENGLISH_CC = ENGLISH_SUBS.replace(
  'nttm:textType="SUBS"',
  'nttm:textType="CC"',
);

class FakeXmlHttpRequest {
  open(): void {}
  send(): void {}
}

const ORIGINAL_JSON_PARSE = JSON.parse;

afterEach(() => {
  JSON.parse = ORIGINAL_JSON_PARSE;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Netflix MAIN-world request ownership', () => {
  it('limits cached replay to signed OCA timed-text resources of the requested kind', () => {
    expect(
      isNetflixCachedTimedTextUrl(
        'https://ipv4-c109-sin001-ix.1.oca.nflxvideo.net/?o=1&token=secret',
      ),
    ).toBe(true);
    expect(
      isNetflixCachedTimedTextUrl(
        'https://ipv4-c109-sin001-ix.1.oca.nflxvideo.net/range/1-100?o=1',
      ),
    ).toBe(false);
    expect(
      matchesNetflixTimedTextKind(ENGLISH_SUBS, 'subtitles'),
    ).toBe(true);
    expect(
      matchesNetflixTimedTextKind(ENGLISH_CC, 'subtitles'),
    ).toBe(false);
    expect(
      matchesNetflixTimedTextKind(ENGLISH_CC, 'closed-captions'),
    ).toBe(true);
  });

  it('replays a current-page cached TTML response after the request is armed', async () => {
    const subtitleUrl =
      'https://ipv4-c109-sin001-ix.1.oca.nflxvideo.net/?o=1&token=secret';
    const originalFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(ENGLISH_SUBS, {
          status: 200,
          headers: { 'content-type': 'text/xml' },
        }),
      );
    const postMessage = vi.fn();
    const attributes = new Map<string, string>();
    let messageListener:
      | ((event: MessageEvent<unknown>) => void)
      | undefined;
    vi.stubGlobal('window', {
      fetch: originalFetch,
      location: {
        href: 'https://www.netflix.com/watch/81262757',
        origin: 'https://www.netflix.com',
      },
      postMessage,
      addEventListener(
        type: string,
        listener: (event: MessageEvent<unknown>) => void,
      ) {
        if (type === 'message') messageListener = listener;
      },
    });
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);
    vi.stubGlobal('performance', {
      getEntriesByType: () => [{ name: subtitleUrl }],
    });
    vi.stubGlobal('document', {
      documentElement: {
        getAttribute(name: string) {
          return attributes.get(name) ?? null;
        },
      },
    });

    startNetflixMainHook();
    const request = netflixTrackRequest(
      'request-cached',
      '81262757',
      {
        contentGeneration: 2,
        clockGeneration: 2,
        selectionGeneration: 0,
      },
      { id: 'english-plain', kind: 'subtitles' },
    );
    attributes.set(NETFLIX_TRACK_REQUEST_ATTRIBUTE, request.requestId);
    messageListener?.({
      source: window,
      data: request,
    } as unknown as MessageEvent<unknown>);

    await vi.waitFor(() => {
      expect(originalFetch).toHaveBeenCalledWith(subtitleUrl, undefined);
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'netflix-ttml-response',
          requestId: request.requestId,
          trackId: request.trackId,
          raw: ENGLISH_SUBS,
        }),
        window.location.origin,
      );
    });
  });

  it('keeps the request-time generation when an old response arrives after re-arm', async () => {
    let resolveOld:
      | ((response: Response) => void)
      | undefined;
    const originalFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => {
          resolveOld = resolve;
        }),
      );
    const postMessage = vi.fn();
    const attributes = new Map<string, string>();
    let messageListener:
      | ((event: MessageEvent<unknown>) => void)
      | undefined;
    vi.stubGlobal('window', {
      fetch: originalFetch,
      location: {
        href: 'https://www.netflix.com/watch/81262757',
        origin: 'https://www.netflix.com',
      },
      postMessage,
      addEventListener(
        type: string,
        listener: (event: MessageEvent<unknown>) => void,
      ) {
        if (type === 'message') messageListener = listener;
      },
    });
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);
    vi.stubGlobal('document', {
      documentElement: {
        getAttribute(name: string) {
          return attributes.get(name) ?? null;
        },
      },
    });

    startNetflixMainHook();
    const oldRequest = netflixTrackRequest(
      'request-old',
      '81262757',
      {
        contentGeneration: 2,
        clockGeneration: 2,
        selectionGeneration: 0,
      },
      { id: 'japanese-plain', kind: 'subtitles' },
    );
    messageListener?.({
      source: window,
      data: oldRequest,
    } as unknown as MessageEvent<unknown>);
    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'netflix-track-request-ready',
          requestId: oldRequest.requestId,
          ok: true,
        }),
        window.location.origin,
      );
    });

    attributes.set(NETFLIX_TRACK_REQUEST_ATTRIBUTE, oldRequest.requestId);
    const oldResponse = window.fetch(
      'https://ipv4-c001-lax001-ix.1.oca.nflxvideo.net/japanese.ttml',
    );
    const newRequest = netflixTrackRequest(
      'request-new',
      '81262757',
      { ...oldRequest.generation, selectionGeneration: 1 },
      { id: 'japanese-cc', kind: 'closed-captions' },
    );
    messageListener?.({
      source: window,
      data: newRequest,
    } as unknown as MessageEvent<unknown>);
    attributes.set(NETFLIX_TRACK_REQUEST_ATTRIBUTE, newRequest.requestId);

    resolveOld?.(
      new Response(TTML, {
        status: 200,
        headers: { 'content-type': 'application/xml' },
      }),
    );
    await oldResponse;
    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'netflix-ttml-response',
          requestId: oldRequest.requestId,
          generation: oldRequest.generation,
          trackId: oldRequest.trackId,
          trackKind: oldRequest.trackKind,
        }),
        window.location.origin,
      );
    });
  });
});
