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
const observedTimedText = new Map<string, string>();
const MAX_OBSERVED_TIMED_TEXT = 8;
let activeTrackRequest: NetflixTrackRequestMessage | undefined;
let activeManifestCandidate: unknown;

export function startNetflixMainHook(): void {
  activeTrackRequest = undefined;
  activeManifestCandidate = undefined;
  observedTimedText.clear();
  patchJsonParse();
  patchResponseJson();
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
    try {
      observeManifestCandidate(parsed);
    } catch {
      // Observation must not change JSON.parse behavior.
    }
    return parsed;
  } as typeof JSON.parse;
}

function patchResponseJson(): void {
  const originalJson = Response.prototype.json;
  Response.prototype.json = function duetSubNetflixResponseJson(): Promise<unknown> {
    return originalJson.call(this).then((parsed: unknown) => {
      try {
        observeManifestCandidate(parsed);
      } catch {
        // Observation must not change Response.json behavior.
      }
      return parsed;
    });
  };
}

function observeManifestCandidate(value: unknown): void {
  if (!isNetflixWatchUrl(window.location.href)) return;
  const candidate = manifestCandidate(value);
  if (candidate === undefined) return;
  activeManifestCandidate = candidate;
  postDuetSubMessage(netflixManifestMessage(candidate));
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
    const url = xhrUrls.get(this);
    const observation = currentObservation(url);
    this.addEventListener(
      'load',
      () => {
        void observeXhrResponse(this, url, observation);
      },
      { once: true },
    );
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
  if (ok) void replayCachedTimedText(message);
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

async function replayCachedTimedText(
  request: NetflixTrackRequestMessage,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (activeTrackRequest?.requestId !== request.requestId) return;
    if (
      document.documentElement?.getAttribute(
        NETFLIX_TRACK_REQUEST_ATTRIBUTE,
      ) === request.requestId
    ) {
      break;
    }
    await delay(25);
  }

  if (
    manifestContentIdentity(activeManifestCandidate) ===
    request.contentIdentity
  ) {
    for (const url of netflixTimedTextUrlsForTrack(
      activeManifestCandidate,
      request.trackId,
    )) {
      if (!ownsActiveRequest(request)) return;
      await window.fetch(url).catch(() => undefined);
    }
  }

  for (const [url, raw] of [...observedTimedText].reverse()) {
    if (!ownsActiveRequest(request)) return;
    forwardXmlCandidate(raw, { url, request });
  }

  const urls = cachedTimedTextUrls();
  for (const url of urls) {
    if (!ownsActiveRequest(request)) return;
    await window.fetch(url).catch(() => undefined);
  }
}

function ownsActiveRequest(request: NetflixTrackRequestMessage): boolean {
  return (
    activeTrackRequest?.requestId === request.requestId &&
    document.documentElement?.getAttribute(
        NETFLIX_TRACK_REQUEST_ATTRIBUTE,
      ) === request.requestId
  );
}

function cachedTimedTextUrls(): string[] {
  if (typeof performance === 'undefined') return [];

  const urls = performance
    .getEntriesByType('resource')
    .map(({ name }) => name)
    .filter(isNetflixCachedTimedTextUrl);
  return [...new Set(urls)].slice(-8).reverse();
}

export function isNetflixCachedTimedTextUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      isNetflixOcaUrl(url.href) &&
      url.pathname === '/' &&
      url.search.length > 1
    );
  } catch {
    return false;
  }
}

function manifestCandidate(value: unknown): unknown | undefined {
  const queue: Array<{ readonly value: unknown; readonly depth: number }> = [
    { value, depth: 0 },
  ];
  const visited = new Set<object>();
  let inspected = 0;

  while (queue.length > 0 && inspected < 500) {
    const current = queue.shift();
    if (current === undefined) break;
    if (isNetflixManifestCandidate(current.value)) return current.value;
    if (
      current.depth >= 6 ||
      typeof current.value !== 'object' ||
      current.value === null ||
      visited.has(current.value)
    ) {
      continue;
    }

    visited.add(current.value);
    inspected += 1;
    const nested = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value);
    for (const candidate of nested) {
      if (typeof candidate === 'object' && candidate !== null) {
        queue.push({ value: candidate, depth: current.depth + 1 });
      }
    }
  }
  return undefined;
}

function manifestContentIdentity(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const manifest = value as Record<string, unknown>;
  const identity = manifest.movieId ?? manifest.viewableId;
  if (typeof identity === 'string') return identity;
  return typeof identity === 'number' && Number.isFinite(identity)
    ? String(identity)
    : undefined;
}

export function netflixTimedTextUrlsForTrack(
  value: unknown,
  trackId: string,
): string[] {
  if (typeof value !== 'object' || value === null) return [];
  const manifest = value as Record<string, unknown>;
  if (!Array.isArray(manifest.timedtexttracks)) return [];

  const track = manifest.timedtexttracks.find((candidate) => {
    if (typeof candidate !== 'object' || candidate === null) return false;
    const record = candidate as Record<string, unknown>;
    const id = record.id ?? record.new_track_id;
    return String(id) === trackId;
  });
  if (typeof track !== 'object' || track === null) return [];

  const trackRecord = track as Record<string, unknown>;
  const downloadables =
    trackRecord.ttDownloadables ?? trackRecord.downloadables;
  if (typeof downloadables !== 'object' || downloadables === null) return [];

  const preferred = Object.entries(downloadables)
    .filter(([name, downloadable]) => {
      if (!/(?:dfxp|ttml)/i.test(name)) return false;
      return !isImageDownloadable(downloadable);
    })
    .map(([, downloadable]) => downloadable);
  const candidates =
    preferred.length > 0
      ? preferred
      : Object.values(downloadables).filter(
          (downloadable) => !isImageDownloadable(downloadable),
        );

  const result = new Set<string>();
  for (const downloadable of candidates) {
    collectNetflixTimedTextUrls(downloadable, result, 0);
  }
  return [...result];
}

