import type { Cue, SiteAdapter, TrackInfo } from '../core/contracts';
import { isDuetSubMessage } from '../core/messages';
import { parseTtml } from '../core/ttml';

const MENU_BUTTON_SELECTOR =
  '#dv-web-player button[aria-label="Subtitles and Audio Menu"]';
const SUBTITLE_GROUP_SELECTOR =
  '#dv-web-player .atvwebplayersdk-subtitle-radio-group';
const SUBTITLE_RADIO_SELECTOR = 'input[type="radio"][name="subtitle"]';
const DOM_TIMEOUT_MS = 8_000;
const RESPONSE_TIMEOUT_MS = 15_000;

interface TrackRequest {
  readonly track: TrackInfo;
  readonly resolve: (cues: Cue[]) => void;
  readonly reject: (error: Error) => void;
}

interface PendingResponse {
  readonly track: TrackInfo;
  readonly radio: HTMLInputElement;
  readonly resolve: (cues: Cue[]) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: number;
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

  #started = false;
  #enumerating = false;
  #batchScheduled = false;
  #batchRunning = false;
  #pending: PendingResponse | undefined;

  start(): void {
    if (!this.#started) {
      this.#started = true;
      window.addEventListener('message', this.#onMessage);
    }
    if (this.#enumerating) return;
    this.#enumerating = true;
    void this.#enumerateTracks().then(
      (tracks) => this.#emitTracks(tracks),
      (error) => {
        console.warn('[DuetSub] Prime track enumeration failed', error);
        this.#emitTracks([]);
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
      this.#requestQueue.push({ track, resolve, reject });
      if (this.#batchScheduled) return;
      this.#batchScheduled = true;
      queueMicrotask(() => {
        this.#batchScheduled = false;
        void this.#drainRequestQueue();
      });
    });
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
      await this.#runAcquisitionBatch(requests);
    }

    this.#batchRunning = false;
  }

  async #runAcquisitionBatch(requests: readonly TrackRequest[]): Promise<void> {
    const button = await waitForMenuButton().catch(() => undefined);
    if (button === undefined) {
      rejectRequests(requests, new Error('Prime subtitle menu unavailable'));
      return;
    }

    const menuWasOpen = isSubtitleMenuOpen();
    let originalId = '';
    let captured = new Map<string, Cue[]>();
    let operationError: unknown;

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
          visibleTrack.label !== track.label
        ) {
          throw new Error(`Prime track DOM handle changed: ${track.id}`);
        }
      }

      const orderedTracks = requestedTracks.toSorted((left, right) =>
        left.id === originalId ? 1 : right.id === originalId ? -1 : 0,
      );

      for (const track of orderedTracks) {
        const cues = await this.#switchAndCapture(track);
        captured.set(track.id, cues);
      }
    } catch (error) {
      operationError = error;
    }

    const restored =
      originalId !== '' &&
      (await restoreOriginalState(button, originalId, menuWasOpen));
    if (!restored) {
      operationError = new Error('Could not restore Prime subtitle state');
    }

    if (operationError !== undefined) {
      captured = new Map();
      rejectRequests(requests, asError(operationError));
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
  ): Promise<Cue[]> {
    let group = await getSubtitleGroup();
    let radio = findRadio(group, track.id);
    if (radio === undefined) throw new Error(`Prime track disappeared: ${track.id}`);

    if (radio.checked) {
      const off = findRadio(group, 'off');
      if (off === undefined) {
        throw new Error('Prime cannot re-request the currently selected track');
      }
      clickRadio(off);
      await waitUntil(() => off.checked, DOM_TIMEOUT_MS);
      group = await getSubtitleGroup();
      radio = findRadio(group, track.id);
      if (radio === undefined) throw new Error(`Prime track disappeared: ${track.id}`);
    }

    const response = this.#armPending(track, radio);
    try {
      clickRadio(radio);
      await waitUntil(() => radio.checked, DOM_TIMEOUT_MS);
      return await response;
    } catch (error) {
      this.#rejectPending(asError(error));
      throw error;
    }
  }

  #armPending(track: TrackInfo, radio: HTMLInputElement): Promise<Cue[]> {
    if (this.#pending !== undefined) {
      throw new Error('Prime response ownership is ambiguous');
    }

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        if (this.#pending?.radio !== radio) return;
        this.#pending = undefined;
        reject(new Error(`Prime TTML response timed out: ${track.id}`));
      }, RESPONSE_TIMEOUT_MS);
      this.#pending = { track, radio, resolve, reject, timeout };
    });
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
      message.direction !== 'main-to-isolated' ||
      message.type !== 'prime-ttml-response'
    ) {
      return;
    }

    const pending = this.#pending;
    if (pending === undefined || !pending.radio.checked) return;

    const cues = parseTtml(message.raw, {
      language: pending.track.language,
      acceptedSourceLanguages: acceptedPrimeTtmlLanguages(
        pending.track.language,
      ),
    });
    if (!isValidCueSet(cues)) return;

    window.clearTimeout(pending.timeout);
    this.#pending = undefined;
    pending.resolve(cues);
  };

  #emitTracks(tracks: TrackInfo[]): void {
    for (const callback of this.#trackCallbacks) callback(tracks);
  }
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
  const label = radio.getAttribute('aria-label')?.trim() ?? '';
  if (radio.id === '' || label === '' || radio.id === 'off') return undefined;

  const language = languageFromRadio(radio.id, label);
  if (language === undefined) return undefined;
  return { id: radio.id, language, source: 'official', label };
}

