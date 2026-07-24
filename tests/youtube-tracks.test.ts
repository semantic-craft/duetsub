import { describe, expect, it } from 'vitest';

import { parseYoutubeCaptionTracks } from '../src/adapters/youtube-tracks';

const VIDEO_ID = 'video-one';

function baseUrl(language: string): string {
  return `https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=${language}`;
}

describe('parseYoutubeCaptionTracks', () => {
  it('classifies creator and ASR tracks with stable ids and normalized languages', () => {
    const parsed = parseYoutubeCaptionTracks(
      {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              baseUrl: baseUrl('en'),
              vssId: '.en',
              languageCode: 'en',
              trackName: 'Creator captions',
              name: { simpleText: 'English' },
            },
            {
              baseUrl: `${baseUrl('en')}&kind=asr`,
              vssId: 'a.en',
              languageCode: 'en',
              kind: 'asr',
              trackName: '',
              name: { runs: [{ text: 'English' }, { text: ' (auto)' }] },
            },
            ...['zh-TW', 'zh-HK', 'zh-MO', 'zh-CN', 'zh-SG', 'zh'].map(
              (languageCode) => ({
                baseUrl: baseUrl(languageCode),
                vssId: `.${languageCode}`,
                languageCode,
                trackName: '',
                name: { simpleText: languageCode },
              }),
            ),
            {
              baseUrl: baseUrl('fr'),
              vssId: '.fr',
              languageCode: 'fr',
              kind: 'forced',
              trackName: '',
              name: { simpleText: 'French forced' },
            },
          ],
        },
      },
      VIDEO_ID,
    );

    expect(
      parsed.map(({ track }) => ({
        id: track.id,
        language: track.language,
        source: track.source,
        label: track.label,
      })),
    ).toEqual([
      {
        id: 'youtube:.en:Creator%20captions',
        language: 'en',
        source: 'official',
        label: 'English',
      },
      {
        id: 'youtube:a.en:',
        language: 'en',
        source: 'asr',
        label: 'English (auto)',
      },
      ...['zh-TW', 'zh-HK', 'zh-MO'].map((label) => ({
        id: `youtube:.${label}:`,
        language: 'zh-Hant',
        source: 'official' as const,
        label,
      })),
      ...['zh-CN', 'zh-SG', 'zh'].map((label) => ({
        id: `youtube:.${label}:`,
        language: 'zh-Hans',
        source: 'official' as const,
        label,
      })),
    ]);
  });

  it('adds tlang tracks only as platform translation candidates', () => {
    const parsed = parseYoutubeCaptionTracks(
      {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              baseUrl: baseUrl('en'),
              vssId: '.en',
              languageCode: 'en',
              trackName: '',
              name: { simpleText: 'English' },
              isTranslatable: true,
            },
            {
              baseUrl: baseUrl('zh-TW'),
              vssId: '.zh-TW',
              languageCode: 'zh-TW',
              trackName: '',
              name: { simpleText: '中文（繁體）' },
              isTranslatable: true,
            },
          ],
          translationLanguages: [
            {
              languageCode: 'en',
              languageName: { simpleText: 'English' },
            },
            {
              languageCode: 'zh-Hant',
              languageName: { simpleText: '中文（繁體）' },
            },
          ],
        },
      },
      VIDEO_ID,
    );

    expect(
      parsed.map(({ track, handle }) => ({
        id: track.id,
        language: track.language,
        source: track.source,
        tlang: handle.tlang,
      })),
    ).toEqual([
      {
        id: 'youtube:.en:',
        language: 'en',
        source: 'official',
        tlang: undefined,
      },
      {
        id: 'youtube:.zh-TW:',
        language: 'zh-Hant',
        source: 'official',
        tlang: undefined,
      },
      {
        id: 'youtube:.en::tlang:zh-Hant',
        language: 'zh-Hant',
        source: 'platform-mt',
        tlang: 'zh-Hant',
      },
      {
        id: 'youtube:.zh-TW::tlang:en',
        language: 'en',
        source: 'platform-mt',
        tlang: 'en',
      },
    ]);
  });
});
