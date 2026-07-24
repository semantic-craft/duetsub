import type { Cue, SiteAdapter, TrackInfo } from '../core/contracts';
import type { PlaybackGeneration } from '../core/lifecycle';
import { isDuetSubMessage } from '../core/messages';
import { readNetflixWatchIdentity } from './netflix-location';
import { parseNetflixManifest, type NetflixManifest } from './netflix-manifest';
import {
  claimNetflixTtmlResponseForPending,
  consumeNetflixTtmlResponse,
  EMPTY_NETFLIX_TTML_INBOX,
  recordNetflixTtmlResponse,
  recordNetflixTtmlResponseForUniqueTrack,
  resolveNetflixResponseOwner,
  resolveNetflixUnownedResponseGeneration,
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
const MAX_UNOWNED_RESPONSES = 8;

interface TrackRequest {
  readonly track: TrackInfo;
  readonly generation: PlaybackGeneration;
  readonly resolve: (cues: Cue[]) => void;
  readonly reject: (error: Error) => void;
}

interface PendingResponse extends NetflixResponseOwner {
  readonly resolve: (cues: Cue[]) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: number;
}

interface GenerationBoundManifest {
  readonly generation: PlaybackGeneration;
  readonly manifest: NetflixManifest;
}

interface UnownedTtmlResponse {
  readonly responseId: string;
  readonly raw: string;
  readonly contentIdentity: string;
  readonly generation: PlaybackGeneration;
}

interface SubtitleMenuOption {
  readonly element: HTMLElement;
  readonly key: string;
  readonly label: string;
  readonly language?: string;
  readonly selected: boolean;
  readonly off: boolean;
  readonly forcedOnly: boolean;
  readonly closedCaptions: boolean;
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
  #currentTrack: TrackInfo | undefined;
  #pending: PendingResponse | undefined;
  #responseInbox: NetflixTtmlResponseInbox = EMPTY_NETFLIX_TTML_INBOX;
  #unownedResponses: readonly UnownedTtmlResponse[] = [];
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
    this.#currentTrack = undefined;
    this.#responseInbox = retainNetflixTtmlResponsesForGeneration(
      this.#responseInbox,
      generation,
    );
    const currentIdentity = readNetflixWatchIdentity(window.location.href);
    this.#unownedResponses = this.#unownedResponses.filter(
      (response) =>
        resolveNetflixUnownedResponseGeneration(
          response.contentIdentity,
          response.generation,
          currentIdentity,
          generation,
        ) !== undefined,
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
      this.#currentTrack = uniqueTrackForOption(selected[0], this.#tracks);

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
    const response = this.#armPending(track, generation);
    try {
      target.element.click();
      return await response;
    } catch (error) {
      this.#rejectPending(asError(error));
      throw error;
    }
  }

  #armPending(
    track: TrackInfo,
    generation: PlaybackGeneration,
  ): Promise<Cue[]> {
    if (this.#pending !== undefined) {
      throw new Error('Netflix response ownership is ambiguous');
    }

    const response = new Promise<Cue[]>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        if (this.#pending?.track.id !== track.id) return;
        this.#pending = undefined;
        reject(new Error(`Netflix TTML response timed out: ${track.id}`));
      }, RESPONSE_TIMEOUT_MS);
      this.#pending = { track, generation, resolve, reject, timeout };
    });
    this.#claimUnownedResponses();
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

  async #selectOption(
    option: SubtitleMenuOption,
    button: HTMLElement,
  ): Promise<void> {
    this.#currentTrack = undefined;
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
    const current = currentSubtitleMenu();
    const selected = (
      current === undefined ? [] : readSubtitleOptions(current)
    ).filter((candidate) => candidate.selected);
    this.#currentTrack =
      selected.length === 1
        ? uniqueTrackForOption(selected[0], this.#tracks)
        : undefined;
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

      this.#currentTrack = uniqueTrackForOption(original, this.#tracks);
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
    } else if (message.type === 'netflix-ttml-response') {
      this.#observeTtmlResponse(
        message.responseId,
        message.contentIdentity,
        message.raw,
      );
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

  #observeTtmlResponse(
    responseId: string,
    contentIdentity: string,
    raw: string,
  ): void {
    if (
      contentIdentity !== readNetflixWatchIdentity(window.location.href)
    ) {
      return;
    }
    const owner = resolveNetflixResponseOwner(
      this.#generation,
      this.#pending,
      this.#currentTrack === undefined ? [] : [this.#currentTrack],
    );
    if (owner === undefined) {
      this.#unownedResponses = [
        ...this.#unownedResponses,
        {
          responseId,
          raw,
          contentIdentity,
          generation: this.#generation,
        },
      ].slice(-MAX_UNOWNED_RESPONSES);
      this.#claimUnownedResponses();
      return;
    }

    const before = this.#responseInbox;
    this.#responseInbox = recordNetflixTtmlResponse(before, {
      responseId,
      raw,
      owner,
    });
    const recorded = this.#responseInbox.find(
      (response) => response.responseId === responseId,
    );
    if (recorded === undefined) return;
    console.debug(
      `[DuetSub] Netflix ISOLATED validated TTML for ${owner.track.label}`,
    );

    if (this.#pending !== undefined) {
      this.#resolvePendingFromInbox();
      return;
    }

    const delivered = consumeNetflixTtmlResponse(
      this.#responseInbox,
      owner.track,
      owner.generation,
    );
    this.#responseInbox = delivered.inbox;
    if (delivered.cues === undefined) return;
    for (const callback of this.#cueCallbacks) {
      callback(owner.track.id, [...delivered.cues]);
    }
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
    this.#currentTrack = pending.track;
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
      .map(({ id, language, label }) => `${id}\u0000${language}\u0000${label}`)
      .join('\u0001');
    if (signature === this.#lastEmittedSignature) return;

    this.#lastEmittedSignature = signature;
    this.#tracks = tracks;
    this.#claimUnownedResponses();
    for (const callback of this.#trackCallbacks) callback([...tracks]);
  }

  #claimUnownedResponses(): void {
    if (this.#tracks.length === 0 || this.#unownedResponses.length === 0) {
      return;
    }

    const currentIdentity = readNetflixWatchIdentity(window.location.href);
    const currentResponses = this.#unownedResponses.flatMap((response) => {
      const generation = resolveNetflixUnownedResponseGeneration(
        response.contentIdentity,
        response.generation,
        currentIdentity,
        this.#generation,
      );
      return generation === undefined
        ? []
        : [{ ...response, generation }];
    });

    const pending = this.#pending;
    let claimedResponseId: string | undefined;
    if (
      pending !== undefined &&
      sameGeneration(pending.generation, this.#generation)
    ) {
      const claimed = claimNetflixTtmlResponseForPending(
        this.#responseInbox,
        currentResponses,
        pending,
      );
      this.#responseInbox = claimed.inbox;
      claimedResponseId = claimed.claimedResponseId;
    }

    const remaining: UnownedTtmlResponse[] = [];
    for (const response of currentResponses) {
      if (response.responseId === claimedResponseId) continue;
      const nextInbox = recordNetflixTtmlResponseForUniqueTrack(
        this.#responseInbox,
        {
          ...response,
          candidates: this.#tracks,
        },
      );
      const recorded = nextInbox.some(
        ({ responseId }) => responseId === response.responseId,
      );
      this.#responseInbox = nextInbox;
      if (!recorded) remaining.push(response);
    }
    this.#unownedResponses = remaining.slice(-MAX_UNOWNED_RESPONSES);
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
    const token = dataUia.toLowerCase();
    const language = languageFromMenuOption(element, dataUia, label);
    const off = /(?:^|[-_:])(off|none)(?:[-_:]|$)/i.test(dataUia);
    const forcedOnly = token.includes('forced');
    const closedCaptions = hasClosedCaptionMarker(label, dataUia);
    const selected =
      element.getAttribute('aria-selected') === 'true' ||
      token.includes('selected');
    const key = [
      off ? 'off' : language ?? 'unknown',
      closedCaptions ? 'cc' : 'plain',
      normalizeLabel(label),
    ].join(':');

    if (
      label !== '' &&
      !result.some((option) => option.key === key)
    ) {
      result.push({
        element,
        key,
        label,
        language,
        selected,
        off,
        forcedOnly,
        closedCaptions,
      });
    }
  }
  return result;
}

