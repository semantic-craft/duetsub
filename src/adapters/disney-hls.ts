import type { TrackInfo } from '../core/contracts';
import type { WebVttParserOptions } from '../core/webvtt';

const MPEG_TS_WRAP = 2 ** 33;
const MAX_PLAYLIST_SEGMENTS = 2_000;
const MAX_SEGMENT_DURATION_MS = 600_000;
const MAX_PROGRAM_DURATION_MS = 86_400_000;

export interface DisneySubtitleSegment {
  readonly url: string;
  readonly presentationAnchor: NonNullable<
    WebVttParserOptions['presentationAnchor']
  >;
}

export interface DisneyTrackResource {
  readonly track: TrackInfo;
  readonly playlistUrl: string;
}

export interface DisneyMasterManifest {
  readonly tracks: readonly TrackInfo[];
  readonly resources: Readonly<Record<string, DisneyTrackResource>>;
}

export function parseDisneyMasterManifest(
  raw: string,
  manifestUrl: string,
): DisneyMasterManifest | undefined {
  if (
    !raw.replace(/^\uFEFF/, '').startsWith('#EXTM3U') ||
    !isDisneyMediaUrl(manifestUrl, 'manifest')
  ) {
    return undefined;
  }

  const resources: Record<string, DisneyTrackResource> = {};
  const duplicates = new Set<string>();
  for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.startsWith('#EXT-X-MEDIA:')) continue;
    const attributes = parseAttributeList(line.slice('#EXT-X-MEDIA:'.length));
    if (attributes?.TYPE !== 'SUBTITLES') continue;

    const language = canonicalLanguage(attributes.LANGUAGE ?? '');
    const label = attributes.NAME?.trim() ?? '';
    const forced = attributes.FORCED === 'YES';
    const closedCaptions = (attributes.CHARACTERISTICS ?? '')
      .split(',')
      .includes('public.accessibility.describes-music-and-sound');
    const kind = closedCaptions ? 'closed-captions' : 'subtitles';
    const variant = forced ? 'forced' : closedCaptions ? 'cc' : 'normal';
    const id = language === undefined ? '' : `${language}:${variant}`;
    const playlistUrl = resolveDisneyMediaUrl(
      attributes.URI ?? '',
      manifestUrl,
      'manifest',
    );
    if (
      language === undefined ||
      label.length === 0 ||
      attributes.FORCED !== 'YES' && attributes.FORCED !== 'NO' ||
      playlistUrl === undefined ||
      id.length === 0
    ) {
      continue;
    }
    if (resources[id] !== undefined) {
      delete resources[id];
      duplicates.add(id);
      continue;
    }
    if (duplicates.has(id)) continue;

    const track: TrackInfo = {
      id,
      language,
      source: 'official',
      label,
      kind,
      ...(forced ? { forcedOnly: true } : {}),
    };
    resources[id] = { track, playlistUrl };
  }

  const tracks = Object.values(resources).map(({ track }) => track);
  return tracks.length === 0 ? undefined : { tracks, resources };
}

