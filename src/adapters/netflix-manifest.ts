import type { TrackInfo } from '../core/contracts';

export interface NetflixManifest {
  readonly contentIdentity: string;
  readonly tracks: readonly TrackInfo[];
}

export function parseNetflixManifest(value: unknown): NetflixManifest | undefined {
  const manifest = asRecord(value);
  if (manifest === undefined || !Array.isArray(manifest.timedtexttracks)) {
    return undefined;
  }

  const contentIdentity = readIdentity(manifest);
  if (contentIdentity === undefined) return undefined;

  const tracks: TrackInfo[] = [];
  for (const value of manifest.timedtexttracks) {
    const track = parseTrack(value);
    if (track !== undefined && !tracks.some(({ id }) => id === track.id)) {
      tracks.push(track);
    }
  }

  return { contentIdentity, tracks };
}

function parseTrack(value: unknown): TrackInfo | undefined {
  const track = asRecord(value);
  if (track === undefined || track.hydrated !== true) return undefined;

  const id = readStringOrNumber(track.id ?? track.new_track_id);
  if (
    id === undefined ||
    isNoneTrack(track, id) ||
    isForcedOnly(track) ||
    !hasTextDownloadable(track)
  ) {
    return undefined;
  }

  const language = canonicalLanguage(track.language);
  if (language === undefined) return undefined;

  const description =
    typeof track.languageDescription === 'string'
      ? track.languageDescription.trim()
      : '';
  const closedCaptions =
    normalizeToken(track.rawTrackType ?? track.trackType) === 'closedcaptions';
  const label = description === '' ? language : description;

  return {
    id,
    language,
    source: 'official',
    label:
      closedCaptions && !/[\[(（]CC[\])）]/i.test(label)
        ? `${label} [CC]`
        : label,
    kind: closedCaptions ? 'closed-captions' : 'subtitles',
  };
}

function readIdentity(manifest: Record<string, unknown>): string | undefined {
  return readStringOrNumber(manifest.movieId ?? manifest.viewableId);
}

function readStringOrNumber(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized === '' ? undefined : normalized;
  }
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : undefined;
}

function isNoneTrack(track: Record<string, unknown>, id: string): boolean {
  if (track.isNoneTrack === true) return true;
  if (typeof track.rank === 'number' && track.rank < 0) return true;
  if (normalizeToken(track.rawTrackType ?? track.trackType) === 'none') {
    return true;
  }
  return id.split(';')[4] === '1';
}

function isForcedOnly(track: Record<string, unknown>): boolean {
  if (track.isForcedNarrative === true) return true;
  return normalizeToken(track.rawTrackType ?? track.trackType) ===
    'forcednarrative';
}

function hasTextDownloadable(track: Record<string, unknown>): boolean {
  const downloadables = asRecord(track.ttDownloadables ?? track.downloadables);
  if (downloadables === undefined) return false;

  return Object.values(downloadables).some((value) => {
    const downloadable = asRecord(value);
    return (
      downloadable !== undefined &&
      downloadable.isImage !== true &&
      hasDownloadUrl(downloadable.urls ?? downloadable.downloadUrls)
    );
  });
}

function hasDownloadUrl(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.some(hasDownloadUrl);

  const record = asRecord(value);
  if (record === undefined) return false;
  if (typeof record.url === 'string' && record.url.length > 0) return true;
  return Object.values(record).some(hasDownloadUrl);
}

function canonicalLanguage(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    return undefined;
  }
}

function normalizeToken(value: unknown): string {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/[^a-z]/g, '')
    : '';
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
