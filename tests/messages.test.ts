import { describe, expect, it } from 'vitest';

import {
  isDuetSubMessage,
  maxSubtitleResponseMessage,
  netflixManifestMessage,
  netflixTtmlResponseMessage,
  primeTtmlResponseMessage,
  youtubeCaptionsMessage,
  youtubePlayerCommand,
  youtubePlayerCommandResult,
  youtubeTimedTextRequestMessage,
} from '../src/core/messages';

const PRIME_TTML_URL =
  'https://cf-timedtext.aux.pv-cdn.net/example/subtitle.ttml2';
const PRIME_FRAGMENTED_TEXT_URL =
  'https://subtitle.ta.pop-vod-dash.main.amazon.pv-cdn.net/asset/' +
  'english_text_1.mp4?token=SIGNED_PLACEHOLDER';
const MAX_CONTENT_IDENTITY =
  '/video/watch/41c7eddd-2eea-4ed3-a299-474d693063f4/35a8260d-3bc6-4b91-b370-a5f3c72ad6d5';

describe('Prime MAIN to ISOLATED messages', () => {
  it('accepts a validated Prime TTML response envelope', () => {
    expect(
      isDuetSubMessage(
        primeTtmlResponseMessage('response-1', PRIME_TTML_URL, '<tt/>'),
      ),
    ).toBe(true);
  });

  it('accepts the trusted fragmented-text URL used by Off Campus', () => {
    const valid = primeTtmlResponseMessage(
      'response-off-campus',
      PRIME_FRAGMENTED_TEXT_URL,
      '\u0000\u0000\u0000\u0008mdat<?xml version="1.0"?><tt/>',
    );

    expect(isDuetSubMessage(valid)).toBe(true);
    expect(
      isDuetSubMessage({
        ...valid,
        url:
          'https://subtitle.ta.pop-vod-dash.main.amazon.pv-cdn.net.' +
          'attacker.example/asset/english_text_1.mp4',
      }),
    ).toBe(false);
  });

  it('rejects page-forged malformed response payloads', () => {
    const valid = primeTtmlResponseMessage(
      'response-1',
      PRIME_TTML_URL,
      '<tt/>',
    );

    expect(
      isDuetSubMessage({
        ...valid,
        url: 'https://attacker.example/subtitle.ttml2',
      }),
    ).toBe(false);
    expect(isDuetSubMessage({ ...valid, raw: '' })).toBe(false);
    expect(isDuetSubMessage({ ...valid, responseId: 42 })).toBe(false);
  });
});

describe('Max MAIN to ISOLATED messages', () => {
  it('binds raw subtitle candidates to the requesting Max content identity', () => {
    const message = maxSubtitleResponseMessage(
      'response-1',
      'manifest',
      'https://media.max.com/title/dash.mpd',
      '<MPD/>',
      MAX_CONTENT_IDENTITY,
    );

    expect(isDuetSubMessage(message)).toBe(true);
    expect(
      isDuetSubMessage({
        ...message,
        contentIdentity:
          '/video/watch/other-title/other-episode/forged-suffix',
      }),
    ).toBe(false);
  });

  it('accepts the current Max h264 CDN and rejects lookalike hosts', () => {
    const valid = maxSubtitleResponseMessage(
      'response-h264',
      'manifest',
      'https://edge.cf.prd.media.h264.io/gcs/title/dash.mpd',
      '<MPD/>',
      MAX_CONTENT_IDENTITY,
    );

    expect(isDuetSubMessage(valid)).toBe(true);
    for (const url of [
      'https://prd.media.h264.io.attacker.example/gcs/title/dash.mpd',
      'https://media.h264.io/gcs/title/dash.mpd',
    ]) {
      expect(isDuetSubMessage({ ...valid, url })).toBe(false);
    }
  });
});

describe('Netflix MAIN to ISOLATED messages', () => {
  it('preserves the observed manifest object and raw XML candidate', () => {
    const manifest = {
      movieId: 81262752,
      timedtexttracks: [],
    };
    const manifestMessage = netflixManifestMessage(manifest);
    const ttmlMessage = netflixTtmlResponseMessage(
      'response-1',
      '81262752',
      '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"/>',
    );

    expect(manifestMessage.manifest).toBe(manifest);
    expect(isDuetSubMessage(manifestMessage)).toBe(true);
    expect(isDuetSubMessage(ttmlMessage)).toBe(true);
  });

  it('rejects malformed Netflix observation payloads', () => {
    expect(
      isDuetSubMessage(
        netflixManifestMessage({ movieId: 81262752 }),
      ),
    ).toBe(false);
    expect(
      isDuetSubMessage({
        ...netflixTtmlResponseMessage('response-1', '81262752', '<tt/>'),
        raw: '',
      }),
    ).toBe(false);
    expect(
      isDuetSubMessage({
        ...netflixTtmlResponseMessage('response-1', '81262752', '<tt/>'),
        contentIdentity: '../other-title',
      }),
    ).toBe(false);
  });
});

describe('YouTube MAIN to ISOLATED messages', () => {
  it('accepts guarded raw captions and a same-video POT request snapshot', () => {
    const captions = youtubeCaptionsMessage('video-one', {
      playerCaptionsTracklistRenderer: { captionTracks: [] },
    });
    const request = youtubeTimedTextRequestMessage('video-one', {
      url:
        'https://www.youtube.com/api/timedtext?v=video-one' +
        '&lang=en&pot=POT_PLACEHOLDER',
      method: 'GET',
      headers: [['accept', 'application/json']],
      credentials: 'include',
    });

    expect(isDuetSubMessage(captions)).toBe(true);
    expect(isDuetSubMessage(request)).toBe(true);
    expect(
      isDuetSubMessage({
        ...request,
        videoId: 'video-two',
      }),
    ).toBe(false);
    expect(
      isDuetSubMessage({
        ...request,
        request: {
          ...request.request,
          url: 'https://www.youtube.com/api/timedtext?v=video-one&lang=en',
        },
      }),
    ).toBe(false);
  });

  it('accepts only explicit JSON-safe player getter and primitive commands', () => {
    const read = youtubePlayerCommand(
      'request-read',
      'video-one',
      'read-caption-state',
    );
    const set = youtubePlayerCommand(
      'request-set',
      'video-one',
      'set-caption-track',
      { languageCode: 'en', kind: 'asr' },
    );
    const result = youtubePlayerCommandResult(
      'request-set',
      'video-one',
      'set-caption-track',
      true,
      { languageCode: 'en', kind: 'asr' },
    );

    expect(isDuetSubMessage(read)).toBe(true);
    expect(isDuetSubMessage(set)).toBe(true);
    expect(isDuetSubMessage(result)).toBe(true);
    expect(
      isDuetSubMessage({
        ...set,
        value: { languageCode: 'en', unsafe: () => undefined },
      }),
    ).toBe(false);
  });
});
