import type { Cue, SiteId, TrackInfo } from './contracts';

export type CanonicalLanguageTag = string;

export interface LanguagePairPreference {
  readonly version: 1;
  readonly top: CanonicalLanguageTag;
  readonly bottom: CanonicalLanguageTag;
}

export const DEFAULT_LANGUAGE_PAIR_PREFERENCE: LanguagePairPreference = {
  version: 1,
  top: 'en',
  bottom: 'zh-Hant',
};

export const FIXED_OFFICIAL_PAIR_TRACER_PREFERENCE: LanguagePairPreference = {
  version: 1,
  top: 'ja',
  bottom: 'zh-Hans',
};

export interface OfficialLanguageOption {
  readonly language: CanonicalLanguageTag;
  readonly label: string;
}

export function normalizeLanguagePairPreference(
  value: unknown,
): LanguagePairPreference | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Partial<LanguagePairPreference>;
  if (
    candidate.version !== 1 ||
    typeof candidate.top !== 'string' ||
    typeof candidate.bottom !== 'string'
  ) {
    return undefined;
  }
  const top = canonicalLanguage(candidate.top);
  const bottom = canonicalLanguage(candidate.bottom);
  return top === undefined || bottom === undefined || top === bottom
    ? undefined
    : { version: 1, top, bottom };
}

export function createLanguagePairPreference(
  catalog: readonly OfficialLanguageOption[],
  top: string,
  bottom: string,
): LanguagePairPreference | undefined {
  const preference = normalizeLanguagePairPreference({
    version: 1,
    top,
    bottom,
  });
  if (preference === undefined) return undefined;
  const languages = new Set(
    catalog.flatMap(({ language }) => {
      const canonical = canonicalLanguage(language);
      return canonical === undefined ? [] : [canonical];
    }),
  );
  return languages.has(preference.top) && languages.has(preference.bottom)
    ? preference
    : undefined;
}

export type OfficialPairUnavailableReason =
  | 'same-language'
  | 'top-missing'
  | 'bottom-missing'
  | 'both-missing'
  | 'ambiguous-language';

export type OfficialPairResolution =
  | {
      readonly kind: 'ready';
      readonly catalog: readonly OfficialLanguageOption[];
      readonly top: TrackInfo;
      readonly bottom: TrackInfo;
    }
  | {
      readonly kind: 'unavailable';
      readonly catalog: readonly OfficialLanguageOption[];
      readonly reason: OfficialPairUnavailableReason;
      readonly top: TrackInfo | undefined;
      readonly bottom: TrackInfo | undefined;
    };

export type OfficialPairCueResolution =
  | {
      readonly kind: 'ready';
      readonly catalog: readonly OfficialLanguageOption[];
      readonly top: TrackInfo;
      readonly bottom: TrackInfo;
      readonly topCues: readonly Cue[];
      readonly bottomCues: readonly Cue[];
    }
  | {
      readonly kind: 'unavailable';
      readonly catalog: readonly OfficialLanguageOption[];
      readonly reason:
        | OfficialPairUnavailableReason
        | 'top-empty'
        | 'bottom-empty'
        | 'both-empty';
    };

interface CatalogTrack {
  readonly track: TrackInfo;
  readonly language: CanonicalLanguageTag;
}

type LanguageTrackSelection =
  | { readonly kind: 'selected'; readonly track: TrackInfo }
  | { readonly kind: 'missing' }
  | { readonly kind: 'ambiguous' };

export function resolveOfficialPair(input: {
  readonly siteId: SiteId;
  readonly tracks: readonly TrackInfo[];
  readonly preference: LanguagePairPreference;
}): OfficialPairResolution {
  const tracks = officialCatalogTracks(input.tracks);
  const catalog = createOfficialTrackCatalog(input.tracks);
  const topLanguage = canonicalLanguage(input.preference.top);
  const bottomLanguage = canonicalLanguage(input.preference.bottom);
  if (
    topLanguage !== undefined &&
    topLanguage === bottomLanguage
  ) {
    return {
      kind: 'unavailable',
      catalog,
      reason: 'same-language',
      top: undefined,
      bottom: undefined,
    };
  }
  const topSelection = selectLanguageTrack(
    tracks,
    topLanguage,
    ['subtitles', 'closed-captions'],
  );
  const bottomSelection = selectLanguageTrack(
    tracks,
    bottomLanguage,
    ['subtitles', 'closed-captions'],
  );
  if (
    topSelection.kind === 'ambiguous' ||
    bottomSelection.kind === 'ambiguous'
  ) {
    return {
      kind: 'unavailable',
      catalog,
      reason: 'ambiguous-language',
      top: undefined,
      bottom: undefined,
    };
  }
  const top = topSelection.kind === 'selected'
    ? topSelection.track
    : undefined;
  const bottom = bottomSelection.kind === 'selected'
    ? bottomSelection.track
    : undefined;

  if (top !== undefined && bottom !== undefined) {
    return { kind: 'ready', catalog, top, bottom };
  }
  return {
    kind: 'unavailable',
    catalog,
    top,
    bottom,
    reason: top === undefined
      ? bottom === undefined
        ? 'both-missing'
        : 'top-missing'
      : 'bottom-missing',
  };
}

export function isMaxEnglishTraditionalChineseLanguagePair(
  siteId: SiteId,
  topLanguage: CanonicalLanguageTag,
  bottomLanguage: CanonicalLanguageTag,
): boolean {
  const top = canonicalLanguage(topLanguage);
  const bottom = canonicalLanguage(bottomLanguage);
  return siteId === 'max' &&
    top === 'en-US' &&
    bottom === 'zh-Hant-TW';
}

