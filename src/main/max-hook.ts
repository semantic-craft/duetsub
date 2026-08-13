import {
  isMaxSubtitleObservationUrl,
  maxSubtitleResponseMessage,
  postDuetSubMessage,
  type MaxSubtitleResponseMessage,
  type MaxSubtitleResponseKind,
} from '../core/messages';
import { readMaxContentIdentity } from '../adapters/max-location';

interface MaxObservationTarget {
  readonly kind: MaxSubtitleResponseKind;
  readonly url: string;
}

interface MaxObservation extends MaxObservationTarget {
  readonly requestStartedAtMs: number;
}

const xhrTargets = new WeakMap<XMLHttpRequest, MaxObservationTarget>();
const MAX_REPLAYABLE_METADATA = 4;

export function startMaxMainHook(): void {
  const replayableMetadata = new Map<string, MaxSubtitleResponseMessage>();
  const forward = (target: MaxObservation, raw: string) => {
    const message = observedResponseMessage(target, raw);
    if (message === undefined) return;
    if (message.kind !== 'vtt') {
      const key = `${message.contentIdentity}\u0000${message.kind}`;
      replayableMetadata.delete(key);
      replayableMetadata.set(key, message);
      while (replayableMetadata.size > MAX_REPLAYABLE_METADATA) {
        const oldestKey = replayableMetadata.keys().next().value;
        if (oldestKey === undefined) break;
        replayableMetadata.delete(oldestKey);
      }
    }
    postDuetSubMessage(message);
  };

  patchFetch(forward);
  patchXmlHttpRequest(forward);
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (
      event.source !== window ||
      !isMaxObserverReadyMessage(event.data)
    ) {
      return;
    }
    for (const message of replayableMetadata.values()) {
      if (message.contentIdentity === event.data.contentIdentity) {
        postDuetSubMessage(message);
      }
    }
  });
}

function isMaxObserverReadyMessage(
  value: unknown,
): value is {
  readonly contentIdentity: string;
} {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    message.channel === 'duetsub' &&
    message.version === 1 &&
    message.direction === 'isolated-to-main' &&
    message.type === 'max-observer-ready' &&
    message.siteId === 'max' &&
    typeof message.contentIdentity === 'string' &&
    /^\/video\/watch\/[A-Za-z0-9-]{1,128}$/.test(
      message.contentIdentity,
    )
  );
}

function patchFetch(
  forward: (target: MaxObservation, raw: string) => void,
): void {
  const originalFetch = window.fetch;

  window.fetch = function duetSubMaxFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const requestedUrl = requestUrl(input);
    const requestedTarget =
      requestedUrl === undefined
        ? undefined
        : observationTarget(requestedUrl);
    const requestStartedAtMs = performance.timeOrigin + performance.now();
    const result = originalFetch.call(this, input, init);

    void result.then(
      (response) => {
        const target =
          requestedTarget ??
          observationTarget(response.url);
        if (target !== undefined) {
          void observeFetchResponse(response, {
            ...target,
            requestStartedAtMs,
          }, forward);
        }
      },
      () => undefined,
    );
    return result;
  };
}

function patchXmlHttpRequest(
  forward: (target: MaxObservation, raw: string) => void,
): void {
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
    const target =
      resolved === undefined
        ? undefined
        : observationTarget(resolved);
    if (target === undefined) xhrTargets.delete(this);
    else xhrTargets.set(this, target);
    originalOpen.call(this, method, url, async ?? true, username, password);
  };

  XMLHttpRequest.prototype.send = function duetSubMaxSend(
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const target = xhrTargets.get(this);
    if (target !== undefined) {
      const observation: MaxObservation = {
        ...target,
        requestStartedAtMs: performance.timeOrigin + performance.now(),
      };
      this.addEventListener(
        'load',
        () => {
          void observeXhrResponse(this, observation, forward);
        },
        { once: true },
      );
    }
    originalSend.call(this, body);
  };
}

async function observeFetchResponse(
  response: Response,
  target: MaxObservation,
  forward: (target: MaxObservation, raw: string) => void,
): Promise<void> {
  try {
    if (!response.ok) return;
    forward(target, await response.clone().text());
  } catch {
    // Observing must never affect the page's original response.
  }
}

async function observeXhrResponse(
  xhr: XMLHttpRequest,
  target: MaxObservation,
  forward: (target: MaxObservation, raw: string) => void,
): Promise<void> {
  try {
    if (xhr.status < 200 || xhr.status >= 300) return;
    const raw = await readXhrBody(xhr);
    if (raw !== undefined) forward(target, raw);
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

function observedResponseMessage(
  target: MaxObservation,
  raw: string,
): MaxSubtitleResponseMessage | undefined {
  if (raw.length === 0 || raw.length > 5_000_000) return undefined;
  const contentIdentity = readMaxContentIdentity(window.location.href);
  if (contentIdentity === undefined) return undefined;
  return maxSubtitleResponseMessage(
    crypto.randomUUID(),
    target.kind,
    target.url,
    raw,
    contentIdentity,
    target.requestStartedAtMs,
  );
}

function observationTarget(
  value: string,
): MaxObservationTarget | undefined {
  for (
    const kind of ['playback-info', 'manifest', 'vtt'] as const
  ) {
    if (isMaxSubtitleObservationUrl(value, kind)) {
      return { kind, url: value };
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
