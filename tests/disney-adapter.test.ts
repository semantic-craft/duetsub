import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDisneyAdapter,
  fetchDisneyTrackResource,
} from '../src/adapters/disney';
import type { DisneyTrackResource } from '../src/adapters/disney-hls';
import { disneyTimelineMessage } from '../src/core/messages';

const PLAYLIST_URL =
  'https://vod-edge.media.dssott.com/signed/title/r/english.m3u8';

const RESOURCE: DisneyTrackResource = {
  track: {
    id: 'en:normal',
    language: 'en',
    source: 'official',
    label: 'English',
    kind: 'subtitles',
  },
  playlistUrl: PLAYLIST_URL,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Disney+ official subtitle acquisition', () => {
  it('exposes the latest validated program clock for cue synchronization', () => {
    let onMessage: ((event: MessageEvent<unknown>) => void) | undefined;
    vi.stubGlobal('window', {
      location: {
        href:
          'https://www.disneyplus.com/zh-hant/play/' +
          '12345678-1234-1234-1234-123456789abc',
      },
      addEventListener: (
        type: string,
        callback: (event: MessageEvent<unknown>) => void,
      ) => {
        if (type === 'message') onMessage = callback;
      },
    });
    const adapter = createDisneyAdapter();

    onMessage?.({
      source: window,
      data: disneyTimelineMessage(
        991_000,
        '/play/12345678-1234-1234-1234-123456789abc',
      ),
    } as unknown as MessageEvent<unknown>);

    expect(adapter.getPlaybackTimeMs?.()).toBe(991_000);
  });

  it('loads every VOD segment and normalizes its timestamp map', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === PLAYLIST_URL) {
        return response(`#EXTM3U
#EXTINF:2,
segments/pts_90000.vtt
#EXTINF:2,
segments/pts_270000.vtt
#EXT-X-ENDLIST`, url);
      }
      const startPts = url.endsWith('pts_90000.vtt') ? 90_000 : 270_000;
      return response(`WEBVTT
X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:${startPts}

00:00:00.200 --> 00:00:00.800
Cue ${startPts}`, url);
    });

    await expect(
      fetchDisneyTrackResource(
        RESOURCE,
        new AbortController().signal,
        fetcher,
      ),
    ).resolves.toEqual([
      { start: 1_200, end: 1_800, text: 'Cue 90000', language: 'en' },
      { start: 3_200, end: 3_800, text: 'Cue 270000', language: 'en' },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('does not accept a partial track when one segment fails', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === PLAYLIST_URL) {
        return response(
          '#EXTM3U\n#EXTINF:2,\npts_0.vtt\n#EXT-X-ENDLIST',
          url,
        );
      }
      return response('missing', url, 404);
    });

    await expect(
      fetchDisneyTrackResource(
        RESOURCE,
        new AbortController().signal,
        fetcher,
      ),
    ).rejects.toThrow('VTT segment failed: 404');
  });
});

function response(body: string, url: string, status = 200): Response {
  const value = new Response(body, { status });
  Object.defineProperty(value, 'url', { value: url });
  return value;
}
