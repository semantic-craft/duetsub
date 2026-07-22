import { describe, expect, it } from 'vitest';

import {
  isDuetSubMessage,
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
