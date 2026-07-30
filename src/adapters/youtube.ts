import type { Cue, SiteAdapter, TrackInfo } from '../core/contracts';
import {
  samePlaybackGeneration,
  type PlaybackGeneration,
} from '../core/lifecycle';
import {
  isDuetSubMessage,
  postDuetSubMessage,
  youtubePlayerCommand,
  type MessageJsonValue,
  type YoutubePlayerOperation,
} from '../core/messages';
import { parseYoutubeJson3 } from '../core/youtube-json3';
import {
  canRestoreYoutubeCaptionState,
  decideYoutubeEmptyBodyRecovery,
  isYoutubeCaptionStateRestored,
  readRestorableYoutubeCaptionState,
  type RestorableYoutubeCaptionState,
} from './youtube-priming';
import {
  cloneYoutubeTimedTextRequest,
  sameYoutubeRequestContext,
  type YoutubeBoundTrackHandle,
  type YoutubeRequestContext,
  type YoutubeTimedTextRequestSnapshot,
} from './youtube-request';
import {
  parseYoutubeCreatorOfficialCaptionTracks,
  type YoutubeTrackHandle,
} from './youtube-tracks';
import { youtubeVideoIdFromUrl } from './youtube-url';

const COMMAND_TIMEOUT_MS = 5_000;
const POT_TIMEOUT_MS = 8_000;
export const YOUTUBE_MANUAL_CAPTION_MESSAGE =
  '請先手動開啟一次 YouTube 字幕，再重試 DuetSub';

interface PendingCommand {
  readonly context: YoutubeRequestContext;
  readonly operation: YoutubePlayerOperation;
  readonly allowStaleGeneration: boolean;
  readonly resolve: (value: MessageJsonValue | undefined) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: number;
}

interface PendingPot {
  readonly context: YoutubeRequestContext;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timeout: number;
}

export function createYoutubeAdapter(): SiteAdapter {
  return new YoutubeAdapter();
}

class YoutubeAdapter implements SiteAdapter {
  readonly id = 'youtube' as const;

  readonly #trackCallbacks: Array<(tracks: TrackInfo[]) => void> = [];
  readonly #cueCallbacks: Array<(trackId: string, cues: Cue[]) => void> = [];
  readonly #resetCallbacks: Array<
    (reason: 'navigation' | 'episode' | 'seek-flush') => void
  > = [];
  readonly #commands = new Map<string, PendingCommand>();
  readonly #pendingPot = new Set<PendingPot>();

