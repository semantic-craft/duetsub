import { describe, expect, it } from 'vitest';

import {
  isDuetSubMessage,
  netflixManifestMessage,
  netflixTtmlResponseMessage,
  primeTtmlResponseMessage,
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

describe('Netflix MAIN to ISOLATED messages', () => {
  it('preserves the observed manifest object and raw XML candidate', () => {
    const manifest = {
      movieId: 81262752,
      timedtexttracks: [],
    };
    const manifestMessage = netflixManifestMessage(manifest);
    const ttmlMessage = netflixTtmlResponseMessage(
      'response-1',
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
        ...netflixTtmlResponseMessage('response-1', '<tt/>'),
        raw: '',
      }),
    ).toBe(false);
  });
});
