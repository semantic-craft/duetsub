import { describe, expect, it } from 'vitest';

import { parseWebVtt } from '../src/core/webvtt';
import maxMinimalFixture from './fixtures/max-minimal.synthetic.vtt?raw';

describe('parseWebVtt', () => {
  it('normalizes the explicitly synthetic Max-shaped fixture into cues', () => {
    expect(
      parseWebVtt(maxMinimalFixture, { language: 'en-US' }),
    ).toEqual([
      {
        start: 11_177,
        end: 13_847,
        text: 'Alpha & Beta\nGamma Delta',
        language: 'en-US',
      },
      {
        start: 14_000,
        end: 15_250,
        text: 'Top region cue',
        language: 'en-US',
        position: 'top',
      },
      {
        start: 16_000,
        end: 17_500,
        text: 'Top line cue',
        language: 'en-US',
        position: 'top',
      },
    ]);
  });

  it('requires a presentation anchor for a non-zero timestamp map', () => {
    const raw = `WEBVTT
X-TIMESTAMP-MAP=LOCAL:00:00:05.000,MPEGTS:900000

00:00:06.000 --> 00:00:07.500
Anchored cue`;

    expect(parseWebVtt(raw, { language: 'en-US' })).toEqual([]);
    expect(
      parseWebVtt(raw, {
        language: 'en-US',
        presentationAnchor: {
          mpegTs: 900_000,
          presentationTimeMs: 10_000,
        },
      }),
    ).toEqual([
      {
        start: 11_000,
        end: 12_500,
        text: 'Anchored cue',
        language: 'en-US',
      },
    ]);
  });

  it('applies a non-zero period offset to a zero timestamp map', () => {
    const raw = `WEBVTT
X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0

00:00:12.000 --> 00:00:13.000
Period cue`;

    expect(
      parseWebVtt(raw, {
        language: 'en-US',
        presentationAnchor: {
          mpegTs: 900_000,
          presentationTimeMs: 15_000,
        },
      }),
    ).toEqual([
      {
        start: 17_000,
        end: 18_000,
        text: 'Period cue',
        language: 'en-US',
      },
    ]);
  });
});
