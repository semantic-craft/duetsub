import {
  isDuetSubMessage,
  isPrimeTtmlUrl,
  postDuetSubMessage,
  primeTimelineOffsetMessage,
  primeTtmlResponseMessage,
} from '../core/messages';

const xhrUrls = new WeakMap<XMLHttpRequest, string>();
const completeFragmentedTextPayloads = new Map<string, Promise<string>>();
let readPrimeTimelineOffsetMs: () => number | undefined = () => undefined;

export function startPrimeVideoMainHook(): void {
  readPrimeTimelineOffsetMs = observePrimePlaybackTimeline();
  window.addEventListener('message', respondWithPrimeTimelineOffset);
  const originalFetch = patchFetch();
  patchXmlHttpRequest(originalFetch);
}

function respondWithPrimeTimelineOffset(event: MessageEvent<unknown>): void {
  if (event.source !== window || !isDuetSubMessage(event.data)) return;
  const message = event.data;
  if (
    message.direction !== 'isolated-to-main' ||
    message.type !== 'request-prime-timeline-offset'
  ) {
    return;
  }
  void readStablePrimeTimelineOffsetMs().then((timelineOffsetMs) => {
    if (timelineOffsetMs === undefined) return;
    postDuetSubMessage(
      primeTimelineOffsetMessage(message.requestId, timelineOffsetMs),
    );
  });
}

async function readStablePrimeTimelineOffsetMs(): Promise<
  number | undefined
> {
  const deadline = performance.now() + 500;
  let timelineOffsetMs = readPrimeTimelineOffsetMs();
  while (
    (timelineOffsetMs === undefined || timelineOffsetMs === 0) &&
    performance.now() < deadline
  ) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    timelineOffsetMs = readPrimeTimelineOffsetMs();
  }
  return timelineOffsetMs;
}

function observePrimePlaybackTimeline(): () => number | undefined {
  if (
    typeof MediaSource === 'undefined' ||
    typeof SourceBuffer === 'undefined'
  ) {
    return () => undefined;
  }

  const originalAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
  const offsetDescriptor = Object.getOwnPropertyDescriptor(
    SourceBuffer.prototype,
    'timestampOffset',
  );
  if (
    offsetDescriptor?.get === undefined ||
    offsetDescriptor.set === undefined
  ) {
    return () => undefined;
  }

  const kindByBuffer = new WeakMap<SourceBuffer, 'audio' | 'video'>();
  let audioOffset: number | undefined;
  let videoOffset: number | undefined;
  let confirmedOffset: number | undefined;

  MediaSource.prototype.addSourceBuffer = function duetSubAddSourceBuffer(
    type: string,
  ): SourceBuffer {
    const sourceBuffer = originalAddSourceBuffer.call(this, type);
    const kind = type.startsWith('audio/')
      ? 'audio'
      : type.startsWith('video/')
        ? 'video'
        : undefined;
    if (kind !== undefined) kindByBuffer.set(sourceBuffer, kind);
    return sourceBuffer;
  };

  Object.defineProperty(SourceBuffer.prototype, 'timestampOffset', {
    configurable: offsetDescriptor.configurable,
    enumerable: offsetDescriptor.enumerable,
    get: offsetDescriptor.get,
    set(this: SourceBuffer, value: number) {
      offsetDescriptor.set?.call(this, value);
      if (!Number.isFinite(value)) return;
      const kind = kindByBuffer.get(this);
      if (kind === 'audio') audioOffset = value;
      if (kind === 'video') videoOffset = value;
      if (
        audioOffset !== undefined &&
        videoOffset !== undefined &&
        Math.abs(audioOffset - videoOffset) <= 0.001
      ) {
        confirmedOffset = (audioOffset + videoOffset) / 2;
      }
    },
  });

  return () =>
    confirmedOffset === undefined
      ? undefined
      : Math.round(confirmedOffset * 1_000);
}

