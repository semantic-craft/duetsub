import type { TrackInfo } from '../core/contracts';
import type { WebVttParserOptions } from '../core/webvtt';

const DASH_NAMESPACE = 'urn:mpeg:dash:schema:mpd:2011';
const MPEG_TS_WRAP = 2 ** 33;

interface XmlNodeList {
  readonly length: number;
  item(index: number): XmlNode | null;
}

interface XmlNode {
  readonly nodeType: number;
  readonly parentNode: XmlNode | null;
}

interface XmlElement extends XmlNode {
  readonly namespaceURI: string | null;
  readonly localName: string | null;
  getAttribute(name: string): string | null;
  getElementsByTagNameNS(namespace: string, localName: string): XmlNodeList;
}

interface XmlDocument {
  readonly documentElement: XmlElement | null;
  getElementsByTagName(name: string): XmlNodeList;
  getElementsByTagNameNS(namespace: string, localName: string): XmlNodeList;
}

interface XmlParser {
  parseFromString(source: string, mimeType: 'application/xml'): unknown;
}

export interface MaxTrackSegment {
  readonly url: string;
  readonly presentationAnchor: NonNullable<
    WebVttParserOptions['presentationAnchor']
  >;
}

export interface MaxTrackResource {
  readonly track: TrackInfo;
  readonly segments: readonly MaxTrackSegment[];
}

export type MaxTrackResourceMap = Readonly<
  Record<string, MaxTrackResource>
>;

export interface MaxTrackMappingInput {
  readonly tracks: readonly TrackInfo[];
  readonly playbackInfoRaw: string;
  readonly manifestUrl: string;
  readonly manifestRaw: string;
  readonly parser?: XmlParser;
}

export function mapMaxTrackResources(
  input: MaxTrackMappingInput,
): MaxTrackResourceMap {
  const playback = parsePlaybackInfo(input.playbackInfoRaw);
  if (
    playback === undefined ||
    !sameMaxManifestUrl(playback.manifestUrl, input.manifestUrl)
  ) {
    return {};
  }

  const document = parseDashManifest(input.manifestRaw, input.parser);
  if (document === undefined) return {};
  const adaptations = readTextAdaptations(document, input.manifestUrl);
  const result: Record<string, MaxTrackResource> = {};

  for (const track of input.tracks) {
    const declared = playback.textTracks.filter(
      (candidate) =>
        candidate.id === track.id &&
        candidate.language === track.language &&
        candidate.label === track.label,
    );
    if (declared.length !== 1) continue;

    const matches = adaptations.filter(
      (adaptation) =>
        adaptation.language === declared[0].language &&
        adaptation.role === roleForType(declared[0].type),
    );
    const segments = mergePeriodAdaptations(matches);
    if (segments === undefined) continue;
    result[track.id] = { track, segments };
  }

  return result;
}

interface PlaybackTextTrack {
  readonly id: string;
  readonly language: string;
  readonly label: string;
  readonly type: 'subtitles' | 'closedcaptions';
}

interface PlaybackInfo {
  readonly manifestUrl: string;
  readonly textTracks: readonly PlaybackTextTrack[];
}

function parsePlaybackInfo(raw: string): PlaybackInfo | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(value) || !isRecord(value.manifest)) return undefined;
  const manifestUrl = value.manifest.url;
  if (typeof manifestUrl !== 'string' || !isHttpsUrl(manifestUrl)) {
    return undefined;
  }

  const videos = Array.isArray(value.videos) ? value.videos : [];
  const textTracks: PlaybackTextTrack[] = [];
  for (const video of videos) {
    if (!isRecord(video) || !Array.isArray(video.textTracks)) continue;
    for (const candidate of video.textTracks) {
      const track = parsePlaybackTextTrack(candidate);
      if (
        track !== undefined &&
        !textTracks.some(({ id }) => id === track.id)
      ) {
        textTracks.push(track);
      }
    }
  }

  return { manifestUrl, textTracks };
}

export function readMaxPlaybackManifestUrl(
  raw: string,
): string | undefined {
  return parsePlaybackInfo(raw)?.manifestUrl;
}

function parsePlaybackTextTrack(
  value: unknown,
): PlaybackTextTrack | undefined {
  if (
    !isRecord(value) ||
    (value.type !== 'subtitles' && value.type !== 'closedcaptions') ||
    value.format !== 'webvtt' ||
    typeof value.language !== 'string' ||
    typeof value.displayName !== 'string'
  ) {
    return undefined;
  }

  const language = canonicalLanguage(value.language);
  const label = value.displayName.trim();
  if (language === undefined || label.length === 0) return undefined;
  return {
    id: `${language}-${value.type}`,
    language,
    label,
    type: value.type,
  };
}

