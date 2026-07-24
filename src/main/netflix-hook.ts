import { isNetflixWatchUrl } from '../adapters/netflix-location';
import {
  isNetflixManifestCandidate,
  netflixManifestMessage,
  netflixTtmlResponseMessage,
  postDuetSubMessage,
} from '../core/messages';

export function startNetflixMainHook(): void {
  if (!isNetflixWatchUrl(window.location.href)) return;
  patchJsonParse();
  patchFetchAndXmlHttpRequest();
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
        console.debug('[DuetSub] Netflix MAIN observed timed-text manifest');
      }
    } catch {
      // Observation must not change JSON.parse behavior.
    }
    return parsed;
  } as typeof JSON.parse;
}

function patchFetchAndXmlHttpRequest(): void {
  const originalFetch = window.fetch;
  const originalSend = XMLHttpRequest.prototype.send;

  window.fetch = function duetSubNetflixFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const response = originalFetch.call(this, input, init);
    if (isNetflixWatchUrl(window.location.href)) {
      void response.then(observeFetchResponse, () => undefined);
    }
    return response;
  };

  XMLHttpRequest.prototype.send = function duetSubNetflixSend(
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    if (isNetflixWatchUrl(window.location.href)) {
      this.addEventListener(
        'load',
        () => {
          void observeXhrResponse(this);
        },
        { once: true },
      );
    }
    originalSend.call(this, body);
  };
}

function manifestCandidate(value: unknown): unknown | undefined {
  if (isNetflixManifestCandidate(value)) return value;
  if (typeof value !== 'object' || value === null) return undefined;

  const result = (value as Record<string, unknown>).result;
  return isNetflixManifestCandidate(result) ? result : undefined;
}

async function observeFetchResponse(response: Response): Promise<void> {
  try {
    if (
      !isNetflixWatchUrl(window.location.href) ||
      !response.ok ||
      !isXmlMimeType(response.headers.get('content-type'))
    ) {
      return;
    }
    forwardXmlCandidate(await response.clone().text());
  } catch {
    // Reading a clone must never affect the page's original response.
  }
}

async function observeXhrResponse(xhr: XMLHttpRequest): Promise<void> {
  try {
    if (
      !isNetflixWatchUrl(window.location.href) ||
      xhr.status < 200 ||
      xhr.status >= 300 ||
      !isXmlMimeType(xhr.getResponseHeader('content-type'))
    ) {
      return;
    }

    const raw = await readXhrBody(xhr);
    if (raw !== undefined) forwardXmlCandidate(raw);
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

function forwardXmlCandidate(raw: string): void {
  if (raw.length === 0 || raw.length > 2_000_000 || !hasXmlMagic(raw)) return;
  postDuetSubMessage(
    netflixTtmlResponseMessage(crypto.randomUUID(), raw),
  );
  console.debug('[DuetSub] Netflix MAIN observed XML timed-text candidate');
}

function isXmlMimeType(value: string | null): boolean {
  return value !== null && /(?:^|[/+])xml(?:\s*;|$)/i.test(value);
}

function hasXmlMagic(raw: string): boolean {
  const start = raw.replace(/^\uFEFF/, '').trimStart();
  return start.startsWith('<?xml') || start.startsWith('<tt');
}
