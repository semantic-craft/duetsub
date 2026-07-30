import { describe, expect, it } from 'vitest';

import type { Cue } from '../src/core/contracts';
import { synchronizeCues } from '../src/core/synchronizer';

const topCue: Cue = {
  start: 1_000,
  end: 2_000,
  text: 'ちょうど一秒',
  language: 'ja',
};

describe('synchronizeCues', () => {
  it('uses exact start-inclusive and end-exclusive cue boundaries', () => {
    expect(synchronizeCues([topCue], [], 999).topActive).toEqual([]);
    expect(synchronizeCues([topCue], [], 1_000).topActive).toEqual([
      topCue,
    ]);
    expect(synchronizeCues([topCue], [], 1_999).topActive).toEqual([
      topCue,
    ]);
    expect(synchronizeCues([topCue], [], 2_000).topActive).toEqual([]);
  });

  it('keeps a long cue active across multiple shorter cues on the other side', () => {
    const bottomCues: Cue[] = [
      {
        start: 1_000,
        end: 2_000,
        text: '第一段',
        language: 'zh-Hans',
      },
      {
        start: 2_000,
        end: 3_000,
        text: '第二段',
        language: 'zh-Hans',
      },
    ];

    const first = synchronizeCues(
      [{ ...topCue, end: 3_000 }],
      bottomCues,
      1_500,
    );
    expect(first).toMatchObject({
      topActive: [{ text: 'ちょうど一秒' }],
      bottomActive: [{ text: '第一段' }],
    });
    expect(
      synchronizeCues(
        [{ ...topCue, end: 3_000 }],
        bottomCues,
        2_500,
        first.state,
      ),
    ).toMatchObject({
      topActive: [{ text: 'ちょうど一秒' }],
      bottomActive: [{ text: '第二段' }],
    });
  });

  it('returns the available side when the other side has no active cue', () => {
    expect(synchronizeCues([topCue], [], 1_500)).toMatchObject({
      topActive: [topCue],
      bottomActive: [],
    });
  });

  it('repositions correctly when time moves backwards after forward playback', () => {
    const cues: Cue[] = [
      { ...topCue, text: 'Earlier' },
      { ...topCue, start: 8_000, end: 9_000, text: 'Later' },
    ];
    const later = synchronizeCues(cues, [], 8_500);

    expect(synchronizeCues(cues, [], 1_500, later.state).topActive).toEqual([
      cues[0],
    ]);
  });
});
