import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import type { TrackInfo } from '../src/core/contracts';
import {
  claimNetflixTtmlResponseForPending,
  consumeNetflixTtmlResponse,
  EMPTY_NETFLIX_TTML_INBOX,
  recordNetflixTtmlResponse,
  recordNetflixTtmlResponseForUniqueTrack,
  resolveNetflixResponseOwner,
  resolveNetflixUnownedResponseGeneration,
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
const TRADITIONAL_CHINESE_TRACK: TrackInfo = {
  id: 'traditional-chinese',
  language: 'zh-Hant',
  source: 'official',
  label: '中文（繁體）',
};
const SIMPLIFIED_CHINESE_TRACK: TrackInfo = {
  id: 'simplified-chinese',
  language: 'zh-Hans',
  source: 'official',
  label: '中文（簡體）',
};
const EPISODE_ONE = {
  contentGeneration: 1,
  clockGeneration: 1,
};
const UNBOUND_GENERATION = {
  contentGeneration: 0,
  clockGeneration: 0,
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

  it('claims an early TTML response after one official track uniquely validates it', () => {
    const traditionalChineseFixture = netflixFixture.replace(
      'xml:lang="en"',
      'xml:lang="zh-Hant"',
    );
    const inbox = recordNetflixTtmlResponseForUniqueTrack(
      EMPTY_NETFLIX_TTML_INBOX,
      {
        responseId: 'early-traditional-chinese',
        raw: traditionalChineseFixture,
        generation: EPISODE_ONE,
        candidates: [
          ENGLISH_TRACK,
          ENGLISH_TRACK_PLAIN,
          TRADITIONAL_CHINESE_TRACK,
          SIMPLIFIED_CHINESE_TRACK,
        ],
      },
      new DOMParser(),
    );

    expect(
      consumeNetflixTtmlResponse(
        inbox,
        TRADITIONAL_CHINESE_TRACK,
        EPISODE_ONE,
      ).cues?.[0],
    ).toMatchObject({
      start: 22_708,
      end: 24_708,
      text: 'Alpha & Beta Gamma\nDelta line',
      language: 'zh-Hant',
    });
  });

  it('keeps an early TTML response unowned when official tracks are ambiguous', () => {
    expect(
      recordNetflixTtmlResponseForUniqueTrack(
        EMPTY_NETFLIX_TTML_INBOX,
        {
          responseId: 'ambiguous-english',
          raw: netflixFixture,
          generation: EPISODE_ONE,
          candidates: [ENGLISH_TRACK, ENGLISH_TRACK_PLAIN],
        },
        new DOMParser(),
      ),
    ).toEqual([]);
  });

  it('claims exactly one buffered response after a pending track supplies ownership', () => {
    const traditionalChineseFixture = netflixFixture.replace(
      'xml:lang="en"',
      'xml:lang="zh-Hant"',
    );
    const claimed = claimNetflixTtmlResponseForPending(
      EMPTY_NETFLIX_TTML_INBOX,
      [
        {
          responseId: 'early-traditional-chinese',
          raw: traditionalChineseFixture,
        },
        {
          responseId: 'early-english',
          raw: netflixFixture,
        },
      ],
      {
        track: ENGLISH_TRACK,
        generation: EPISODE_ONE,
      },
      new DOMParser(),
    );

    expect(claimed.claimedResponseId).toBe('early-english');
    expect(
      consumeNetflixTtmlResponse(
        claimed.inbox,
        ENGLISH_TRACK,
        EPISODE_ONE,
      ).cues?.[0],
    ).toMatchObject({
      start: 22_708,
      end: 24_708,
      language: 'en-US',
    });
  });

  it('leaves multiple matching buffered responses unowned', () => {
    expect(
      claimNetflixTtmlResponseForPending(
        EMPTY_NETFLIX_TTML_INBOX,
        [
          { responseId: 'english-cc-or-plain-1', raw: netflixFixture },
          { responseId: 'english-cc-or-plain-2', raw: netflixFixture },
        ],
        {
          track: ENGLISH_TRACK,
          generation: EPISODE_ONE,
        },
        new DOMParser(),
      ),
    ).toEqual({
      inbox: [],
      claimedResponseId: undefined,
    });
  });

  it('promotes a same-title bootstrap response into the first bound generation', () => {
    expect(
      resolveNetflixUnownedResponseGeneration(
        'netflix:81262752',
        UNBOUND_GENERATION,
        'netflix:81262752',
        EPISODE_ONE,
      ),
    ).toEqual(EPISODE_ONE);
  });

  it('promotes a request-bound response when the same title advances generation', () => {
    expect(
      resolveNetflixUnownedResponseGeneration(
        'netflix:81262753',
        EPISODE_ONE,
        'netflix:81262753',
        { contentGeneration: 2, clockGeneration: 2 },
      ),
    ).toEqual({ contentGeneration: 2, clockGeneration: 2 });
  });

  it('rejects an early response from another title', () => {
    expect(
      resolveNetflixUnownedResponseGeneration(
        'netflix:81262752',
        UNBOUND_GENERATION,
        'netflix:81262753',
        EPISODE_ONE,
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
