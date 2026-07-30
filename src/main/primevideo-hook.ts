import {
  isDuetSubMessage,
  isPrimeTtmlUrl,
  postDuetSubMessage,
  primeTimelineOffsetMessage,
  primeTtmlResponseMessage,
  type PrimeTtmlObservationOwnership,
} from '../core/messages';

const xhrUrls = new WeakMap<XMLHttpRequest, string>();
const completeFragmentedTextPayloads = new Map<string, Promise<string>>();
const cachedPayloadsByMediaSource = new Map<
  string,
  Array<{ readonly url: string; readonly raw: string }>
>();
const PRIME_ZERO_OFFSET_STABILITY_MS = 2_000;
const MAX_CACHED_MEDIA_SOURCES = 4;
const MAX_CACHED_PAYLOADS_PER_SOURCE = 8;
const PRIME_SUBTITLE_RADIO_SELECTOR =
  'input[type="radio"][name="subtitle"]';
const OBSERVATION_REQUEST_ATTRIBUTE = 'data-duetsub-observation-request';
const OBSERVATION_GENERATION_ATTRIBUTE =
  'data-duetsub-observation-generation';
let readPrimeTimelineOffsetMs: () => number | undefined = () => undefined;
let activePrimeTtmlObservation: PrimeTtmlObservationOwnership | undefined;

export function startPrimeVideoMainHook(): void {
  activePrimeTtmlObservation = undefined;
  completeFragmentedTextPayloads.clear();
  cachedPayloadsByMediaSource.clear();
  readPrimeTimelineOffsetMs = observePrimePlaybackTimeline();
  window.addEventListener('message', respondToPrimeRequest);
  document.addEventListener('click', observePrimeSubtitleClick, true);
  const originalFetch = patchFetch();
  patchXmlHttpRequest(originalFetch);
}