function parseDashManifest(
  raw: string,
  injectedParser?: XmlParser,
): XmlDocument | undefined {
  if (!raw.trimStart().startsWith('<')) return undefined;
  const parser = injectedParser ?? new DOMParser();
  let document: XmlDocument;
  try {
    document = parser.parseFromString(raw, 'application/xml') as XmlDocument;
  } catch {
    return undefined;
  }
  const root = document.documentElement;
  if (
    root === null ||
    root.localName !== 'MPD' ||
    root.namespaceURI !== DASH_NAMESPACE ||
    document.getElementsByTagName('parsererror').length > 0
  ) {
    return undefined;
  }
  return document;
}

interface TextAdaptation {
  readonly language: string;
  readonly role: 'subtitle' | 'caption';
  readonly periodStartMs: number;
  readonly periodDurationMs?: number;
  readonly segments: readonly MaxTrackSegment[];
}

function readTextAdaptations(
  document: XmlDocument,
  manifestUrl: string,
): TextAdaptation[] {
  const result: TextAdaptation[] = [];
  const nodes = document.getElementsByTagNameNS(
    DASH_NAMESPACE,
    'AdaptationSet',
  );

  for (let index = 0; index < nodes.length; index += 1) {
    const adaptation = asElement(nodes.item(index));
    if (
      adaptation === undefined ||
      adaptation.getAttribute('contentType') !== 'text'
    ) {
      continue;
    }
    const language = canonicalLanguage(adaptation.getAttribute('lang') ?? '');
    const role = readRole(adaptation);
    const hasWebVtt = elements(
      adaptation.getElementsByTagNameNS(DASH_NAMESPACE, 'Representation'),
    ).some((representation) =>
      representation.getAttribute('mimeType') === 'text/vtt'
    );
    if (language === undefined || role === undefined || !hasWebVtt) continue;

    const period = asElement(adaptation.parentNode);
    if (
      period?.localName !== 'Period' ||
      period.namespaceURI !== DASH_NAMESPACE
    ) {
      continue;
    }
    const rawPeriodStart = period.getAttribute('start');
    const periodStartMs =
      rawPeriodStart === null || rawPeriodStart === ''
        ? 0
        : parseDashDurationMs(rawPeriodStart);
    const rawPeriodDuration = period.getAttribute('duration');
    const periodDurationMs =
      rawPeriodDuration === null || rawPeriodDuration === ''
        ? undefined
        : parseDashDurationMs(rawPeriodDuration);
    if (
      periodStartMs === undefined ||
      (rawPeriodDuration !== null &&
        rawPeriodDuration !== '' &&
        periodDurationMs === undefined)
    ) {
      continue;
    }

    const templates = elements(
      adaptation.getElementsByTagNameNS(DASH_NAMESPACE, 'SegmentTemplate'),
    );
    if (templates.length !== 1) continue;
    const segments = expandSegments(
      templates[0],
      manifestUrl,
      periodStartMs,
    );
    if (segments.length === 0) continue;
    result.push({
      language,
      role,
      periodStartMs,
      periodDurationMs,
      segments,
    });
  }

  return result;
}

function readRole(
  adaptation: XmlElement,
): TextAdaptation['role'] | undefined {
  const roles = elements(
    adaptation.getElementsByTagNameNS(DASH_NAMESPACE, 'Role'),
  )
    .map((role) => role.getAttribute('value'))
    .filter(
      (value): value is TextAdaptation['role'] =>
        value === 'subtitle' || value === 'caption',
    );
  return roles.length === 1
    ? roles[0]
    : undefined;
}