function isImageDownloadable(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).isImage === true
  );
}

function collectNetflixTimedTextUrls(
  value: unknown,
  result: Set<string>,
  depth: number,
): void {
  if (depth > 5) return;
  if (typeof value === 'string') {
    if (isNetflixCachedTimedTextUrl(value)) result.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectNetflixTimedTextUrls(item, result, depth + 1);
    }
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const nested of Object.values(value)) {
    collectNetflixTimedTextUrls(nested, result, depth + 1);
  }
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
  url: string | undefined,
  observation: NetflixRequestObservation | undefined,
): Promise<void> {
  try {
    observeXhrManifestCandidate(xhr);
    const contentType = xhr.getResponseHeader('content-type');
    const binaryCandidate =
      url !== undefined &&
      isNetflixOcaUrl(url) &&
      isOctetStreamMimeType(contentType) &&
      xhr.response instanceof ArrayBuffer &&
      xhr.response.byteLength <= 2_000_000;
    if (
      xhr.status < 200 ||
      xhr.status >= 300 ||
      (!isXmlMimeType(contentType) && !binaryCandidate)
    ) {
      return;
    }

    const raw = await readXhrBody(xhr);
    if (raw === undefined || !hasXmlMagic(raw)) return;
    if (url !== undefined && isNetflixOcaUrl(url)) {
      rememberTimedText(url, raw);
    }
    if (observation !== undefined) forwardXmlCandidate(raw, observation);
  } catch {
    // Observing must never affect the page's original response.
  }
}

function observeXhrManifestCandidate(xhr: XMLHttpRequest): void {
  if (xhr.status < 200 || xhr.status >= 300) return;
  const contentType = xhr.getResponseHeader('content-type');
  if (xhr.responseType === 'json') {
    observeManifestCandidate(xhr.response);
    return;
  }
  if (
    isJsonMimeType(contentType) &&
    typeof xhr.response === 'string' &&
    xhr.response.length <= 10_000_000
  ) {
    observeManifestCandidate(JSON.parse(xhr.response));
  }
}

function readXhrBody(xhr: XMLHttpRequest): string | Promise<string> | undefined {
  if (typeof xhr.response === 'string') return xhr.response;
  if (xhr.response instanceof ArrayBuffer) {
    if (xhr.response.byteLength > 2_000_000) return undefined;
    const prefix = new TextDecoder().decode(xhr.response.slice(0, 512));
    if (!hasXmlMagic(prefix)) return undefined;
    return new TextDecoder().decode(xhr.response);
  }
  if (xhr.response instanceof Blob) return xhr.response.text();
  return undefined;
}

function rememberTimedText(url: string, raw: string): void {
  if (
    raw.length === 0 ||
    raw.length > 2_000_000 ||
    !hasXmlMagic(raw)
  ) {
    return;
  }
  observedTimedText.delete(url);
  observedTimedText.set(url, raw);
  while (observedTimedText.size > MAX_OBSERVED_TIMED_TEXT) {
    const oldest = observedTimedText.keys().next().value;
    if (oldest === undefined) return;
    observedTimedText.delete(oldest);
  }
}

function forwardXmlCandidate(
  raw: string,
  observation: NetflixRequestObservation,
): void {
  if (
    raw.length === 0 ||
    raw.length > 2_000_000 ||
    !hasXmlMagic(raw) ||
    !matchesNetflixTimedTextKind(raw, observation.request.trackKind)
  ) {
    return;
  }
  postDuetSubMessage(
    netflixTtmlResponseMessage(
      crypto.randomUUID(),
      observation.url,
      raw,
      observation.request,
    ),
  );
}

export function matchesNetflixTimedTextKind(
  raw: string,
  kind: NetflixTrackRequestMessage['trackKind'],
): boolean {
  const value = raw
    .slice(0, 8_192)
    .match(/\b(?:[\w.-]+:)?textType\s*=\s*["']([^"']+)["']/i)
    ?.[1]
    ?.trim()
    .toLowerCase();
  if (value === undefined) return true;
  const closedCaptions = value === 'cc' || value === 'sdh';
  return kind === 'closed-captions'
    ? closedCaptions
    : !closedCaptions;
}

function isXmlMimeType(value: string | null): boolean {
  return value !== null && /(?:^|[/+])xml(?:\s*;|$)/i.test(value);
}

function isJsonMimeType(value: string | null): boolean {
  return value !== null && /(?:^|[/+])json(?:\s*;|$)/i.test(value);
}

function isOctetStreamMimeType(value: string | null): boolean {
  return value !== null && /^application\/octet-stream(?:\s*;|$)/i.test(value);
}

function isNetflixOcaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.hostname.endsWith('.nflxvideo.net')
    );
  } catch {
    return false;
  }
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
