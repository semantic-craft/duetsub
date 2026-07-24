import type { TrackInfo } from './contracts';

export type MissingOfficialSide = 'english' | 'zh-Hant';

export interface OfficialDualTrackSelection {
  readonly english: TrackInfo | undefined;
  readonly chinese: TrackInfo | undefined;
  readonly missing: readonly MissingOfficialSide[];
}

export type SubtitleSource =
  | { readonly kind: 'official'; readonly track: TrackInfo }
  | {
      readonly kind: 'mt';
      readonly source: TrackInfo;
      readonly targetLanguage: 'en' | 'zh-Hant';
    }
  | {
      readonly kind: 'opencc';
      readonly source: TrackInfo;
      readonly targetLanguage: 'zh-Hant';
    };

export interface SubtitleSourceDecision {
  readonly english: SubtitleSource | undefined;
  readonly chinese: SubtitleSource | undefined;
}

export function selectOfficialDualTracks(
  tracks: readonly TrackInfo[],
): OfficialDualTrackSelection {
  const official = tracks.filter((track) => track.source === 'official');
  const english = bestLanguageMatch(official, 'en');
  const chinese = bestLanguageMatch(official, 'zh-Hant');
  const missing: MissingOfficialSide[] = [];
  if (english === undefined) missing.push('english');
  if (chinese === undefined) missing.push('zh-Hant');

  return { english, chinese, missing };
}

export function decideSubtitleSources(
  tracks: readonly TrackInfo[],
): SubtitleSourceDecision {
  const official = tracks.filter((track) => track.source === 'official');
  const english = bestLanguageMatch(official, 'en');
  const traditional = bestLanguageMatch(official, 'zh-Hant');
  const simplified = bestLanguageMatch(official, 'zh-Hans');

  if (english !== undefined && traditional !== undefined) {
    return {
      english: { kind: 'official', track: english },
      chinese: { kind: 'official', track: traditional },
    };
  }
  if (english !== undefined) {
    return {
      english: { kind: 'official', track: english },
      chinese: simplified !== undefined
        ? {
            kind: 'opencc',
            source: simplified,
            targetLanguage: 'zh-Hant',
          }
        : {
        kind: 'mt',
        source: english,
        targetLanguage: 'zh-Hant',
          },
    };
  }
  const chinese = traditional ?? simplified;
  if (chinese === undefined) return { english: undefined, chinese: undefined };
  return {
    english: { kind: 'mt', source: chinese, targetLanguage: 'en' },
    chinese: traditional !== undefined
      ? { kind: 'official', track: traditional }
      : {
          kind: 'opencc',
          source: chinese,
          targetLanguage: 'zh-Hant',
        },
  };
}

function bestLanguageMatch(
  tracks: readonly TrackInfo[],
  target: 'en' | 'zh-Hans' | 'zh-Hant',
): TrackInfo | undefined {
  const normalizedTarget = target.toLowerCase();
  return (
    tracks.find((track) => track.language.toLowerCase() === normalizedTarget) ??
    tracks.find((track) =>
      track.language.toLowerCase().startsWith(`${normalizedTarget}-`),
    )
  );
}
