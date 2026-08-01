import { readDisneyContentIdentity } from '../adapters/disney-location';
import {
  disneyManifestMessage,
  disneyTimelineMessage,
  isDisneyManifestUrl,
  postDuetSubMessage,
} from '../core/messages';

const MAX_MANIFEST_LENGTH = 2_000_000;
const TIMELINE_POLL_MS = 250;
const xhrUrls = new WeakMap<XMLHttpRequest, string>();
let timelineTimer: number | undefined;

export function startDisneyMainHook(): void {
  patchFetch();
  patchXmlHttpRequest();
  startTimelineObservation();
}

export function readDisneyTimelinePositionMs(
  root: { querySelector(selector: string): unknown } = document,
): number | undefined {
  const player = root.querySelector('disney-web-player') as
    | {
        mediaPlayer?: {
          timeline?: { info?: { playheadPositionMs?: unknown } };
        };
      }
    | null;
  const value = player?.mediaPlayer?.timeline?.info?.playheadPositionMs;
  return typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 86_400_000
    ? value
    : undefined;
}

function startTimelineObservation(): void {
  if (timelineTimer !== undefined || typeof window.setInterval !== 'function') {
    return;
  }
  const forward = () => {
    const contentIdentity = readDisneyContentIdentity(window.location.href);
    const timeMs = readDisneyTimelinePositionMs();
    if (contentIdentity === undefined || timeMs === undefined) return;
    postDuetSubMessage(disneyTimelineMessage(timeMs, contentIdentity));
  };
  forward();
  timelineTimer = window.setInterval(forward, TIMELINE_POLL_MS);
  if (typeof window.addEventListener === 'function') {
    window.addEventListener(
      'pagehide',
      () => {
        if (timelineTimer !== undefined) window.clearInterval(timelineTimer);
        timelineTimer = undefined;
      },
      { once: true },
    );
  }
}

function patchFetch(): void {
  const originalFetch = window.fetch;
  window.fetch = function duetSubDisneyFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const result = originalFetch.call(this, input, init);
    const requestedUrl = requestUrl(input);
    void result.then(
      (response) => {
        const url = requestedUrl !== undefined && isDisneyManifestUrl(requestedUrl)
          ? requestedUrl
          : response.url;
        if (isDisneyManifestUrl(url)) void observeFetchResponse(response, url);
      },
      () => undefined,
    );
    return result;
  };
}

function patchXmlHttpRequest(): void {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function duetSubDisneyOpen(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    const resolved = resolveUrl(String(url));
    if (resolved !== undefined && isDisneyManifestUrl(resolved)) {
      xhrUrls.set(this, resolved);
    } else {
      xhrUrls.delete(this);
    }
    originalOpen.call(this, method, url, async ?? true, username, password);
  };

  XMLHttpRequest.prototype.send = function duetSubDisneySend(
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const url = xhrUrls.get(this);
    if (url !== undefined) {
      this.addEventListener('load', () => observeXhrResponse(this, url), {
        once: true,
      });
    }
    originalSend.call(this, body);
  };
}

async function observeFetchResponse(
  response: Response,
  requestedUrl: string,
): Promise<void> {
  try {
    if (!response.ok) return;
    const responseUrl = isDisneyManifestUrl(response.url)
      ? response.url
      : requestedUrl;
    forwardMasterManifest(responseUrl, await response.clone().text());
  } catch {
    // Observation must never affect the page's original response.
  }
}

function observeXhrResponse(xhr: XMLHttpRequest, requestedUrl: string): void {
  try {
    if (xhr.status < 200 || xhr.status >= 300) return;
    const responseUrl = isDisneyManifestUrl(xhr.responseURL)
      ? xhr.responseURL
      : requestedUrl;
    if (typeof xhr.responseText === 'string') {
      forwardMasterManifest(responseUrl, xhr.responseText);
    }
  } catch {
    // Observation must never affect the page's original response.
  }
}

function forwardMasterManifest(url: string, raw: string): void {
  if (
    raw.length === 0 ||
    raw.length > MAX_MANIFEST_LENGTH ||
    !raw.replace(/^\uFEFF/, '').startsWith('#EXTM3U') ||
    !raw.includes('#EXT-X-MEDIA:TYPE=SUBTITLES')
  ) {
    return;
  }
  const contentIdentity = readDisneyContentIdentity(window.location.href);
  if (contentIdentity === undefined) return;
  postDuetSubMessage(
    disneyManifestMessage(
      crypto.randomUUID(),
      url,
      raw,
      contentIdentity,
    ),
  );
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
