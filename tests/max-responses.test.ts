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
  kind: 'subtitles',
};
const CURRENT_GENERATION = {
  contentGeneration: 1,
  clockGeneration: 1,
};
const EPISODE_ONE =
  '/video/watch/b8a64f23-c654-4be6-829a-1cb5fb0b7c8e';
const EPISODE_TWO =
  '/video/watch/41c7eddd-2eea-4ed3-a299-474d693063f4';
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
      requestStartedAtMs: 1,
      kind: 'vtt',
      url: 'https://media.example.invalid/title/t/en/1.vtt',
      raw: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nOne cue',
      generation: CURRENT_GENERATION,
      contentIdentity: EPISODE_ONE,
    });

    expect(
      resolveMaxTrackResources(
        inbox,
        [ENGLISH],
        CURRENT_GENERATION,
      ),
    ).toEqual({});
  });

  it('uses only probe-scoped VTT evidence to resolve duplicate adaptations', () => {
    const duplicateManifest = `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period start="PT0S" duration="PT30M">
    <AdaptationSet lang="en-US" contentType="text">
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
      <SegmentTemplate timescale="1000" startNumber="1" media="t/en-0/$Number$.vtt">
        <SegmentTimeline><S t="0" d="1000"/></SegmentTimeline>
      </SegmentTemplate>
      <Representation mimeType="text/vtt" id="en-0"/>
    </AdaptationSet>
    <AdaptationSet lang="en-US" contentType="text">
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
      <SegmentTemplate timescale="1000" startNumber="1" media="t/en-1/$Number$.vtt">
        <SegmentTimeline><S t="0" d="1000"/></SegmentTimeline>
      </SegmentTemplate>
      <Representation mimeType="text/vtt" id="en-1"/>
    </AdaptationSet>
  </Period>
</MPD>`;
    const inbox = [
      {
        responseId: 'playback',
        requestStartedAtMs: 1,
        kind: 'playback-info' as const,
        url: 'https://api.example.invalid/playbackInfo',
        raw: SYNTHETIC_PLAYBACK_INFO,
        generation: CURRENT_GENERATION,
        contentIdentity: EPISODE_ONE,
      },
      {
        responseId: 'manifest',
        requestStartedAtMs: 1,
        kind: 'manifest' as const,
        url: 'https://media.example.invalid/title/dash.mpd',
        raw: duplicateManifest,
        generation: CURRENT_GENERATION,
        contentIdentity: EPISODE_ONE,
      },
      {
        responseId: 'observed-vtt',
        requestStartedAtMs: 1,
        kind: 'vtt' as const,
        url: 'https://media.example.invalid/title/t/en-1/1.vtt',
        raw: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nSynthetic',
        generation: CURRENT_GENERATION,
        contentIdentity: EPISODE_ONE,
      },
    ];

    expect(
      resolveMaxTrackResources(
        inbox,
        [ENGLISH],
        CURRENT_GENERATION,
        { parser: new DOMParser() },
      ),
    ).toEqual({});
    expect(
      resolveMaxTrackResources(
        inbox,
        [ENGLISH],
        CURRENT_GENERATION,
        {
          parser: new DOMParser(),
          observedVttUrls: [
            'https://media.example.invalid/title/t/en-1/1.vtt',
          ],
        },
      ),
    ).toHaveProperty(
      'en-US-subtitles.segments.0.url',
      'https://media.example.invalid/title/t/en-1/1.vtt',
    );
  });

  it('keeps a previous generation complete mapping invisible after reset', () => {
    const withPlayback = recordMaxResponse(EMPTY_MAX_RESPONSE_INBOX, {
      responseId: 'episode-one-playback',
      requestStartedAtMs: 1,
      kind: 'playback-info',
      url: 'https://api.example.invalid/playbackInfo',
      raw: SYNTHETIC_PLAYBACK_INFO,
      generation: CURRENT_GENERATION,
      contentIdentity: EPISODE_ONE,
    });
    const episodeOne = recordMaxResponse(withPlayback, {
      responseId: 'episode-one-mpd',
      requestStartedAtMs: 1,
      kind: 'manifest',
      url: 'https://media.example.invalid/title/dash.mpd',
      raw: SYNTHETIC_MPD,
      generation: CURRENT_GENERATION,
      contentIdentity: EPISODE_ONE,
    });
    expect(
      Object.keys(
        resolveMaxTrackResources(
          episodeOne,
          [ENGLISH],
          CURRENT_GENERATION,
          { parser: new DOMParser() },
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
      EPISODE_TWO,
    );

    expect(episodeTwo).toEqual([]);
    expect(
      resolveMaxTrackResources(
        episodeTwo,
        [ENGLISH],
        episodeTwoGeneration,
        { parser: new DOMParser() },
      ),
    ).toEqual({});
  });

  it('promotes only the new episode metadata that arrived before generation advanced', () => {
    const episodeTwoPlaybackInfo = SYNTHETIC_PLAYBACK_INFO.replaceAll(
      '/title/',
      '/title-two/',
    );
    const withOldPlayback = recordMaxResponse(EMPTY_MAX_RESPONSE_INBOX, {
      responseId: 'episode-one-playback',
      requestStartedAtMs: 1,
      kind: 'playback-info',
      url: 'https://api.example.invalid/playbackInfo',
      raw: SYNTHETIC_PLAYBACK_INFO,
      generation: CURRENT_GENERATION,
      contentIdentity: EPISODE_ONE,
    });
    const withNewPlayback = recordMaxResponse(withOldPlayback, {
      responseId: 'episode-two-playback',
      requestStartedAtMs: 1,
      kind: 'playback-info',
      url: 'https://api.example.invalid/playbackInfo',
      raw: episodeTwoPlaybackInfo,
      generation: CURRENT_GENERATION,
      contentIdentity: EPISODE_TWO,
    });
    const raced = recordMaxResponse(withNewPlayback, {
      responseId: 'episode-two-mpd',
      requestStartedAtMs: 1,
      kind: 'manifest',
      url: 'https://media.example.invalid/title-two/dash.mpd',
      raw: SYNTHETIC_MPD,
      generation: CURRENT_GENERATION,
      contentIdentity: EPISODE_TWO,
    });
    const episodeTwoGeneration = {
      contentGeneration: 2,
      clockGeneration: 2,
    };

    const retained = retainMaxResponsesForGeneration(
      raced,
      episodeTwoGeneration,
      EPISODE_TWO,
    );

    expect(
      retained.map(({ responseId, contentIdentity, generation }) => ({
        responseId,
        contentIdentity,
        generation,
      })),
    ).toEqual([
      {
        responseId: 'episode-two-playback',
        contentIdentity: EPISODE_TWO,
        generation: episodeTwoGeneration,
      },
      {
        responseId: 'episode-two-mpd',
        contentIdentity: EPISODE_TWO,
        generation: episodeTwoGeneration,
      },
    ]);
    expect(
      Object.keys(
        resolveMaxTrackResources(
          retained,
          [ENGLISH],
          episodeTwoGeneration,
          { parser: new DOMParser() },
        ),
      ),
    ).toEqual([ENGLISH.id]);
  });

  it('promotes a prefetched next-episode playlist only when it differs from the active manifest', () => {
    const nextPlaybackInfo = SYNTHETIC_PLAYBACK_INFO.replaceAll(
      '/title/',
      '/title-two/',
    );
    const activePlayback = recordMaxResponse(EMPTY_MAX_RESPONSE_INBOX, {
      responseId: 'active-playback',
      requestStartedAtMs: 1,
      kind: 'playback-info',
      url: 'https://api.example.invalid/playbackInfo',
      raw: SYNTHETIC_PLAYBACK_INFO,
      generation: CURRENT_GENERATION,
      contentIdentity: EPISODE_ONE,
    });
    const activeManifest = recordMaxResponse(activePlayback, {
      responseId: 'active-manifest',
      requestStartedAtMs: 1,
      kind: 'manifest',
      url: 'https://media.example.invalid/title/dash.mpd',
      raw: SYNTHETIC_MPD,
      generation: CURRENT_GENERATION,
      contentIdentity: EPISODE_ONE,
    });
    const prefetched = recordMaxResponse(activeManifest, {
      responseId: 'prefetched-next-playback',
      requestStartedAtMs: 1,
      kind: 'playback-info',
      url: 'https://api.example.invalid/playbackInfo',
      raw: nextPlaybackInfo,
      generation: CURRENT_GENERATION,
      contentIdentity: EPISODE_ONE,
    });
    const episodeTwoGeneration = {
      contentGeneration: 2,
      clockGeneration: 2,
    };

    const retained = retainMaxResponsesForGeneration(
      prefetched,
      episodeTwoGeneration,
      EPISODE_TWO,
      'https://media.example.invalid/title/dash.mpd',
    );

    expect(retained.map(({ responseId, contentIdentity }) => ({
      responseId,
      contentIdentity,
    }))).toEqual([
      {
        responseId: 'prefetched-next-playback',
        contentIdentity: EPISODE_TWO,
      },
    ]);

    const withNextManifest = recordMaxResponse(retained, {
      responseId: 'episode-two-manifest',
      requestStartedAtMs: 1,
      kind: 'manifest',
      url: 'https://media.example.invalid/title-two/dash.mpd',
      raw: SYNTHETIC_MPD,
      generation: episodeTwoGeneration,
      contentIdentity: EPISODE_TWO,
    });
    expect(
      Object.keys(
        resolveMaxTrackResources(
          withNextManifest,
          [ENGLISH],
          episodeTwoGeneration,
          { parser: new DOMParser() },
        ),
      ),
    ).toEqual([ENGLISH.id]);
  });

  it('rebinds same-content mapping metadata across a clock reset but drops old VTT', () => {
    const withPlayback = recordMaxResponse(EMPTY_MAX_RESPONSE_INBOX, {
      responseId: 'same-content-playback',
      requestStartedAtMs: 1,
      kind: 'playback-info',
      url: 'https://api.example.invalid/playbackInfo',
      raw: SYNTHETIC_PLAYBACK_INFO,
      generation: CURRENT_GENERATION,
      contentIdentity: EPISODE_ONE,
    });
    const withManifest = recordMaxResponse(withPlayback, {
      responseId: 'same-content-mpd',
      requestStartedAtMs: 1,
      kind: 'manifest',
      url: 'https://media.example.invalid/title/dash.mpd',
      raw: SYNTHETIC_MPD,
      generation: CURRENT_GENERATION,
      contentIdentity: EPISODE_ONE,
    });
    const withVtt = recordMaxResponse(withManifest, {
      responseId: 'old-clock-vtt',
      requestStartedAtMs: 1,
      kind: 'vtt',
      url: 'https://media.example.invalid/title/t/en/1.vtt',
      raw: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nOld clock',
      generation: CURRENT_GENERATION,
      contentIdentity: EPISODE_ONE,
    });
    const nextClock = {
      contentGeneration: 1,
      clockGeneration: 2,
    };

    const retained = retainMaxResponsesForGeneration(
      withVtt,
      nextClock,
      EPISODE_ONE,
    );

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
          { parser: new DOMParser() },
        ),
      ),
    ).toEqual([ENGLISH.id]);
  });

  it('rebinds complete mapping metadata but drops old VTT across a selection generation', () => {
    const currentSelection = {
      contentGeneration: 1,
      clockGeneration: 1,
      selectionGeneration: 4,
    };
    const withPlayback = recordMaxResponse(EMPTY_MAX_RESPONSE_INBOX, {
      responseId: 'selection-playback',
      requestStartedAtMs: 1,
      kind: 'playback-info',
      url: 'https://api.example.invalid/playbackInfo',
      raw: SYNTHETIC_PLAYBACK_INFO,
      generation: currentSelection,
      contentIdentity: EPISODE_ONE,
    });
    const withManifest = recordMaxResponse(withPlayback, {
      responseId: 'selection-mpd',
      requestStartedAtMs: 1,
      kind: 'manifest',
      url: 'https://media.example.invalid/title/dash.mpd',
      raw: SYNTHETIC_MPD,
      generation: currentSelection,
      contentIdentity: EPISODE_ONE,
    });
    const withVtt = recordMaxResponse(withManifest, {
      responseId: 'old-selection-vtt',
      requestStartedAtMs: 1,
      kind: 'vtt',
      url: 'https://media.example.invalid/title/t/en/1.vtt',
      raw: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nOld pair',
      generation: currentSelection,
      contentIdentity: EPISODE_ONE,
    });
    const nextSelection = {
      ...currentSelection,
      selectionGeneration: 5,
    };

    const retained = retainMaxResponsesForGeneration(
      withVtt,
      nextSelection,
      EPISODE_ONE,
    );

    expect(retained.map(({ kind, generation }) => ({
      kind,
      generation,
    }))).toEqual([
      { kind: 'playback-info', generation: nextSelection },
      { kind: 'manifest', generation: nextSelection },
    ]);
    expect(
      Object.keys(
        resolveMaxTrackResources(
          retained,
          [ENGLISH],
          nextSelection,
          { parser: new DOMParser() },
        ),
      ),
    ).toEqual([ENGLISH.id]);
    expect(
      resolveMaxTrackResources(
        retained,
        [ENGLISH],
        currentSelection,
        { parser: new DOMParser() },
      ),
    ).toEqual({});
  });
});
