import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import { parseTtml } from '../src/core/ttml';
import netflixFixture from './fixtures/netflix-minimal.ttml?raw';
import primeVideoFixture from './fixtures/primevideo-minimal.ttml2?raw';

describe('parseTtml', () => {
  it('normalizes the sanitized live Prime TTML2 shape into cues', () => {
    const cues = parseTtml(primeVideoFixture, {
      language: 'en-US',
      acceptedSourceLanguages: ['en-US'],
      parser: new DOMParser(),
    });

    expect(cues).toEqual([
      {
        start: 22_708,
        end: 24_708,
        text: 'Alpha & Beta Gamma\nDelta line',
        language: 'en-US',
      },
      {
        start: 25_000,
        end: 27_250,
        text: 'Top cue',
        language: 'en-US',
        position: 'top',
      },
    ]);
  });

  it('rejects a valid TTML document owned by another language track', () => {
    expect(
      parseTtml(primeVideoFixture, {
        language: 'zh-Hant',
        acceptedSourceLanguages: ['zh-Hant', 'cmn-Hant'],
        parser: new DOMParser(),
      }),
    ).toEqual([]);
  });

  it('uses the document tick rate for Netflix IMSC cue boundaries', () => {
    const cues = parseTtml(netflixFixture, {
      language: 'en',
      acceptedSourceLanguages: ['en'],
      parser: new DOMParser(),
    });

    expect(cues).toEqual([
      {
        start: 22_708,
        end: 24_708,
        text: 'Alpha & Beta Gamma\nDelta line',
        language: 'en',
      },
      {
        start: 25_000,
        end: 27_250,
        text: 'Millisecond boundary',
        language: 'en',
      },
    ]);
  });
});
