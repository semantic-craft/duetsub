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

  it('skips a Prime paragraph whose browser DOM omits a cue boundary', () => {
    const parser = {
      parseFromString(source: string, mimeType: 'application/xml') {
        const document = new DOMParser().parseFromString(source, mimeType);
        const paragraph = document
          .getElementsByTagNameNS('http://www.w3.org/ns/ttml', 'p')
          .item(0);
        if (paragraph === null) throw new Error('Fixture paragraph missing');
        const getAttribute = paragraph.getAttribute.bind(paragraph);
        paragraph.getAttribute = ((name: string) =>
          name === 'begin' ? null : getAttribute(name)) as unknown as
          typeof paragraph.getAttribute;
        return document;
      },
    };

    expect(
      parseTtml(primeVideoFixture, {
        language: 'en-US',
        acceptedSourceLanguages: ['en-US'],
        parser,
      }),
    ).toEqual([
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

  it('relaxes incomplete source language only for an explicitly owned track', () => {
    const unlabeled = netflixFixture.replace('xml:lang="en"', '');
    const underspecified = netflixFixture.replace(
      'xml:lang="en"',
      'xml:lang="zh"',
    );

    expect(
      parseTtml(unlabeled, {
        language: 'zh-Hant',
        acceptedSourceLanguages: ['zh-Hant'],
        parser: new DOMParser(),
      }),
    ).toEqual([]);
    expect(
      parseTtml(unlabeled, {
        language: 'zh-Hant',
        acceptedSourceLanguages: ['zh-Hant'],
        allowMissingSourceLanguage: true,
        parser: new DOMParser(),
      })[0],
    ).toMatchObject({
      text: 'Alpha & Beta Gamma\nDelta line',
      language: 'zh-Hant',
    });
    expect(
      parseTtml(underspecified, {
        language: 'zh-Hant',
        acceptedSourceLanguages: ['zh-Hant'],
        parser: new DOMParser(),
      }),
    ).toEqual([]);
    expect(
      parseTtml(underspecified, {
        language: 'zh-Hant',
        acceptedSourceLanguages: ['zh-Hant'],
        allowUnderspecifiedSourceLanguage: true,
        parser: new DOMParser(),
      })[0],
    ).toMatchObject({
      text: 'Alpha & Beta Gamma\nDelta line',
      language: 'zh-Hant',
    });
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
