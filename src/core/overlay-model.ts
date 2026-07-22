import type { Cue } from './contracts';

export interface OverlayLineModel {
  readonly id: 'english' | 'chinese';
  readonly lang: 'en' | 'zh-Hant';
  readonly text: string;
  readonly sizePercent: 82 | 100;
  readonly machineTranslated: boolean;
}

export interface OverlayModel {
  readonly visible: boolean;
  readonly lines: readonly [OverlayLineModel, OverlayLineModel];
  readonly placement:
    | { readonly edge: 'top'; readonly offset: '8%' }
    | { readonly edge: 'bottom'; readonly offset: '8.5%' | '18%' };
}

export interface OverlayModelInput {
  readonly active: boolean;
  readonly enActive: readonly Cue[];
  readonly zhActive: readonly Cue[];
  readonly englishMachineTranslated: boolean;
  readonly chineseMachineTranslated: boolean;
  readonly controlsVisible: boolean;
}

export function createOverlayModel(input: OverlayModelInput): OverlayModel {
  const englishText = input.enActive.map((cue) => cue.text).join('\n');
  const chineseText = input.zhActive.map((cue) => cue.text).join('\n');
  const hasTopCue = [...input.enActive, ...input.zhActive].some(
    (cue) => cue.position === 'top',
  );

  return {
    visible:
      input.active && (englishText.length > 0 || chineseText.length > 0),
    lines: [
      {
        id: 'english',
        lang: 'en',
        text: englishText,
        sizePercent: 82,
        machineTranslated:
          input.englishMachineTranslated && englishText.length > 0,
      },
      {
        id: 'chinese',
        lang: 'zh-Hant',
        text: chineseText,
        sizePercent: 100,
        machineTranslated:
          input.chineseMachineTranslated && chineseText.length > 0,
      },
    ],
    placement: hasTopCue
      ? { edge: 'top', offset: '8%' }
      : {
          edge: 'bottom',
          offset: input.controlsVisible ? '18%' : '8.5%',
        },
  };
}
