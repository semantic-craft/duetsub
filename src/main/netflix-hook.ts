import {
  isNetflixWatchUrl,
  readNetflixWatchIdentity,
} from '../adapters/netflix-location';
import {
  isDuetSubMessage,
  isNetflixManifestCandidate,
  NETFLIX_TRACK_REQUEST_ATTRIBUTE,
  netflixManifestMessage,
  netflixTrackRequestReady,
  netflixTtmlResponseMessage,
  postDuetSubMessage,
  type NetflixTrackRequestMessage,
} from '../core/messages';

const xhrUrls = new WeakMap<XMLHttpRequest, string>();
let activeTrackRequest: NetflixTrackRequestMessage | undefined;

export function startNetflixMainHook(): void {
  patchJsonParse();
  patchFetchAndXmlHttpRequest();
  window.addEventListener('message', onTrackRequest);
}

function patchJsonParse(): void {
  const originalParse = JSON.parse;

  JSON.parse = function duetSubNetflixJsonParse(
    this: typeof JSON,
    text: string,
    reviver?: (this: unknown, key: string, value: unknown) => unknown,
  ): unknown {
    const parsed = originalParse.call(this, text, reviver);
    if (!isNetflixWatchUrl(window.location.href)) return parsed;

    try {
      const candidate = manifestCandidate(parsed);
      if (candidate !== undefined) {
        postDuetSubMessage(netflixManifestMessage(candidate));
      }
    } catch {
      // Observation must not change JSON.parse behavior.
    }
    return parsed;
  } as typeof JSON.parse;
}

function patchFetchAndXmlHttpRequest(): void {
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  window.fetch = function duetSubNetflixFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const observation = currentObservation(requestUrl(input));
    const response = originalFetch.call(this, input, init);
    if (observation !== undefined) {
      void response.then(
        (value) => observeFetchResponse(value, observation),
        () => undefined,
      );
    }
    return response;
  };

  XMLHttpRequest.prototype.open = function duetSubNetflixOpen(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    const resolved = resolveUrl(String(url));
    if (resolved === undefined) xhrUrls.delete(this);
    else xhrUrls.set(this, resolved);
    originalOpen.call(this, method, url, async ?? true, username, password);
  };

  XMLHttpRequest.prototype.send = function duetSubNetflixSend(
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const observation = currentObservation(xhrUrls.get(this));
    if (observation !== undefined) {
      this.addEventListener(
        'load',
        () => {
          void observeXhrResponse(this, observation);
        },
        { once: true },
      );
    }
    originalSend.call(this, body);
  };
}

interface NetflixRequestObservation {
  readonly url: string;
  readonly request: NetflixTrackRequestMessage;
}

function onTrackRequest(event: MessageEvent<unknown>): void {
  if (event.source !== window || !isDuetSubMessage(event.data)) return;
  const message = event.data;
  if (
    message.direction !== 'isolated-to-main' ||
    message.type !== 'netflix-track-request'
  ) {
    return;
  }

  const ok =
    readNetflixWatchIdentity(window.location.href) === message.contentIdentity;
  if (ok) activeTrackRequest = message;
  postDuetSubMessage(netflixTrackRequestReady(message, ok));
}

function currentObservation(
  url: string | undefined,
): NetflixRequestObservation | undefined {
  const request = activeTrackRequest;
  return (
      request !== undefined &&
      url !== undefined &&
      document.documentElement?.getAttribute(
        NETFLIX_TRACK_REQUEST_ATTRIBUTE,
      ) === request.requestId &&
      readNetflixWatchIdentity(window.location.href) === request.contentIdentity
    )
    ? { url, request }
    : undefined;
}

function manifestCandidate(value: unknown): unknown | undefined {
  if (isNetflixManifestCandidate(value)) return value;
  if (typeof value !== 'object' || value === null) return undefined;

  const result = (value as Record<string, unknown>).result;
  return isNetflixManifestCandidate(result) ? result : undefined;
}

async function observeFetchResponse(
  response: Response,
  observation: NetflixRequestObservation,
): Promise<void> {
  try {
    if (
      !response.ok ||
      !isXmlMimeType(response.headers.get('content-type'))
    ) {
      return;
    }
    forwardXmlCandidate(await response.clone().text(), observation);
  } catch {
    // Reading a clone must never affect the page's original response.
  }
}

async function observeXhrResponse(
  xhr: XMLHttpRequest,
  observation: NetflixRequestObservation,
): Promise<void> {
  try {
    if (
      xhr.status < 200 ||
      xhr.status >= 300 ||
      !isXmlMimeType(xhr.getResponseHeader('content-type'))
    ) {
      return;
    }

    const raw = await readXhrBody(xhr);
    if (raw !== undefined) forwardXmlCandidate(raw, observation);
  } catch {
    // Observing must never affect the page's original response.
  }
}

function readXhrBody(xhr: XMLHttpRequest): string | Promise<string> | undefined {
  if (typeof xhr.response === 'string') return xhr.response;
  if (xhr.response instanceof ArrayBuffer) {
    return new TextDecoder().decode(xhr.response);
  }
  if (xhr.response instanceof Blob) return xhr.response.text();
  return undefined;
}

function forwardXmlCandidate(
  raw: string,
  observation: NetflixRequestObservation,
): void {
  if (raw.length === 0 || raw.length > 2_000_000 || !hasXmlMagic(raw)) return;
  postDuetSubMessage(
    netflixTtmlResponseMessage(
      crypto.randomUUID(),
      observation.url,
      raw,
      observation.request,
    ),
  );
  if (activeTrackRequest?.requestId === observation.request.requestId) {
    activeTrackRequest = undefined;
  }
}

function isXmlMimeType(value: string | null): boolean {
  return value !== null && /(?:^|[/+])xml(?:\s*;|$)/i.test(value);
}

function hasXmlMagic(raw: string): boolean {
  const start = raw.replace(/^\uFEFF/, '').trimStart();
  return start.startsWith('<?xml') || start.startsWith('<tt');
}

function requestUrl(input: RequestInfo | URL): string | undefined {
  if (input instanceof Request) return input.url;
  return resolveUrl(String(input));
}

function resolveUrl(value: string): string | undefined {
  try {
    return new URL(value, window.location.href).href;
  } catch {
    return undefined;
  }
}
