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
  kind: 'closed-captions',
};
const ENGLISH_TRACK_PLAIN: TrackInfo = {
  ...ENGLISH_TRACK,
  id: 'english-plain',
  label: 'English',
  kind: 'subtitles',
};
const EPISODE_ONE = {
  contentGeneration: 1,
  clockGeneration: 1,
  selectionGeneration: 0,
};
const PENDING_ENGLISH = {
  requestId: 'request-english-cc',
  contentIdentity: '81262752',
  armed: true,
  track: ENGLISH_TRACK,
  generation: EPISODE_ONE,
};
const ENGLISH_RESPONSE = {
  requestId: PENDING_ENGLISH.requestId,
  responseId: 'response-english-cc',
  contentIdentity: PENDING_ENGLISH.contentIdentity,
  url: 'https://ipv4-c001-lax001-ix.1.oca.nflxvideo.net/english.ttml',
  generation: EPISODE_ONE,
  trackId: ENGLISH_TRACK.id,
  trackKind: ENGLISH_TRACK.kind,
  raw: netflixFixture,
};

describe('Netflix TTML response ownership', () => {
  it('gives an exactly correlated current response exclusive ownership', () => {
    expect(
      resolveNetflixResponseOwner(
        EPISODE_ONE,
        PENDING_ENGLISH,
        ENGLISH_RESPONSE,
      ),
    ).toEqual(PENDING_ENGLISH);
  });

  it('rejects a response issued before the selection generation changed', () => {
    expect(
      resolveNetflixResponseOwner(
        { ...EPISODE_ONE, selectionGeneration: 1 },
        PENDING_ENGLISH,
        ENGLISH_RESPONSE,
      ),
    ).toBeUndefined();
  });

  it('rejects a different request id or subtitle variant', () => {
    expect(
      resolveNetflixResponseOwner(EPISODE_ONE, PENDING_ENGLISH, {
        ...ENGLISH_RESPONSE,
        requestId: 'different-request',
      }),
    ).toBeUndefined();
    expect(
      resolveNetflixResponseOwner(EPISODE_ONE, PENDING_ENGLISH, {
        ...ENGLISH_RESPONSE,
        trackId: ENGLISH_TRACK_PLAIN.id,
        trackKind: ENGLISH_TRACK_PLAIN.kind,
      }),
    ).toBeUndefined();
  });

  it('rejects an otherwise valid response without a pending owner', () => {
    expect(
      resolveNetflixResponseOwner(
        EPISODE_ONE,
        undefined,
        ENGLISH_RESPONSE,
      ),
    ).toBeUndefined();
  });

  it('rejects a response delivered before MAIN acknowledges the request', () => {
    expect(
      resolveNetflixResponseOwner(
        EPISODE_ONE,
        { ...PENDING_ENGLISH, armed: false },
        ENGLISH_RESPONSE,
      ),
    ).toBeUndefined();
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
