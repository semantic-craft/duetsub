import { describe, expect, it } from 'vitest';

import { youtubeVideoIdFromUrl } from '../src/adapters/youtube-url';

describe('youtubeVideoIdFromUrl', () => {
  it('activates only on the exact HTTPS www.youtube.com watch route', () => {
    expect(
      youtubeVideoIdFromUrl(
        'https://www.youtube.com/watch?feature=share&v=video-one',
      ),
    ).toBe('video-one');
    expect(youtubeVideoIdFromUrl('https://www.youtube.com/')).toBeUndefined();
    expect(
      youtubeVideoIdFromUrl('https://www.youtube.com/shorts/video-one'),
    ).toBeUndefined();
    expect(
      youtubeVideoIdFromUrl('https://m.youtube.com/watch?v=video-one'),
    ).toBeUndefined();
    expect(
      youtubeVideoIdFromUrl('http://www.youtube.com/watch?v=video-one'),
    ).toBeUndefined();
  });
});