  #generation: PlaybackGeneration = {
    contentGeneration: 0,
    clockGeneration: 0,
    selectionGeneration: 0,
  };
  #videoId: string | undefined;
  #tracks: TrackInfo[] = [];
  #handles = new Map<string, YoutubeBoundTrackHandle>();
  #capturedRequest: YoutubeTimedTextRequestSnapshot | undefined;
  #started = false;
  #navigationStarted = false;
  #rePrimeUsed = false;
  #commandSequence = 0;
  #captionMutationTail: Promise<void> = Promise.resolve();
  #priming: {
    readonly context: YoutubeRequestContext;
    readonly promise: Promise<void>;
  } | undefined;

  constructor() {
    this.#videoId = currentWatchVideoId();
    window.addEventListener('message', this.#onMessage);
    document.addEventListener('yt-navigate-start', this.#onNavigateStart);
    document.addEventListener('yt-navigate-finish', this.#onNavigateFinish);
  }

  start(): void {
    this.#started = true;
    const videoId = currentWatchVideoId();
    if (videoId === undefined) {
      this.#emitTracks([]);
      return;
    }
    if (this.#videoId !== videoId) this.#resetPrivateState(videoId);
    const context = this.#context();
    if (context === undefined) {
      this.#emitTracks([]);
      return;
    }
    if (
      this.#tracks.length > 0 &&
      Array.from(this.#handles.values()).every((bound) =>
        sameYoutubeRequestContext(bound.context, context)
      )
    ) {
      this.#emitTracks(this.#tracks);
      return;
    }
    void this.#sendCommand(context, 'read-player-captions').catch(() => {
      if (this.#isCurrent(context)) this.#emitTracks([]);
    });
  }

  onTracks(cb: (tracks: TrackInfo[]) => void): void {
    this.#trackCallbacks.push(cb);
  }

  onCues(cb: (trackId: string, cues: Cue[]) => void): void {
    this.#cueCallbacks.push(cb);
  }

  async fetchTrack(track: TrackInfo): Promise<Cue[]> {
    const context = this.#context();
    const boundHandle = this.#handles.get(track.id);
    if (
      context === undefined ||
      boundHandle === undefined ||
      !sameYoutubeRequestContext(boundHandle.context, context) ||
      boundHandle.handle.videoId !== context.videoId
    ) {
      throw new Error('YouTube track handle became stale');
    }

    for (;;) {
      const snapshot = await this.#ensureCapturedRequest(
        context,
        boundHandle.handle,
      );
      const response = await fetch(
        cloneYoutubeTimedTextRequest(snapshot, boundHandle, context),
      );
      if (!this.#isCurrent(context)) {
        throw new Error('YouTube timedtext response became stale');
      }
      if (!response.ok) {
        throw new Error(`YouTube timedtext failed with HTTP ${response.status}`);
      }
      const raw = await response.text();
      if (!this.#isCurrent(context)) {
        throw new Error('YouTube timedtext response became stale');
      }
      if (raw.length > 0) {
        const cues = parseYoutubeJson3(raw, track.language);
        if (cues.length === 0) {
          throw new Error('YouTube json3 response had no usable cues');
        }
        for (const callback of this.#cueCallbacks) callback(track.id, cues);
        return cues;
      }

      const priming = this.#priming !== undefined &&
          sameYoutubeRequestContext(this.#priming.context, context)
        ? this.#priming
        : undefined;
      const recovery = decideYoutubeEmptyBodyRecovery({
        rePrimeUsed: this.#rePrimeUsed,
        requestIsCurrent: this.#capturedRequest === snapshot,
        rePrimeInFlight: priming !== undefined,
      });
      if (recovery === 'retry-current') continue;
      if (recovery === 'await-reprime') {
        await priming?.promise;
        continue;
      }
      if (recovery === 'fail-closed') {
        throw new Error('YouTube POT remained invalid after one re-prime');
      }
      this.#rePrimeUsed = true;
      if (this.#capturedRequest === snapshot) {
        this.#capturedRequest = undefined;
      }
      await this.#primeForPot(context, boundHandle.handle);
    }
  }

  bindGeneration(generation: PlaybackGeneration): void {
    if (samePlaybackGeneration(generation, this.#generation)) return;
    this.#generation = generation;
    this.#tracks = [];
    this.#handles.clear();
    this.#invalidateGeneration(false);
  }

  onReset(
    cb: (reason: 'navigation' | 'episode' | 'seek-flush') => void,
  ): void {
    this.#resetCallbacks.push(cb);
  }

  async #ensureCapturedRequest(
    context: YoutubeRequestContext,
    handle: YoutubeTrackHandle,
  ): Promise<YoutubeTimedTextRequestSnapshot> {
    if (
      this.#capturedRequest !== undefined &&
      sameYoutubeRequestContext(this.#capturedRequest.context, context)
    ) {
      return this.#capturedRequest;
    }
    await this.#primeForPot(context, handle);
    if (
      this.#capturedRequest === undefined ||
      !sameYoutubeRequestContext(this.#capturedRequest.context, context)
    ) {
      throw manualCaptionError();
    }
    return this.#capturedRequest;
  }

  #primeForPot(
    context: YoutubeRequestContext,
    handle: YoutubeTrackHandle,
  ): Promise<void> {
    if (
      this.#priming !== undefined &&
      sameYoutubeRequestContext(this.#priming.context, context)
    ) {
      return this.#priming.promise;
    }
    const operation = this.#captionMutationTail
      .catch(() => undefined)
      .then(() => {
        if (!this.#isCurrent(context)) {
          throw new Error('YouTube POT priming became stale');
        }
        return this.#runPriming(context, handle);
      });
    this.#captionMutationTail = operation.catch(() => undefined);
    const promise = operation.finally(() => {
      if (this.#priming?.promise === promise) this.#priming = undefined;
    });
    this.#priming = { context, promise };
    return promise;
  }

  async #runPriming(
    context: YoutubeRequestContext,
    handle: YoutubeTrackHandle,
  ): Promise<void> {
    const rawState = await this.#sendCommand(context, 'read-caption-state');
    const original = readRestorableYoutubeCaptionState(rawState);
    if (original === undefined) throw manualCaptionError();

    let mutationAttempted = false;
    let operationError: unknown;
    let pot: Promise<void> | undefined;
    try {
      mutationAttempted = true;
      await this.#sendCommand(context, 'load-captions');
      if (original.enabled) {
        await this.#sendCommand(context, 'set-caption-track', {});
      }
      pot = this.#waitForPot(context);
      mutationAttempted = true;
      await this.#sendCommand(
        context,
        'set-caption-track',
        playerTrackOption(handle),
      );
      await pot;
    } catch (error) {
      void pot?.catch(() => undefined);
      this.#rejectPotForContext(context, asError(error));
      operationError = error;
    }

    let restored = !mutationAttempted;
    if (
      mutationAttempted &&
      canRestoreYoutubeCaptionState(
        context.videoId,
        currentWatchVideoId(),
      )
    ) {
      restored = await this.#restoreCaptionState(context, original);
    }
    if (!restored) {
      this.#capturedRequest = undefined;
      throw manualCaptionError();
    }
    if (operationError !== undefined) throw operationError;
    if (!this.#isCurrent(context)) {
      throw new Error('YouTube POT priming became stale');
    }
  }

  async #restoreCaptionState(
    context: YoutubeRequestContext,
    original: RestorableYoutubeCaptionState,
  ): Promise<boolean> {
    try {
      await this.#sendCommand(
        context,
        'set-caption-track',
        original.track as MessageJsonValue,
        true,
      );
      const observed = await this.#sendCommand(
        context,
        'read-caption-state',
        undefined,
        true,
      );
      return isYoutubeCaptionStateRestored(original, observed);
    } catch {
      return false;
    }
  }

  #waitForPot(context: YoutubeRequestContext): Promise<void> {
    if (
      this.#capturedRequest !== undefined &&
      sameYoutubeRequestContext(this.#capturedRequest.context, context)
    ) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const pending: PendingPot = {
        context,
        resolve: () => {
          window.clearTimeout(pending.timeout);
          this.#pendingPot.delete(pending);
          resolve();
        },
        reject: (error) => {
          window.clearTimeout(pending.timeout);
          this.#pendingPot.delete(pending);
          reject(error);
        },
        timeout: window.setTimeout(() => {
          pending.reject(manualCaptionError());
        }, POT_TIMEOUT_MS),
      };
      this.#pendingPot.add(pending);
    });
  }

  #rejectPotForContext(
    context: YoutubeRequestContext,
    error: Error,
  ): void {
    for (const pending of Array.from(this.#pendingPot)) {
      if (sameYoutubeRequestContext(pending.context, context)) {
        pending.reject(error);
      }
    }
  }

  #sendCommand(
    context: YoutubeRequestContext,
    operation: YoutubePlayerOperation,
    value?: MessageJsonValue,
    allowStaleGeneration = false,
  ): Promise<MessageJsonValue | undefined> {
    if (
      allowStaleGeneration
        ? currentWatchVideoId() !== context.videoId
        : !this.#isCurrent(context)
    ) {
      return Promise.reject(new Error('YouTube player command became stale'));
    }
    const requestId = `youtube-${Date.now()}-${++this.#commandSequence}`;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.#commands.delete(requestId);
        reject(new Error(`YouTube player command timed out: ${operation}`));
      }, COMMAND_TIMEOUT_MS);
      this.#commands.set(requestId, {
        context,
        operation,
        allowStaleGeneration,
        resolve,
        reject,
        timeout,
      });
      postDuetSubMessage(
        youtubePlayerCommand(
          requestId,
          context.videoId,
          context.generation,
          operation,
          value,
        ),
      );
    });
  }

  readonly #onMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== window || !isDuetSubMessage(event.data)) return;
    const message = event.data;
    if (
      message.direction !== 'main-to-isolated' ||
      message.siteId !== 'youtube'
    ) {
      return;
    }

    if (message.type === 'youtube-player-command-result') {
      const pending = this.#commands.get(message.requestId);
      if (
        pending === undefined ||
        pending.operation !== message.operation ||
        message.videoId !== pending.context.videoId ||
        !samePlaybackGeneration(
          message.generation,
          pending.context.generation,
        )
      ) {
        return;
      }
      window.clearTimeout(pending.timeout);
      this.#commands.delete(message.requestId);
      const contextAccepted = pending.allowStaleGeneration
        ? currentWatchVideoId() === pending.context.videoId
        : this.#isCurrent(pending.context);
      if (!contextAccepted || !message.ok) {
        pending.reject(
          new Error(message.error ?? 'YouTube player command failed'),
        );
      } else {
        pending.resolve(message.value);
      }
      return;
    }
    if (
      message.type !== 'youtube-captions' &&
      message.type !== 'youtube-timedtext-request'
    ) {
      return;
    }

    const context = this.#context();
    if (
      context === undefined ||
      message.videoId !== context.videoId ||
      currentWatchVideoId() !== context.videoId
    ) {
      return;
    }

    if (message.type === 'youtube-captions') {
      const candidates = parseYoutubeCreatorOfficialCaptionTracks(
        message.captions,
        message.videoId,
      );
      this.#tracks = candidates.map(({ track }) => track);
      this.#handles = new Map(
        candidates.map(({ track, handle }) => [
          track.id,
          { context, handle },
        ]),
      );
      if (this.#started) this.#emitTracks(this.#tracks);
      return;
    }

    if (message.type === 'youtube-timedtext-request') {
      const requestContext = {
        videoId: message.videoId,
        generation: message.generation,
      };
      if (!sameYoutubeRequestContext(requestContext, context)) return;
      this.#capturedRequest = {
        context: requestContext,
        ...message.request,
      };
      for (const pending of Array.from(this.#pendingPot)) {
        if (sameYoutubeRequestContext(pending.context, context)) {
          pending.resolve();
        }
      }
    }
  };

  readonly #onNavigateStart = () => {
    this.#navigationStarted = true;
    this.#resetPrivateState(undefined);
    for (const callback of this.#resetCallbacks) callback('navigation');
  };

  readonly #onNavigateFinish = () => {
    const videoId = currentWatchVideoId();
    if (!this.#navigationStarted && videoId !== this.#videoId) {
      for (const callback of this.#resetCallbacks) callback('navigation');
    }
    this.#navigationStarted = false;
    this.#resetPrivateState(videoId);
    if (this.#started && videoId !== undefined) this.start();
  };

  #resetPrivateState(videoId: string | undefined): void {
    const videoChanged = this.#videoId !== videoId;
    this.#videoId = videoId;
    this.#tracks = [];
    this.#handles.clear();
    this.#invalidateGeneration(videoChanged);
  }

  #invalidateGeneration(videoChanged: boolean): void {
    this.#capturedRequest = undefined;
    this.#priming = undefined;
    this.#rePrimeUsed = false;
    if (videoChanged) {
      for (const [requestId, pending] of this.#commands) {
        window.clearTimeout(pending.timeout);
        pending.reject(new Error('YouTube player command became stale'));
        this.#commands.delete(requestId);
      }
    }
    for (const pending of Array.from(this.#pendingPot)) {
      pending.reject(new Error('YouTube POT request became stale'));
    }
  }

  #context(): YoutubeRequestContext | undefined {
    return this.#videoId === undefined
      ? undefined
      : {
          videoId: this.#videoId,
          generation: {
            contentGeneration: this.#generation.contentGeneration,
            clockGeneration: this.#generation.clockGeneration,
            selectionGeneration: this.#generation.selectionGeneration ?? 0,
          },
        };
  }

  #isCurrent(context: YoutubeRequestContext): boolean {
    const current = this.#context();
    return current !== undefined &&
      currentWatchVideoId() === current.videoId &&
      sameYoutubeRequestContext(current, context);
  }

  #emitTracks(tracks: TrackInfo[]): void {
    for (const callback of this.#trackCallbacks) callback(tracks);
  }
}

function playerTrackOption(
  handle: YoutubeTrackHandle,
): { readonly [key: string]: MessageJsonValue } {
  return {
    languageCode: handle.languageCode,
    ...(handle.kind === undefined ? {} : { kind: handle.kind }),
    ...(handle.trackName === '' ? {} : { name: handle.trackName }),
  };
}

function currentWatchVideoId(): string | undefined {
  return youtubeVideoIdFromUrl(window.location.href);
}

function manualCaptionError(): Error {
  return new Error(YOUTUBE_MANUAL_CAPTION_MESSAGE);
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
