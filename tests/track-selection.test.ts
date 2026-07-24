import { describe, expect, it } from 'vitest';

import type { TrackInfo } from '../src/core/contracts';
import {
  decideSubtitleSources,
  selectOfficialDualTracks,
} from '../src/core/track-selection';

const officialEnglish: TrackInfo = {
  id: 'en-us_Sdh_Dialog_3',
  language: 'en-US',
  source: 'official',
  label: 'English [CC]',
};

const officialTraditionalChinese: TrackInfo = {
  id: 'zh-hant_Subtitle_Dialog_38',
  language: 'zh-Hant',
  source: 'official',
  label: '中文（繁體）',
};

describe('selectOfficialDualTracks', () => {
  it('selects official English and official Traditional Chinese', () => {
    expect(
      selectOfficialDualTracks([
        officialEnglish,
        officialTraditionalChinese,
      ]),
    ).toEqual({
      english: officialEnglish,
      chinese: officialTraditionalChinese,
      missing: [],
    });
  });

  it('keeps the official-source priority and prefers the exact target tag', () => {
    const exactEnglish = { ...officialEnglish, id: 'en', language: 'en' };
    const exactChinese = {
      ...officialTraditionalChinese,
      id: 'zh-Hant',
    };

    expect(
      selectOfficialDualTracks([
        { ...officialEnglish, source: 'asr' },
        officialEnglish,
        exactEnglish,
        { ...officialTraditionalChinese, language: 'zh-Hant-TW' },
        exactChinese,
        { ...officialTraditionalChinese, source: 'platform-mt' },
      ]),
    ).toEqual({
      english: exactEnglish,
      chinese: exactChinese,
      missing: [],
    });
  });

  it('reports a missing side without treating zh-Hans as zh-Hant', () => {
    const simplifiedChinese: TrackInfo = {
      ...officialTraditionalChinese,
      id: 'zh-hans_Subtitle_Dialog_37',
      language: 'zh-Hans',
      label: '中文（简体）',
    };

    expect(
      selectOfficialDualTracks([officialEnglish, simplifiedChinese]),
    ).toEqual({
      english: officialEnglish,
      chinese: undefined,
      missing: ['zh-Hant'],
    });
    expect(selectOfficialDualTracks([officialTraditionalChinese])).toEqual({
      english: undefined,
      chinese: officialTraditionalChinese,
      missing: ['english'],
    });
  });
});

describe('decideSubtitleSources', () => {
  const simplifiedChinese: TrackInfo = {
    ...officialTraditionalChinese,
    id: 'zh-hans',
    language: 'zh-Hans',
    label: '中文（简体）',
  };

  it('uses two official tracks without machine translation', () => {
    expect(
      decideSubtitleSources([officialEnglish, officialTraditionalChinese]),
    ).toEqual({
      english: { kind: 'official', track: officialEnglish },
      chinese: {
        kind: 'official',
        track: officialTraditionalChinese,
      },
    });
  });

  it('uses English as the source for zh-Hant machine translation', () => {
    expect(decideSubtitleSources([officialEnglish])).toEqual({
      english: { kind: 'official', track: officialEnglish },
      chinese: {
        kind: 'mt',
        source: officialEnglish,
        targetLanguage: 'zh-Hant',
      },
    });
  });

  it('uses OpenCC rather than MT when official English and Simplified Chinese both exist', () => {
    expect(decideSubtitleSources([officialEnglish, simplifiedChinese])).toEqual({
      english: { kind: 'official', track: officialEnglish },
      chinese: {
        kind: 'opencc',
        source: simplifiedChinese,
        targetLanguage: 'zh-Hant',
      },
    });
  });

  it('uses Traditional Chinese as the source for English machine translation', () => {
    expect(decideSubtitleSources([officialTraditionalChinese])).toEqual({
      english: {
        kind: 'mt',
        source: officialTraditionalChinese,
        targetLanguage: 'en',
      },
      chinese: {
        kind: 'official',
        track: officialTraditionalChinese,
      },
    });
  });

  it('converts a lone Simplified Chinese track with OpenCC and never marks it as MT', () => {
    expect(decideSubtitleSources([simplifiedChinese])).toEqual({
      english: {
        kind: 'mt',
        source: simplifiedChinese,
        targetLanguage: 'en',
      },
      chinese: {
        kind: 'opencc',
        source: simplifiedChinese,
        targetLanguage: 'zh-Hant',
      },
    });
  });
});
