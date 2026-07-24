import type { YoutubeTrackHandle } from './youtube-tracks';
import type { PlaybackGeneration } from '../core/lifecycle';

export interface YoutubeRequestContext {
  readonly videoId: string;
  readonly generation: PlaybackGeneration;
}

export interface YoutubeTimedTextRequestSnapshot {
  readonly context: YoutubeRequestContext;
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

export interface YoutubeBoundTrackHandle {
  readonly context: YoutubeRequestContext;
  readonly handle: YoutubeTrackHandle;
}

export function cloneYoutubeTimedTextRequest(
  snapshot: YoutubeTimedTextRequestSnapshot,
  boundHandle: YoutubeBoundTrackHandle,
  context: YoutubeRequestContext,
): Request {
  const handle = boundHandle.handle;
  const videoId = context.videoId;
  if (
    !sameYoutubeRequestContext(snapshot.context, context) ||
    !sameYoutubeRequestContext(boundHandle.context, context) ||
    handle.videoId !== videoId ||
    snapshot.method !== 'GET'
  ) {
    throw new Error('YouTube timedtext context is stale');
  }

  const url = new URL(snapshot.url);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.youtube.com' ||
    url.pathname !== '/api/timedtext' ||
    url.searchParams.get('v') !== videoId ||
    url.searchParams.get('pot') === null ||
    url.searchParams.get('pot') === ''
  ) {
    throw new Error('YouTube POT request is invalid');
  }

  url.searchParams.set('lang', handle.languageCode);
  url.searchParams.set('fmt', 'json3');
  if (handle.kind === 'asr') url.searchParams.set('kind', 'asr');
  else url.searchParams.delete('kind');
  if (handle.trackName === '') url.searchParams.delete('name');
  else url.searchParams.set('name', handle.trackName);
  if (handle.tlang === undefined) url.searchParams.delete('tlang');
  else url.searchParams.set('tlang', handle.tlang);

  return new Request(url, {
    method: 'GET',
    headers: snapshot.headers.map(([name, value]) => [name, value]),
    credentials: snapshot.credentials,
    cache: snapshot.cache,
    redirect: snapshot.redirect,
    referrer: snapshot.referrer,
    referrerPolicy: snapshot.referrerPolicy,
    mode: snapshot.mode,
    integrity: snapshot.integrity,
    keepalive: snapshot.keepalive,
  });
}

export function sameYoutubeRequestContext(
  left: YoutubeRequestContext,
  right: YoutubeRequestContext,
): boolean {
  return left.videoId === right.videoId &&
    left.generation.contentGeneration === right.generation.contentGeneration &&
    left.generation.clockGeneration === right.generation.clockGeneration;
}
