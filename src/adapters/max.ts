import type { Cue, SiteAdapter, TrackInfo } from '../core/contracts';
import type { PlaybackGeneration } from '../core/lifecycle';
import { isDuetSubMessage } from '../core/messages';
import { parseWebVtt } from '../core/webvtt';
import {
  EMPTY_MAX_RESPONSE_INBOX,
  recordMaxResponse,
  resolveMaxTrackResourceSelection,
  retainMaxResponsesForGeneration,
  type MaxResponseInbox,
} from './max-responses';
import {
  selectMaxSegmentsAfterFailure,
  selectMaxSegmentsAt,
  type MaxTrackResource,
  type MaxTrackSegment,
} from './max-track-mapping';
import { readMaxContentIdentity } from './max-location';

const VIDEO_SELECTOR = '[data-testid="VideoElement"]';
const PLAYER_SELECTOR = '[data-testid="playerContainer"]';
const MENU_BUTTON_SELECTOR =
  '[data-testid="playback_controls"] ' +
  '[data-testid="player-ux-track-selector-button"]';
const MENU_DISMISS_SELECTOR =
  '[data-testid="player-ux-track-dismiss-button"]';
const TRACK_BUTTON_SELECTOR =
  '[data-testid="player-ux-text-track-button"][role="radio"]';
const TRACK_CHECK_PREFIX = 'player-ux-text-track-check-';
const DOM_TIMEOUT_MS = 8_000;
const MAPPING_TIMEOUT_MS = 15_000;
const MAX_VTT_LENGTH = 2_000_000;

interface AdBreak {
  readonly startMs: number;
  readonly endMs: number;
}

export function createMaxAdapter(): SiteAdapter {
  return new MaxAdapter();
}

class MaxAdapter implements SiteAdapter {
  readonly id = 'max' as const;

  readonly #trackCallbacks: Array<(tracks: TrackInfo[]) => void> = [];
  readonly #cueCallbacks: Array<(trackId: string, cues: Cue[]) => void> = [];
  readonly #resetCallbacks: Array<
    (reason: 'navigation' | 'episode' | 'seek-flush') => void
  > = [];
  readonly #adCallbacks: Array<
    (active: boolean, programClockContinuous: boolean) => void
  > = [];
  readonly #mappingWaiters = new Set<() => void>();
  readonly #fetchControllers = new Set<AbortController>();

