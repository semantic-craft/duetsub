import type { Cue, SiteId, TrackInfo } from './contracts';

const CHANNEL = 'duetsub';
const VERSION = 1;

interface MessageEnvelope {
  readonly channel: typeof CHANNEL;
  readonly version: typeof VERSION;
  readonly siteId: SiteId;
  readonly requestId: string;
}

interface UncorrelatedMessageEnvelope {
  readonly channel: typeof CHANNEL;
  readonly version: typeof VERSION;
  readonly siteId: SiteId;
}

export interface RequestFakeDataMessage extends MessageEnvelope {
  readonly direction: 'isolated-to-main';
  readonly type: 'request-fake-data';
  readonly anchorTimeMs: number;
}

export interface TracksMessage extends MessageEnvelope {
  readonly direction: 'main-to-isolated';
  readonly type: 'tracks';
  readonly tracks: readonly TrackInfo[];
}

export interface CuesMessage extends MessageEnvelope {
  readonly direction: 'main-to-isolated';
  readonly type: 'cues';
  readonly role: 'english' | 'chinese';
  readonly trackId: string;
  readonly cues: readonly Cue[];
  readonly translation: 'official' | 'mt-fallback';
}

export interface PrimeTtmlResponseMessage extends UncorrelatedMessageEnvelope {
  readonly direction: 'main-to-isolated';
  readonly type: 'prime-ttml-response';
  readonly siteId: 'primevideo';
  readonly responseId: string;
  readonly url: string;
  readonly raw: string;
}

export interface YoutubeTimedTextRequestData {
  readonly url: string;
  readonly method: 'GET';
  readonly headers: readonly (readonly [string, string])[];
  readonly credentials: RequestCredentials;
  readonly cache?: RequestCache;
  readonly redirect?: RequestRedirect;
  readonly referrer?: string;
  readonly referrerPolicy?: ReferrerPolicy;
  readonly mode?: RequestMode;
  readonly integrity?: string;
  readonly keepalive?: boolean;
}

export interface YoutubeCaptionsMessage extends UncorrelatedMessageEnvelope {
  readonly direction: 'main-to-isolated';
  readonly type: 'youtube-captions';
  readonly siteId: 'youtube';
  readonly videoId: string;
  readonly captions: object;
}

export interface YoutubeTimedTextRequestMessage
  extends UncorrelatedMessageEnvelope {
  readonly direction: 'main-to-isolated';
  readonly type: 'youtube-timedtext-request';
  readonly siteId: 'youtube';
  readonly videoId: string;
  readonly request: YoutubeTimedTextRequestData;
}

export type YoutubePlayerOperation =
  | 'read-player-captions'
  | 'read-caption-state'
  | 'load-captions'
  | 'set-caption-track';

export type MessageJsonValue =
  | boolean
  | number
  | string
  | null
  | readonly MessageJsonValue[]
  | { readonly [key: string]: MessageJsonValue };

export interface YoutubePlayerCommandMessage extends MessageEnvelope {
  readonly direction: 'isolated-to-main';
  readonly type: 'youtube-player-command';
  readonly siteId: 'youtube';
  readonly videoId: string;
  readonly operation: YoutubePlayerOperation;
  readonly value?: MessageJsonValue;
}

export interface YoutubePlayerCommandResultMessage extends MessageEnvelope {
  readonly direction: 'main-to-isolated';
  readonly type: 'youtube-player-command-result';
  readonly siteId: 'youtube';
  readonly videoId: string;
  readonly operation: YoutubePlayerOperation;
  readonly ok: boolean;
  readonly value?: MessageJsonValue;
  readonly error?: string;
}

export type MainToIsolatedMessage =
  | TracksMessage
  | CuesMessage
  | PrimeTtmlResponseMessage
  | YoutubeCaptionsMessage
  | YoutubeTimedTextRequestMessage
  | YoutubePlayerCommandResultMessage;
export type IsolatedToMainMessage =
  | RequestFakeDataMessage
  | YoutubePlayerCommandMessage;
export type DuetSubMessage = MainToIsolatedMessage | IsolatedToMainMessage;

export function requestFakeData(
  siteId: SiteId,
  requestId: string,
  anchorTimeMs: number,
): RequestFakeDataMessage {
  return {
    channel: CHANNEL,
    version: VERSION,
    direction: 'isolated-to-main',
    type: 'request-fake-data',
    siteId,
    requestId,
    anchorTimeMs,
  };
}

export function tracksMessage(
  envelope: Pick<MessageEnvelope, 'siteId' | 'requestId'>,
  tracks: readonly TrackInfo[],
): TracksMessage {
  return {
    channel: CHANNEL,
    version: VERSION,
    direction: 'main-to-isolated',
    type: 'tracks',
    ...envelope,
    tracks,
  };
}

export function cuesMessage(
  envelope: Pick<MessageEnvelope, 'siteId' | 'requestId'>,
  message: Pick<
    CuesMessage,
    'role' | 'trackId' | 'cues' | 'translation'
  >,
): CuesMessage {
  return {
    channel: CHANNEL,
    version: VERSION,
    direction: 'main-to-isolated',
    type: 'cues',
    ...envelope,
    ...message,
  };
}