function trackFromMenuOption(
  option: SubtitleMenuOption,
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
  };
}

function findOptionForTrack(
  track: TrackInfo,
  options: readonly SubtitleMenuOption[],
): SubtitleMenuOption | undefined {
  const direct = options.filter(
    (option) => trackFromMenuOption(option)?.id === track.id,
  );
  if (direct.length === 1) return direct[0];

  let candidates = options.filter(
    (option) =>
      !option.off &&
      !option.forcedOnly &&
      option.language !== undefined &&
      sameLanguage(option.language, track.language),
  );
  const trackClosedCaptions = hasClosedCaptionMarker(track.label, track.id);
  const sameCaptionKind = candidates.filter(
    ({ closedCaptions }) => closedCaptions === trackClosedCaptions,
  );
  if (sameCaptionKind.length > 0) candidates = sameCaptionKind;
  if (candidates.length === 1) return candidates[0];

  const normalizedLabel = normalizeLabel(track.label);
  const exactLabel = candidates.filter(
    ({ label }) => normalizeLabel(label) === normalizedLabel,
  );
  return exactLabel.length === 1 ? exactLabel[0] : undefined;
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

function languageFromMenuOption(
  element: HTMLElement,
  dataUia: string,
  label: string,
): string | undefined {
  const explicit =
    element.getAttribute('lang') ??
    dataUia.match(
      /(?:^|[-_:])(zh-(?:hant|hans)|en(?:-[a-z0-9]{2,8})*)(?:[-_:]|$)/i,
    )?.[1];
  const canonical = canonicalLanguage(explicit);
  if (canonical !== undefined) return canonical;

  if (/中文[（(](?:繁體|繁体)[）)]/.test(label)) return 'zh-Hant';
  if (/中文[（(](?:簡體|简体)[）)]/.test(label)) return 'zh-Hans';
  if (/(?:English|英語|英语)(?:\s|[[(（]|$)/i.test(label)) return 'en';
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
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight}-`) ||
    normalizedRight.startsWith(`${normalizedLeft}-`)
  );
}

function hasClosedCaptionMarker(label: string, id: string): boolean {
  return /(?:[\[(（]\s*CC\s*[\])）]|closedcaptions)/i.test(`${label} ${id}`);
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

  button.click();
  await waitUntil(() => isSubtitleMenuOpen(), DOM_TIMEOUT_MS);
  const menu = document.querySelector<HTMLElement>(SUBTITLE_MENU_SELECTOR);
  if (menu === null) throw new Error('Netflix subtitle menu did not open');
  return menu;
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
  return (
    left.contentGeneration === right.contentGeneration &&
    left.clockGeneration === right.clockGeneration
  );
}
