import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import type { TrackInfo } from '../src/core/contracts';
import {
  consumePrimeTtmlResponse,
  EMPTY_PRIME_TTML_INBOX,
  recordPrimeTtmlResponse,
  retainPrimeTtmlResponsesForGeneration,
} from '../src/adapters/primevideo-responses';
import primeVideoFixture from './fixtures/primevideo-minimal.ttml2?raw';

const ENGLISH_TRACK: TrackInfo = {
  id: 'en-us_Sdh_Dialog_3',
  language: 'en-US',
  source: 'official',
  label: 'English [CC]',
};

const EPISODE_ONE = {
  contentGeneration: 1,
  clockGeneration: 1,
};

describe('Prime TTML response inbox', () => {
  it('makes a same-generation response visible when Prime fetched it before the track request', () => {
    const inbox = recordPrimeTtmlResponse(EMPTY_PRIME_TTML_INBOX, {
      responseId: 'response-before-request',
      trackId: ENGLISH_TRACK.id,
      raw: primeVideoFixture,
      generation: EPISODE_ONE,
    });

    const consumed = consumePrimeTtmlResponse(
      inbox,
      ENGLISH_TRACK,
      EPISODE_ONE,
      new DOMParser(),
    );

    expect(consumed.cues?.map(({ text }) => text)).toEqual([
      'Alpha & Beta Gamma\nDelta line',
      'Top cue',
    ]);
  });

  it('keeps a previous episode response invisible after generation reset', () => {
    const inbox = recordPrimeTtmlResponse(EMPTY_PRIME_TTML_INBOX, {
      responseId: 'episode-one-response',
      trackId: ENGLISH_TRACK.id,
      raw: primeVideoFixture,
      generation: EPISODE_ONE,
    });
    const episodeTwo = {
      contentGeneration: 2,
      clockGeneration: 2,
    };

    const currentInbox = retainPrimeTtmlResponsesForGeneration(
      inbox,
      episodeTwo,
    );
    const consumed = consumePrimeTtmlResponse(
      currentInbox,
      ENGLISH_TRACK,
      episodeTwo,
      new DOMParser(),
    );

    expect(consumed.cues).toBeUndefined();
  });
});