export function parseDisneySubtitlePlaylist(
  raw: string,
  playlistUrl: string,
): readonly DisneySubtitleSegment[] | undefined {
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (
    !normalized.startsWith('#EXTM3U') ||
    !normalized.includes('#EXT-X-ENDLIST') ||
    !isDisneyMediaUrl(playlistUrl, 'manifest')
  ) {
    return undefined;
  }

  const result: DisneySubtitleSegment[] = [];
  let pendingDurationMs: number | undefined;
  let elapsedDurationMs = 0;
  let firstPresentationTimeMs: number | undefined;
  for (const line of normalized.split('\n')) {
    const value = line.trim();
    if (value.length === 0) continue;
    if (value.startsWith('#EXTINF:')) {
      if (pendingDurationMs !== undefined) return undefined;
      pendingDurationMs = parseSegmentDurationMs(value);
      if (pendingDurationMs === undefined) return undefined;
      continue;
    }
    if (value.startsWith('#')) continue;
    if (pendingDurationMs === undefined) return undefined;
    const url = resolveDisneyMediaUrl(value, playlistUrl, 'vtt');
    const rawAnchor = url === undefined ? undefined : anchorFromSegmentUrl(url);
    if (url === undefined || rawAnchor === undefined) return undefined;
    firstPresentationTimeMs ??= rawAnchor.presentationTimeMs;
    result.push({
      url,
      presentationAnchor: {
        mpegTs: rawAnchor.mpegTs,
        presentationTimeMs: firstPresentationTimeMs + elapsedDurationMs,
      },
    });
    if (result.length > MAX_PLAYLIST_SEGMENTS) return undefined;
    elapsedDurationMs += pendingDurationMs;
    if (elapsedDurationMs > MAX_PROGRAM_DURATION_MS) return undefined;
    pendingDurationMs = undefined;
  }
  return result.length === 0 || pendingDurationMs !== undefined
    ? undefined
    : result;
}

export function isDisneyMediaUrl(
  value: string,
  kind: 'manifest' | 'vtt',
): boolean {
  if (value.length === 0 || value.length > 8_192) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      (url.hostname === 'media.dssott.com' ||
        url.hostname.endsWith('.media.dssott.com')) &&
      (kind === 'manifest'
        ? url.pathname.endsWith('.m3u8')
        : url.pathname.endsWith('.vtt'))
    );
  } catch {
    return false;
  }
}

function resolveDisneyMediaUrl(
  value: string,
  baseUrl: string,
  kind: 'manifest' | 'vtt',
): string | undefined {
  try {
    const base = new URL(baseUrl);
    const url = new URL(value, base);
    const baseDirectory = new URL('.', base);
    return isDisneyMediaUrl(url.href, kind) &&
        url.origin === base.origin &&
        url.pathname.startsWith(baseDirectory.pathname)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function anchorFromSegmentUrl(
  value: string,
): DisneySubtitleSegment['presentationAnchor'] | undefined {
  const match = new URL(value).pathname.match(/\/pts_(\d+)\.vtt$/i);
  if (match === null) return undefined;
  const pts = Number(match[1]);
  return Number.isSafeInteger(pts) && pts >= 0
    ? {
        mpegTs: pts % MPEG_TS_WRAP,
        presentationTimeMs: pts / 90,
      }
    : undefined;
}

function parseSegmentDurationMs(value: string): number | undefined {
  const match = value.match(/^#EXTINF:(\d+(?:\.\d+)?),/);
  if (match === null) return undefined;
  const durationMs = Number(match[1]) * 1_000;
  return Number.isFinite(durationMs) &&
      durationMs > 0 &&
      durationMs <= MAX_SEGMENT_DURATION_MS
    ? durationMs
    : undefined;
}

function parseAttributeList(
  value: string,
): Readonly<Record<string, string>> | undefined {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (const character of value) {
    if (character === '"') quoted = !quoted;
    if (character === ',' && !quoted) {
      fields.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  if (quoted) return undefined;
  fields.push(current);

  const result: Record<string, string> = {};
  for (const field of fields) {
    const separator = field.indexOf('=');
    if (separator <= 0) return undefined;
    const key = field.slice(0, separator).trim().toUpperCase();
    let fieldValue = field.slice(separator + 1).trim();
    if (fieldValue.startsWith('"') || fieldValue.endsWith('"')) {
      if (!(fieldValue.startsWith('"') && fieldValue.endsWith('"'))) {
        return undefined;
      }
      fieldValue = fieldValue.slice(1, -1);
    }
    if (key.length === 0 || result[key] !== undefined) return undefined;
    result[key] = fieldValue;
  }
  return result;
}

function canonicalLanguage(value: string): string | undefined {
  try {
    const language = Intl.getCanonicalLocales(value)[0];
    return language === 'zxx' || language === 'und' || language === 'mul'
      ? undefined
      : language;
  } catch {
    return undefined;
  }
}
