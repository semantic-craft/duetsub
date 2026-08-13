import { describe, expect, it } from 'vitest';

import { readMaxContentIdentity } from '../src/adapters/max-location';

describe('readMaxContentIdentity', () => {
  it('accepts the current single-id Max watch path', () => {
    const path = '/video/watch/41c7eddd-2eea-4ed3-a299-474d693063f4';

    expect(
      readMaxContentIdentity(`https://play.hbomax.com${path}`),
    ).toBe(path);
  });

  it('rejects obsolete or ambiguous Max watch paths', () => {
    expect(
      readMaxContentIdentity(
        'https://play.hbomax.com/video/watch/first-id/second-id',
      ),
    ).toBeUndefined();
    expect(
      readMaxContentIdentity(
        'https://play.hbomax.com/video/watch/current-id/forged-suffix',
      ),
    ).toBeUndefined();
  });
});