function respondToPrimeRequest(event: MessageEvent<unknown>): void {
  if (event.source !== window || !isDuetSubMessage(event.data)) return;
  const message = event.data;
  if (
    message.direction === 'isolated-to-main' &&
    message.type === 'request-prime-cached-ttml'
  ) {
    replayCachedPrimeTtml({
      requestId: message.requestId,
      trackId: message.trackId,
      generation: message.generation,
    });
    return;
  }
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
  const deadline = performance.now() + PRIME_ZERO_OFFSET_STABILITY_MS;
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

  const offsetsByMediaSource = new WeakMap<
    MediaSource,
    {
      audio?: number;
      video?: number;
      confirmed?: number;
    }
  >();
  const mediaSourceByUrl = new Map<string, MediaSource>();
  const originalCreateObjectUrl = URL.createObjectURL;
  URL.createObjectURL = function duetSubCreateObjectUrl(
    object: Blob | MediaSource,
  ): string {
    const url = originalCreateObjectUrl.call(this, object);
    if (object instanceof MediaSource) {
      mediaSourceByUrl.set(url, object);
    }
    return url;
  };
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  URL.revokeObjectURL = function duetSubRevokeObjectUrl(url: string): void {
    mediaSourceByUrl.delete(url);
    originalRevokeObjectUrl.call(this, url);
  };

  const bindingByBuffer = new WeakMap<
    SourceBuffer,
    { readonly kind: 'audio' | 'video'; readonly source: MediaSource }
  >();

  MediaSource.prototype.addSourceBuffer = function duetSubAddSourceBuffer(
    type: string,
  ): SourceBuffer {
    const sourceBuffer = originalAddSourceBuffer.call(this, type);
    const kind = type.startsWith('audio/')
      ? 'audio'
      : type.startsWith('video/')
        ? 'video'
        : undefined;
    if (kind !== undefined) {
      bindingByBuffer.set(sourceBuffer, { kind, source: this });
    }
    return sourceBuffer;
  };

  Object.defineProperty(SourceBuffer.prototype, 'timestampOffset', {
    configurable: offsetDescriptor.configurable,
    enumerable: offsetDescriptor.enumerable,
    get: offsetDescriptor.get,
    set(this: SourceBuffer, value: number) {
      offsetDescriptor.set?.call(this, value);
      if (!Number.isFinite(value)) return;
      const binding = bindingByBuffer.get(this);
      if (binding === undefined) return;
      const offsets = offsetsByMediaSource.get(binding.source) ?? {};
      offsetsByMediaSource.set(binding.source, offsets);
      if (binding.kind === 'audio') offsets.audio = value;
      if (binding.kind === 'video') offsets.video = value;
      if (
        offsets.audio !== undefined &&
        offsets.video !== undefined &&
        Math.abs(offsets.audio - offsets.video) <= 0.001
      ) {
        offsets.confirmed = (offsets.audio + offsets.video) / 2;
      }
    },
  });

  return () => {
    const video = document.querySelector<HTMLVideoElement>(
      '#dv-web-player video',
    );
    const mediaSourceUrl = video?.currentSrc || video?.src;
    if (mediaSourceUrl === undefined || mediaSourceUrl === '') {
      return undefined;
    }
    const mediaSource = mediaSourceByUrl.get(mediaSourceUrl);
    const confirmedOffset =
      mediaSource === undefined
        ? undefined
        : offsetsByMediaSource.get(mediaSource)?.confirmed;
    return confirmedOffset === undefined
      ? undefined
      : Math.round(confirmedOffset * 1_000);
  };
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
      const observation = takePrimeTtmlObservation();
      void result.then(
        (response) => {
          if (isFragmentedTextUrl(url)) {
            void observeFragmentedTextResponse(
              response, url, originalFetch, observation,
            );
          } else {
            void observeFetchResponse(response, url, observation);
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
      const observation = takePrimeTtmlObservation();
      this.addEventListener(
        'load',
        () => {
          if (isFragmentedTextUrl(url)) {
            void observeFragmentedTextXhr(
              this, url, originalFetch, observation,
            );
          } else {
            void observeXhrResponse(this, url, observation);
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
  observation: PrimeTtmlObservationOwnership | undefined,
): Promise<void> {
  if (!response.ok) return;
  if (response.status === 200) {
    await observeCompleteFragmentedText(
      url, () => response.clone().text(), observation,
    );
    return;
  }
  await fetchCompleteFragmentedText(url, originalFetch, observation);
}

async function observeFragmentedTextXhr(
  xhr: XMLHttpRequest,
  url: string,
  originalFetch: typeof window.fetch,
  observation: PrimeTtmlObservationOwnership | undefined,
): Promise<void> {
  if (xhr.status < 200 || xhr.status >= 300) return;
  if (xhr.status === 200) {
    await observeCompleteFragmentedText(
      url,
      async () => {
        const raw = await readXhrBody(xhr);
        if (raw === undefined) throw new Error('Prime text MP4 body unavailable');
        return raw;
      },
      observation,
    );
    return;
  }
  await fetchCompleteFragmentedText(url, originalFetch, observation);
}

async function fetchCompleteFragmentedText(
  url: string,
  originalFetch: typeof window.fetch,
  observation: PrimeTtmlObservationOwnership | undefined,
): Promise<void> {
  await observeCompleteFragmentedText(
    url,
    async () => {
      const response = await originalFetch.call(window, url);
      if (!response.ok) throw new Error('Prime text MP4 request failed');
      return response.text();
    },
    observation,
  );
}

async function observeCompleteFragmentedText(
  url: string,
  read: () => Promise<string>,
  observation: PrimeTtmlObservationOwnership | undefined,
): Promise<void> {
  let payload = completeFragmentedTextPayloads.get(url);
  if (payload === undefined) {
    payload = read();
    completeFragmentedTextPayloads.set(url, payload);
  }
  try {
    forwardRawResponse(url, await payload, observation);
  } catch {
    if (completeFragmentedTextPayloads.get(url) === payload) {
      completeFragmentedTextPayloads.delete(url);
    }
  }
}

async function observeFetchResponse(
  response: Response,
  url: string,
  observation: PrimeTtmlObservationOwnership | undefined,
): Promise<void> {
  try {
    forwardRawResponse(url, await response.clone().text(), observation);
  } catch {
    // Observing must never affect the page's original response.
  }
}

async function observeXhrResponse(
  xhr: XMLHttpRequest,
  url: string,
  observation: PrimeTtmlObservationOwnership | undefined,
): Promise<void> {
  try {
    const raw = await readXhrBody(xhr);
    if (raw !== undefined) forwardRawResponse(url, raw, observation);
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
  url: string,
  raw: string,
  observation: PrimeTtmlObservationOwnership | undefined,
): void {
  if (raw.length === 0 || raw.length > 2_000_000) return;
  postDuetSubMessage(
    primeTtmlResponseMessage(crypto.randomUUID(), url, raw, observation),
  );
  cachePrimeTtmlPayload(url, raw);
}

function cachePrimeTtmlPayload(url: string, raw: string): void {
  const mediaSource = activePrimeMediaSource();
  if (mediaSource === undefined) return;
  const cached = cachedPayloadsByMediaSource.get(mediaSource) ?? [];
  cachedPayloadsByMediaSource.delete(mediaSource);
  cachedPayloadsByMediaSource.set(
    mediaSource,
    [
      ...cached.filter((candidate) => candidate.url !== url),
      { url, raw },
    ].slice(-MAX_CACHED_PAYLOADS_PER_SOURCE),
  );
  while (cachedPayloadsByMediaSource.size > MAX_CACHED_MEDIA_SOURCES) {
    const oldest = cachedPayloadsByMediaSource.keys().next().value;
    if (oldest === undefined) break;
    cachedPayloadsByMediaSource.delete(oldest);
  }
}

function replayCachedPrimeTtml(
  observation: PrimeTtmlObservationOwnership,
): void {
  const mediaSource = activePrimeMediaSource();
  if (mediaSource === undefined) return;
  const cached = cachedPayloadsByMediaSource.get(mediaSource) ?? [];
  for (const { url, raw } of cached.toReversed()) {
    postDuetSubMessage(
      primeTtmlResponseMessage(crypto.randomUUID(), url, raw, observation),
    );
  }
}

function activePrimeMediaSource(): string | undefined {
  const video = document.querySelector<HTMLVideoElement>(
    '#dv-web-player video',
  );
  const mediaSource = video?.currentSrc || video?.src;
  return mediaSource === undefined || mediaSource === ''
    ? undefined
    : mediaSource;
}

function takePrimeTtmlObservation(): PrimeTtmlObservationOwnership | undefined {
  const observation = activePrimeTtmlObservation;
  activePrimeTtmlObservation = undefined;
  return observation;
}

function observePrimeSubtitleClick(event: MouseEvent): void {
  const radio = event.target;
  if (
    !(radio instanceof HTMLInputElement) ||
    radio.id === '' ||
    !radio.matches(PRIME_SUBTITLE_RADIO_SELECTOR)
  ) {
    return;
  }
  const requestId = radio.getAttribute(OBSERVATION_REQUEST_ATTRIBUTE);
  const generation = parseObservationGeneration(
    radio.getAttribute(OBSERVATION_GENERATION_ATTRIBUTE),
  );
  if (requestId === null || requestId === '' || generation === undefined) return;
  const observation = {
    requestId,
    trackId: radio.id,
    generation,
  };
  activePrimeTtmlObservation = observation;
  setTimeout(() => {
    if (activePrimeTtmlObservation === observation) {
      activePrimeTtmlObservation = undefined;
    }
  }, 0);
}

function parseObservationGeneration(
  value: string | null,
): PrimeTtmlObservationOwnership['generation'] | undefined {
  const match = value?.match(/^(\d+):(\d+):(\d+)$/);
  if (match === undefined || match === null) return undefined;
  const generation = match.slice(1).map(Number);
  return generation.every((part) => Number.isSafeInteger(part))
    ? {
        contentGeneration: generation[0],
        clockGeneration: generation[1],
        selectionGeneration: generation[2],
      }
    : undefined;
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
