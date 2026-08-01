import { describe, expect, it } from 'vitest';

import { readDisneyContentIdentity } from '../src/adapters/disney-location';

describe('Disney+ playback location', () => {
  it.each([
    'https://www.disneyplus.com/play/12345678-1234-1234-1234-123456789abc',
    'https://www.disneyplus.com/zh-hant/play/12345678-1234-1234-1234-123456789abc',
    'https://www.disneyplus.com/en-gb/play/12345678-1234-1234-1234-123456789abc?resume=true',
  ])('normalizes a localized play URL: %s', (value) => {
    expect(readDisneyContentIdentity(value)).toBe(
      '/play/12345678-1234-1234-1234-123456789abc',
    );
  });

  it.each([
    'https://disneyplus.com/zh-hant/play/12345678-1234-1234-1234-123456789abc',
    'http://www.disneyplus.com/zh-hant/play/12345678-1234-1234-1234-123456789abc',
    'https://www.disneyplus.com/zh-hant/home',
    'https://www.disneyplus.com/zh-hant/play/not-an-id',
  ])('rejects a non-player or untrusted URL: %s', (value) => {
    expect(readDisneyContentIdentity(value)).toBeUndefined();
  });
});
