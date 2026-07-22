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

export type MainToIsolatedMessage =
  | TracksMessage
  | CuesMessage
  | PrimeTtmlResponseMessage;
export type IsolatedToMainMessage = RequestFakeDataMessage;
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
  if (typeof candidate.requestId !== 'string') return false;
  if (candidate.direction === 'isolated-to-main') {
    return (
      candidate.type === 'request-fake-data' &&
      typeof candidate.anchorTimeMs === 'number' &&
      Number.isFinite(candidate.anchorTimeMs)
    );
  }
  if (candidate.direction !== 'main-to-isolated') return false;
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