export function createOfficialTrackCatalog(
  tracks: readonly TrackInfo[],
): readonly OfficialLanguageOption[] {
  const catalogTracks = officialCatalogTracks(tracks);
  return catalogTracks.flatMap(({ track, language }, index) =>
    catalogTracks.findIndex(
      (candidate) => candidate.language === language,
    ) === index
      ? [{ language, label: displayLanguage(language, track.label) }]
      : []
  );
}

export function resolveOfficialPairCues(input: {
  readonly siteId: SiteId;
  readonly tracks: readonly TrackInfo[];
  readonly preference: LanguagePairPreference;
  readonly cuesByTrack: ReadonlyMap<string, readonly Cue[]>;
}): OfficialPairCueResolution {
  const pair = resolveOfficialPair(input);
  if (pair.kind === 'unavailable') return pair;

  const topCues = input.cuesByTrack.get(pair.top.id) ?? [];
  const bottomCues = input.cuesByTrack.get(pair.bottom.id) ?? [];
  if (topCues.length > 0 && bottomCues.length > 0) {
    return { ...pair, topCues, bottomCues };
  }
  return {
    kind: 'unavailable',
    catalog: pair.catalog,
    reason: topCues.length === 0
      ? bottomCues.length === 0
        ? 'both-empty'
        : 'top-empty'
      : 'bottom-empty',
  };
}

function selectLanguageTrack(
  tracks: readonly CatalogTrack[],
  preference: CanonicalLanguageTag | undefined,
  preferredKinds: readonly TrackInfo['kind'][],
): LanguageTrackSelection {
  if (preference === undefined) return { kind: 'missing' };
  const exact = tracks.filter(({ language }) => language === preference);
  if (exact.length > 0) return selectedVariant(exact, preferredKinds);

  const preferredLanguage = languageParts(preference);
  const preferredScript = scriptFamily(preferredLanguage);
  const scriptMatches = tracks.filter(({ language }) => {
    const candidate = languageParts(language);
    if (candidate.language !== preferredLanguage.language) return false;
    const candidateScript = scriptFamily(candidate);
    if (preferredScript !== undefined) {
      return candidateScript === preferredScript;
    }
    return preferredLanguage.language !== 'zh' &&
      preferredLanguage.region !== undefined &&
      candidateScript === undefined;
  });
  if (scriptMatches.length > 0) {
    return selectedVariant(scriptMatches, preferredKinds);
  }

  if (
    preferredLanguage.script !== undefined ||
    preferredLanguage.region !== undefined
  ) {
    return { kind: 'missing' };
  }
  const baseMatches = tracks.filter(({ language }) =>
    languageParts(language).language === preferredLanguage.language
  );
  const scriptFamilies = new Set(
    baseMatches
      .map(({ language }) => scriptFamily(languageParts(language)))
      .filter((script): script is string => script !== undefined),
  );
  if (baseMatches.length === 0) return { kind: 'missing' };
  if (scriptFamilies.size > 1) return { kind: 'ambiguous' };
  if (preferredLanguage.language !== 'zh') {
    return selectedVariant(baseMatches, preferredKinds);
  }
  const [onlyFamily] = scriptFamilies;
  return onlyFamily === undefined
    ? { kind: 'ambiguous' }
    : selectedVariant(
        baseMatches.filter(({ language }) =>
          scriptFamily(languageParts(language)) === onlyFamily
        ),
        preferredKinds,
      );
}

function officialCatalogTracks(
  tracks: readonly TrackInfo[],
): CatalogTrack[] {
  return tracks.flatMap((track) => {
    if (track.source !== 'official' || track.forcedOnly === true) return [];
    const language = canonicalLanguage(track.language);
    return language === undefined ? [] : [{ track, language }];
  });
}

function selectedVariant(
  candidates: readonly CatalogTrack[],
  preferredKinds: readonly TrackInfo['kind'][],
): LanguageTrackSelection {
  const track = selectVariant(candidates, preferredKinds);
  return track === undefined
    ? { kind: 'missing' }
    : { kind: 'selected', track };
}

function selectVariant(
  candidates: readonly CatalogTrack[],
  preferredKinds: readonly TrackInfo['kind'][],
): TrackInfo | undefined {
  return candidates.toSorted(
    (left, right) =>
      preferredKinds.indexOf(left.track.kind) -
      preferredKinds.indexOf(right.track.kind),
  )[0]?.track;
}

interface LanguageParts {
  readonly language: string;
  readonly script: string | undefined;
  readonly region: string | undefined;
}

function languageParts(language: CanonicalLanguageTag): LanguageParts {
  const locale = new Intl.Locale(language);
  return {
    language: locale.language,
    script: locale.script || undefined,
    region: locale.region || undefined,
  };
}

function scriptFamily(parts: LanguageParts): string | undefined {
  if (parts.language !== 'zh') return parts.script;
  if (parts.script === 'Hans' || parts.script === 'Hant') {
    return parts.script;
  }
  if (parts.region === 'CN' || parts.region === 'SG') return 'Hans';
  if (
    parts.region === 'TW' ||
    parts.region === 'HK' ||
    parts.region === 'MO'
  ) {
    return 'Hant';
  }
  return undefined;
}

function canonicalLanguage(value: string): string | undefined {
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    return undefined;
  }
}

function displayLanguage(language: string, fallback: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(language) ??
      fallback;
  } catch {
    return fallback;
  }
}
