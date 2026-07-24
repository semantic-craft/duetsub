import { describe, expect, it } from 'vitest';

import type { TrackInfo } from '../src/core/contracts';
import {
  selectBilingualTracks,
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

describe('selectBilingualTracks', () => {
  it('prefers creator tracks, then ASR, then platform tlang candidates', () => {
    const asrEnglish: TrackInfo = {
      ...officialEnglish,
      id: 'asr-en',
      source: 'asr',
    };
    const translatedEnglish: TrackInfo = {
      ...officialEnglish,
      id: 'tlang-en',
      source: 'platform-mt',
    };
    const translatedChinese: TrackInfo = {
      ...officialTraditionalChinese,
      id: 'tlang-zh-Hant',
      source: 'platform-mt',
    };

    expect(
      selectBilingualTracks([
        translatedEnglish,
        asrEnglish,
        officialEnglish,
        translatedChinese,
        officialTraditionalChinese,
      ]),
    ).toMatchObject({
      english: officialEnglish,
      chinese: officialTraditionalChinese,
      missing: [],
    });
    expect(
      selectBilingualTracks([
        translatedEnglish,
        asrEnglish,
        translatedChinese,
      ]),
    ).toMatchObject({
      english: asrEnglish,
      chinese: translatedChinese,
      missing: [],
    });
  });
});
