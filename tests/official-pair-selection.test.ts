import { describe, expect, it } from 'vitest';

import type { TrackInfo } from '../src/core/contracts';
import {
  DEFAULT_LANGUAGE_PAIR_PREFERENCE,
  resolveOfficialPair,
  resolveOfficialPairCues,
  type LanguagePairPreference,
} from '../src/core/official-pair-selection';

const DEFAULT_PAIR: LanguagePairPreference = DEFAULT_LANGUAGE_PAIR_PREFERENCE;

function track(
  id: string,
  language: string,
  overrides: Partial<TrackInfo> = {},
): TrackInfo {
  return {
    id,
    language,
    source: 'official',
    label: id,
    kind: 'subtitles',
    ...overrides,
  };
}

describe('resolveOfficialPair', () => {
  it('catalogs only official, non-forced subtitle tracks', () => {
    const english = track('official-en', 'en');
    const traditionalChinese = track('official-zh-Hant', 'zh-Hant');

    const result = resolveOfficialPair({
      siteId: 'netflix',
      tracks: [
        english,
        traditionalChinese,
        track('asr-en', 'en', { source: 'asr' }),
        track('platform-zh-Hant', 'zh-Hant', { source: 'platform-mt' }),
        track('forced-ja', 'ja', { forcedOnly: true }),
        track('invalid-language', 'not_a_language'),
      ],
      preference: DEFAULT_PAIR,
    });

    expect(result).toMatchObject({
      kind: 'ready',
      top: english,
      bottom: traditionalChinese,
    });
    expect(result.catalog.map(({ language }) => language)).toEqual([
      'en',
      'zh-Hant',
    ]);
  });

  it('prefers ordinary subtitles over closed captions without parsing labels', () => {
    const closedCaptions = track('en-closed-captions', 'en', {
      kind: 'closed-captions',
      label: 'English accessibility track',
    });
    const subtitles = track('en-subtitles', 'en', {
      label: 'English dialogue',
    });

    expect(
      resolveOfficialPair({
        siteId: 'max',
        tracks: [
          closedCaptions,
          subtitles,
          track('zh-Hant-subtitles', 'zh-Hant'),
        ],
        preference: DEFAULT_PAIR,
      }),
    ).toMatchObject({
      kind: 'ready',
      top: subtitles,
    });
  });

  it('rejects a pair whose tags canonicalize to the same language', () => {
    expect(
      resolveOfficialPair({
        siteId: 'primevideo',
        tracks: [track('english-us', 'en-US')],
        preference: {
          version: 1,
          top: 'en-us',
          bottom: 'en-US',
        },
      }),
    ).toMatchObject({
      kind: 'unavailable',
      reason: 'same-language',
    });
  });

  it('matches compatible script families across regional tags', () => {
    const traditionalChineseTaiwan = track('traditional-taiwan', 'zh-TW');

    expect(
      resolveOfficialPair({
        siteId: 'youtube',
        tracks: [
          traditionalChineseTaiwan,
          track('english', 'en'),
        ],
        preference: {
          version: 1,
          top: 'zh-Hant-HK',
          bottom: 'en',
        },
      }),
    ).toMatchObject({
      kind: 'ready',
      top: traditionalChineseTaiwan,
    });
  });

  it('prefers an exact tag over a compatible regional candidate', () => {
    const exact = track('traditional-exact', 'zh-Hant');

    expect(
      resolveOfficialPair({
        siteId: 'youtube',
        tracks: [
          track('traditional-taiwan', 'zh-TW'),
          exact,
          track('english', 'en'),
        ],
        preference: DEFAULT_PAIR,
      }),
    ).toMatchObject({
      kind: 'ready',
      bottom: exact,
    });
  });

  it('matches a regional preference to the same unscripted language', () => {
    const britishEnglish = track('english-gb', 'en-GB');

    expect(
      resolveOfficialPair({
        siteId: 'netflix',
        tracks: [
          britishEnglish,
          track('traditional', 'zh-Hant'),
        ],
        preference: {
          version: 1,
          top: 'en-US',
          bottom: 'zh-Hant',
        },
      }),
    ).toMatchObject({
      kind: 'ready',
      top: britishEnglish,
    });
  });

  it('does not match different explicit scripts of the same language', () => {
    expect(
      resolveOfficialPair({
        siteId: 'netflix',
        tracks: [
          track('serbian-cyrillic', 'sr-Cyrl'),
          track('english', 'en'),
        ],
        preference: {
          version: 1,
          top: 'sr-Latn',
          bottom: 'en',
        },
      }),
    ).toMatchObject({
      kind: 'unavailable',
      reason: 'top-missing',
    });
  });

  it('matches a bare preference when the catalog has one script family', () => {
    const regionalEnglish = track('english-us', 'en-US');

    expect(
      resolveOfficialPair({
        siteId: 'max',
        tracks: [
          regionalEnglish,
          track('traditional', 'zh-Hant'),
        ],
        preference: DEFAULT_PAIR,
      }),
    ).toMatchObject({
      kind: 'ready',
      top: regionalEnglish,
    });
  });

  it('reports ambiguity instead of assigning bare zh to a script family', () => {
    expect(
      resolveOfficialPair({
        siteId: 'youtube',
        tracks: [
          track('simplified', 'zh-Hans'),
          track('traditional', 'zh-Hant'),
          track('english', 'en'),
        ],
        preference: {
          version: 1,
          top: 'zh',
          bottom: 'en',
        },
      }),
    ).toMatchObject({
      kind: 'unavailable',
      reason: 'ambiguous-language',
    });
  });

  it('keeps English above Traditional Chinese as the default pair', () => {
    const english = track('english', 'en-US', {
      kind: 'closed-captions',
    });
    const traditionalChinese = track('traditional', 'zh-Hant');

    expect(
      resolveOfficialPair({
        siteId: 'primevideo',
        tracks: [english, traditionalChinese],
        preference: DEFAULT_LANGUAGE_PAIR_PREFERENCE,
      }),
    ).toMatchObject({
      kind: 'ready',
      top: english,
      bottom: traditionalChinese,
    });
  });

  it('allows Simplified and Traditional Chinese to form a pair', () => {
    const simplifiedChinese = track('simplified', 'zh-Hans');
    const traditionalChinese = track('traditional', 'zh-Hant');

    expect(
      resolveOfficialPair({
        siteId: 'netflix',
        tracks: [simplifiedChinese, traditionalChinese],
        preference: {
          version: 1,
          top: 'zh-Hans',
          bottom: 'zh-Hant',
        },
      }),
    ).toMatchObject({
      kind: 'ready',
      top: simplifiedChinese,
      bottom: traditionalChinese,
    });
  });

  it('resolves a non-English European official pair without fallback', () => {
    const german = track('german', 'de');
    const french = track('french', 'fr');

    expect(
      resolveOfficialPair({
        siteId: 'netflix',
        tracks: [german, french],
        preference: {
          version: 1,
          top: 'de',
          bottom: 'fr',
        },
      }),
    ).toMatchObject({
      kind: 'ready',
      top: german,
      bottom: french,
    });
  });

  it('fails closed when either resolved official track has no cues', () => {
    const japanese = track('japanese', 'ja');
    const simplifiedChinese = track('simplified', 'zh-Hans');
    const preference: LanguagePairPreference = {
      version: 1,
      top: 'ja',
      bottom: 'zh-Hans',
    };

    expect(
      resolveOfficialPairCues({
        siteId: 'youtube',
        tracks: [japanese, simplifiedChinese],
        preference,
        cuesByTrack: new Map([
          [
            japanese.id,
            [{ start: 0, end: 1_000, text: '日本語', language: 'ja' }],
          ],
        ]),
      }),
    ).toMatchObject({
      kind: 'unavailable',
      reason: 'bottom-empty',
    });
    expect(
      resolveOfficialPairCues({
        siteId: 'youtube',
        tracks: [japanese, simplifiedChinese],
        preference,
        cuesByTrack: new Map(),
      }),
    ).toMatchObject({
      kind: 'unavailable',
      reason: 'both-empty',
    });
  });

  it('keeps adapter catalog order between variants of the same kind', () => {
    const first = track('english-first', 'en');
    const second = track('english-second', 'en');

    expect(
      resolveOfficialPair({
        siteId: 'primevideo',
        tracks: [
          first,
          second,
          track('traditional', 'zh-Hant'),
        ],
        preference: DEFAULT_PAIR,
      }),
    ).toMatchObject({
      kind: 'ready',
      top: first,
    });
  });
});
