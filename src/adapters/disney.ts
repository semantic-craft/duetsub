import type { Cue, SiteAdapter, TrackInfo } from '../core/contracts';
import {
  samePlaybackGeneration,
  type PlaybackGeneration,
} from '../core/lifecycle';
import { isDuetSubMessage } from '../core/messages';
import { parseWebVtt } from '../core/webvtt';
import {
  parseDisneyMasterManifest,
  parseDisneySubtitlePlaylist,
  type DisneyMasterManifest,
  type DisneySubtitleSegment,
  type DisneyTrackResource,
} from './disney-hls';
import { readDisneyContentIdentity } from './disney-location';

const MAX_PLAYLIST_LENGTH = 2_000_000;
const MAX_VTT_LENGTH = 2_000_000;
const FETCH_CONCURRENCY = 8;

type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

interface ManifestObservation {
  readonly responseId: string;
  readonly contentIdentity: string;
  readonly manifest: DisneyMasterManifest;
  readonly generation: PlaybackGeneration;
}

export function createDisneyAdapter(): SiteAdapter {
  return new DisneyAdapter();
}

class DisneyAdapter implements SiteAdapter {
  readonly id = 'disneyplus' as const;

  readonly #trackCallbacks: Array<(tracks: TrackInfo[]) => void> = [];
  readonly #cueCallbacks: Array<(trackId: string, cues: Cue[]) => void> = [];
  readonly #resetCallbacks: Array<
    (reason: 'navigation' | 'episode' | 'seek-flush') => void
  > = [];
  readonly #fetchControllers = new Set<AbortController>();