  #enumerating = false;
  #enumerateAgain = false;
  #generationBound = false;
  #generation: PlaybackGeneration = {
    contentGeneration: 0,
    clockGeneration: 0,
  };
  #inbox: MaxResponseInbox = EMPTY_MAX_RESPONSE_INBOX;
  #tracks: readonly TrackInfo[] = [];
  #activeManifestUrl: string | undefined;
  #adBreaks: readonly AdBreak[] = [];
  #adActive: boolean | undefined;
  #adExitPending = false;
  #lastClockMs: number | undefined;

  constructor() {
    window.addEventListener('message', this.#onMessage);
    window.setInterval(() => this.#updateAdState(), 250);
  }

  start(): void {
    if (this.#enumerating) {
      this.#enumerateAgain = true;
      return;
    }
    this.#enumerating = true;
    const generation = this.#generation;
    void enumerateMaxTracks().then(
      (tracks) => {
        if (!sameGeneration(this.#generation, generation)) return;
        this.#tracks = tracks;
        for (const callback of this.#trackCallbacks) callback(tracks);
        this.#wakeMappingWaiters();
      },
      (error) => {
        console.warn('[DuetSub] Max track enumeration failed', error);
        if (!sameGeneration(this.#generation, generation)) return;
        this.#tracks = [];
        for (const callback of this.#trackCallbacks) callback([]);
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

  async fetchTrack(track: TrackInfo): Promise<Cue[]> {
    const generation = this.#generation;
    const authoritative = this.#tracks.find(
      (candidate) =>
        candidate.id === track.id &&
        candidate.language === track.language &&
        candidate.label === track.label &&
        candidate.source === 'official',
    );
    if (authoritative === undefined) {
      throw new Error(`Max track is not in the authoritative DOM: ${track.id}`);
    }

    const resource = await this.#waitForTrackResource(track, generation);
    const controller = new AbortController();
    this.#fetchControllers.add(controller);
    try {
      const cues = await this.#fetchResource(
        resource,
        generation,
        controller.signal,
      );
      if (!sameGeneration(this.#generation, generation)) {
        throw new Error('Max track response became stale');
      }
      if (cues.length === 0) {
        throw new Error(`Max returned an empty official track: ${track.id}`);
      }
      for (const callback of this.#cueCallbacks) callback(track.id, cues);
      return cues;
    } finally {
      this.#fetchControllers.delete(controller);
    }
  }

  bindGeneration(generation: PlaybackGeneration): void {
    if (!this.#generationBound) {
      this.#generationBound = true;
      this.#generation = generation;
      this.#retainCurrentContentResponses(generation);
      this.#wakeMappingWaiters();
      return;
    }
    if (sameGeneration(this.#generation, generation)) return;

    const contentChanged =
      this.#generation.contentGeneration !== generation.contentGeneration;
    const previousManifestUrl = contentChanged
      ? this.#activeManifestUrl
      : undefined;
    this.#generation = generation;
    this.#retainCurrentContentResponses(generation, previousManifestUrl);
    this.#tracks = [];
    if (contentChanged) {
      this.#activeManifestUrl = undefined;
      this.#adBreaks = [];
      this.#adActive = undefined;
      this.#adExitPending = false;
      this.#lastClockMs = undefined;
    }
    for (const controller of this.#fetchControllers) controller.abort();
    this.#wakeMappingWaiters();
  }

  onAdState(
    cb: (active: boolean, programClockContinuous: boolean) => void,
  ): void {
    this.#adCallbacks.push(cb);
  }

  onReset(
    cb: (reason: 'navigation' | 'episode' | 'seek-flush') => void,
  ): void {
    this.#resetCallbacks.push(cb);
  }

  readonly #onMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== window || !isDuetSubMessage(event.data)) return;
    const message = event.data;
    if (
      message.direction !== 'main-to-isolated' ||
      message.type !== 'max-subtitle-response'
    ) {
      return;
    }
    const contentIdentity = readMaxContentIdentity(window.location.href);
    if (contentIdentity !== message.contentIdentity) return;

    this.#inbox = recordMaxResponse(this.#inbox, {
      responseId: message.responseId,
      kind: message.kind,
      contentIdentity: message.contentIdentity,
      url: message.url,
      raw: message.raw,
      generation: this.#generation,
    });
    if (message.kind === 'playback-info') {
      const breaks = readAdBreaks(message.raw);
      if (breaks !== undefined) this.#adBreaks = breaks;
    }
    this.#wakeMappingWaiters();
  };

  #retainCurrentContentResponses(
    generation: PlaybackGeneration,
    previousManifestUrl?: string,
  ): void {
    const contentIdentity = readMaxContentIdentity(window.location.href);
    this.#inbox = contentIdentity === undefined
      ? EMPTY_MAX_RESPONSE_INBOX
      : retainMaxResponsesForGeneration(
          this.#inbox,
          generation,
          contentIdentity,
          previousManifestUrl,
        );
  }

  async #waitForTrackResource(
    track: TrackInfo,
    generation: PlaybackGeneration,
  ): Promise<MaxTrackResource> {
    const startedAt = performance.now();

    while (performance.now() - startedAt < MAPPING_TIMEOUT_MS) {
      if (!sameGeneration(this.#generation, generation)) {
        throw new Error('Max track mapping became stale');
      }
      const resolution = resolveMaxTrackResourceSelection(
        this.#inbox,
        this.#tracks,
        generation,
      );
      const resource = resolution?.resources[track.id];
      if (resource !== undefined && resolution !== undefined) {
        this.#activeManifestUrl = resolution.manifestUrl;
        return resource;
      }
      await this.#waitForMappingChange();
    }

    throw new Error(
      `Max complete playbackInfo/manifest mapping unavailable: ${track.id}`,
    );
  }

  #waitForMappingChange(): Promise<void> {
    return new Promise((resolve) => {
      const wake = () => {
        window.clearTimeout(timeout);
        this.#mappingWaiters.delete(wake);
        resolve();
      };
      const timeout = window.setTimeout(wake, 250);
      this.#mappingWaiters.add(wake);
    });
  }

  #wakeMappingWaiters(): void {
    for (const wake of [...this.#mappingWaiters]) wake();
  }

  async #fetchResource(
    resource: MaxTrackResource,
    generation: PlaybackGeneration,
    signal: AbortSignal,
  ): Promise<Cue[]> {
    const video = currentMaxPlayer()?.video;
    if (video === undefined || !Number.isFinite(video.currentTime)) {
      throw new Error('Max video clock unavailable');
    }
    let pending = [...selectMaxSegmentsAt(
      resource.segments,
      video.currentTime * 1_000,
    )];
    if (pending.length === 0) {
      throw new Error('Max subtitle segment timeline unavailable');
    }

    const cues: Cue[] = [];
    while (pending.length > 0) {
      const segment = pending[0];
      if (!sameGeneration(this.#generation, generation)) {
        throw new Error('Max track response became stale');
      }
      let raw = this.#observedVtt(segment, generation);
      if (raw === undefined) {
        try {
          raw = await fetchVtt(segment.url, signal);
        } catch (error) {
          const recovery = error instanceof MaxVttRequestError &&
              error.status === 404
            ? selectMaxSegmentsAfterFailure(resource.segments, segment.url)
            : [];
          if (recovery.length === 0) throw error;
          await this.#waitForPresentationTime(
            video,
            recovery[0].presentationAnchor.presentationTimeMs,
            generation,
            signal,
          );
          pending = [...recovery];
          continue;
        }
      }
      const parsed = parseWebVtt(raw, {
        language: resource.track.language,
        presentationAnchor: segment.presentationAnchor,
      });
      if (parsed.length === 0 && raw.includes('-->')) {
        throw new Error(`Max VTT segment could not be normalized: ${segment.url}`);
      }
      cues.push(...parsed);
      pending.shift();
    }
    return normalizeCues(cues);
  }

  async #waitForPresentationTime(
    video: HTMLVideoElement,
    presentationTimeMs: number,
    generation: PlaybackGeneration,
    signal: AbortSignal,
  ): Promise<void> {
    while (video.currentTime * 1_000 < presentationTimeMs) {
      if (
        signal.aborted ||
        !sameGeneration(this.#generation, generation) ||
        !video.isConnected ||
        video.ended
      ) {
        throw new Error('Max VTT recovery became stale');
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
    }
  }

  #observedVtt(
    segment: MaxTrackSegment,
    generation: PlaybackGeneration,
  ): string | undefined {
    return this.#inbox
      .filter(
        (response) =>
          response.kind === 'vtt' &&
          sameGeneration(response.generation, generation) &&
          sameUrlWithoutQuery(response.url, segment.url),
      )
      .at(-1)
      ?.raw;
  }

  #updateAdState(): void {
    if (this.#adBreaks.length === 0) return;
    const video = document.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
    if (video === null || !Number.isFinite(video.currentTime)) return;

    const currentMs = video.currentTime * 1_000;
    const active = this.#adBreaks.some(
      (adBreak) =>
        adBreak.startMs <= currentMs && currentMs < adBreak.endMs,
    );
    const continuous =
      this.#lastClockMs !== undefined &&
      currentMs >= this.#lastClockMs &&
      currentMs - this.#lastClockMs < 1_000;
    this.#lastClockMs = currentMs;
    if (active) {
      if (this.#adActive === true) return;
      this.#adActive = true;
      this.#adExitPending = false;
      for (const callback of this.#adCallbacks) callback(true, continuous);
      return;
    }
    if (this.#adActive === true) {
      this.#adActive = false;
      this.#adExitPending = true;
    }
    if (!this.#adExitPending || !continuous) return;
    this.#adExitPending = false;
    for (const callback of this.#adCallbacks) callback(false, true);
  }
}

async function enumerateMaxTracks(): Promise<TrackInfo[]> {
  const player = await waitForMaxPlayerReady();
  const menuWasOpen = isTrackMenuOpen(player);
  let operationError: unknown;
  let tracks: TrackInfo[] = [];

  try {
    if (!menuWasOpen) await openTrackMenu(player);
    await waitUntil(
      () =>
        player.isConnected &&
        visibleElements<HTMLButtonElement>(
          TRACK_BUTTON_SELECTOR,
          player,
        ).length > 1,
      DOM_TIMEOUT_MS,
    );
    tracks = readOfficialTracks(player);
    if (tracks.length === 0) throw new Error('No Max subtitle tracks');
  } catch (error) {
    operationError = error;
  }

  if (!menuWasOpen && !(await closeTrackMenu(player))) {
    operationError = new Error('Could not restore Max subtitle menu state');
  }
  if (operationError !== undefined) throw asError(operationError);
  return tracks;
}

function readOfficialTracks(player: HTMLElement): TrackInfo[] {
  const tracks: TrackInfo[] = [];
  for (const button of visibleElements<HTMLButtonElement>(
    TRACK_BUTTON_SELECTOR,
    player,
  )) {
    const track = trackFromButton(button);
    if (track !== undefined && !tracks.some(({ id }) => id === track.id)) {
      tracks.push(track);
    }
  }
  return tracks;
}

function trackFromButton(button: HTMLButtonElement): TrackInfo | undefined {
  const label = button.getAttribute('aria-label')?.trim() ?? '';
  const checks = Array.from(
    button.querySelectorAll<HTMLElement>(
      `[data-testid^="${TRACK_CHECK_PREFIX}"]`,
    ),
  );
  const testId = checks.length === 1
    ? checks[0].getAttribute('data-testid')
    : null;
  if (
    label === '' ||
    testId === null ||
    !testId.startsWith(TRACK_CHECK_PREFIX)
  ) {
    return undefined;
  }

  const id = testId.slice(TRACK_CHECK_PREFIX.length);
  if (id === 'off') return undefined;
  const language = languageFromTrackId(id);
  return language === undefined
    ? undefined
    : { id, language, source: 'official', label };
}

function languageFromTrackId(id: string): string | undefined {
  const match = id.match(/^(.+)-(?:subtitles|closedcaptions)$/);
  if (match === null) return undefined;
  try {
    return Intl.getCanonicalLocales(match[1])[0];
  } catch {
    return undefined;
  }
}

async function waitForMaxPlayerReady(): Promise<HTMLElement> {
  await waitUntil(() => {
    const current = currentMaxPlayer();
    return current !== undefined && current.video.readyState >= 2;
  }, DOM_TIMEOUT_MS);
  const current = currentMaxPlayer();
  if (current === undefined) throw new Error('Max video player is ambiguous');
  return current.player;
}

async function openTrackMenu(player: HTMLElement): Promise<void> {
  await waitUntil(
    () =>
      player.isConnected &&
      player.querySelectorAll<HTMLButtonElement>(MENU_BUTTON_SELECTOR).length ===
        1,
    DOM_TIMEOUT_MS,
  );
  const buttons =
    player.querySelectorAll<HTMLButtonElement>(MENU_BUTTON_SELECTOR);
  if (buttons.length !== 1) {
    throw new Error('Max subtitle menu button is ambiguous');
  }
  buttons[0].click();
  await waitUntil(() => isTrackMenuOpen(player), DOM_TIMEOUT_MS);
}

async function closeTrackMenu(player: HTMLElement): Promise<boolean> {
  if (!isTrackMenuOpen(player)) return true;
  let buttons: HTMLButtonElement[];
  try {
    await waitUntil(
      () =>
        player.isConnected &&
        visibleElements<HTMLButtonElement>(
          MENU_DISMISS_SELECTOR,
          player,
        ).length === 1,
      DOM_TIMEOUT_MS,
    );
    buttons = visibleElements<HTMLButtonElement>(
      MENU_DISMISS_SELECTOR,
      player,
    );
  } catch {
    return false;
  }
  buttons[0].click();
  try {
    await waitUntil(() => !isTrackMenuOpen(player), DOM_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

function isTrackMenuOpen(player: HTMLElement): boolean {
  return visibleElements<HTMLElement>(
    MENU_DISMISS_SELECTOR,
    player,
  ).length > 0;
}

function currentMaxPlayer():
  | { readonly video: HTMLVideoElement; readonly player: HTMLElement }
  | undefined {
  const videos = visibleElements<HTMLVideoElement>(VIDEO_SELECTOR);
  if (videos.length !== 1) return undefined;
  const player = videos[0].closest<HTMLElement>(PLAYER_SELECTOR);
  return player === null ? undefined : { video: videos[0], player };
}

function visibleElements<T extends HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T[] {
  return Array.from(root.querySelectorAll<T>(selector)).filter(isVisible);
}

function isVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return (
    element.getClientRects().length > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden'
  );
}

async function fetchVtt(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    credentials: 'omit',
    signal,
  });
  if (!response.ok) {
    throw new MaxVttRequestError(response.status);
  }
  const raw = await response.text();
  if (
    raw.length === 0 ||
    raw.length > MAX_VTT_LENGTH ||
    !raw.replace(/^\uFEFF/, '').startsWith('WEBVTT')
  ) {
    throw new Error('Max VTT response failed format validation');
  }
  return raw;
}

class MaxVttRequestError extends Error {
  constructor(readonly status: number) {
    super(`Max VTT request failed: ${status}`);
  }
}

function normalizeCues(cues: readonly Cue[]): Cue[] {
  const result: Cue[] = [];
  for (const cue of cues.toSorted((left, right) => left.start - right.start)) {
    if (
      !Number.isFinite(cue.start) ||
      !Number.isFinite(cue.end) ||
      cue.start < 0 ||
      cue.end <= cue.start ||
      cue.text.length === 0 ||
      result.some(
        (current) =>
          current.start === cue.start &&
          current.end === cue.end &&
          current.text === cue.text,
      )
    ) {
      continue;
    }
    result.push(cue);
  }
  return result;
}

function readAdBreaks(raw: string): readonly AdBreak[] | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(value) || !isRecord(value.ssaiInfo)) return [];
  const vendorAttributes = value.ssaiInfo.vendorAttributes;
  if (!isRecord(vendorAttributes) || !Array.isArray(vendorAttributes.breaks)) {
    return [];
  }

  const result: AdBreak[] = [];
  for (const value of vendorAttributes.breaks.slice(0, 100)) {
    if (!isRecord(value)) continue;
    const start = value.timeOffset;
    const duration = value.duration;
    if (
      typeof start !== 'number' ||
      !Number.isFinite(start) ||
      start < 0 ||
      typeof duration !== 'number' ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      continue;
    }
    result.push({
      startMs: start * 1_000,
      endMs: (start + duration) * 1_000,
    });
  }
  return result;
}

function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const check = () => {
      if (predicate()) {
        resolve();
      } else if (performance.now() - startedAt >= timeoutMs) {
        reject(new Error('Max DOM operation timed out'));
      } else {
        window.setTimeout(check, 50);
      }
    };
    check();
  });
}

function sameUrlWithoutQuery(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return (
      leftUrl.origin === rightUrl.origin &&
      leftUrl.pathname === rightUrl.pathname
    );
  } catch {
    return false;
  }
}

function sameGeneration(
  left: PlaybackGeneration,
  right: PlaybackGeneration,
): boolean {
  return left.contentGeneration === right.contentGeneration &&
    left.clockGeneration === right.clockGeneration;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
