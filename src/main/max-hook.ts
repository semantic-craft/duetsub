import {
  isMaxSubtitleObservationUrl,
  maxSubtitleResponseMessage,
  postDuetSubMessage,
  type MaxSubtitleResponseKind,
} from '../core/messages';
import { readMaxContentIdentity } from '../adapters/max-location';

interface MaxObservationTarget {
  readonly kind: MaxSubtitleResponseKind;
  readonly url: string;
  readonly contentIdentity: string;
}

const xhrTargets = new WeakMap<XMLHttpRequest, MaxObservationTarget>();

export function startMaxMainHook(): void {
  patchFetch();
  patchXmlHttpRequest();
}

function patchFetch(): void {
  const originalFetch = window.fetch;

  window.fetch = function duetSubMaxFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const result = originalFetch.call(this, input, init);
    const requestedUrl = requestUrl(input);
    const contentIdentity = readMaxContentIdentity(window.location.href);
    const requestedTarget =
      requestedUrl === undefined || contentIdentity === undefined
        ? undefined
        : observationTarget(requestedUrl, contentIdentity);

    void result.then(
      (response) => {
        const target =
          requestedTarget ??
          (
            contentIdentity === undefined
              ? undefined
              : observationTarget(response.url, contentIdentity)
          );
        if (target !== undefined) {
          void observeFetchResponse(response, target);
        }
      },
      () => undefined,
    );
    return result;
  };
}

function patchXmlHttpRequest(): void {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function duetSubMaxOpen(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    const resolved = resolveUrl(String(url));
    const contentIdentity = readMaxContentIdentity(window.location.href);
    const target =
      resolved === undefined || contentIdentity === undefined
        ? undefined
        : observationTarget(resolved, contentIdentity);
    if (target === undefined) xhrTargets.delete(this);
    else xhrTargets.set(this, target);
    originalOpen.call(this, method, url, async ?? true, username, password);
  };

  XMLHttpRequest.prototype.send = function duetSubMaxSend(
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const target = xhrTargets.get(this);
    if (target !== undefined) {
      this.addEventListener(
        'load',
        () => {
          void observeXhrResponse(this, target);
        },
        { once: true },
      );
    }
    originalSend.call(this, body);
  };
}

async function observeFetchResponse(
  response: Response,
  target: MaxObservationTarget,
): Promise<void> {
  try {
    if (!response.ok) return;
    forwardRawResponse(target, await response.clone().text());
  } catch {
    // Observing must never affect the page's original response.
  }
}

async function observeXhrResponse(
  xhr: XMLHttpRequest,
  target: MaxObservationTarget,
): Promise<void> {
  try {
    if (xhr.status < 200 || xhr.status >= 300) return;
    const raw = await readXhrBody(xhr);
    if (raw !== undefined) forwardRawResponse(target, raw);
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

function forwardRawResponse(
  target: MaxObservationTarget,
  raw: string,
): void {
  if (raw.length === 0 || raw.length > 5_000_000) return;
  postDuetSubMessage(
    maxSubtitleResponseMessage(
      crypto.randomUUID(),
      target.kind,
      target.url,
      raw,
      target.contentIdentity,
    ),
  );
}

function observationTarget(
  value: string,
  contentIdentity: string,
): MaxObservationTarget | undefined {
  for (
    const kind of ['playback-info', 'manifest', 'vtt'] as const
  ) {
    if (isMaxSubtitleObservationUrl(value, kind)) {
      return { kind, url: value, contentIdentity };
    }
  }
  return undefined;
}

function requestUrl(input: RequestInfo | URL): string | undefined {
  if (input instanceof Request) return resolveUrl(input.url);
  return resolveUrl(String(input));
}

function resolveUrl(value: string): string | undefined {
  try {
    return new URL(value, window.location.href).href;
  } catch {
    return undefined;
  }
}
