import { describe, expect, it } from 'vitest';

import type { Cue } from '../src/core/contracts';
import { synchronizeCues } from '../src/core/synchronizer';

const englishCue: Cue = {
  start: 1_000,
  end: 2_000,
  text: 'Exactly one second',
  language: 'en',
};

describe('synchronizeCues', () => {
  it('uses exact start-inclusive and end-exclusive cue boundaries', () => {
    expect(synchronizeCues([englishCue], [], 999).enActive).toEqual([]);
    expect(synchronizeCues([englishCue], [], 1_000).enActive).toEqual([
      englishCue,
    ]);
    expect(synchronizeCues([englishCue], [], 1_999).enActive).toEqual([
      englishCue,
    ]);
    expect(synchronizeCues([englishCue], [], 2_000).enActive).toEqual([]);
  });

  it('keeps a long cue active across multiple shorter cues on the other side', () => {
    const chineseCues: Cue[] = [
      {
        start: 1_000,
        end: 2_000,
        text: '第一段',
        language: 'zh-Hant',
      },
      {
        start: 2_000,
        end: 3_000,
        text: '第二段',
        language: 'zh-Hant',
      },
    ];

    const first = synchronizeCues(
      [{ ...englishCue, end: 3_000 }],
      chineseCues,
      1_500,
    );
    expect(first).toMatchObject({
      enActive: [{ text: 'Exactly one second' }],
      zhActive: [{ text: '第一段' }],
    });
    expect(
      synchronizeCues(
        [{ ...englishCue, end: 3_000 }],
        chineseCues,
        2_500,
        first.state,
      ),
    ).toMatchObject({
      enActive: [{ text: 'Exactly one second' }],
      zhActive: [{ text: '第二段' }],
    });
  });

  it('returns the available side when the other side has no active cue', () => {
    expect(synchronizeCues([englishCue], [], 1_500)).toMatchObject({
      enActive: [englishCue],
      zhActive: [],
    });
  });

  it('repositions correctly when time moves backwards after forward playback', () => {
    const cues: Cue[] = [
      { ...englishCue, text: 'Earlier' },
      { ...englishCue, start: 8_000, end: 9_000, text: 'Later' },
    ];
    const later = synchronizeCues(cues, [], 8_500);

    expect(synchronizeCues(cues, [], 1_500, later.state).enActive).toEqual([
      cues[0],
    ]);
  });
});
