import type { TrackInfo } from '../core/contracts';

export interface YoutubeTrackHandle {
  readonly videoId: string;
  readonly baseUrl: string;
  readonly vssId: string;
  readonly languageCode: string;
  readonly trackName: string;
  readonly kind?: 'asr';
  readonly tlang?: string;
}

export interface YoutubeTrackCandidate {
  readonly track: TrackInfo;
  readonly handle: YoutubeTrackHandle;
}

interface CaptionTrackRecord {
  readonly baseUrl?: unknown;
  readonly vssId?: unknown;
  readonly languageCode?: unknown;
  readonly kind?: unknown;
  readonly trackName?: unknown;
  readonly name?: unknown;
  readonly isTranslatable?: unknown;
}

export function parseYoutubeCaptionTracks(
  captions: unknown,
  videoId: string,
): YoutubeTrackCandidate[] {
  const renderer = readRecord(captions)?.playerCaptionsTracklistRenderer;
  const captionTracks = readRecord(renderer)?.captionTracks;
  if (!Array.isArray(captionTracks)) return [];

  const candidates: YoutubeTrackCandidate[] = [];
  const translatable: YoutubeTrackCandidate[] = [];
  for (const value of captionTracks) {
    const raw = value as CaptionTrackRecord;
    if (
      typeof raw.baseUrl !== 'string' ||
      !isTimedTextBaseUrl(raw.baseUrl, videoId) ||
      typeof raw.vssId !== 'string' ||
      raw.vssId === '' ||
      typeof raw.languageCode !== 'string'
    ) {
      continue;
    }
    if (raw.kind !== undefined && raw.kind !== 'asr') continue;

    const language = normalizeYoutubeLanguage(raw.languageCode);
    const label = readText(raw.name);
    if (language === undefined || label === undefined) continue;
    const trackName = typeof raw.trackName === 'string' ? raw.trackName : '';
    const source = raw.kind === 'asr' ? 'asr' : 'official';

    const candidate: YoutubeTrackCandidate = {
      track: {
        id: youtubeTrackId(raw.vssId, trackName),
        language,
        source,
        label,
        kind: 'subtitles',
      },
      handle: {
        videoId,
        baseUrl: raw.baseUrl,
        vssId: raw.vssId,
        languageCode: raw.languageCode,
        trackName,
        ...(raw.kind === 'asr' ? { kind: 'asr' as const } : {}),
      },
    };
    candidates.push(candidate);
    if (raw.isTranslatable === true) translatable.push(candidate);
  }

  const translationLanguages = readRecord(renderer)?.translationLanguages;
  if (!Array.isArray(translationLanguages)) return candidates;
  for (const source of translatable) {
    for (const value of translationLanguages) {
      const target = readRecord(value);
      const targetCode = target?.languageCode;
      if (typeof targetCode !== 'string') continue;
      const language = normalizeYoutubeLanguage(targetCode);
      if (
        (language !== 'en' && language !== 'zh-Hant') ||
        language === source.track.language
      ) {
        continue;
      }
      const targetLabel = readText(target?.languageName) ?? language;
      candidates.push({
        track: {
          id: `${source.track.id}:tlang:${encodeURIComponent(targetCode)}`,
          language,
          source: 'platform-mt',
          label: `${source.track.label} → ${targetLabel}`,
          kind: 'subtitles',
        },
        handle: {
          ...source.handle,
          tlang: targetCode,
        },
      });
    }
  }
  return candidates;
}

export function normalizeYoutubeLanguage(value: string): string | undefined {
  const parts = value.split('-');
  if (parts[0]?.toLowerCase() === 'zh') {
    const qualifiers = parts.slice(1).map((part) => part.toLowerCase());
    if (
      qualifiers.includes('hant') ||
      qualifiers.some((part) => ['tw', 'hk', 'mo'].includes(part))
    ) {
      return 'zh-Hant';
    }
    if (
      qualifiers.length === 0 ||
      qualifiers.includes('hans') ||
      qualifiers.some((part) => ['cn', 'sg'].includes(part))
    ) {
      return 'zh-Hans';
    }
  }

  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    return undefined;
  }
}

function youtubeTrackId(vssId: string, trackName: string): string {
  return `youtube:${encodeURIComponent(vssId)}:${encodeURIComponent(trackName)}`;
}

function isTimedTextBaseUrl(value: string, videoId: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'www.youtube.com' &&
      url.pathname === '/api/timedtext' &&
      url.searchParams.get('v') === videoId
    );
  } catch {
    return false;
  }
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function readText(value: unknown): string | undefined {
  const record = readRecord(value);
  if (record === undefined) return undefined;
  if (typeof record.simpleText === 'string' && record.simpleText.trim() !== '') {
    return record.simpleText.trim();
  }
  if (!Array.isArray(record.runs)) return undefined;
  const text = record.runs
    .map((run) => readRecord(run)?.text)
    .filter((part): part is string => typeof part === 'string')
    .join('')
    .trim();
  return text === '' ? undefined : text;
}
