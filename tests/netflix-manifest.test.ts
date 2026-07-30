import { describe, expect, it } from 'vitest';

import { parseNetflixManifest } from '../src/adapters/netflix-manifest';

const TEXT_DOWNLOADABLE = {
  'dfxp-ls-sdh': {
    downloadUrls: {
      primary: 'https://example.oca.nflxvideo.net/?redacted',
    },
  },
};

describe('parseNetflixManifest', () => {
  it('exposes only hydrated official tracks with text downloadables', () => {
    const manifest = parseNetflixManifest({
      movieId: 81262752,
      timedtexttracks: [
        {
          id: 'none',
          language: '',
          languageDescription: 'Off',
          hydrated: true,
          isNoneTrack: true,
          ttDownloadables: TEXT_DOWNLOADABLE,
        },
        {
          id: 'forced',
          language: 'en',
          languageDescription: 'English',
          hydrated: true,
          isForcedNarrative: true,
          ttDownloadables: TEXT_DOWNLOADABLE,
        },
        {
          id: 'dehydrated',
          language: 'en',
          languageDescription: 'English',
          hydrated: false,
          ttDownloadables: TEXT_DOWNLOADABLE,
        },
        {
          id: 'missing-downloadable',
          language: 'en',
          languageDescription: 'English',
          hydrated: true,
          ttDownloadables: {},
        },
        {
          id: 'image-only',
          language: 'zh-Hant',
          languageDescription: '中文（繁體）',
          hydrated: true,
          ttDownloadables: {
            image: {
              isImage: true,
              urls: [{ url: 'https://example.oca.nflxvideo.net/image' }],
            },
          },
        },
        {
          id: 'english-cc',
          language: 'en-US',
          languageDescription: 'English',
          rawTrackType: 'closedcaptions',
          hydrated: true,
          ttDownloadables: TEXT_DOWNLOADABLE,
        },
        {
          id: 'traditional-chinese',
          language: 'zh-Hant',
          languageDescription: '中文（繁體）',
          rawTrackType: 'subtitles',
          hydrated: true,
          ttDownloadables: TEXT_DOWNLOADABLE,
        },
      ],
    });

    expect(manifest).toEqual({
      contentIdentity: '81262752',
      tracks: [
        {
          id: 'english-cc',
          language: 'en-US',
          source: 'official',
          label: 'English [CC]',
          kind: 'closed-captions',
        },
        {
          id: 'traditional-chinese',
          language: 'zh-Hant',
          source: 'official',
          label: '中文（繁體）',
          kind: 'subtitles',
        },
      ],
    });
  });

  it('preserves a single downloadable official track for later fallback', () => {
    expect(
      parseNetflixManifest({
        viewableId: 'single-track-title',
        timedtexttracks: [
          {
            new_track_id: 'english-only',
            language: 'en',
            languageDescription: 'English',
            hydrated: true,
            downloadables: TEXT_DOWNLOADABLE,
          },
        ],
      }),
    ).toMatchObject({
      contentIdentity: 'single-track-title',
      tracks: [{ id: 'english-only', language: 'en' }],
    });
  });

  it('catalogs arbitrary canonical languages and rejects forced variants', () => {
    expect(
      parseNetflixManifest({
        movieId: 'non-default-pair',
        timedtexttracks: [
          {
            id: 'japanese',
            language: 'JA-jp',
            languageDescription: '日本語',
            hydrated: true,
            rawTrackType: 'subtitles',
            ttDownloadables: TEXT_DOWNLOADABLE,
          },
          {
            id: 'german-cc',
            language: 'de-de',
            languageDescription: 'Deutsch',
            hydrated: true,
            rawTrackType: 'closedcaptions',
            ttDownloadables: TEXT_DOWNLOADABLE,
          },
          {
            id: 'forced-french',
            language: 'fr',
            languageDescription: 'Français',
            hydrated: true,
            rawTrackType: 'forcednarrative',
            ttDownloadables: TEXT_DOWNLOADABLE,
          },
        ],
      }),
    ).toMatchObject({
      tracks: [
        {
          id: 'japanese',
          language: 'ja-JP',
          kind: 'subtitles',
        },
        {
          id: 'german-cc',
          language: 'de-DE',
          kind: 'closed-captions',
        },
      ],
    });
  });

  it('rejects candidates without both identity and timed text tracks', () => {
    expect(parseNetflixManifest({ movieId: 1 })).toBeUndefined();
    expect(parseNetflixManifest({ timedtexttracks: [] })).toBeUndefined();
  });
});
