import { describe, expect, it } from 'vitest';

import type { TrackInfo } from '../src/core/contracts';
import { selectOfficialDualTracks } from '../src/core/track-selection';

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
