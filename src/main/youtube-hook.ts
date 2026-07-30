import {
  isDuetSubMessage,
  isYoutubeTimedTextUrl,
  postDuetSubMessage,
  youtubeCaptionsMessage,
  youtubePlayerCommandResult,
  youtubeTimedTextRequestMessage,
  type MessageJsonValue,
  type YoutubePlayerCommandMessage,
  type YoutubeTimedTextRequestData,
} from '../core/messages';
import { youtubeVideoIdFromUrl } from '../adapters/youtube-url';
import type { PlaybackGeneration } from '../core/lifecycle';

const PLAYER_SELECTOR = '#movie_player';
const CAPTIONS_RETRY_COUNT = 20;
const CAPTIONS_RETRY_MS = 100;

interface YoutubePlayerElement extends HTMLElement {
  getPlayerResponse?: () => unknown;
  getOption?: (module: string, option: string) => unknown;
  loadModule?: (module: string) => unknown;
  setOption?: (
    module: string,
    option: string,
    value: MessageJsonValue,
  ) => unknown;
}

interface XhrRequestData {
  readonly method: string;
  readonly url: string;
  readonly headers: Array<readonly [string, string]>;
}

interface CaptionMutationContext {
  readonly videoId: string;
  readonly generation: PlaybackGeneration;
}

const xhrRequests = new WeakMap<XMLHttpRequest, XhrRequestData>();
let captionsReadSequence = 0;
let captionMutationContext: CaptionMutationContext | undefined;

export function startYoutubeMainHook(): void {
  patchFetch();
  patchXmlHttpRequest();
  window.addEventListener('message', onPlayerCommand);
  document.addEventListener('yt-navigate-start', clearCaptionMutationContext);
  document.addEventListener('yt-navigate-finish', scheduleCurrentCaptions);
  scheduleCurrentCaptions();
}

function patchFetch(): void {
  const originalFetch = window.fetch;

  window.fetch = function duetSubYoutubeFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const result = originalFetch.call(this, input, init);
    try {
      const videoId = currentWatchVideoId();
      const url = requestUrl(input);
      if (
        videoId !== undefined &&
        url !== undefined &&
        isYoutubeTimedTextUrl(url, videoId, true)
      ) {
        const request = new Request(input, init);
        if (request.method === 'GET') {
          forwardTimedTextRequest(videoId, {
            url: request.url,
            method: 'GET',
            headers: Array.from(request.headers.entries()),
            credentials: request.credentials,
            cache: request.cache,
            redirect: request.redirect,
            referrer: request.referrer,
            referrerPolicy: request.referrerPolicy,
            mode: request.mode,
            integrity: request.integrity,
            keepalive: request.keepalive,
          });
        }
      }
    } catch {
      // Observation must never affect the page request.
    }
    return result;
  };
}

function patchXmlHttpRequest(): void {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function duetSubYoutubeOpen(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    const resolved = resolveUrl(String(url));
    const videoId = currentWatchVideoId();
    if (
      resolved === undefined ||
      videoId === undefined ||
      method.toUpperCase() !== 'GET' ||
      !isYoutubeTimedTextUrl(resolved, videoId, true)
    ) {
      xhrRequests.delete(this);
    } else {
      xhrRequests.set(this, {
        method: method.toUpperCase(),
        url: resolved,
        headers: [],
      });
    }
    originalOpen.call(this, method, url, async ?? true, username, password);
  };

  XMLHttpRequest.prototype.setRequestHeader =
    function duetSubYoutubeSetRequestHeader(name: string, value: string): void {
      xhrRequests.get(this)?.headers.push([name, value]);
      originalSetRequestHeader.call(this, name, value);
    };

  XMLHttpRequest.prototype.send = function duetSubYoutubeSend(
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const request = xhrRequests.get(this);
    const videoId = currentWatchVideoId();
    if (
      request?.method === 'GET' &&
      videoId !== undefined &&
      isYoutubeTimedTextUrl(request.url, videoId, true)
    ) {
      forwardTimedTextRequest(videoId, {
        url: request.url,
        method: 'GET',
        headers: request.headers,
        credentials: this.withCredentials ? 'include' : 'same-origin',
      });
    }
    originalSend.call(this, body);
  };
}

function forwardTimedTextRequest(
  videoId: string,
  request: YoutubeTimedTextRequestData,
): void {
  const generation = captionMutationContext?.videoId === videoId
    ? captionMutationContext.generation
    : undefined;
  if (generation === undefined) return;
  postDuetSubMessage(
    youtubeTimedTextRequestMessage(videoId, request, generation),
  );
}

function scheduleCurrentCaptions(): void {
  const sequence = ++captionsReadSequence;
  const videoId = currentWatchVideoId();
  if (videoId === undefined) return;

  let attempts = 0;
  const tryRead = () => {
    if (
      sequence !== captionsReadSequence ||
      currentWatchVideoId() !== videoId
    ) {
      return;
    }
    if (forwardCurrentCaptions(videoId)) return;
    attempts += 1;
    if (attempts < CAPTIONS_RETRY_COUNT) {
      window.setTimeout(tryRead, CAPTIONS_RETRY_MS);
    }
  };
  tryRead();
}