function patchFetch(): typeof window.fetch {
  const originalFetch = window.fetch;

  window.fetch = function duetSubPrimeFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const result = originalFetch.call(this, input, init);
    const url = requestUrl(input);

    if (url !== undefined && isPrimeTtmlUrl(url)) {
      void result.then(
        (response) => {
          if (isFragmentedTextUrl(url)) {
            void observeFragmentedTextResponse(response, url, originalFetch);
          } else {
            void observeFetchResponse(response, url);
          }
        },
        () => undefined,
      );
    }

    return result;
  };
  return originalFetch;
}

function patchXmlHttpRequest(originalFetch: typeof window.fetch): void {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function duetSubPrimeOpen(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    const resolved = resolveUrl(String(url));
    if (resolved !== undefined && isPrimeTtmlUrl(resolved)) {
      xhrUrls.set(this, resolved);
    } else {
      xhrUrls.delete(this);
    }

    originalOpen.call(this, method, url, async ?? true, username, password);
  };

  XMLHttpRequest.prototype.send = function duetSubPrimeSend(
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const url = xhrUrls.get(this);
    if (url !== undefined) {
      this.addEventListener(
        'load',
        () => {
          if (isFragmentedTextUrl(url)) {
            void observeFragmentedTextXhr(this, url, originalFetch);
          } else {
            void observeXhrResponse(this, url);
          }
        },
        { once: true },
      );
    }

    originalSend.call(this, body);
  };
}

async function observeFragmentedTextResponse(
  response: Response,
  url: string,
  originalFetch: typeof window.fetch,
): Promise<void> {
  if (!response.ok) return;
  if (response.status === 200) {
    await observeCompleteFragmentedText(url, () => response.clone().text());
    return;
  }
  await fetchCompleteFragmentedText(url, originalFetch);
}

async function observeFragmentedTextXhr(
  xhr: XMLHttpRequest,
  url: string,
  originalFetch: typeof window.fetch,
): Promise<void> {
  if (xhr.status < 200 || xhr.status >= 300) return;
  if (xhr.status === 200) {
    await observeCompleteFragmentedText(url, async () => {
      const raw = await readXhrBody(xhr);
      if (raw === undefined) throw new Error('Prime text MP4 body unavailable');
      return raw;
    });
    return;
  }
  await fetchCompleteFragmentedText(url, originalFetch);
}

async function fetchCompleteFragmentedText(
  url: string,
  originalFetch: typeof window.fetch,
): Promise<void> {
  await observeCompleteFragmentedText(url, async () => {
    const response = await originalFetch.call(window, url);
    if (!response.ok) throw new Error('Prime text MP4 request failed');
    return response.text();
  });
}

async function observeCompleteFragmentedText(
  url: string,
  read: () => Promise<string>,
): Promise<void> {
  let payload = completeFragmentedTextPayloads.get(url);
  if (payload === undefined) {
    payload = read();
    completeFragmentedTextPayloads.set(url, payload);
  }
  try {
    forwardRawResponse(url, await payload);
  } catch {
    if (completeFragmentedTextPayloads.get(url) === payload) {
      completeFragmentedTextPayloads.delete(url);
    }
  }
}

async function observeFetchResponse(
  response: Response,
  url: string,
): Promise<void> {
  try {
    forwardRawResponse(url, await response.clone().text());
  } catch {
    // Observing must never affect the page's original response.
  }
}

async function observeXhrResponse(
  xhr: XMLHttpRequest,
  url: string,
): Promise<void> {
  try {
    const raw = await readXhrBody(xhr);
    if (raw !== undefined) forwardRawResponse(url, raw);
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

function forwardRawResponse(url: string, raw: string): void {
  if (raw.length === 0 || raw.length > 2_000_000) return;
  postDuetSubMessage(
    primeTtmlResponseMessage(crypto.randomUUID(), url, raw),
  );
}

function isFragmentedTextUrl(value: string): boolean {
  try {
    return /_text_\d+\.mp4$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
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
