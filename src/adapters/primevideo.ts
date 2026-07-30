import type { Cue, SiteAdapter, TrackInfo } from '../core/contracts';
import {
  samePlaybackGeneration,
  type PlaybackGeneration,
} from '../core/lifecycle';
import {
  PRIME_SUBTITLE_GROUP_SELECTOR,
  PRIME_SUBTITLE_MENU_BUTTON_SELECTOR,
  PRIME_VIDEO_SELECTOR,
} from '../core/primevideo-dom';
import {
  isDuetSubMessage,
  postDuetSubMessage,
  requestPrimeCachedTtml,
  requestPrimeTimelineOffset,
  type PrimeTtmlResponseMessage,
} from '../core/messages';
import {
  alignPrimeChineseCuesToEnglish,
  consumePrimeTtmlResponse,
  EMPTY_PRIME_TTML_INBOX,
  recordPrimeTtmlResponse,
  retainPrimeTtmlResponsesForGeneration,
  type PrimeTtmlResponseInbox,
} from './primevideo-responses';

const SUBTITLE_RADIO_SELECTOR = 'input[type="radio"][name="subtitle"]';
const OBSERVATION_REQUEST_ATTRIBUTE = 'data-duetsub-observation-request';
const OBSERVATION_GENERATION_ATTRIBUTE =
  'data-duetsub-observation-generation';
const DOM_TIMEOUT_MS = 8_000;
const RESPONSE_TIMEOUT_MS = 15_000;

interface TrackRequest {
  readonly track: TrackInfo;
  readonly generation: PlaybackGeneration;
  readonly resolve: (cues: Cue[]) => void;
  readonly reject: (error: Error) => void;
}

interface PendingResponse {
  readonly track: TrackInfo;
  readonly radio: HTMLInputElement;
  readonly generation: PlaybackGeneration;
  readonly observationRequestId: string;
  readonly resolve: (cues: Cue[]) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: number;
}

interface PendingTimelineOffset {
  readonly requestId: string;
  readonly generation: PlaybackGeneration;
}

export interface PrimeVideoSubtitleTrackMetadata {
  readonly id: string;
  readonly label: string;
}

export interface PrimeVideoTrackAcquisition {
  readonly tracks: readonly TrackInfo[];
  readonly isCurrent: () => boolean;
  readonly capture: (track: TrackInfo) => Promise<Cue[]>;
  readonly restore: () => Promise<boolean>;
}

export interface PrimeTimelineOffsetOwnership {
  readonly current: PlaybackGeneration;
  readonly pending: PendingTimelineOffset | undefined;
  readonly response: {
    readonly requestId: string;
    readonly timelineOffsetMs: number;
  };
}

export function createPrimeVideoAdapter(): SiteAdapter {
  return new PrimeVideoAdapter();
}

class PrimeVideoAdapter implements SiteAdapter {
  readonly id = 'primevideo' as const;

  readonly #trackCallbacks: Array<(tracks: TrackInfo[]) => void> = [];
  readonly #cueCallbacks: Array<(trackId: string, cues: Cue[]) => void> = [];
  readonly #resetCallbacks: Array<
    (reason: 'navigation' | 'episode' | 'seek-flush') => void
  > = [];
  readonly #requestQueue: TrackRequest[] = [];