function languageFromRadio(id: string, label: string): string | undefined {
  const idLanguage = id.match(/^([a-z]{2,3}(?:-[a-z0-9]{2,8})*)_/i)?.[1];
  if (idLanguage !== undefined) {
    try {
      return Intl.getCanonicalLocales(idLanguage)[0];
    } catch {
      // Fall through to the verified accessible label vocabulary.
    }
  }

  if (/^English(?:\s|\[|$)/i.test(label)) return 'en';
  if (/中文[（(](?:繁體|繁体)[）)]/.test(label)) return 'zh-Hant';
  if (/中文[（(](?:簡體|简体)[）)]/.test(label)) return 'zh-Hans';
  return undefined;
}

function uniqueRequestedTracks(requests: readonly TrackRequest[]): TrackInfo[] {
  const result: TrackInfo[] = [];
  for (const { track } of requests) {
    if (!result.some(({ id }) => id === track.id)) result.push(track);
  }
  return result;
}

function acceptedPrimeTtmlLanguages(language: string): readonly string[] {
  if (language.toLowerCase() === 'zh-hant') {
    return ['zh-Hant', 'cmn-Hant', 'zh-TW', 'cmn-TW'];
  }
  return [language];
}

function isValidCueSet(cues: readonly Cue[]): cues is Cue[] {
  return (
    cues.length > 0 &&
    cues.every(
      (cue, index) =>
        Number.isFinite(cue.start) &&
        Number.isFinite(cue.end) &&
        cue.start >= 0 &&
        cue.end > cue.start &&
        cue.text.length > 0 &&
        (index === 0 || cues[index - 1].start <= cue.start),
    )
  );
}

async function restoreOriginalState(
  button: HTMLButtonElement,
  originalId: string,
  menuWasOpen: boolean,
): Promise<boolean> {
  try {
    const group = await getSubtitleGroup();
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
      await ensureSubtitleMenuOpen(button);
    } else if (isSubtitleMenuOpen()) {
      button.click();
      await waitUntil(() => !isSubtitleMenuOpen(), DOM_TIMEOUT_MS);
    }
    return isSubtitleMenuOpen() === menuWasOpen;
  } catch {
    return false;
  }
}

async function ensureSubtitleMenuOpen(
  button: HTMLButtonElement,
): Promise<HTMLElement> {
  const current = document.querySelector<HTMLElement>(SUBTITLE_GROUP_SELECTOR);
  if (current !== null && isVisible(current)) return current;
  button.click();
  await waitUntil(() => isSubtitleMenuOpen(), DOM_TIMEOUT_MS);
  const group = document.querySelector<HTMLElement>(SUBTITLE_GROUP_SELECTOR);
  if (group === null) throw new Error('Prime subtitle menu did not open');
  return group;
}

async function getSubtitleGroup(): Promise<HTMLElement> {
  await waitUntil(
    () => document.querySelector(SUBTITLE_GROUP_SELECTOR) !== null,
    DOM_TIMEOUT_MS,
  );
  const group = document.querySelector<HTMLElement>(SUBTITLE_GROUP_SELECTOR);
  if (group === null) throw new Error('Prime subtitle menu DOM unavailable');
  return group;
}

function isSubtitleMenuOpen(): boolean {
  const group = document.querySelector<HTMLElement>(SUBTITLE_GROUP_SELECTOR);
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
    const video = document.querySelector<HTMLVideoElement>('#dv-web-player video');
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
    () => document.querySelector(MENU_BUTTON_SELECTOR) !== null,
    DOM_TIMEOUT_MS,
  );
  const button = document.querySelector<HTMLButtonElement>(MENU_BUTTON_SELECTOR);
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