  #generationBound = false;
  #generation: PlaybackGeneration = {
    contentGeneration: 0,
    clockGeneration: 0,
    selectionGeneration: 0,
  };
  #observation: ManifestObservation | undefined;
  #timeline:
    | { readonly contentIdentity: string; readonly timeMs: number }
    | undefined;

  constructor() {
    window.addEventListener('message', this.#onMessage);
  }

  start(): void {
    const tracks = this.#currentManifest()?.tracks;
    if (tracks === undefined) return;
    for (const callback of this.#trackCallbacks) callback([...tracks]);
  }

  onTracks(cb: (tracks: TrackInfo[]) => void): void {
    this.#trackCallbacks.push(cb);
  }

  onCues(cb: (trackId: string, cues: Cue[]) => void): void {
    this.#cueCallbacks.push(cb);
  }

  async fetchTrack(track: TrackInfo): Promise<Cue[]> {
    const generation = this.#generation;
    const manifest = this.#currentManifest();
    const resource = manifest?.resources[track.id];
    if (
      resource === undefined ||
      resource.track.language !== track.language ||
      resource.track.label !== track.label ||
      resource.track.kind !== track.kind ||
      resource.track.source !== 'official'
    ) {
      throw new Error(`Disney+ track is not authoritative: ${track.id}`);
    }

    const controller = new AbortController();
    this.#fetchControllers.add(controller);
    try {
      const cues = await fetchDisneyTrackResource(
        resource,
        controller.signal,
        (input, init) => fetch(input, init),
      );
      if (!sameGeneration(this.#generation, generation)) {
        throw new Error('Disney+ track response became stale');
      }
      for (const callback of this.#cueCallbacks) callback(track.id, cues);
      return cues;
    } finally {
      this.#fetchControllers.delete(controller);
    }
  }

  getPlaybackTimeMs(): number | undefined {
    const contentIdentity = readDisneyContentIdentity(window.location.href);
    const timeline = this.#timeline;
    return timeline !== undefined && timeline.contentIdentity === contentIdentity
      ? timeline.timeMs
      : undefined;
  }

  bindGeneration(generation: PlaybackGeneration): void {
    if (!this.#generationBound) {
      this.#generationBound = true;
      this.#generation = generation;
      if (this.#observation !== undefined) {
        this.#observation = { ...this.#observation, generation };
      }
      return;
    }
    if (sameGeneration(this.#generation, generation)) return;

    const contentChanged =
      this.#generation.contentGeneration !== generation.contentGeneration;
    this.#generation = generation;
    for (const controller of this.#fetchControllers) controller.abort();
    if (contentChanged) {
      this.#observation = undefined;
      this.#timeline = undefined;
    } else if (this.#observation !== undefined) {
      this.#observation = { ...this.#observation, generation };
    }
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
      (message.type !== 'disney-manifest' &&
        message.type !== 'disney-timeline')
    ) {
      return;
    }
    const contentIdentity = readDisneyContentIdentity(window.location.href);
    if (contentIdentity !== message.contentIdentity) return;
    if (message.type === 'disney-timeline') {
      this.#timeline = { contentIdentity, timeMs: message.timeMs };
      return;
    }
    const manifest = parseDisneyMasterManifest(message.raw, message.url);
    if (manifest === undefined) return;
    this.#observation = {
      responseId: message.responseId,
      contentIdentity,
      manifest,
      generation: this.#generation,
    };
    for (const callback of this.#trackCallbacks) {
      callback([...manifest.tracks]);
    }
  };

  #currentManifest(): DisneyMasterManifest | undefined {
    const contentIdentity = readDisneyContentIdentity(window.location.href);
    return this.#observation !== undefined &&
        this.#observation.contentIdentity === contentIdentity &&
        sameGeneration(this.#observation.generation, this.#generation)
      ? this.#observation.manifest
      : undefined;
  }
}

export async function fetchDisneyTrackResource(
  resource: DisneyTrackResource,
  signal: AbortSignal,
  fetcher: FetchLike,
): Promise<Cue[]> {
  const playlistResponse = await fetcher(resource.playlistUrl, {
    credentials: 'omit',
    signal,
  });
  if (!playlistResponse.ok) {
    throw new Error(`Disney+ subtitle playlist failed: ${playlistResponse.status}`);
  }
  const playlistRaw = await playlistResponse.text();
  if (playlistRaw.length === 0 || playlistRaw.length > MAX_PLAYLIST_LENGTH) {
    throw new Error('Disney+ subtitle playlist failed format validation');
  }
  const segments = parseDisneySubtitlePlaylist(
    playlistRaw,
    playlistResponse.url || resource.playlistUrl,
  );
  if (segments === undefined) {
    throw new Error('Disney+ complete subtitle timeline unavailable');
  }

  const parsed = await fetchSegments(
    segments,
    resource.track.language,
    signal,
    fetcher,
  );
  const cues = normalizeCues(parsed.flat());
  if (cues.length === 0) {
    throw new Error(`Disney+ returned an empty official track: ${resource.track.id}`);
  }
  return cues;
}

async function fetchSegments(
  segments: readonly DisneySubtitleSegment[],
  language: string,
  signal: AbortSignal,
  fetcher: FetchLike,
): Promise<readonly Cue[][]> {
  const result: Cue[][] = Array.from({ length: segments.length }, () => []);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < segments.length) {
      const index = nextIndex;
      nextIndex += 1;
      const segment = segments[index];
      const response = await fetcher(segment.url, {
        credentials: 'omit',
        signal,
      });
      if (!response.ok) {
        throw new Error(`Disney+ VTT segment failed: ${response.status}`);
      }
      const raw = await response.text();
      if (
        raw.length === 0 ||
        raw.length > MAX_VTT_LENGTH ||
        !raw.replace(/^\uFEFF/, '').startsWith('WEBVTT')
      ) {
        throw new Error('Disney+ VTT response failed format validation');
      }
      const cues = parseWebVtt(raw, {
        language,
        presentationAnchor: segment.presentationAnchor,
      });
      if (cues.length === 0 && raw.includes('-->')) {
        throw new Error('Disney+ VTT segment could not be normalized');
      }
      result[index] = cues;
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(FETCH_CONCURRENCY, segments.length) },
      worker,
    ),
  );
  return result;
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
        (candidate) =>
          candidate.start === cue.start &&
          candidate.end === cue.end &&
          candidate.text === cue.text,
      )
    ) {
      continue;
    }
    result.push(cue);
  }
  return result;
}

function sameGeneration(
  left: PlaybackGeneration,
  right: PlaybackGeneration,
): boolean {
  return samePlaybackGeneration(left, right);
}
