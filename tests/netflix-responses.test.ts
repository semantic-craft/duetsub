import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import type { TrackInfo } from '../src/core/contracts';
import {
  consumeNetflixTtmlResponse,
  EMPTY_NETFLIX_TTML_INBOX,
  recordNetflixTtmlResponse,
  resolveNetflixResponseOwner,
  retainNetflixTtmlResponsesForGeneration,
} from '../src/adapters/netflix-responses';
import netflixFixture from './fixtures/netflix-minimal.ttml?raw';

const ENGLISH_TRACK: TrackInfo = {
  id: 'english-cc',
  language: 'en-US',
  source: 'official',
  label: 'English [CC]',
};
const ENGLISH_TRACK_PLAIN: TrackInfo = {
  ...ENGLISH_TRACK,
  id: 'english-plain',
  label: 'English',
};
const EPISODE_ONE = {
  contentGeneration: 1,
  clockGeneration: 1,
};

describe('Netflix TTML response ownership', () => {
  it('gives a current pending fetchTrack exclusive ownership', () => {
    expect(
      resolveNetflixResponseOwner(
        EPISODE_ONE,
        { track: ENGLISH_TRACK, generation: EPISODE_ONE },
        [ENGLISH_TRACK, ENGLISH_TRACK_PLAIN],
      ),
    ).toEqual({ track: ENGLISH_TRACK, generation: EPISODE_ONE });
  });

  it('fails closed for a stale pending request and ambiguous current tracks', () => {
    expect(
      resolveNetflixResponseOwner(
        { contentGeneration: 2, clockGeneration: 2 },
        { track: ENGLISH_TRACK, generation: EPISODE_ONE },
        [ENGLISH_TRACK, ENGLISH_TRACK_PLAIN],
      ),
    ).toBeUndefined();
  });

  it('accepts one unambiguous current TrackInfo without a pending request', () => {
    expect(
      resolveNetflixResponseOwner(EPISODE_ONE, undefined, [ENGLISH_TRACK]),
    ).toEqual({ track: ENGLISH_TRACK, generation: EPISODE_ONE });
  });

  it('parses only owned TTML and drops it after a generation change', () => {
    const owned = {
      track: ENGLISH_TRACK,
      generation: EPISODE_ONE,
    };
    const inbox = recordNetflixTtmlResponse(
      EMPTY_NETFLIX_TTML_INBOX,
      {
        responseId: 'owned-response',
        raw: netflixFixture,
        owner: owned,
      },
      new DOMParser(),
    );

    expect(
      consumeNetflixTtmlResponse(inbox, ENGLISH_TRACK, EPISODE_ONE).cues?.[0],
    ).toMatchObject({
      start: 22_708,
      end: 24_708,
      text: 'Alpha & Beta Gamma\nDelta line',
      language: 'en-US',
    });
    expect(
      retainNetflixTtmlResponsesForGeneration(inbox, {
        contentGeneration: 2,
        clockGeneration: 2,
      }),
    ).toEqual([]);
  });

  it('does not record XML that lacks a TTML root', () => {
    expect(
      recordNetflixTtmlResponse(
        EMPTY_NETFLIX_TTML_INBOX,
        {
          responseId: 'not-ttml',
          raw: '<?xml version="1.0"?><html/>',
          owner: { track: ENGLISH_TRACK, generation: EPISODE_ONE },
        },
        new DOMParser(),
      ),
    ).toEqual([]);
  });
});
