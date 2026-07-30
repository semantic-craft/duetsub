import type { Cue } from './contracts';

export interface OverlayLineModel {
  readonly id: 'top' | 'bottom';
  readonly lang: string;
  readonly dir: 'ltr' | 'rtl' | 'auto';
  readonly text: string;
  readonly sizePercent: 90 | 100;
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
  readonly topActive: readonly Cue[];
  readonly bottomActive: readonly Cue[];
  readonly topLanguage: string;
  readonly bottomLanguage: string;
  readonly topMachineTranslated: boolean;
  readonly bottomMachineTranslated: boolean;
  readonly controlsVisible: boolean;
}

export function createOverlayModel(input: OverlayModelInput): OverlayModel {
  const topText = input.topActive.map((cue) => cue.text).join('\n');
  const bottomText = input.bottomActive.map((cue) => cue.text).join('\n');
  const hasTopCue = [...input.topActive, ...input.bottomActive].some(
    (cue) => cue.position === 'top',
  );

  return {
    visible:
      input.active && (topText.length > 0 || bottomText.length > 0),
    lines: [
      {
        id: 'top',
        lang: input.topLanguage,
        dir: languageDirection(input.topLanguage),
        text: topText,
        sizePercent: 100,
        machineTranslated:
          input.topMachineTranslated && topText.length > 0,
      },
      {
        id: 'bottom',
        lang: input.bottomLanguage,
        dir: languageDirection(input.bottomLanguage),
        text: bottomText,
        sizePercent: 90,
        machineTranslated:
          input.bottomMachineTranslated && bottomText.length > 0,
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

const RTL_SCRIPTS = new Set([
  'Adlm',
  'Arab',
  'Hebr',
  'Mand',
  'Nkoo',
  'Rohg',
  'Samr',
  'Syrc',
  'Thaa',
]);

function languageDirection(language: string): 'ltr' | 'rtl' | 'auto' {
  try {
    const script = new Intl.Locale(language).maximize().script;
    return script !== undefined && RTL_SCRIPTS.has(script) ? 'rtl' : 'ltr';
  } catch {
    return 'auto';
  }
}