  #enumerating = false;
  #enumerateAgain = false;
  #batchScheduled = false;
  #batchRunning = false;
  #pending: PendingResponse | undefined;
  #pendingTimelineOffset: PendingTimelineOffset | undefined;
  #timelineOffsetMs: number | undefined;
  #responseInbox: PrimeTtmlResponseInbox = EMPTY_PRIME_TTML_INBOX;
  #generation: PlaybackGeneration = {
    contentGeneration: 0,
    clockGeneration: 0,
    selectionGeneration: 0,
  };

  constructor() {
    window.addEventListener('message', this.#onMessage);
  }

  start(): void {
    if (this.#enumerating) {
      this.#enumerateAgain = true;
      return;
    }
    this.#enumerating = true;
    const generation = this.#generation;
    void this.#enumerateTracks().then(
      (tracks) => this.#emitTracks(tracks, generation),
      (error) => {
        console.warn('[DuetSub] Prime track enumeration failed', error);
        this.#emitTracks([], generation);
      },
    ).finally(() => {
      this.#enumerating = false;
      if (this.#enumerateAgain) {
        this.#enumerateAgain = false;
        this.start();
      }
    });
  }

  onTracks(cb: (tracks: TrackInfo[]) => void): void {
    this.#trackCallbacks.push(cb);
  }

  onCues(cb: (trackId: string, cues: Cue[]) => void): void {
    this.#cueCallbacks.push(cb);
  }

  fetchTrack(track: TrackInfo): Promise<Cue[]> {
    return new Promise((resolve, reject) => {
      this.#requestQueue.push({
        track,
        generation: this.#generation,
        resolve,
        reject,
      });
      if (this.#batchScheduled) return;
      this.#batchScheduled = true;
      queueMicrotask(() => {
        this.#batchScheduled = false;
        void this.#drainRequestQueue();
      });
    });
  }

  bindGeneration(generation: PlaybackGeneration): void {
    if (sameGeneration(this.#generation, generation)) return;
    this.#generation = generation;
    this.#responseInbox = retainPrimeTtmlResponsesForGeneration(
      this.#responseInbox,
      generation,
    );
    this.#pendingTimelineOffset = undefined;
    this.#timelineOffsetMs = undefined;
    this.#rejectPending(new Error('Prime TTML response became stale'));

    const stale = this.#requestQueue.splice(0);
    rejectRequests(stale, new Error('Prime track request became stale'));
  }

  onReset(
    cb: (reason: 'navigation' | 'episode' | 'seek-flush') => void,
  ): void {
    this.#resetCallbacks.push(cb);
  }

  async #enumerateTracks(): Promise<TrackInfo[]> {
    await waitForPrimePlayerReady();
    await waitForMenuButton();
    const menuWasOpen = isSubtitleMenuOpen();
    const group = await getSubtitleGroup();
    await waitForStableSubtitleSelection(group);
    const tracks = readOfficialTracks(group);
    if (tracks.length === 0) throw new Error('No Prime subtitle tracks');
    if (isSubtitleMenuOpen() !== menuWasOpen) {
      throw new Error('Prime subtitle menu changed during enumeration');
    }
    return tracks;
  }

  async #drainRequestQueue(): Promise<void> {
    if (this.#batchRunning) return;
    this.#batchRunning = true;

    while (this.#requestQueue.length > 0) {
      const requests = this.#requestQueue.splice(0);
      const current = requests.filter(({ generation }) =>
        sameGeneration(this.#generation, generation),
      );
      const stale = requests.filter(({ generation }) =>
        !sameGeneration(this.#generation, generation),
      );
      rejectRequests(stale, new Error('Prime track request became stale'));
      if (current.length === 0) continue;
      await this.#runAcquisitionBatch(current);
    }

    this.#batchRunning = false;
  }

  async #runAcquisitionBatch(requests: readonly TrackRequest[]): Promise<void> {
    const generation = requests[0]?.generation;
    if (
      generation === undefined ||
      !sameGeneration(this.#generation, generation)
    ) {
      rejectRequests(requests, new Error('Prime track request became stale'));
      return;
    }

    const button = await waitForMenuButton().catch(() => undefined);
    if (button === undefined) {
      rejectRequests(requests, new Error('Prime subtitle menu unavailable'));
      return;
    }

    const menuWasOpen = isSubtitleMenuOpen();
    let originalId = '';
    let captured: Map<string, Cue[]>;

    try {
      await waitForPrimePlayerReady();
      const group = await getSubtitleGroup();
      await waitForStableSubtitleSelection(group);
      const radios = readSubtitleRadios(group);
      const original = radios.find((radio) => radio.checked);
      if (original === undefined || original.id === '') {
        throw new Error('Prime original subtitle option is unknown');
      }
      originalId = original.id;

      const requestedTracks = uniqueRequestedTracks(requests);
      for (const track of requestedTracks) {
        const radio = radios.find((candidate) => candidate.id === track.id);
        const visibleTrack = radio === undefined ? undefined : trackFromRadio(radio);
        if (
          radio === undefined ||
          visibleTrack === undefined ||
          visibleTrack.language !== track.language ||
          visibleTrack.label !== track.label ||
          visibleTrack.kind !== track.kind
        ) {
          throw new Error(`Prime track DOM handle changed: ${track.id}`);
        }
      }

      const orderedTracks = requestedTracks.toSorted((left, right) =>
        left.id === originalId ? 1 : right.id === originalId ? -1 : 0,
      );
      captured = await acquirePrimeVideoTracks({
        tracks: orderedTracks,
        isCurrent: () => sameGeneration(this.#generation, generation),
        capture: (track) => this.#switchAndCapture(track, generation),
        restore: async () =>
          generation.contentGeneration !==
              this.#generation.contentGeneration ||
          restoreOriginalState(button, originalId, menuWasOpen),
      });
      captured = applyPrimeVideoPairAlignmentPolicy(
        requestedTracks,
        captured,
      );
    } catch (error) {
      rejectRequests(requests, asError(error));
      return;
    }

    for (const request of requests) {
      const cues = captured.get(request.track.id);
      if (cues === undefined) {
        request.reject(new Error(`Prime track was not captured: ${request.track.id}`));
        continue;
      }
      request.resolve(cues);
      for (const callback of this.#cueCallbacks) {
        callback(request.track.id, cues);
      }
    }
  }

  async #switchAndCapture(
    track: TrackInfo,
    generation: PlaybackGeneration,
  ): Promise<Cue[]> {
    const button = await waitForMenuButton();
    let group = await ensurePrimeSubtitleMenuOpen(button);
    let radio = findRadio(group, track.id);
    if (radio === undefined) throw new Error(`Prime track disappeared: ${track.id}`);

    if (radio.checked) {
      const off = findRadio(group, 'off');
      if (off === undefined) {
        throw new Error('Prime cannot re-request the currently selected track');
      }
      clickRadio(off);
      await waitUntil(() => off.checked, DOM_TIMEOUT_MS);
      group = await ensurePrimeSubtitleMenuOpen(button);
      radio = findRadio(group, track.id);
      if (radio === undefined) throw new Error(`Prime track disappeared: ${track.id}`);
    }

    const observationRequestId = crypto.randomUUID();
    const response = this.#armPending(
      track,
      radio,
      generation,
      observationRequestId,
    );
    try {
      clickRadioForObservation(
        radio,
        observationRequestId,
        generation,
      );
      await waitUntil(() => radio.checked, DOM_TIMEOUT_MS);
      return await response;
    } catch (error) {
      this.#rejectPending(asError(error));
      throw error;
    }
  }

  #armPending(
    track: TrackInfo,
    radio: HTMLInputElement,
    generation: PlaybackGeneration,
    observationRequestId: string,
  ): Promise<Cue[]> {
    if (this.#pending !== undefined) {
      throw new Error('Prime response ownership is ambiguous');
    }

    const response = new Promise<Cue[]>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        if (this.#pending?.radio !== radio) return;
        this.#pending = undefined;
        reject(new Error(`Prime TTML response timed out: ${track.id}`));
      }, RESPONSE_TIMEOUT_MS);
      this.#pending = {
        track,
        radio,
        generation,
        observationRequestId,
        resolve,
        reject,
        timeout,
      };
    });
    this.#requestTimelineOffset(generation);
    postDuetSubMessage(
      requestPrimeCachedTtml(
        observationRequestId,
        track.id,
        generation,
      ),
    );
    this.#resolvePendingFromInbox();
    return response;
  }

  #rejectPending(error: Error): void {
    const pending = this.#pending;
    if (pending === undefined) return;
    window.clearTimeout(pending.timeout);
    this.#pending = undefined;
    pending.reject(error);
  }

  readonly #onMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== window || !isDuetSubMessage(event.data)) return;
    const message = event.data;
    if (
      message.direction === 'main-to-isolated' &&
      message.type === 'prime-timeline-offset'
    ) {
      const timelineOffsetMs = acceptPrimeTimelineOffset({
        current: this.#generation,
        pending: this.#pendingTimelineOffset,
        response: message,
      });
      if (timelineOffsetMs === undefined) return;
      this.#timelineOffsetMs = timelineOffsetMs;
      this.#pendingTimelineOffset = undefined;
      this.#resolvePendingFromInbox();
      return;
    }
    if (
      message.direction !== 'main-to-isolated' ||
      message.type !== 'prime-ttml-response'
    ) {
      return;
    }

    const observation = acceptPrimeTtmlObservation({
      current: this.#generation,
      pending: this.#pending,
      response: message,
    });
    if (observation === undefined) return;

    this.#responseInbox = recordPrimeTtmlResponse(this.#responseInbox, {
      responseId: message.responseId,
      trackId: observation.trackId,
      raw: message.raw,
      generation: observation.generation,
    });
    this.#resolvePendingFromInbox();
  };

  #resolvePendingFromInbox(): void {
    const pending = this.#pending;
    if (
      pending === undefined ||
      !sameGeneration(this.#generation, pending.generation) ||
      this.#timelineOffsetMs === undefined
    ) {
      return;
    }

    const consumed = consumePrimeTtmlResponse(
      this.#responseInbox,
      pending.track,
      pending.generation,
      undefined,
      this.#timelineOffsetMs,
    );
    this.#responseInbox = consumed.inbox;
    if (consumed.cues === undefined) return;

    window.clearTimeout(pending.timeout);
    this.#pending = undefined;
    pending.resolve(consumed.cues);
  }

  #requestTimelineOffset(generation: PlaybackGeneration): void {
    const requestId = crypto.randomUUID();
    this.#pendingTimelineOffset = { requestId, generation };
    postDuetSubMessage(requestPrimeTimelineOffset(requestId));
  }

  #emitTracks(
    tracks: TrackInfo[],
    generation: PlaybackGeneration,
  ): void {
    if (!sameGeneration(this.#generation, generation)) return;
    for (const callback of this.#trackCallbacks) callback(tracks);
  }
}

export function parsePrimeVideoSubtitleTrack(
  metadata: PrimeVideoSubtitleTrackMetadata,
): TrackInfo | undefined {
  const id = metadata.id.trim();
  const label = metadata.label.trim();
  const match = id.match(
    /^([a-z]{2,3}(?:-[a-z0-9]{2,8})*)_([a-z][a-z0-9-]*)(?:_|$)/i,
  );
  if (id === '' || label === '' || match === null) return undefined;

  let language: string;
  try {
    language = Intl.getCanonicalLocales(match[1])[0];
  } catch {
    return undefined;
  }

  const variant = match[2].toLowerCase();
  const closedCaptions =
    variant === 'sdh' ||
    variant === 'cc' ||
    variant === 'caption' ||
    variant === 'closedcaption' ||
    variant === 'closedcaptions';
  const forcedOnly = variant === 'forced' || variant === 'forcednarrative';
  if (!closedCaptions && !forcedOnly && variant !== 'subtitle') {
    return undefined;
  }

  return {
    id,
    language,
    source: 'official',
    label,
    kind: closedCaptions ? 'closed-captions' : 'subtitles',
    ...(forcedOnly ? { forcedOnly: true } : {}),
  };
}

export async function acquirePrimeVideoTracks(
  input: PrimeVideoTrackAcquisition,
): Promise<Map<string, Cue[]>> {
  const captured = new Map<string, Cue[]>();
  let operationError: unknown;

  try {
    for (const track of input.tracks) {
      if (!input.isCurrent()) {
        throw new Error('Prime track request became stale');
      }
      captured.set(track.id, await input.capture(track));
      if (!input.isCurrent()) {
        throw new Error('Prime track request became stale');
      }
    }
  } catch (error) {
    operationError = error;
  }

  let restored = false;
  try {
    restored = await input.restore();
  } catch {
    // Restoration failure takes precedence over the triggering operation.
  }
  if (!restored) {
    operationError = new Error('Could not restore Prime subtitle state');
  }
  if (!input.isCurrent()) {
    operationError = new Error('Prime track request became stale');
  }
  if (operationError !== undefined) throw asError(operationError);

  return captured;
}

export function applyPrimeVideoPairAlignmentPolicy(
  pair: readonly TrackInfo[],
  captured: ReadonlyMap<string, Cue[]>,
): Map<string, Cue[]> {
  const result = new Map(captured);
  const [top, bottom] = pair;
  if (
    pair.length !== 2 ||
    top === undefined ||
    bottom === undefined ||
    !isEnglishCcTrack(top) ||
    !isTraditionalChineseTrack(bottom) ||
    bottom.kind !== 'subtitles'
  ) {
    return result;
  }
  const topCues = result.get(top.id);
  const bottomCues = result.get(bottom.id);
  if (topCues !== undefined && bottomCues !== undefined) {
    result.set(
      bottom.id,
      alignPrimeChineseCuesToEnglish(topCues, bottomCues),
    );
  }
  return result;
}

export function acceptPrimeTimelineOffset(
  ownership: PrimeTimelineOffsetOwnership,
): number | undefined {
  const pending = ownership.pending;
  return pending !== undefined &&
      ownership.response.requestId === pending.requestId &&
      sameGeneration(ownership.current, pending.generation)
    ? ownership.response.timelineOffsetMs
    : undefined;
}

export function acceptPrimeTtmlObservation(
  ownership: {
    readonly current: PlaybackGeneration;
    readonly pending:
      | {
          readonly observationRequestId: string;
          readonly track: TrackInfo;
          readonly generation: PlaybackGeneration;
        }
      | undefined;
    readonly response: PrimeTtmlResponseMessage;
  },
): {
  readonly trackId: string;
  readonly generation: PlaybackGeneration;
} | undefined {
  const pending = ownership.pending;
  const observation = ownership.response.observation;
  return pending !== undefined &&
      observation !== undefined &&
      observation.requestId === pending.observationRequestId &&
      observation.trackId === pending.track.id &&
      sameGeneration(observation.generation, pending.generation) &&
      sameGeneration(ownership.current, pending.generation)
    ? {
        trackId: pending.track.id,
        generation: pending.generation,
      }
    : undefined;
}

function readOfficialTracks(group: HTMLElement): TrackInfo[] {
  const tracks: TrackInfo[] = [];
  for (const radio of readSubtitleRadios(group)) {
    const track = trackFromRadio(radio);
    if (track !== undefined && !tracks.some(({ id }) => id === track.id)) {
      tracks.push(track);
    }
  }
  return tracks;
}

function readSubtitleRadios(group: HTMLElement): HTMLInputElement[] {
  return Array.from(
    group.querySelectorAll<HTMLInputElement>(SUBTITLE_RADIO_SELECTOR),
  );
}

function trackFromRadio(radio: HTMLInputElement): TrackInfo | undefined {
  return parsePrimeVideoSubtitleTrack({
    id: radio.id,
    label: radio.getAttribute('aria-label') ?? '',
  });
}

function uniqueRequestedTracks(requests: readonly TrackRequest[]): TrackInfo[] {
  const result: TrackInfo[] = [];
  for (const { track } of requests) {
    if (!result.some(({ id }) => id === track.id)) result.push(track);
  }
  return result;
}

function isEnglishCcTrack(track: TrackInfo): boolean {
  const language = track.language.toLowerCase();
  return (
    (language === 'en' || language.startsWith('en-')) &&
    track.kind === 'closed-captions'
  );
}

function isTraditionalChineseTrack(track: TrackInfo): boolean {
  const language = track.language.toLowerCase();
  return language === 'zh-hant' || language.startsWith('zh-hant-');
}

async function restoreOriginalState(
  button: HTMLButtonElement,
  originalId: string,
  menuWasOpen: boolean,
): Promise<boolean> {
  try {
    const group = await ensurePrimeSubtitleMenuOpen(button);
    const original = findRadio(group, originalId);
    if (original === undefined) return false;
    if (!original.checked) {
      clickRadio(original);
      await waitUntil(() => original.checked, DOM_TIMEOUT_MS);
    }
    return await restoreMenuState(button, menuWasOpen);
  } catch {
    return false;
  }
}

async function restoreMenuState(
  button: HTMLButtonElement,
  menuWasOpen: boolean,
): Promise<boolean> {
  try {
    if (menuWasOpen) {
      await ensurePrimeSubtitleMenuOpen(button);
    } else if (isSubtitleMenuOpen()) {
      button.click();
      await waitUntil(() => !isSubtitleMenuOpen(), DOM_TIMEOUT_MS);
    }
    return isSubtitleMenuOpen() === menuWasOpen;
  } catch {
    return false;
  }
}

export async function ensurePrimeSubtitleMenuOpen(
  button: HTMLButtonElement,
): Promise<HTMLElement> {
  const current = document.querySelector<HTMLElement>(
    PRIME_SUBTITLE_GROUP_SELECTOR,
  );
  if (current !== null && isVisible(current)) return current;
  button.click();
  await waitUntil(() => isSubtitleMenuOpen(), DOM_TIMEOUT_MS);
  const group = document.querySelector<HTMLElement>(
    PRIME_SUBTITLE_GROUP_SELECTOR,
  );
  if (group === null) throw new Error('Prime subtitle menu did not open');
  return group;
}

async function getSubtitleGroup(): Promise<HTMLElement> {
  await waitUntil(
    () => document.querySelector(PRIME_SUBTITLE_GROUP_SELECTOR) !== null,
    DOM_TIMEOUT_MS,
  );
  const group = document.querySelector<HTMLElement>(
    PRIME_SUBTITLE_GROUP_SELECTOR,
  );
  if (group === null) throw new Error('Prime subtitle menu DOM unavailable');
  return group;
}

function isSubtitleMenuOpen(): boolean {
  const group = document.querySelector<HTMLElement>(
    PRIME_SUBTITLE_GROUP_SELECTOR,
  );
  return group !== null && isVisible(group);
}

function isVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return (
    element.getClientRects().length > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden'
  );
}

async function waitForPrimePlayerReady(): Promise<void> {
  await waitUntil(() => {
    const video =
      document.querySelector<HTMLVideoElement>(PRIME_VIDEO_SELECTOR);
    return video !== null && isVisible(video) && video.readyState >= 2;
  }, DOM_TIMEOUT_MS);
}

async function waitForStableSubtitleSelection(
  group: HTMLElement,
): Promise<void> {
  const startedAt = performance.now();
  let stableId = '';
  let stableSince = startedAt;

  while (performance.now() - startedAt < DOM_TIMEOUT_MS) {
    const checked = readSubtitleRadios(group).find((radio) => radio.checked);
    const currentId = checked?.id ?? '';
    if (currentId !== '' && currentId === stableId) {
      const requiredStableMs = currentId === 'off' ? 3_000 : 1_000;
      if (performance.now() - stableSince >= requiredStableMs) return;
    } else {
      stableId = currentId;
      stableSince = performance.now();
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
  }

  throw new Error('Prime subtitle selection did not stabilize');
}

async function waitForMenuButton(): Promise<HTMLButtonElement> {
  await waitUntil(
    () =>
      document.querySelector(PRIME_SUBTITLE_MENU_BUTTON_SELECTOR) !== null,
    DOM_TIMEOUT_MS,
  );
  const button = document.querySelector<HTMLButtonElement>(
    PRIME_SUBTITLE_MENU_BUTTON_SELECTOR,
  );
  if (button === null) throw new Error('Prime subtitle menu button unavailable');
  return button;
}

function findRadio(
  group: HTMLElement,
  id: string,
): HTMLInputElement | undefined {
  return readSubtitleRadios(group).find((radio) => radio.id === id);
}

function clickRadio(radio: HTMLInputElement): void {
  radio.click();
}

function clickRadioForObservation(
  radio: HTMLInputElement,
  requestId: string,
  generation: PlaybackGeneration,
): void {
  radio.setAttribute(OBSERVATION_REQUEST_ATTRIBUTE, requestId);
  radio.setAttribute(
    OBSERVATION_GENERATION_ATTRIBUTE,
    [
      generation.contentGeneration,
      generation.clockGeneration,
      generation.selectionGeneration ?? 0,
    ].join(':'),
  );
  try {
    clickRadio(radio);
  } finally {
    radio.removeAttribute(OBSERVATION_REQUEST_ATTRIBUTE);
    radio.removeAttribute(OBSERVATION_GENERATION_ATTRIBUTE);
  }
}

function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const check = () => {
      if (predicate()) {
        resolve();
      } else if (performance.now() - startedAt >= timeoutMs) {
        reject(new Error('Prime DOM operation timed out'));
      } else {
        window.setTimeout(check, 50);
      }
    };
    check();
  });
}

function rejectRequests(
  requests: readonly TrackRequest[],
  error: Error,
): void {
  for (const request of requests) request.reject(error);
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function sameGeneration(
  left: PlaybackGeneration,
  right: PlaybackGeneration,
): boolean {
  return samePlaybackGeneration(left, right);
}