function forwardCurrentCaptions(videoId: string): boolean {
  const current = readCurrentPlayer(videoId);
  if (current === undefined) return false;
  const captions = readRecord(current.response)?.captions;
  if (typeof captions !== 'object' || captions === null) return false;
  postDuetSubMessage(youtubeCaptionsMessage(videoId, captions));
  return true;
}

function onPlayerCommand(event: MessageEvent<unknown>): void {
  if (event.source !== window || !isDuetSubMessage(event.data)) return;
  const message = event.data;
  if (
    message.direction !== 'isolated-to-main' ||
    message.type !== 'youtube-player-command'
  ) {
    return;
  }
  void executePlayerCommand(message);
}

async function executePlayerCommand(
  message: YoutubePlayerCommandMessage,
): Promise<void> {
  const current = readCurrentPlayer(message.videoId);
  if (current === undefined) {
    postCommandFailure(message, 'player-unavailable');
    return;
  }

  try {
    switch (message.operation) {
      case 'read-player-captions': {
        const ok = forwardCurrentCaptions(message.videoId);
        postDuetSubMessage(
          youtubePlayerCommandResult(
            message.requestId,
            message.videoId,
            message.generation,
            message.operation,
            ok,
            undefined,
            ok ? undefined : 'captions-unavailable',
          ),
        );
        return;
      }
      case 'read-caption-state': {
        const value = readJsonValue(
          current.player.getOption?.('captions', 'track'),
        );
        if (value === undefined) {
          postCommandFailure(message, 'caption-state-unavailable');
          return;
        }
        postCommandSuccess(message, value);
        return;
      }
      case 'load-captions':
        if (typeof current.player.loadModule !== 'function') {
          postCommandFailure(message, 'caption-module-unavailable');
          return;
        }
        await current.player.loadModule('captions');
        postCommandSuccess(message);
        return;
      case 'set-caption-track': {
        if (
          typeof current.player.setOption !== 'function' ||
          message.value === undefined
        ) {
          postCommandFailure(message, 'caption-set-unavailable');
          return;
        }
        captionMutationContext = {
          videoId: message.videoId,
          generation: message.generation,
        };
        await current.player.setOption('captions', 'track', message.value);
        const value = readJsonValue(
          current.player.getOption?.('captions', 'track'),
        );
        if (value === undefined) {
          postCommandFailure(message, 'caption-state-unavailable');
          return;
        }
        postCommandSuccess(message, value);
      }
    }
  } catch {
    postCommandFailure(message, 'player-command-failed');
  }
}

function postCommandSuccess(
  message: YoutubePlayerCommandMessage,
  value?: MessageJsonValue,
): void {
  postDuetSubMessage(
    youtubePlayerCommandResult(
      message.requestId,
      message.videoId,
      message.generation,
      message.operation,
      true,
      value,
    ),
  );
}

function postCommandFailure(
  message: YoutubePlayerCommandMessage,
  error: string,
): void {
  postDuetSubMessage(
    youtubePlayerCommandResult(
      message.requestId,
      message.videoId,
      message.generation,
      message.operation,
      false,
      undefined,
      error,
    ),
  );
}

function clearCaptionMutationContext(): void {
  captionMutationContext = undefined;
}

function readCurrentPlayer(
  videoId: string,
): { readonly player: YoutubePlayerElement; readonly response: unknown } | undefined {
  if (currentWatchVideoId() !== videoId) return undefined;
  const player = document.querySelector<YoutubePlayerElement>(PLAYER_SELECTOR);
  if (player === null || typeof player.getPlayerResponse !== 'function') {
    return undefined;
  }
  const response = player.getPlayerResponse();
  const responseVideoId = readRecord(readRecord(response)?.videoDetails)
    ?.videoId;
  return responseVideoId === videoId ? { player, response } : undefined;
}

function currentWatchVideoId(): string | undefined {
  return youtubeVideoIdFromUrl(window.location.href);
}

function requestUrl(input: RequestInfo | URL): string | undefined {
  return input instanceof Request
    ? resolveUrl(input.url)
    : resolveUrl(String(input));
}

function resolveUrl(value: string): string | undefined {
  try {
    return new URL(value, window.location.href).href;
  } catch {
    return undefined;
  }
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function readJsonValue(value: unknown): MessageJsonValue | undefined {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    const result: MessageJsonValue[] = [];
    for (const entry of value) {
      const parsed = readJsonValue(entry);
      if (parsed === undefined) return undefined;
      result.push(parsed);
    }
    return result;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const result: Record<string, MessageJsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    const parsed = readJsonValue(entry);
    if (parsed === undefined) return undefined;
    result[key] = parsed;
  }
  return result;
}
