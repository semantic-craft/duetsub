import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import type { TrackInfo } from '../src/core/contracts';
import {
  mapMaxTrackResources,
  selectMaxSegmentsAfterFailure,
  selectMaxSegmentsAt,
} from '../src/adapters/max-track-mapping';

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
  it('selects the current and future VTT segments at a resumed clock', () => {
    const segments = [
      {
        url: 'https://media.example.invalid/intro.vtt',
        presentationAnchor: { mpegTs: 0, presentationTimeMs: 0 },
      },
      {
        url: 'https://media.example.invalid/feature-1.vtt',
        presentationAnchor: { mpegTs: 0, presentationTimeMs: 19_000 },
      },
      {
        url: 'https://media.example.invalid/feature-2.vtt',
        presentationAnchor: {
          mpegTs: 90_000,
          presentationTimeMs: 1_191_760,
        },
      },
    ];

    expect(selectMaxSegmentsAt(segments, 1_245_000)).toEqual([
      segments[2],
    ]);
    expect(
      selectMaxSegmentsAfterFailure(segments, segments[0].url),
    ).toEqual([segments[1], segments[2]]);
    expect(
      selectMaxSegmentsAfterFailure(segments, segments[2].url),
    ).toEqual([]);
  });

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

  it('maps the same manifest path after a trusted Max media CDN redirect', () => {
    const playbackInfoRaw = SYNTHETIC_PLAYBACK_INFO.replace(
      'https://media.example.invalid/title/dash.mpd?synthetic=1',
      'https://gcp.asia.prd.media.max.com/title/dash.mpd?declared=1',
    );

    expect(
      mapMaxTrackResources({
        tracks: [ENGLISH, TRADITIONAL_CHINESE],
        playbackInfoRaw,
        manifestUrl:
          'https://akm.asia.prd.media.max.com/title/dash.mpd?observed=1',
        manifestRaw: SYNTHETIC_MPD,
        parser: new DOMParser(),
      }),
    ).toHaveProperty(
      'en-US-subtitles.segments.0.url',
      'https://akm.asia.prd.media.max.com/title/t/en/1.vtt',
    );
  });

  it('maps one official track across non-overlapping DASH periods', () => {
    const multiPeriodMpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period id="intro" start="PT0S" duration="PT15S">
    <AdaptationSet lang="en-US" contentType="text">
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
      <SegmentTemplate timescale="1000" startNumber="1" media="intro/en/$Number$.vtt">
        <SegmentTimeline><S t="0" d="15000"/></SegmentTimeline>
      </SegmentTemplate>
      <Representation mimeType="text/vtt" id="intro-en"/>
    </AdaptationSet>
  </Period>
  <Period id="feature" start="PT19S" duration="PT30M">
    <AdaptationSet lang="en-US" contentType="text">
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
      <SegmentTemplate timescale="1000" startNumber="1" media="feature/en/$Number$.vtt">
        <SegmentTimeline><S t="0" d="1000" r="1"/></SegmentTimeline>
      </SegmentTemplate>
      <Representation mimeType="text/vtt" id="feature-en"/>
    </AdaptationSet>
  </Period>
</MPD>`;

    expect(
      mapMaxTrackResources({
        tracks: [ENGLISH],
        playbackInfoRaw: SYNTHETIC_PLAYBACK_INFO,
        manifestUrl:
          'https://media.example.invalid/title/dash.mpd?synthetic=1',
        manifestRaw: multiPeriodMpd,
        parser: new DOMParser(),
      }),
    ).toEqual({
      'en-US-subtitles': {
        track: ENGLISH,
        segments: [
          {
            url: 'https://media.example.invalid/title/intro/en/1.vtt',
            presentationAnchor: {
              mpegTs: 0,
              presentationTimeMs: 0,
            },
          },
          {
            url: 'https://media.example.invalid/title/feature/en/1.vtt',
            presentationAnchor: {
              mpegTs: 0,
              presentationTimeMs: 19_000,
            },
          },
          {
            url: 'https://media.example.invalid/title/feature/en/2.vtt',
            presentationAnchor: {
              mpegTs: 90_000,
              presentationTimeMs: 20_000,
            },
          },
        ],
      },
    });

    expect(
      mapMaxTrackResources({
        tracks: [ENGLISH],
        playbackInfoRaw: SYNTHETIC_PLAYBACK_INFO,
        manifestUrl:
          'https://media.example.invalid/title/dash.mpd?synthetic=1',
        manifestRaw: multiPeriodMpd.replace(
          'start="PT19S"',
          'start="PT10S"',
        ),
        parser: new DOMParser(),
      }),
    ).toEqual({});
  });

  it.each([
    'https://captions.example.com/title/dash.mpd',
    'https://akm.asia.prd.media.max.com/other/dash.mpd',
  ])('rejects an untrusted manifest redirect: %s', (manifestUrl) => {
    const playbackInfoRaw = SYNTHETIC_PLAYBACK_INFO.replace(
      'https://media.example.invalid/title/dash.mpd?synthetic=1',
      'https://gcp.asia.prd.media.max.com/title/dash.mpd',
    );

    expect(
      mapMaxTrackResources({
        tracks: [ENGLISH, TRADITIONAL_CHINESE],
        playbackInfoRaw,
        manifestUrl,
        manifestRaw: SYNTHETIC_MPD,
        parser: new DOMParser(),
      }),
    ).toEqual({});
  });
});
