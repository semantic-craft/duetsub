import { describe, expect, it } from 'vitest';

import type { Cue } from '../src/core/contracts';
import { mergeTranslatedCues } from '../src/core/translated-cue-merge';

describe('translated cue merge', () => {
  it('preserves every translated line that shares one time range', () => {
    const firstLine: Cue = {
      start: 1_000,
      end: 2_000,
      text: '这桩家事',
      language: 'zh-Hans',
    };
    const secondLine: Cue = {
      start: 1_000,
      end: 2_000,
      text: '我们要去处理？',
      language: 'zh-Hans',
    };

    const merged = mergeTranslatedCues(
      [
        {
          start: 100,
          end: 900,
          text: '前一句。',
          language: 'zh-Hans',
        },
        firstLine,
      ],
      [secondLine],
    );

    expect(merged.map((cue) => cue.text)).toEqual([
      '前一句。',
      '这桩家事',
      '我们要去处理？',
    ]);
  });

  it('deduplicates an identical translated cue', () => {
    const cue: Cue = {
      start: 1_000,
      end: 2_000,
      text: '倒在她身上。',
      language: 'zh-Hans',
    };

    expect(mergeTranslatedCues([cue], [cue])).toEqual([cue]);
  });
});
