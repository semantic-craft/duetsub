import OpenCC from 'opencc-js/cn2t';

import type { Cue } from '../core/contracts';

const toTraditional = OpenCC.Converter({ from: 'cn', to: 't' });

export function convertCuesToTraditional(cues: readonly Cue[]): Cue[] {
  return cues.map((cue) => ({
    ...cue,
    text: toTraditional(cue.text),
    language: 'zh-Hant',
  }));
}
