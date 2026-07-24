import type { TrackInfo } from './contracts';

export type MissingOfficialSide = 'english' | 'zh-Hant';

export interface OfficialDualTrackSelection {
  readonly english: TrackInfo | undefined;
  readonly chinese: TrackInfo | undefined;
  readonly missing: readonly MissingOfficialSide[];
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

export function selectBilingualTracks(
  tracks: readonly TrackInfo[],
): OfficialDualTrackSelection {
  const english = bestAvailableLanguageMatch(tracks, 'en');
  const chinese = bestAvailableLanguageMatch(tracks, 'zh-Hant');
  const missing: MissingOfficialSide[] = [];
  if (english === undefined) missing.push('english');
  if (chinese === undefined) missing.push('zh-Hant');
  return { english, chinese, missing };
}

function bestAvailableLanguageMatch(
  tracks: readonly TrackInfo[],
  target: 'en' | 'zh-Hant',
): TrackInfo | undefined {
  for (const source of ['official', 'asr', 'platform-mt'] as const) {
    const match = bestLanguageMatch(
      tracks.filter((track) => track.source === source),
      target,
    );
    if (match !== undefined) return match;
  }
  return undefined;
}

function bestLanguageMatch(
  tracks: readonly TrackInfo[],
  target: 'en' | 'zh-Hant',
): TrackInfo | undefined {
  const normalizedTarget = target.toLowerCase();
  return (
    tracks.find((track) => track.language.toLowerCase() === normalizedTarget) ??
    tracks.find((track) =>
      track.language.toLowerCase().startsWith(`${normalizedTarget}-`),
    )
  );
}
