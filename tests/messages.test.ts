import { describe, expect, it } from 'vitest';

import {
  isDuetSubMessage,
  primeTtmlResponseMessage,
  youtubeCaptionsMessage,
  youtubePlayerCommand,
  youtubePlayerCommandResult,
  youtubeTimedTextRequestMessage,
} from '../src/core/messages';

const PRIME_TTML_URL =
  'https://cf-timedtext.aux.pv-cdn.net/example/subtitle.ttml2';

describe('Prime MAIN to ISOLATED messages', () => {
  it('accepts a validated Prime TTML response envelope', () => {
    expect(
      isDuetSubMessage(
        primeTtmlResponseMessage('response-1', PRIME_TTML_URL, '<tt/>'),
      ),
    ).toBe(true);
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
