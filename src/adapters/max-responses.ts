import type { TrackInfo } from '../core/contracts';
import {
  samePlaybackGeneration,
  type PlaybackGeneration,
} from '../core/lifecycle';
import {
  mapMaxTrackResources,
  readMaxPlaybackManifestUrl,
  sameMaxManifestUrl,
  type MaxTrackMappingInput,
  type MaxTrackResourceMap,
} from './max-track-mapping';

const MAX_BUFFERED_RESPONSES = 32;

export type MaxResponseKind = 'playback-info' | 'manifest' | 'vtt';

export interface MaxResponseObservation {
  readonly responseId: string;
  readonly kind: MaxResponseKind;
  readonly contentIdentity: string;
  readonly url: string;
  readonly raw: string;
  readonly generation: PlaybackGeneration;
}

export type MaxResponseInbox = readonly MaxResponseObservation[];

export const EMPTY_MAX_RESPONSE_INBOX: MaxResponseInbox = [];

export function recordMaxResponse(
  inbox: MaxResponseInbox,
  response: MaxResponseObservation,
): MaxResponseInbox {
  return [
    ...inbox.filter(({ responseId }) => responseId !== response.responseId),
    response,
  ].slice(-MAX_BUFFERED_RESPONSES);
}

export function retainMaxResponsesForGeneration(
  inbox: MaxResponseInbox,
  generation: PlaybackGeneration,
  contentIdentity: string,
  previousManifestUrl?: string,
): MaxResponseInbox {
  return inbox.flatMap((response) => {
    if (response.contentIdentity === contentIdentity) {
      if (sameGeneration(response.generation, generation)) return [response];
      if (response.kind !== 'vtt') {
        return [{ ...response, generation }];
      }
      return [];
    }
    const candidateManifestUrl = manifestUrlForResponse(response);
    if (
      previousManifestUrl !== undefined &&
      candidateManifestUrl !== undefined &&
      !sameMaxManifestUrl(candidateManifestUrl, previousManifestUrl)
    ) {
      return [{ ...response, contentIdentity, generation }];
    }
    return [];
  });
}

export interface MaxTrackResourceResolution {
  readonly resources: MaxTrackResourceMap;
  readonly manifestUrl: string;
}

export function resolveMaxTrackResources(
  inbox: MaxResponseInbox,
  tracks: readonly TrackInfo[],
  generation: PlaybackGeneration,
  parser?: MaxTrackMappingInput['parser'],
): MaxTrackResourceMap {
  return resolveMaxTrackResourceSelection(
    inbox,
    tracks,
    generation,
    parser,
  )?.resources ?? {};
}

export function resolveMaxTrackResourceSelection(
  inbox: MaxResponseInbox,
  tracks: readonly TrackInfo[],
  generation: PlaybackGeneration,
  parser?: MaxTrackMappingInput['parser'],
): MaxTrackResourceResolution | undefined {
  const current = inbox.filter((response) =>
    sameGeneration(response.generation, generation),
  );
  const playbackResponses = current
    .filter(({ kind }) => kind === 'playback-info')
    .toReversed();
  const manifests = current
    .filter(({ kind }) => kind === 'manifest')
    .toReversed();

  for (const playback of playbackResponses) {
    for (const manifest of manifests) {
      const mapped = mapMaxTrackResources({
        tracks,
        playbackInfoRaw: playback.raw,
        manifestUrl: manifest.url,
        manifestRaw: manifest.raw,
        parser,
      });
      if (Object.keys(mapped).length > 0) {
        return { resources: mapped, manifestUrl: manifest.url };
      }
    }
  }

  return undefined;
}

function manifestUrlForResponse(
  response: MaxResponseObservation,
): string | undefined {
  if (response.kind === 'manifest') return response.url;
  if (response.kind === 'playback-info') {
    return readMaxPlaybackManifestUrl(response.raw);
  }
  return undefined;
}

function sameGeneration(
  left: PlaybackGeneration,
  right: PlaybackGeneration,
): boolean {
  return samePlaybackGeneration(left, right);
}
