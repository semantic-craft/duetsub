import type { TrackInfo } from '../core/contracts';
import type { PlaybackGeneration } from '../core/lifecycle';
import {
  mapMaxTrackResources,
  type MaxTrackMappingInput,
  type MaxTrackResourceMap,
} from './max-track-mapping';

const MAX_BUFFERED_RESPONSES = 32;

export type MaxResponseKind = 'playback-info' | 'manifest' | 'vtt';

export interface MaxResponseObservation {
  readonly responseId: string;
  readonly kind: MaxResponseKind;
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
): MaxResponseInbox {
  return inbox.flatMap((response) => {
    if (sameGeneration(response.generation, generation)) return [response];
    if (
      response.kind !== 'vtt' &&
      response.generation.contentGeneration === generation.contentGeneration
    ) {
      return [{ ...response, generation }];
    }
    return [];
  });
}

export function resolveMaxTrackResources(
  inbox: MaxResponseInbox,
  tracks: readonly TrackInfo[],
  generation: PlaybackGeneration,
  parser?: MaxTrackMappingInput['parser'],
): MaxTrackResourceMap {
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
      if (Object.keys(mapped).length > 0) return mapped;
    }
  }

  return {};
}

function sameGeneration(
  left: PlaybackGeneration,
  right: PlaybackGeneration,
): boolean {
  return left.contentGeneration === right.contentGeneration &&
    left.clockGeneration === right.clockGeneration;
}