export function primeTtmlResponseMessage(
  responseId: string,
  url: string,
  raw: string,
): PrimeTtmlResponseMessage {
  return {
    channel: CHANNEL,
    version: VERSION,
    direction: 'main-to-isolated',
    type: 'prime-ttml-response',
    siteId: 'primevideo',
    responseId,
    url,
    raw,
  };
}

export function youtubeCaptionsMessage(
  videoId: string,
  captions: object,
): YoutubeCaptionsMessage {
  return {
    channel: CHANNEL,
    version: VERSION,
    direction: 'main-to-isolated',
    type: 'youtube-captions',
    siteId: 'youtube',
    videoId,
    captions,
  };
}

export function youtubeTimedTextRequestMessage(
  videoId: string,
  request: YoutubeTimedTextRequestData,
): YoutubeTimedTextRequestMessage {
  return {
    channel: CHANNEL,
    version: VERSION,
    direction: 'main-to-isolated',
    type: 'youtube-timedtext-request',
    siteId: 'youtube',
    videoId,
    request,
  };
}

export function youtubePlayerCommand(
  requestId: string,
  videoId: string,
  operation: YoutubePlayerOperation,
  value?: MessageJsonValue,
): YoutubePlayerCommandMessage {
  return {
    channel: CHANNEL,
    version: VERSION,
    direction: 'isolated-to-main',
    type: 'youtube-player-command',
    siteId: 'youtube',
    requestId,
    videoId,
    operation,
    ...(value === undefined ? {} : { value }),
  };
}

export function youtubePlayerCommandResult(
  requestId: string,
  videoId: string,
  operation: YoutubePlayerOperation,
  ok: boolean,
  value?: MessageJsonValue,
  error?: string,
): YoutubePlayerCommandResultMessage {
  return {
    channel: CHANNEL,
    version: VERSION,
    direction: 'main-to-isolated',
    type: 'youtube-player-command-result',
    siteId: 'youtube',
    requestId,
    videoId,
    operation,
    ok,
    ...(value === undefined ? {} : { value }),
    ...(error === undefined ? {} : { error }),
  };
}

export function isDuetSubMessage(value: unknown): value is DuetSubMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.channel !== CHANNEL ||
    candidate.version !== VERSION ||
    !isSiteId(candidate.siteId)
  ) {
    return false;
  }
  if (candidate.type === 'prime-ttml-response') {
    return (
      candidate.direction === 'main-to-isolated' &&
      candidate.siteId === 'primevideo' &&
      typeof candidate.responseId === 'string' &&
      candidate.responseId.length > 0 &&
      candidate.responseId.length <= 128 &&
      typeof candidate.url === 'string' &&
      isPrimeTtmlUrl(candidate.url) &&
      typeof candidate.raw === 'string' &&
      candidate.raw.length > 0 &&
      candidate.raw.length <= 2_000_000
    );
  }
  if (candidate.type === 'youtube-captions') {
    return (
      candidate.direction === 'main-to-isolated' &&
      candidate.siteId === 'youtube' &&
      isYoutubeVideoId(candidate.videoId) &&
      typeof candidate.captions === 'object' &&
      candidate.captions !== null
    );
  }
  if (candidate.type === 'youtube-timedtext-request') {
    return (
      candidate.direction === 'main-to-isolated' &&
      candidate.siteId === 'youtube' &&
      isYoutubeVideoId(candidate.videoId) &&
      isYoutubeTimedTextRequestData(candidate.request, candidate.videoId)
    );
  }
  if (
    typeof candidate.requestId !== 'string' ||
    candidate.requestId.length === 0 ||
    candidate.requestId.length > 128
  ) {
    return false;
  }
  if (candidate.direction === 'isolated-to-main') {
    if (candidate.type === 'youtube-player-command') {
      return (
        candidate.siteId === 'youtube' &&
        isYoutubeVideoId(candidate.videoId) &&
        isYoutubePlayerOperation(candidate.operation) &&
        (candidate.operation === 'set-caption-track'
          ? isJsonRecord(candidate.value)
          : candidate.value === undefined)
      );
    }
    return (
      candidate.type === 'request-fake-data' &&
      typeof candidate.anchorTimeMs === 'number' &&
      Number.isFinite(candidate.anchorTimeMs)
    );
  }
  if (candidate.direction !== 'main-to-isolated') return false;
  if (candidate.type === 'youtube-player-command-result') {
    return (
      candidate.siteId === 'youtube' &&
      isYoutubeVideoId(candidate.videoId) &&
      isYoutubePlayerOperation(candidate.operation) &&
      typeof candidate.ok === 'boolean' &&
      (candidate.value === undefined || isMessageJsonValue(candidate.value)) &&
      (candidate.error === undefined ||
        (typeof candidate.error === 'string' && candidate.error.length <= 256))
    );
  }
  if (candidate.type === 'tracks') {
    return Array.isArray(candidate.tracks) && candidate.tracks.every(isTrackInfo);
  }
  return (
    candidate.type === 'cues' &&
    (candidate.role === 'english' || candidate.role === 'chinese') &&
    typeof candidate.trackId === 'string' &&
    Array.isArray(candidate.cues) &&
    candidate.cues.every(isCue) &&
    (candidate.translation === 'official' ||
      candidate.translation === 'mt-fallback')
  );
}

