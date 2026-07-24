import { describe, expect, it } from 'vitest';

import type { Cue } from '../src/core/contracts';
import { convertCuesToTraditional } from '../src/mt/opencc';

describe('OpenCC fallback', () => {
  it('converts text while preserving timing and marks the result as zh-Hant', () => {
    const source: Cue = {
      start: 120,
      end: 980,
      text: '汉语里面',
      language: 'zh-Hans',
    };
    expect(convertCuesToTraditional([source])).toEqual([
      { ...source, text: '漢語裏面', language: 'zh-Hant' },
    ]);
  });
});
