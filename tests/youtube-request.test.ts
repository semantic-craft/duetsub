import { describe, expect, it } from 'vitest';

import {
  cloneYoutubeTimedTextRequest,
  type YoutubeBoundTrackHandle,
  type YoutubeRequestContext,
  type YoutubeTimedTextRequestSnapshot,
} from '../src/adapters/youtube-request';
import type { YoutubeTrackHandle } from '../src/adapters/youtube-tracks';

const VIDEO_ID = 'video-one';
const CONTEXT: YoutubeRequestContext = {
  videoId: VIDEO_ID,
  generation: {
    contentGeneration: 3,
    clockGeneration: 4,
    selectionGeneration: 5,
  },
};
const snapshot: YoutubeTimedTextRequestSnapshot = {
  context: CONTEXT,
  url:
    `https://www.youtube.com/api/timedtext?v=${VIDEO_ID}` +
    '&lang=en&kind=asr&name=old&tlang=zh-Hant&fmt=srv3' +
    '&pot=POT_PLACEHOLDER&potc=1',
  method: 'GET',
  headers: [['accept', 'application/json']],
  credentials: 'include',
  cache: 'no-store',
  redirect: 'follow',
  referrer: 'https://www.youtube.com/watch?v=video-one',
  referrerPolicy: 'strict-origin-when-cross-origin',
  mode: 'cors',
  integrity: '',
  keepalive: false,
};

describe('cloneYoutubeTimedTextRequest', () => {
  it('clones the captured POT request for a creator track and forces json3', () => {
    const handle: YoutubeTrackHandle = {
      videoId: VIDEO_ID,
      baseUrl: `https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=zh-TW`,
      vssId: '.zh-TW',
      languageCode: 'zh-TW',
      trackName: '',
    };
    const boundHandle: YoutubeBoundTrackHandle = {
      context: CONTEXT,
      handle,
    };

    const request = cloneYoutubeTimedTextRequest(
      snapshot,
      boundHandle,
      CONTEXT,
    );
    const url = new URL(request.url);

    expect({
      lang: url.searchParams.get('lang'),
      kind: url.searchParams.get('kind'),
      name: url.searchParams.get('name'),
      tlang: url.searchParams.get('tlang'),
      fmt: url.searchParams.get('fmt'),
      potPresent: url.searchParams.has('pot'),
      accept: request.headers.get('accept'),
      credentials: request.credentials,
      cache: request.cache,
      redirect: request.redirect,
      referrer: request.referrer,
      referrerPolicy: request.referrerPolicy,
      mode: request.mode,
      integrity: request.integrity,
      keepalive: request.keepalive,
    }).toEqual({
      lang: 'zh-TW',
      kind: null,
      name: null,
      tlang: null,
      fmt: 'json3',
      potPresent: true,
      accept: 'application/json',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow',
      referrer: 'https://www.youtube.com/watch?v=video-one',
      referrerPolicy: 'strict-origin-when-cross-origin',
      mode: 'cors',
      integrity: '',
      keepalive: false,
    });
  });

  it('rejects POT and track handles from another video or generation', () => {
    const handle: YoutubeBoundTrackHandle = {
      context: CONTEXT,
      handle: {
        videoId: VIDEO_ID,
        baseUrl: `https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=en`,
        vssId: '.en',
        languageCode: 'en',
        trackName: '',
      },
    };

    expect(() =>
      cloneYoutubeTimedTextRequest(snapshot, handle, {
        ...CONTEXT,
        videoId: 'video-two',
      }),
    ).toThrow('stale');
    expect(() =>
      cloneYoutubeTimedTextRequest(snapshot, handle, {
        ...CONTEXT,
        generation: { contentGeneration: 4, clockGeneration: 4 },
      }),
    ).toThrow('stale');
    expect(() =>
      cloneYoutubeTimedTextRequest(snapshot, handle, {
        ...CONTEXT,
        generation: {
          ...CONTEXT.generation,
          clockGeneration: 6,
        },
      }),
    ).toThrow('stale');
    expect(() =>
      cloneYoutubeTimedTextRequest(snapshot, handle, {
        ...CONTEXT,
        generation: {
          ...CONTEXT.generation,
          selectionGeneration: 1,
        },
      }),
    ).toThrow('stale');
  });

  it('adds ASR, named-track, and tlang parameters only when requested', () => {
    const boundHandle: YoutubeBoundTrackHandle = {
      context: CONTEXT,
      handle: {
        videoId: VIDEO_ID,
        baseUrl: `https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=en`,
        vssId: 'a.en',
        languageCode: 'en',
        trackName: 'Speaker one',
        kind: 'asr',
        tlang: 'zh-Hant',
      },
    };

    const url = new URL(
      cloneYoutubeTimedTextRequest(snapshot, boundHandle, CONTEXT).url,
    );

    expect({
      kind: url.searchParams.get('kind'),
      name: url.searchParams.get('name'),
      tlang: url.searchParams.get('tlang'),
      fmt: url.searchParams.get('fmt'),
    }).toEqual({
      kind: 'asr',
      name: 'Speaker one',
      tlang: 'zh-Hant',
      fmt: 'json3',
    });
  });

  it('clones both selected creator tracks from one generation-bound POT request', () => {
    const handles = ['ja', 'zh-CN'].map((languageCode) => ({
      context: CONTEXT,
      handle: {
        videoId: VIDEO_ID,
        baseUrl:
          `https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=${languageCode}`,
        vssId: `.${languageCode}`,
        languageCode,
        trackName: '',
      },
    }));

    const requests = handles.map((handle) =>
      cloneYoutubeTimedTextRequest(snapshot, handle, CONTEXT)
    );

    expect(
      requests.map((request) => {
        const url = new URL(request.url);
        return {
          lang: url.searchParams.get('lang'),
          pot: url.searchParams.get('pot'),
          kind: url.searchParams.get('kind'),
          tlang: url.searchParams.get('tlang'),
          fmt: url.searchParams.get('fmt'),
        };
      }),
    ).toEqual([
      {
        lang: 'ja',
        pot: 'POT_PLACEHOLDER',
        kind: null,
        tlang: null,
        fmt: 'json3',
      },
      {
        lang: 'zh-CN',
        pot: 'POT_PLACEHOLDER',
        kind: null,
        tlang: null,
        fmt: 'json3',
      },
    ]);
  });
});
