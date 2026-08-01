import OpenCC from 'opencc-js/cn2t';
import OpenCCToSimplified from 'opencc-js/t2cn';

import type { Cue } from '../core/contracts';

const toTraditional = OpenCC.Converter({ from: 'cn', to: 't' });
const toSimplified = OpenCCToSimplified.Converter({ from: 't', to: 'cn' });

export function convertCuesToTraditional(cues: readonly Cue[]): Cue[] {
  return cues.map((cue) => ({
    ...cue,
    text: toTraditional(cue.text),
    language: 'zh-Hant',
  }));
}

export function convertCuesToSimplified(cues: readonly Cue[]): Cue[] {
  return cues.map((cue) => ({
    ...cue,
    text: toSimplified(cue.text),
    language: 'zh-Hans',
  }));
}
