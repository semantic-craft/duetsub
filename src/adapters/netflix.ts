import type { Cue, SiteAdapter, TrackInfo } from '../core/contracts';
import {
  samePlaybackGeneration,
  type PlaybackGeneration,
} from '../core/lifecycle';
import {
  isDuetSubMessage,
  NETFLIX_TRACK_REQUEST_ATTRIBUTE,
  netflixTrackRequest,
  postDuetSubMessage,
  type NetflixTtmlResponseMessage,
} from '../core/messages';
import { readNetflixWatchIdentity } from './netflix-location';
import { parseNetflixManifest, type NetflixManifest } from './netflix-manifest';
import {
  consumeNetflixTtmlResponse,
  EMPTY_NETFLIX_TTML_INBOX,
  recordNetflixTtmlResponse,
  resolveNetflixResponseOwner,
  retainNetflixTtmlResponsesForGeneration,
  type NetflixResponseOwner,
  type NetflixTtmlResponseInbox,
} from './netflix-responses';

const MENU_BUTTON_SELECTOR =
  'button[data-uia="control-audio-subtitle"], [data-uia="control-audio-subtitle"][role="button"]';
const SUBTITLE_MENU_SELECTOR = 'div[data-uia="selector-audio-subtitle"]';
const SUBTITLE_OPTION_SELECTOR = 'li[data-uia*="subtitle"]';
const DOM_TIMEOUT_MS = 8_000;
const RESPONSE_TIMEOUT_MS = 15_000;

interface TrackRequest {
  readonly track: TrackInfo;
  readonly generation: PlaybackGeneration;
  readonly resolve: (cues: Cue[]) => void;
  readonly reject: (error: Error) => void;
}

interface PendingResponse extends NetflixResponseOwner {
  readonly requestId: string;
  readonly contentIdentity: string;
  armed: boolean;
  readonly resolve: (cues: Cue[]) => void;
  readonly reject: (error: Error) => void;
  readonly resolveArmed: () => void;
  readonly timeout: number;
}

interface GenerationBoundManifest {
  readonly generation: PlaybackGeneration;
  readonly manifest: NetflixManifest;
}

export interface NetflixMenuOptionMetadata {
  readonly key: string;
  readonly label: string;
  readonly language?: string;
  readonly selected: boolean;
  readonly off: boolean;
  readonly forcedOnly: boolean;
  readonly kind: TrackInfo['kind'];
}

interface SubtitleMenuOption extends NetflixMenuOptionMetadata {
  readonly element: HTMLElement;
}

export function createNetflixAdapter(): SiteAdapter {
  return new NetflixAdapter();
}

class NetflixAdapter implements SiteAdapter {
  readonly id = 'netflix' as const;

  readonly #trackCallbacks: Array<(tracks: TrackInfo[]) => void> = [];
  readonly #cueCallbacks: Array<(trackId: string, cues: Cue[]) => void> = [];
  readonly #resetCallbacks: Array<
    (reason: 'navigation' | 'episode' | 'seek-flush') => void
  > = [];
  readonly #requestQueue: TrackRequest[] = [];

