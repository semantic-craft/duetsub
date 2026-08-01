import type {
  Cue,
  TrackInfo,
  TranslationTargetLanguage,
} from './contracts';

export interface BottomRetranslationPlan {
  readonly source: readonly Cue[];
  readonly trackId: string;
  readonly target: 'bottom';
  readonly targetLanguage: TranslationTargetLanguage;
}

export function createBottomRetranslationPlan(input: {
  readonly topTrack: TrackInfo;
  readonly bottomLanguage: string;
  readonly topCues: readonly Cue[];
}): BottomRetranslationPlan | undefined {
  if (input.topCues.length === 0) return undefined;
  const targetLanguage = bottomRetranslationTargetLanguage(
    input.bottomLanguage,
  );
  return targetLanguage === undefined
    ? undefined
    : {
        source: input.topCues,
        trackId: input.topTrack.id,
        target: 'bottom',
        targetLanguage,
      };
}

export function bottomRetranslationTargetLanguage(
  language: string,
): BottomRetranslationPlan['targetLanguage'] | undefined {
  try {
    const locale = new Intl.Locale(language).maximize();
    if (locale.language === 'en') return 'en';
    if (locale.language === 'zh') {
      if (locale.script === 'Hans') return 'zh-Hans';
      if (locale.script === 'Hant') return 'zh-Hant';
    }
  } catch {
    // Unsupported or malformed language tags cannot be translated here.
  }
  return undefined;
}
