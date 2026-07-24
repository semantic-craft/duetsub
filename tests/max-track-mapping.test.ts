import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import type { TrackInfo } from '../src/core/contracts';
import { mapMaxTrackResources } from '../src/adapters/max-track-mapping';

const ENGLISH: TrackInfo = {
  id: 'en-US-subtitles',
  language: 'en-US',
  source: 'official',
  label: 'English',
};
const TRADITIONAL_CHINESE: TrackInfo = {
  id: 'zh-Hant-TW-subtitles',
  language: 'zh-Hant-TW',
  source: 'official',
  label: 'Traditional Chinese',
};

const SYNTHETIC_PLAYBACK_INFO = JSON.stringify({
  manifest: {
    url: 'https://media.example.invalid/title/dash.mpd?synthetic=1',
  },
  videos: [
    {
      textTracks: [
        {
          type: 'subtitles',
          language: 'en-US',
          displayName: 'English',
          format: 'webvtt',
        },
        {
          type: 'subtitles',
          language: 'zh-Hant-TW',
          displayName: 'Traditional Chinese',
          format: 'webvtt',
        },
      ],
    },
  ],
});

const SYNTHETIC_MPD = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet lang="en-US" contentType="text">
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
      <SegmentTemplate timescale="1000" startNumber="1" media="t/en/$Number$.vtt">
        <SegmentTimeline>
          <S t="0" d="1000"/>
          <S d="1500" r="1"/>
        </SegmentTimeline>
      </SegmentTemplate>
      <Representation mimeType="text/vtt" id="en"/>
    </AdaptationSet>
    <AdaptationSet lang="zh-Hant-TW" contentType="text">
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
      <SegmentTemplate timescale="1000" startNumber="4" media="t/zh/$Number$.vtt">
        <SegmentTimeline>
          <S t="0" d="2500"/>
        </SegmentTimeline>
      </SegmentTemplate>
      <Representation mimeType="text/vtt" id="zh"/>
    </AdaptationSet>
  </Period>
</MPD>`;

describe('mapMaxTrackResources', () => {
  it('maps authoritative DOM track ids through complete playbackInfo and MPD data', () => {
    expect(
      mapMaxTrackResources({
        tracks: [ENGLISH, TRADITIONAL_CHINESE],
        playbackInfoRaw: SYNTHETIC_PLAYBACK_INFO,
        manifestUrl:
          'https://media.example.invalid/title/dash.mpd?synthetic=1',
        manifestRaw: SYNTHETIC_MPD,
        parser: new DOMParser(),
      }),
    ).toEqual({
      'en-US-subtitles': {
        track: ENGLISH,
        segments: [
          {
            url: 'https://media.example.invalid/title/t/en/1.vtt',
            presentationAnchor: {
              mpegTs: 0,
              presentationTimeMs: 0,
            },
          },
          {
            url: 'https://media.example.invalid/title/t/en/2.vtt',
            presentationAnchor: {
              mpegTs: 90_000,
              presentationTimeMs: 1_000,
            },
          },
          {
            url: 'https://media.example.invalid/title/t/en/3.vtt',
            presentationAnchor: {
              mpegTs: 225_000,
              presentationTimeMs: 2_500,
            },
          },
        ],
      },
      'zh-Hant-TW-subtitles': {
        track: TRADITIONAL_CHINESE,
        segments: [
          {
            url: 'https://media.example.invalid/title/t/zh/4.vtt',
            presentationAnchor: {
              mpegTs: 0,
              presentationTimeMs: 0,
            },
          },
        ],
      },
    });
  });
});