  #started = false;
  #enumerating = false;
  #batchScheduled = false;
  #batchRunning = false;
  #retryOnControlsInteraction = false;
  #retryTimer: number | undefined;
  #manifest: GenerationBoundManifest | undefined;
  #tracks: readonly TrackInfo[] = [];
  #lastEmittedSignature: string | undefined;
  #pending: PendingResponse | undefined;
  #responseInbox: NetflixTtmlResponseInbox = EMPTY_NETFLIX_TTML_INBOX;
  #generation: PlaybackGeneration = {
    contentGeneration: 0,
    clockGeneration: 0,
  };

  constructor() {
    window.addEventListener('message', this.#onMessage);
    window.addEventListener('pointermove', this.#onControlsInteraction);
    window.addEventListener('click', this.#onControlsInteraction);
  }

  start(): void {
    this.#started = true;
    this.#retryOnControlsInteraction = false;
    this.#lastEmittedSignature = undefined;
    const generation = this.#generation;
    const manifest = this.#currentManifest();
    if (manifest !== undefined) {
      this.#emitTracks(manifest.tracks, generation);
      return;
    }
    if (this.#tracks.length > 0) {
      this.#emitTracks(this.#tracks, generation);
      return;
    }
    if (this.#enumerating) return;

    this.#enumerating = true;
    void enumerateMenuTracks().then(
      (tracks) => {
        const currentManifest = this.#currentManifest();
        this.#emitTracks(currentManifest?.tracks ?? tracks, generation);
      },
      (error) => {
        console.warn('[DuetSub] Netflix track enumeration failed', error);
        const currentManifest = this.#currentManifest();
        if (currentManifest !== undefined) {
          this.#emitTracks(currentManifest.tracks, generation);
          return;
        }
        if (sameGeneration(this.#generation, generation)) {
          this.#retryOnControlsInteraction = true;
        }
        this.#emitTracks([], generation);
      },
    ).finally(() => {
      this.#enumerating = false;
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
      if (!this.#tracks.some(({ id }) => id === track.id)) {
        reject(new Error(`Netflix track is no longer current: ${track.id}`));
        return;
      }

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

    const sameContent =
      this.#generation.contentGeneration === generation.contentGeneration;
    this.#generation = generation;
    this.#manifest =
      sameContent && this.#manifest !== undefined
        ? { generation, manifest: this.#manifest.manifest }
        : undefined;
    if (!sameContent) this.#tracks = [];
    this.#lastEmittedSignature = undefined;
    this.#responseInbox = retainNetflixTtmlResponsesForGeneration(
      this.#responseInbox,
      generation,
    );
    this.#rejectPending(new Error('Netflix TTML response became stale'));

    const stale = this.#requestQueue.splice(0);
    rejectRequests(stale, new Error('Netflix track request became stale'));
  }

  onReset(
    cb: (reason: 'navigation' | 'episode' | 'seek-flush') => void,
  ): void {
    this.#resetCallbacks.push(cb);
  }

  async #drainRequestQueue(): Promise<void> {
    if (this.#batchRunning) return;
    this.#batchRunning = true;

    while (this.#requestQueue.length > 0) {
      const requests = this.#requestQueue.splice(0);
      const current = requests.filter(({ generation }) =>
        sameGeneration(generation, this.#generation),
      );
      const stale = requests.filter(({ generation }) =>
        !sameGeneration(generation, this.#generation),
      );
      rejectRequests(stale, new Error('Netflix track request became stale'));
      if (current.length > 0) await this.#runAcquisitionBatch(current);
    }

    this.#batchRunning = false;
  }

  async #runAcquisitionBatch(requests: readonly TrackRequest[]): Promise<void> {
    const generation = requests[0]?.generation;
    if (
      generation === undefined ||
      !sameGeneration(this.#generation, generation)
    ) {
      rejectRequests(requests, new Error('Netflix track request became stale'));
      return;
    }

    const button = await waitForMenuButton().catch(() => undefined);
    if (button === undefined) {
      rejectRequests(requests, new Error('Netflix subtitle menu unavailable'));
      return;
    }

    const menuWasOpen = isSubtitleMenuOpen();
    let originalKey = '';
    let captured = new Map<string, Cue[]>();
    let operationError: unknown;

    try {
      await waitForNetflixPlayerReady();
      const menu = await ensureSubtitleMenuOpen(button);
      const options = readSubtitleOptions(menu);
      const selected = options.filter(({ selected }) => selected);
      if (selected.length !== 1) {
        throw new Error('Netflix original subtitle option is ambiguous');
      }
      originalKey = selected[0].key;

      const requestedTracks = uniqueRequestedTracks(requests);
      for (const track of requestedTracks) {
        if (findOptionForTrack(track, options) === undefined) {
          throw new Error(`Netflix track menu handle is ambiguous: ${track.id}`);
        }
      }

      const orderedTracks = requestedTracks.toSorted((left, right) => {
        const originalTrack = uniqueTrackForOption(selected[0], [left, right]);
        return originalTrack?.id === left.id
          ? 1
          : originalTrack?.id === right.id
            ? -1
            : 0;
      });

      for (const track of orderedTracks) {
        if (!sameGeneration(this.#generation, generation)) {
          throw new Error('Netflix track request became stale');
        }
        const cues = await this.#switchAndCapture(track, generation, button);
        captured.set(track.id, cues);
      }
    } catch (error) {
      operationError = error;
    }

    const contentIsCurrent =
      generation.contentGeneration === this.#generation.contentGeneration;
    const restored =
      !contentIsCurrent ||
      (originalKey !== '' &&
        (await this.#restoreOriginalState(
          button,
          originalKey,
          menuWasOpen,
        )));
    if (!restored) {
      operationError = new Error('Could not restore Netflix subtitle state');
    }
    if (!sameGeneration(this.#generation, generation)) {
      operationError = new Error('Netflix track request became stale');
    }

    if (operationError !== undefined) {
      captured = new Map();
      rejectRequests(requests, asError(operationError));
      return;
    }

    for (const request of requests) {
      const cues = captured.get(request.track.id);
      if (cues === undefined) {
        request.reject(
          new Error(`Netflix track was not captured: ${request.track.id}`),
        );
      } else {
        request.resolve(cues);
      }
    }
  }

  async #switchAndCapture(
    track: TrackInfo,
    generation: PlaybackGeneration,
    button: HTMLElement,
  ): Promise<Cue[]> {
    let menu = await ensureSubtitleMenuOpen(button);
    let options = readSubtitleOptions(menu);
    let target = findOptionForTrack(track, options);
    if (target === undefined) {
      throw new Error(`Netflix track disappeared: ${track.id}`);
    }

    if (target.selected) {
      const detour = options.find(({ off }) => off) ??
        options.find(
          (option) =>
            !option.selected &&
            !option.forcedOnly &&
            uniqueTrackForOption(option, this.#tracks) !== undefined,
        );
      if (detour === undefined) {
        throw new Error('Netflix cannot re-request the current track');
      }
      await this.#selectOption(detour, button);
      menu = await ensureSubtitleMenuOpen(button);
      options = readSubtitleOptions(menu);
      target = findOptionForTrack(track, options);
      if (target === undefined) {
        throw new Error(`Netflix track disappeared: ${track.id}`);
      }
    }

    if (!sameGeneration(this.#generation, generation)) {
      throw new Error('Netflix track request became stale');
    }
    const request = this.#armPending(track, generation);
    try {
      await request.armed;
      if (this.#pending?.requestId !== request.requestId) {
        return await request.response;
      }
      if (!sameGeneration(this.#generation, generation)) {
        throw new Error('Netflix track request became stale');
      }
      activateNetflixTrackRequest(request.requestId);
      target.element.click();
      return await request.response;
    } catch (error) {
      this.#rejectPending(asError(error));
      throw error;
    }
  }

  #armPending(
    track: TrackInfo,
    generation: PlaybackGeneration,
  ): {
    readonly requestId: string;
    readonly armed: Promise<void>;
    readonly response: Promise<Cue[]>;
  } {
    if (this.#pending !== undefined) {
      throw new Error('Netflix response ownership is ambiguous');
    }
    const contentIdentity = readNetflixWatchIdentity(window.location.href);
    if (contentIdentity === undefined) {
      throw new Error('Netflix content identity unavailable');
    }

    const requestId = crypto.randomUUID();
    let resolveArmed: () => void = () => undefined;
    const armed = new Promise<void>((resolve) => {
      resolveArmed = resolve;
    });
    const response = new Promise<Cue[]>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        if (this.#pending?.requestId !== requestId) return;
        clearNetflixTrackRequest(requestId);
        resolveArmed();
        this.#pending = undefined;
        reject(new Error(`Netflix TTML response timed out: ${track.id}`));
      }, RESPONSE_TIMEOUT_MS);
      this.#pending = {
        requestId,
        contentIdentity,
        armed: false,
        track,
        generation,
        resolve,
        reject,
        resolveArmed,
        timeout,
      };
    });
    postDuetSubMessage(
      netflixTrackRequest(requestId, contentIdentity, generation, track),
    );
    return { requestId, armed, response };
  }

  #rejectPending(error: Error): void {
    const pending = this.#pending;
    if (pending === undefined) return;
    window.clearTimeout(pending.timeout);
    this.#pending = undefined;
    clearNetflixTrackRequest(pending.requestId);
    pending.resolveArmed();
    pending.reject(error);
  }

  async #selectOption(
    option: SubtitleMenuOption,
    button: HTMLElement,
  ): Promise<void> {
    option.element.click();
    await delay(100);
    await ensureSubtitleMenuOpen(button);
    await waitUntil(
      () => {
        const current = currentSubtitleMenu();
        return (
          current !== undefined &&
          readSubtitleOptions(current).some(
            (candidate) => candidate.key === option.key && candidate.selected,
          )
        );
      },
      DOM_TIMEOUT_MS,
    );
  }

  async #restoreOriginalState(
    button: HTMLElement,
    originalKey: string,
    menuWasOpen: boolean,
  ): Promise<boolean> {
    try {
      let menu = await ensureSubtitleMenuOpen(button);
      let original = readSubtitleOptions(menu).find(
        ({ key }) => key === originalKey,
      );
      if (original === undefined) return false;
      if (!original.selected) {
        await this.#selectOption(original, button);
        menu = await ensureSubtitleMenuOpen(button);
        original = readSubtitleOptions(menu).find(
          ({ key }) => key === originalKey,
        );
        if (original?.selected !== true) return false;
      }

      return await restoreMenuState(button, menuWasOpen);
    } catch {
      return false;
    }
  }

  readonly #onMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== window || !isDuetSubMessage(event.data)) return;
    const message = event.data;
    if (
      message.direction !== 'main-to-isolated' ||
      message.siteId !== 'netflix'
    ) {
      return;
    }

    if (message.type === 'netflix-manifest') {
      this.#observeManifest(message.manifest);
    } else if (message.type === 'netflix-track-request-ready') {
      const pending = this.#pending;
      if (
        pending === undefined ||
        message.requestId !== pending.requestId ||
        message.contentIdentity !== pending.contentIdentity
      ) {
        return;
      }
      if (!message.ok) {
        this.#rejectPending(new Error('Netflix track request was not armed'));
        return;
      }
      pending.armed = true;
      pending.resolveArmed();
    } else if (message.type === 'netflix-ttml-response') {
      this.#observeTtmlResponse(message);
    }
  };

  readonly #onControlsInteraction = () => {
    if (
      !this.#retryOnControlsInteraction ||
      this.#retryTimer !== undefined
    ) {
      return;
    }
    this.#retryOnControlsInteraction = false;
    this.#retryTimer = window.setTimeout(() => {
      this.#retryTimer = undefined;
      if (!this.#started || this.#enumerating) return;
      this.start();
    }, 100);
  };

  #observeManifest(value: unknown): void {
    const manifest = parseNetflixManifest(value);
    const currentIdentity = readNetflixWatchIdentity(window.location.href);
    if (
      manifest === undefined ||
      currentIdentity === undefined ||
      manifest.contentIdentity !== currentIdentity
    ) {
      return;
    }

    this.#manifest = { generation: this.#generation, manifest };
    if (this.#started) this.#emitTracks(manifest.tracks, this.#generation);
  }

  #observeTtmlResponse(message: NetflixTtmlResponseMessage): void {
    if (
      message.contentIdentity !== readNetflixWatchIdentity(window.location.href)
    ) {
      return;
    }
    const owner = resolveNetflixResponseOwner(
      this.#generation,
      this.#pending,
      message,
    );
    if (owner === undefined) return;

    const before = this.#responseInbox;
    this.#responseInbox = recordNetflixTtmlResponse(before, {
      responseId: message.responseId,
      raw: message.raw,
      owner,
    });
    const recorded = this.#responseInbox.find(
      (response) => response.responseId === message.responseId,
    );
    if (recorded === undefined) return;
    console.debug(
      `[DuetSub] Netflix ISOLATED validated TTML for ${owner.track.label}`,
    );

    this.#resolvePendingFromInbox();
  }

  #resolvePendingFromInbox(): void {
    const pending = this.#pending;
    if (
      pending === undefined ||
      !sameGeneration(this.#generation, pending.generation)
    ) {
      return;
    }

    const consumed = consumeNetflixTtmlResponse(
      this.#responseInbox,
      pending.track,
      pending.generation,
    );
    this.#responseInbox = consumed.inbox;
    if (consumed.cues === undefined) return;

    window.clearTimeout(pending.timeout);
    this.#pending = undefined;
    clearNetflixTrackRequest(pending.requestId);
    pending.resolve([...consumed.cues]);
  }

  #currentManifest(): NetflixManifest | undefined {
    return this.#manifest !== undefined &&
        sameGeneration(this.#manifest.generation, this.#generation)
      ? this.#manifest.manifest
      : undefined;
  }

  #emitTracks(
    tracks: readonly TrackInfo[],
    generation: PlaybackGeneration,
  ): void {
    if (!sameGeneration(this.#generation, generation)) return;
    const signature = tracks
      .map(({ id, language, label, kind, forcedOnly }) =>
        [id, language, label, kind, forcedOnly === true ? 'forced' : 'full']
          .join('\u0000')
      )
      .join('\u0001');
    if (signature === this.#lastEmittedSignature) return;

    this.#lastEmittedSignature = signature;
    this.#tracks = tracks;
    for (const callback of this.#trackCallbacks) callback([...tracks]);
  }
}

async function enumerateMenuTracks(): Promise<TrackInfo[]> {
  await waitForNetflixPlayerReady();
  const button = await waitForMenuButton();
  const menuWasOpen = isSubtitleMenuOpen();
  let originalKey = '';
  let tracks: TrackInfo[] = [];
  let operationError: unknown;

  try {
    const menu = await ensureSubtitleMenuOpen(button);
    const options = readSubtitleOptions(menu);
    const selected = options.filter(({ selected }) => selected);
    if (selected.length !== 1) {
      throw new Error('Netflix original subtitle option is ambiguous');
    }
    originalKey = selected[0].key;
    tracks = options.flatMap((option) => {
      const track = trackFromMenuOption(option);
      return track === undefined ? [] : [track];
    });
  } catch (error) {
    operationError = error;
  }

  const restored =
    originalKey !== '' &&
    (await verifySelectionAndRestoreMenu(button, originalKey, menuWasOpen));
  if (!restored) {
    operationError = new Error('Could not restore Netflix subtitle menu');
  }
  if (operationError !== undefined) throw asError(operationError);
  return tracks;
}

function readSubtitleOptions(menu: HTMLElement): SubtitleMenuOption[] {
  const result: SubtitleMenuOption[] = [];
  for (const element of menu.querySelectorAll<HTMLElement>(
    SUBTITLE_OPTION_SELECTOR,
  )) {
    const dataUia = element.getAttribute('data-uia')?.trim() ?? '';
    const label =
      element.getAttribute('aria-label')?.trim() ??
      element.textContent?.trim() ??
      '';
    const metadata = parseNetflixMenuOptionMetadata({
      dataUia,
      label,
      languageCode:
        element.getAttribute('lang') ??
        element.getAttribute('data-language-code') ??
        element.getAttribute('data-language') ??
        element.getAttribute('data-lang'),
      selected: element.getAttribute('aria-selected') === 'true',
    });

    if (metadata !== undefined) result.push({ element, ...metadata });
  }
  return result;
}

export function parseNetflixMenuOptionMetadata(input: {
  readonly dataUia: string;
  readonly label: string;
  readonly languageCode?: string | null;
  readonly selected: boolean;
}): NetflixMenuOptionMetadata | undefined {
  const dataUia = input.dataUia.trim();
  const label = input.label.trim();
  if (label === '') return undefined;

  const off = /(?:^|[-_:])(off|none)(?:[-_:]|$)/i.test(dataUia);
  const forcedOnly =
    /(?:^|[-_:])(?:forced|forcednarrative)(?:[-_:]|$)/i.test(dataUia);
  const closedCaptions = hasClosedCaptionMarker(label, dataUia);
  const language = off
    ? undefined
    : canonicalLanguage(input.languageCode) ??
      languageFromMenuDataUia(dataUia);

  return {
    key: [
      off ? 'off' : language ?? 'unknown',
      closedCaptions ? 'cc' : 'plain',
      normalizeLabel(label),
    ].join(':'),
    label,
    language,
    selected:
      input.selected ||
      /(?:^|[-_:])selected(?:[-_:]|$)/i.test(dataUia),
    off,
    forcedOnly,
    kind: closedCaptions ? 'closed-captions' : 'subtitles',
  };
}

function trackFromMenuOption(
  option: NetflixMenuOptionMetadata,
): TrackInfo | undefined {
  if (
    option.off ||
    option.forcedOnly ||
    option.language === undefined
  ) {
    return undefined;
  }
  return {
    id: `menu:${option.key}`,
    language: option.language,
    source: 'official',
    label: option.label,
    kind: option.kind,
  };
}

function findOptionForTrack(
  track: TrackInfo,
  options: readonly SubtitleMenuOption[],
): SubtitleMenuOption | undefined {
  const key = resolveNetflixMenuTrackKey(track, options);
  return key === undefined
    ? undefined
    : options.find((option) => option.key === key);
}

export function resolveNetflixMenuTrackKey(
  track: TrackInfo,
  options: readonly NetflixMenuOptionMetadata[],
): string | undefined {
  const direct = options.filter(
    (option) => trackFromMenuOption(option)?.id === track.id,
  );
  if (direct.length === 1) return direct[0].key;

  const candidates = options.filter(
    (option) =>
      !option.off &&
      !option.forcedOnly &&
      option.language !== undefined &&
      sameLanguage(option.language, track.language) &&
      option.kind === track.kind,
  );
  return candidates.length === 1 ? candidates[0].key : undefined;
}

function uniqueTrackForOption(
  option: SubtitleMenuOption,
  tracks: readonly TrackInfo[],
): TrackInfo | undefined {
  const candidates = tracks.filter(
    (track) => findOptionForTrack(track, [option]) !== undefined,
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

const NETFLIX_MENU_METADATA_TOKENS = new Set([
  'audio',
  'captions',
  'cc',
  'closed',
  'closedcaptions',
  'data',
  'forced',
  'forcednarrative',
  'item',
  'menu',
  'none',
  'off',
  'option',
  'plain',
  'sdh',
  'selected',
  'subtitle',
  'subtitles',
  'track',
  'uia',
]);

function languageFromMenuDataUia(dataUia: string): string | undefined {
  const segments = dataUia.split(/[-_:]/).filter((segment) => segment !== '');

  for (let start = 0; start < segments.length; start += 1) {
    if (NETFLIX_MENU_METADATA_TOKENS.has(segments[start].toLowerCase())) {
      continue;
    }

    let matched: string | undefined;
    for (let end = start + 1; end <= segments.length; end += 1) {
      const next = segments[end - 1].toLowerCase();
      if (NETFLIX_MENU_METADATA_TOKENS.has(next)) break;
      const canonical = canonicalLanguage(segments.slice(start, end).join('-'));
      if (canonical !== undefined) matched = canonical;
    }
    if (matched !== undefined) return matched;
  }
  return undefined;
}

function canonicalLanguage(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null || value.trim() === '') {
    return undefined;
  }
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    return undefined;
  }
}

function sameLanguage(left: string, right: string): boolean {
  if (left.toLowerCase() === right.toLowerCase()) return true;
  const leftLocale = new Intl.Locale(left);
  const rightLocale = new Intl.Locale(right);
  if (leftLocale.language !== rightLocale.language) return false;

  const leftScript = scriptFamily(leftLocale);
  const rightScript = scriptFamily(rightLocale);
  if (leftScript !== undefined || rightScript !== undefined) {
    return leftScript !== undefined && leftScript === rightScript;
  }
  return leftLocale.language !== 'zh';
}

function scriptFamily(locale: Intl.Locale): string | undefined {
  if (locale.language !== 'zh') return locale.script || undefined;
  if (locale.script === 'Hans' || locale.script === 'Hant') {
    return locale.script;
  }
  if (locale.region === 'CN' || locale.region === 'SG') return 'Hans';
  if (
    locale.region === 'TW' ||
    locale.region === 'HK' ||
    locale.region === 'MO'
  ) {
    return 'Hant';
  }
  return undefined;
}

function hasClosedCaptionMarker(label: string, id: string): boolean {
  return /(?:[\[(（]\s*(?:CC|SDH)\s*[\])）]|closedcaptions|(?:^|[-_:])(?:cc|sdh)(?:[-_:]|$))/i
    .test(`${label} ${id}`);
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, ' ')
    .replace(/[（(]/g, '[')
    .replace(/[）)]/g, ']')
    .trim();
}

async function verifySelectionAndRestoreMenu(
  button: HTMLElement,
  originalKey: string,
  menuWasOpen: boolean,
): Promise<boolean> {
  try {
    const menu = await ensureSubtitleMenuOpen(button);
    const selected = readSubtitleOptions(menu).filter(
      (option) => option.selected,
    );
    if (selected.length !== 1 || selected[0].key !== originalKey) return false;
    return await restoreMenuState(button, menuWasOpen);
  } catch {
    return false;
  }
}

async function restoreMenuState(
  button: HTMLElement,
  menuWasOpen: boolean,
): Promise<boolean> {
  try {
    if (menuWasOpen) {
      await ensureSubtitleMenuOpen(button);
    } else if (isSubtitleMenuOpen()) {
      const menu = currentSubtitleMenu();
      menu?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
      await waitUntil(() => !isSubtitleMenuOpen(), DOM_TIMEOUT_MS);
    }
    return isSubtitleMenuOpen() === menuWasOpen;
  } catch {
    return false;
  }
}

async function ensureSubtitleMenuOpen(
  button: HTMLElement,
): Promise<HTMLElement> {
  const current = document.querySelector<HTMLElement>(SUBTITLE_MENU_SELECTOR);
  if (current !== null && isVisible(current)) return current;

  const currentButton = await currentNetflixMenuButton(button);
  currentButton.click();
  await waitUntil(() => isSubtitleMenuOpen(), DOM_TIMEOUT_MS);
  const menu = document.querySelector<HTMLElement>(SUBTITLE_MENU_SELECTOR);
  if (menu === null) throw new Error('Netflix subtitle menu did not open');
  return menu;
}

async function currentNetflixMenuButton(
  previous: HTMLElement,
): Promise<HTMLElement> {
  let current = document.querySelector<HTMLElement>(MENU_BUTTON_SELECTOR);
  if (current !== null) return current;

  revealNetflixControls();
  await waitUntil(
    () => document.querySelector(MENU_BUTTON_SELECTOR) !== null,
    DOM_TIMEOUT_MS,
  ).catch(() => undefined);
  current = document.querySelector<HTMLElement>(MENU_BUTTON_SELECTOR);
  if (current !== null) return current;
  if (previous.isConnected !== false) return previous;
  throw new Error('Netflix subtitle menu button unavailable');
}

function revealNetflixControls(): void {
  const player = document.querySelector<HTMLElement>(
    '.watch-video--player-view',
  );
  if (player === null) return;

  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: player.clientWidth / 2,
    clientY: player.clientHeight * 0.8,
  };
  let dispatched = false;
  if (typeof PointerEvent === 'function') {
    player.dispatchEvent(
      new PointerEvent('pointermove', { ...init, pointerType: 'mouse' }),
    );
    dispatched = true;
  }
  if (typeof MouseEvent === 'function') {
    player.dispatchEvent(new MouseEvent('mousemove', init));
    dispatched = true;
  }
  if (!dispatched && typeof Event === 'function') {
    player.dispatchEvent(new Event('mousemove', init));
  }
}

function isSubtitleMenuOpen(): boolean {
  return currentSubtitleMenu() !== undefined;
}

function currentSubtitleMenu(): HTMLElement | undefined {
  const menu = document.querySelector<HTMLElement>(SUBTITLE_MENU_SELECTOR);
  return menu !== null && isVisible(menu) ? menu : undefined;
}

async function waitForNetflixPlayerReady(): Promise<void> {
  await waitUntil(() => {
    const video = document.querySelector<HTMLVideoElement>(
      '#appMountPoint video',
    );
    return video !== null && isVisible(video) && video.readyState >= 2;
  }, DOM_TIMEOUT_MS);
}

async function waitForMenuButton(): Promise<HTMLElement> {
  await waitUntil(
    () => document.querySelector(MENU_BUTTON_SELECTOR) !== null,
    DOM_TIMEOUT_MS,
  );
  const button = document.querySelector<HTMLElement>(MENU_BUTTON_SELECTOR);
  if (button === null) throw new Error('Netflix subtitle menu button unavailable');
  return button;
}

function isVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return (
    element.getClientRects().length > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden'
  );
}

function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const check = () => {
      if (predicate()) {
        resolve();
      } else if (performance.now() - startedAt >= timeoutMs) {
        reject(new Error('Netflix DOM operation timed out'));
      } else {
        window.setTimeout(check, 50);
      }
    };
    check();
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function activateNetflixTrackRequest(requestId: string): void {
  document.documentElement?.setAttribute(
    NETFLIX_TRACK_REQUEST_ATTRIBUTE,
    requestId,
  );
}

function clearNetflixTrackRequest(requestId: string): void {
  const root = document.documentElement;
  if (root?.getAttribute(NETFLIX_TRACK_REQUEST_ATTRIBUTE) === requestId) {
    root.removeAttribute(NETFLIX_TRACK_REQUEST_ATTRIBUTE);
  }
}

function uniqueRequestedTracks(
  requests: readonly TrackRequest[],
): TrackInfo[] {
  const result: TrackInfo[] = [];
  for (const { track } of requests) {
    if (!result.some(({ id }) => id === track.id)) result.push(track);
  }
  return result;
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