function expandSegments(
  template: XmlElement,
  manifestUrl: string,
  periodStartMs: number,
): MaxTrackSegment[] {
  const media = template.getAttribute('media') ?? '';
  const timescale = Number(template.getAttribute('timescale') ?? '');
  const startNumber = Number(template.getAttribute('startNumber') || '1');
  if (
    !media.includes('$Number$') ||
    !Number.isFinite(timescale) ||
    timescale <= 0 ||
    !Number.isSafeInteger(startNumber) ||
    startNumber < 0
  ) {
    return [];
  }

  const timelines = elements(
    template.getElementsByTagNameNS(DASH_NAMESPACE, 'SegmentTimeline'),
  );
  if (timelines.length !== 1) return [];
  const entries = elements(
    timelines[0].getElementsByTagNameNS(DASH_NAMESPACE, 'S'),
  );
  const result: MaxTrackSegment[] = [];
  let currentTime: number | undefined;
  let number = startNumber;

  for (const entry of entries) {
    const explicitStart = optionalInteger(entry.getAttribute('t'));
    const duration = optionalInteger(entry.getAttribute('d'));
    const repeat = optionalInteger(entry.getAttribute('r')) ?? 0;
    if (
      duration === undefined ||
      duration <= 0 ||
      repeat < 0 ||
      repeat > 1_000 ||
      (explicitStart === undefined && currentTime === undefined)
    ) {
      return [];
    }
    currentTime = explicitStart ?? currentTime;

    for (let repeated = 0; repeated <= repeat; repeated += 1) {
      if (currentTime === undefined) return [];
      const mediaTimeMs = currentTime / timescale * 1_000;
      const presentationTimeMs = periodStartMs + mediaTimeMs;
      if (
        !Number.isFinite(mediaTimeMs) ||
        !Number.isFinite(presentationTimeMs)
      ) {
        return [];
      }
      const url = resolveSegmentUrl(
        media.replace('$Number$', String(number)),
        manifestUrl,
      );
      if (url === undefined) return [];
      result.push({
        url,
        presentationAnchor: {
          mpegTs: Math.round(mediaTimeMs * 90) % MPEG_TS_WRAP,
          presentationTimeMs,
        },
      });
      currentTime += duration;
      number += 1;
    }
  }

  return result;
}

function mergePeriodAdaptations(
  adaptations: readonly TextAdaptation[],
): readonly MaxTrackSegment[] | undefined {
  if (adaptations.length === 0) return undefined;
  const ordered = [...adaptations].sort(
    (left, right) => left.periodStartMs - right.periodStartMs,
  );

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (
      previous.periodStartMs >= current.periodStartMs ||
      previous.periodDurationMs === undefined ||
      previous.periodStartMs + previous.periodDurationMs >
        current.periodStartMs
    ) {
      return undefined;
    }
  }

  return ordered.flatMap((adaptation) => adaptation.segments);
}

function parseDashDurationMs(value: string): number | undefined {
  const match = value.match(
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/,
  );
  if (match === null || match.slice(1).every((part) => part === undefined)) {
    return undefined;
  }
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  const milliseconds = Math.round(
    (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1_000,
  );
  return Number.isSafeInteger(milliseconds) && milliseconds >= 0
    ? milliseconds
    : undefined;
}

function resolveSegmentUrl(
  relativeUrl: string,
  manifestUrl: string,
): string | undefined {
  try {
    const url = new URL(relativeUrl, manifestUrl);
    return url.protocol === 'https:' && url.username === '' &&
        url.password === ''
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function roleForType(
  type: PlaybackTextTrack['type'],
): TextAdaptation['role'] {
  return type === 'subtitles' ? 'subtitle' : 'caption';
}

function canonicalLanguage(value: string): string | undefined {
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    return undefined;
  }
}

function elements(nodes: XmlNodeList): XmlElement[] {
  const result: XmlElement[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const element = asElement(nodes.item(index));
    if (element !== undefined) result.push(element);
  }
  return result;
}

function asElement(node: XmlNode | null): XmlElement | undefined {
  return node?.nodeType === 1 ? node as XmlElement : undefined;
}

function optionalInteger(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function sameMaxManifestUrl(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    if (
      leftUrl.username !== '' ||
      leftUrl.password !== '' ||
      rightUrl.username !== '' ||
      rightUrl.password !== '' ||
      leftUrl.protocol !== 'https:' ||
      rightUrl.protocol !== 'https:'
    ) {
      return false;
    }
    if (leftUrl.pathname !== rightUrl.pathname) return false;
    if (leftUrl.origin === rightUrl.origin) return true;
    return (
      isMaxMediaHost(leftUrl.hostname) &&
      isMaxMediaHost(rightUrl.hostname)
    );
  } catch {
    return false;
  }
}

function isMaxMediaHost(hostname: string): boolean {
  return (
    hostname === 'prd.media.max.com' ||
    hostname.endsWith('.prd.media.max.com') ||
    hostname === 'prd.media.h264.io' ||
    hostname.endsWith('.prd.media.h264.io')
  );
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
