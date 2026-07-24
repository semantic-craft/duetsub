import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import type { TrackInfo } from '../src/core/contracts';
import {
  EMPTY_MAX_RESPONSE_INBOX,
  recordMaxResponse,
  retainMaxResponsesForGeneration,
  resolveMaxTrackResources,
} from '../src/adapters/max-responses';

const ENGLISH: TrackInfo = {
  id: 'en-US-subtitles',
  language: 'en-US',
  source: 'official',
  label: 'English',
};
const CURRENT_GENERATION = {
  contentGeneration: 1,
  clockGeneration: 1,
};
const SYNTHETIC_PLAYBACK_INFO = JSON.stringify({
  manifest: { url: 'https://media.example.invalid/title/dash.mpd' },
  videos: [
    {
      textTracks: [
        {
          type: 'subtitles',
          language: 'en-US',
          displayName: 'English',
          format: 'webvtt',
        },
      ],
    },
  ],
});
const SYNTHETIC_MPD = `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet lang="en-US" contentType="text">
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
      <SegmentTemplate timescale="1000" startNumber="1" media="t/en/$Number$.vtt">
        <SegmentTimeline><S t="0" d="1000"/></SegmentTimeline>
      </SegmentTemplate>
      <Representation mimeType="text/vtt" id="en"/>
    </AdaptationSet>
  </Period>
</MPD>`;

describe('Max response inbox', () => {
  it('fails closed when the only evidence is a single VTT response', () => {
    const inbox = recordMaxResponse(EMPTY_MAX_RESPONSE_INBOX, {
      responseId: 'single-vtt',
      kind: 'vtt',
      url: 'https://media.example.invalid/title/t/en/1.vtt',
      raw: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nOne cue',
      generation: CURRENT_GENERATION,
    });

    expect(
      resolveMaxTrackResources(
        inbox,
        [ENGLISH],
        CURRENT_GENERATION,
      ),
    ).toEqual({});
  });

  it('keeps a previous generation complete mapping invisible after reset', () => {
    const withPlayback = recordMaxResponse(EMPTY_MAX_RESPONSE_INBOX, {
      responseId: 'episode-one-playback',
      kind: 'playback-info',
      url: 'https://api.example.invalid/playbackInfo',
      raw: SYNTHETIC_PLAYBACK_INFO,
      generation: CURRENT_GENERATION,
    });
    const episodeOne = recordMaxResponse(withPlayback, {
      responseId: 'episode-one-mpd',
      kind: 'manifest',
      url: 'https://media.example.invalid/title/dash.mpd',
      raw: SYNTHETIC_MPD,
      generation: CURRENT_GENERATION,
    });
    expect(
      Object.keys(
        resolveMaxTrackResources(
          episodeOne,
          [ENGLISH],
          CURRENT_GENERATION,
          new DOMParser(),
        ),
      ),
    ).toEqual([ENGLISH.id]);

    const episodeTwoGeneration = {
      contentGeneration: 2,
      clockGeneration: 2,
    };
    const episodeTwo = retainMaxResponsesForGeneration(
      episodeOne,
      episodeTwoGeneration,
    );

    expect(episodeTwo).toEqual([]);
    expect(
      resolveMaxTrackResources(
        episodeTwo,
        [ENGLISH],
        episodeTwoGeneration,
        new DOMParser(),
      ),
    ).toEqual({});
  });

  it('rebinds same-content mapping metadata across a clock reset but drops old VTT', () => {
    const withPlayback = recordMaxResponse(EMPTY_MAX_RESPONSE_INBOX, {
      responseId: 'same-content-playback',
      kind: 'playback-info',
      url: 'https://api.example.invalid/playbackInfo',
      raw: SYNTHETIC_PLAYBACK_INFO,
      generation: CURRENT_GENERATION,
    });
    const withManifest = recordMaxResponse(withPlayback, {
      responseId: 'same-content-mpd',
      kind: 'manifest',
      url: 'https://media.example.invalid/title/dash.mpd',
      raw: SYNTHETIC_MPD,
      generation: CURRENT_GENERATION,
    });
    const withVtt = recordMaxResponse(withManifest, {
      responseId: 'old-clock-vtt',
      kind: 'vtt',
      url: 'https://media.example.invalid/title/t/en/1.vtt',
      raw: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nOld clock',
      generation: CURRENT_GENERATION,
    });
    const nextClock = {
      contentGeneration: 1,
      clockGeneration: 2,
    };

    const retained = retainMaxResponsesForGeneration(withVtt, nextClock);

    expect(retained.map(({ kind, generation }) => ({
      kind,
      generation,
    }))).toEqual([
      { kind: 'playback-info', generation: nextClock },
      { kind: 'manifest', generation: nextClock },
    ]);
    expect(
      Object.keys(
        resolveMaxTrackResources(
          retained,
          [ENGLISH],
          nextClock,
          new DOMParser(),
        ),
      ),
    ).toEqual([ENGLISH.id]);
  });
});
