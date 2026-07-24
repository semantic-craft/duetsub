import { describe, expect, it } from 'vitest';

import { isNetflixWatchUrl } from '../src/adapters/netflix-location';

describe('isNetflixWatchUrl', () => {
  it('activates only for an HTTPS www.netflix.com watch identity', () => {
    expect(
      isNetflixWatchUrl('https://www.netflix.com/watch/81262752'),
    ).toBe(true);
    expect(
      isNetflixWatchUrl('https://www.netflix.com/watch/81262752/'),
    ).toBe(true);

    expect(isNetflixWatchUrl('https://www.netflix.com/watch/')).toBe(false);
    expect(isNetflixWatchUrl('https://www.netflix.com/browse')).toBe(false);
    expect(
      isNetflixWatchUrl('https://www.netflix.com/watch/81262752/episodes'),
    ).toBe(false);
    expect(
      isNetflixWatchUrl('http://www.netflix.com/watch/81262752'),
    ).toBe(false);
    expect(
      isNetflixWatchUrl('https://netflix.com/watch/81262752'),
    ).toBe(false);
  });
});
