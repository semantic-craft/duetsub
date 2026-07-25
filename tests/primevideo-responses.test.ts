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
const OFF_CAMPUS_ENGLISH_TRACK: TrackInfo = {
  id: 'en-us_Caption_Dialog',
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

  it('merges every TTML document from the fragmented Off Campus English track', () => {
    const firstSegment =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="en-US">' +
      '<body><div><p begin="00:00:04.625" end="00:00:06.291">' +
      'First sanitized cue' +
      '</p></div></body></tt>';
    const secondSegment =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="en-US">' +
      '<body><div><p begin="00:51:08.541" end="00:51:10.000">' +
      'Final sanitized cue' +
      '</p></div></body></tt>';
    const fragmentedMp4 =
      `\u0000\u0000\u0000\u0018ftypisom\u0000\u0000mdat${firstSegment}` +
      `\u0000\u0000moof\u0000\u0000mdat${secondSegment}`;
    const inbox = recordPrimeTtmlResponse(EMPTY_PRIME_TTML_INBOX, {
      responseId: 'off-campus-full-track',
      trackId: OFF_CAMPUS_ENGLISH_TRACK.id,
      raw: fragmentedMp4,
      generation: EPISODE_ONE,
    });

    const consumed = consumePrimeTtmlResponse(
      inbox,
      OFF_CAMPUS_ENGLISH_TRACK,
      EPISODE_ONE,
      new DOMParser(),
    );

    expect(consumed.cues).toEqual([
      {
        start: 4_625,
        end: 6_291,
        text: 'First sanitized cue',
        language: 'en-US',
      },
      {
        start: 3_068_541,
        end: 3_070_000,
        text: 'Final sanitized cue',
        language: 'en-US',
      },
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