export function isPrimeTtmlUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.hostname === 'cf-timedtext.aux.pv-cdn.net' &&
      url.pathname.endsWith('.ttml2')
    );
  } catch {
    return false;
  }
}

export function isYoutubeTimedTextUrl(
  value: string,
  videoId: string,
  requirePot = false,
): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.hostname === 'www.youtube.com' &&
      url.pathname === '/api/timedtext' &&
      url.searchParams.get('v') === videoId &&
      (!requirePot || (url.searchParams.get('pot') ?? '') !== '')
    );
  } catch {
    return false;
  }
}

export function postDuetSubMessage(message: DuetSubMessage): void {
  window.postMessage(message, window.location.origin);
}

function isSiteId(value: unknown): value is SiteId {
  return (
    value === 'netflix' ||
    value === 'primevideo' ||
    value === 'max' ||
    value === 'youtube'
  );
}

function isTrackInfo(value: unknown): value is TrackInfo {
  if (typeof value !== 'object' || value === null) return false;
  const track = value as Partial<TrackInfo>;
  return (
    typeof track.id === 'string' &&
    typeof track.language === 'string' &&
    (track.source === 'official' ||
      track.source === 'asr' ||
      track.source === 'platform-mt') &&
    typeof track.label === 'string'
  );
}

function isCue(value: unknown): value is Cue {
  if (typeof value !== 'object' || value === null) return false;
  const cue = value as Partial<Cue>;
  return (
    typeof cue.start === 'number' &&
    Number.isFinite(cue.start) &&
    typeof cue.end === 'number' &&
    Number.isFinite(cue.end) &&
    typeof cue.text === 'string' &&
    typeof cue.language === 'string' &&
    (cue.position === undefined ||
      cue.position === 'top' ||
      cue.position === 'bottom')
  );
}

function isYoutubeVideoId(value: unknown): value is string {
  return typeof value === 'string' && /^[\w-]{6,32}$/.test(value);
}

function isYoutubeTimedTextRequestData(
  value: unknown,
  videoId: string,
): value is YoutubeTimedTextRequestData {
  if (typeof value !== 'object' || value === null) return false;
  const request = value as Partial<YoutubeTimedTextRequestData>;
  return (
    typeof request.url === 'string' &&
    isYoutubeTimedTextUrl(request.url, videoId, true) &&
    request.method === 'GET' &&
    Array.isArray(request.headers) &&
    request.headers.length <= 64 &&
    request.headers.every(isHeaderPair) &&
    (request.credentials === 'omit' ||
      request.credentials === 'same-origin' ||
      request.credentials === 'include') &&
    (request.cache === undefined || isRequestCache(request.cache)) &&
    (request.redirect === undefined || isRequestRedirect(request.redirect)) &&
    (request.referrer === undefined ||
      (typeof request.referrer === 'string' &&
        request.referrer.length <= 4_096)) &&
    (request.referrerPolicy === undefined ||
      isReferrerPolicy(request.referrerPolicy)) &&
    (request.mode === undefined || isRequestMode(request.mode)) &&
    (request.integrity === undefined ||
      (typeof request.integrity === 'string' &&
        request.integrity.length <= 2_048)) &&
    (request.keepalive === undefined ||
      typeof request.keepalive === 'boolean')
  );
}

function isHeaderPair(value: unknown): value is readonly [string, string] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    value[0].length <= 256 &&
    typeof value[1] === 'string' &&
    value[1].length <= 8_192
  );
}

function isRequestCache(value: unknown): value is RequestCache {
  return value === 'default' ||
    value === 'no-store' ||
    value === 'reload' ||
    value === 'no-cache' ||
    value === 'force-cache' ||
    value === 'only-if-cached';
}

function isRequestRedirect(value: unknown): value is RequestRedirect {
  return value === 'follow' || value === 'error' || value === 'manual';
}

function isRequestMode(value: unknown): value is RequestMode {
  return value === 'same-origin' || value === 'cors' || value === 'no-cors';
}

function isReferrerPolicy(value: unknown): value is ReferrerPolicy {
  return value === '' ||
    value === 'no-referrer' ||
    value === 'no-referrer-when-downgrade' ||
    value === 'origin' ||
    value === 'origin-when-cross-origin' ||
    value === 'same-origin' ||
    value === 'strict-origin' ||
    value === 'strict-origin-when-cross-origin' ||
    value === 'unsafe-url';
}

function isYoutubePlayerOperation(
  value: unknown,
): value is YoutubePlayerOperation {
  return value === 'read-player-captions' ||
    value === 'read-caption-state' ||
    value === 'load-captions' ||
    value === 'set-caption-track';
}

function isMessageJsonValue(value: unknown): value is MessageJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isMessageJsonValue);
  return isJsonRecord(value);
}

function isJsonRecord(
  value: unknown,
): value is { readonly [key: string]: MessageJsonValue } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every(isMessageJsonValue);
}
