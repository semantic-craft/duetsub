import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readDisneyTimelinePositionMs,
  startDisneyMainHook,
} from '../src/main/disney-hook';

const MASTER_URL =
  'https://vod-edge.media.dssott.com/signed/title/master.m3u8';
const CONTENT_IDENTITY = '/play/12345678-1234-1234-1234-123456789abc';
const MASTER = `#EXTM3U
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub-main",NAME="English",LANGUAGE="en",FORCED=NO,URI="r/en.m3u8"`;

class FakeXmlHttpRequest {
  open(): void {}
  send(): void {}
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Disney+ MAIN-world manifest observation', () => {
  it('reads the absolute program clock instead of segment-local video time', () => {
    const root = {
      querySelector: () => ({
        mediaPlayer: {
          timeline: {
            info: { playheadPositionMs: 991_000 },
          },
        },
      }),
    };

    expect(readDisneyTimelinePositionMs(root)).toBe(991_000);
  });

  it('forwards only the subtitle master manifest with current content ownership', async () => {
    const originalFetch = vi.fn(async () => response(MASTER, MASTER_URL));
    const postMessage = vi.fn();
    vi.stubGlobal('window', {
      fetch: originalFetch,
      location: {
        href: `https://www.disneyplus.com/zh-hant${CONTENT_IDENTITY}`,
        origin: 'https://www.disneyplus.com',
      },
      postMessage,
    });
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);

    startDisneyMainHook();
    await window.fetch(MASTER_URL);

    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledOnce());
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: 'disney-manifest',
      siteId: 'disneyplus',
      contentIdentity: CONTENT_IDENTITY,
      url: MASTER_URL,
    });
  });

  it('ignores a subtitle media playlist without authoritative track metadata', async () => {
    const originalFetch = vi.fn(async () =>
      response('#EXTM3U\npts_0.vtt\n#EXT-X-ENDLIST', MASTER_URL)
    );
    const postMessage = vi.fn();
    vi.stubGlobal('window', {
      fetch: originalFetch,
      location: {
        href: `https://www.disneyplus.com${CONTENT_IDENTITY}`,
        origin: 'https://www.disneyplus.com',
      },
      postMessage,
    });
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);

    startDisneyMainHook();
    await window.fetch(MASTER_URL);
    await Promise.resolve();

    expect(postMessage).not.toHaveBeenCalled();
  });
});

function response(body: string, url: string): Response {
  const value = new Response(body, { status: 200 });
  Object.defineProperty(value, 'url', { value: url });
  return value;
}
