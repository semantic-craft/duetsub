import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import type { TrackInfo } from '../src/core/contracts';
import {
  alignPrimeChineseCuesToEnglish,
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
  kind: 'closed-captions',
};
const OFF_CAMPUS_ENGLISH_TRACK: TrackInfo = {
  id: 'en-us_Caption_Dialog',
  language: 'en-US',
  source: 'official',
  label: 'English [CC]',
  kind: 'closed-captions',
};
const OFF_CAMPUS_JAPANESE_TRACK: TrackInfo = {
  id: 'ja-jp_Subtitle_Dialog',
  language: 'ja-JP',
  source: 'official',
  label: '日本語',
  kind: 'subtitles',
};

const EPISODE_ONE = {
  contentGeneration: 1,
  clockGeneration: 1,
  selectionGeneration: 0,
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
      0,
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
      0,
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

  it('maps Off Campus TTML cues onto Prime playback time', () => {
    const raw =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="en-US">' +
      '<body><div><p begin="00:04:11.125" end="00:04:13.041">' +
      'Did she do it?' +
      '</p></div></body></tt>';
    const inbox = recordPrimeTtmlResponse(EMPTY_PRIME_TTML_INBOX, {
      responseId: 'off-campus-clock-offset',
      trackId: OFF_CAMPUS_ENGLISH_TRACK.id,
      raw,
      generation: EPISODE_ONE,
    });

    const consumed = consumePrimeTtmlResponse(
      inbox,
      OFF_CAMPUS_ENGLISH_TRACK,
      EPISODE_ONE,
      new DOMParser(),
      6_000,
    );

    expect(consumed.cues).toEqual([
      {
        start: 257_125,
        end: 259_041,
        text: 'Did she do it?',
        language: 'en-US',
      },
    ]);
  });

  it('accepts the non-standard jp language code in the Off Campus Japanese TTML', () => {
    const raw =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="jp">' +
      '<body><div><p begin="00:00:04.625" end="00:00:06.291">' +
      '日本語の字幕' +
      '</p></div></body></tt>';
    const inbox = recordPrimeTtmlResponse(EMPTY_PRIME_TTML_INBOX, {
      responseId: 'off-campus-japanese-jp-alias',
      trackId: OFF_CAMPUS_JAPANESE_TRACK.id,
      raw,
      generation: EPISODE_ONE,
    });

    expect(
      consumePrimeTtmlResponse(
        inbox,
        OFF_CAMPUS_JAPANESE_TRACK,
        EPISODE_ONE,
        new DOMParser(),
        0,
      ).cues,
    ).toEqual([
      {
        start: 4_625,
        end: 6_291,
        text: '日本語の字幕',
        language: 'ja-JP',
      },
    ]);
  });

  it('uses the clock correlated to the active track request', () => {
    const raw =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="en-US">' +
      '<body><div><p begin="00:04:11.125" end="00:04:13.041">' +
      'Did she do it?' +
      '</p></div></body></tt>';
    const inbox = recordPrimeTtmlResponse(EMPTY_PRIME_TTML_INBOX, {
      responseId: 'off-campus-stale-response-clock',
      trackId: OFF_CAMPUS_ENGLISH_TRACK.id,
      raw,
      generation: EPISODE_ONE,
    });

    const consumed = consumePrimeTtmlResponse(
      inbox,
      OFF_CAMPUS_ENGLISH_TRACK,
      EPISODE_ONE,
      new DOMParser(),
      6_000,
    );

    expect(consumed.cues?.[0]).toMatchObject({
      start: 257_125,
      end: 259_041,
    });
  });

  it('waits for a response with a verified Prime playback clock', () => {
    const inbox = recordPrimeTtmlResponse(EMPTY_PRIME_TTML_INBOX, {
      responseId: 'background-response-without-playback-clock',
      trackId: OFF_CAMPUS_ENGLISH_TRACK.id,
      raw: primeVideoFixture,
      generation: EPISODE_ONE,
    });

    expect(
      consumePrimeTtmlResponse(
        inbox,
        OFF_CAMPUS_ENGLISH_TRACK,
        EPISODE_ONE,
        new DOMParser(),
      ).cues,
    ).toBeUndefined();

    const consumed = consumePrimeTtmlResponse(
      inbox,
      OFF_CAMPUS_ENGLISH_TRACK,
      EPISODE_ONE,
      new DOMParser(),
      6_000,
    );
    expect(consumed.cues?.[0]).toMatchObject({
      start: 28_708,
      end: 30_708,
    });
  });

  it('keeps dialogue while removing Off Campus English CC-only captions', () => {
    const fragmentedMp4 =
      '\u0000\u0000mdat<?xml version="1.0" encoding="utf-8"?>' +
      '<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="en-US">' +
      '<body><div>' +
      '<p begin="00:00:04.000" end="00:00:06.000">' +
      '♪ Background song lyrics ♪' +
      '</p>' +
      '<p begin="00:00:06.000" end="00:00:08.000">' +
      '-[students groaning]' +
      '</p>' +
      '<p begin="00:00:08.000" end="00:00:10.000">' +
      '-[Dean] Maybe an hour?' +
      '</p>' +
      '<p begin="00:00:10.000" end="00:00:12.000">' +
      '-[students groaning]<br/>-Okay, yeah.' +
      '</p>' +
      '</div></body></tt>';
    const inbox = recordPrimeTtmlResponse(EMPTY_PRIME_TTML_INBOX, {
      responseId: 'off-campus-english-cc',
      trackId: OFF_CAMPUS_ENGLISH_TRACK.id,
      raw: fragmentedMp4,
      generation: EPISODE_ONE,
    });

    const consumed = consumePrimeTtmlResponse(
      inbox,
      OFF_CAMPUS_ENGLISH_TRACK,
      EPISODE_ONE,
      new DOMParser(),
      0,
    );

    expect(consumed.cues).toEqual([
      {
        start: 8_000,
        end: 10_000,
        text: '- Maybe an hour?',
        language: 'en-US',
      },
      {
        start: 10_000,
        end: 12_000,
        text: '-Okay, yeah.',
        language: 'en-US',
      },
    ]);
  });

  it('removes translated Chinese cues for Off Campus CC-only intervals', () => {
    const englishDialogue = {
      start: 8_000,
      end: 10_000,
      text: '- Maybe an hour?',
      language: 'en-US',
    };
    const translatedMouthing = {
      start: 6_000,
      end: 8_000,
      text: '抱歉',
      language: 'zh-Hant',
    };
    const translatedDialogue = {
      start: 8_000,
      end: 10_000,
      text: '大概一小時？',
      language: 'zh-Hant',
    };

    expect(
      alignPrimeChineseCuesToEnglish(
        [englishDialogue],
        [translatedMouthing, translatedDialogue],
      ),
    ).toEqual([translatedDialogue]);
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
      selectionGeneration: 0,
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

  it('keeps a previous language pair response invisible after selection change', () => {
    const inbox = recordPrimeTtmlResponse(EMPTY_PRIME_TTML_INBOX, {
      responseId: 'previous-pair-response',
      trackId: ENGLISH_TRACK.id,
      raw: primeVideoFixture,
      generation: EPISODE_ONE,
    });
    const currentSelection = {
      ...EPISODE_ONE,
      selectionGeneration: 1,
    };

    const currentInbox = retainPrimeTtmlResponsesForGeneration(
      inbox,
      currentSelection,
    );
    expect(
      consumePrimeTtmlResponse(
        currentInbox,
        ENGLISH_TRACK,
        currentSelection,
        new DOMParser(),
        0,
      ).cues,
    ).toBeUndefined();
  });
});
