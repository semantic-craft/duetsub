import type { Cue, TrackInfo } from '../core/contracts';
import type { PlaybackGeneration } from '../core/lifecycle';
import { parseTtml, type TtmlParserOptions } from '../core/ttml';

const MAX_BUFFERED_RESPONSES = 8;

export interface NetflixOwnedTtmlResponse {
  readonly responseId: string;
  readonly trackId: string;
  readonly cues: readonly Cue[];
  readonly generation: PlaybackGeneration;
}

export type NetflixTtmlResponseInbox =
  readonly NetflixOwnedTtmlResponse[];

export const EMPTY_NETFLIX_TTML_INBOX: NetflixTtmlResponseInbox = [];

export interface NetflixResponseOwner {
  readonly track: TrackInfo;
  readonly generation: PlaybackGeneration;
}

export function resolveNetflixResponseOwner(
  generation: PlaybackGeneration,
  pending: NetflixResponseOwner | undefined,
  currentCandidates: readonly TrackInfo[],
): NetflixResponseOwner | undefined {
  if (pending !== undefined && sameGeneration(pending.generation, generation)) {
    return pending;
  }

  const unique = currentCandidates.filter(
    (track, index) =>
      currentCandidates.findIndex(({ id }) => id === track.id) === index,
  );
  return unique.length === 1
    ? bindTrack(generation, unique[0])
    : undefined;
}

export function recordNetflixTtmlResponse(
  inbox: NetflixTtmlResponseInbox,
  response: {
    readonly responseId: string;
    readonly raw: string;
    readonly owner: NetflixResponseOwner;
  },
  parser?: NonNullable<TtmlParserOptions['parser']>,
): NetflixTtmlResponseInbox {
  const cues = parseTtml(response.raw, {
    language: response.owner.track.language,
    acceptedSourceLanguages: acceptedNetflixTtmlLanguages(
      response.owner.track.language,
    ),
    parser,
  });
  if (!isValidCueSet(cues)) return inbox;

  const withoutDuplicate = inbox.filter(
    ({ responseId }) => responseId !== response.responseId,
  );
  return [
    ...withoutDuplicate,
    {
      responseId: response.responseId,
      trackId: response.owner.track.id,
      cues,
      generation: response.owner.generation,
    },
  ].slice(-MAX_BUFFERED_RESPONSES);
}

export function retainNetflixTtmlResponsesForGeneration(
  inbox: NetflixTtmlResponseInbox,
  generation: PlaybackGeneration,
): NetflixTtmlResponseInbox {
  return inbox.filter((response) =>
    sameGeneration(response.generation, generation),
  );
}

export function consumeNetflixTtmlResponse(
  inbox: NetflixTtmlResponseInbox,
  track: TrackInfo,
  generation: PlaybackGeneration,
): {
  readonly inbox: NetflixTtmlResponseInbox;
  readonly cues?: readonly Cue[];
} {
  const matches = inbox.filter(
    (response) =>
      response.trackId === track.id &&
      sameGeneration(response.generation, generation),
  );
  const remaining = inbox.filter((response) => !matches.includes(response));
  return { inbox: remaining, cues: matches.at(-1)?.cues };
}

function bindTrack(
  generation: PlaybackGeneration,
  track: TrackInfo,
): NetflixResponseOwner {
  return {
    generation: {
      contentGeneration: generation.contentGeneration,
      clockGeneration: generation.clockGeneration,
    },
    track,
  };
}

function acceptedNetflixTtmlLanguages(language: string): readonly string[] {
  const normalized = language.toLowerCase();
  if (normalized.startsWith('en-')) return [language, 'en'];
  if (normalized === 'zh-hant' || normalized.startsWith('zh-hant-')) {
    return [language, 'zh-Hant', 'cmn-Hant', 'zh-TW', 'cmn-TW'];
  }
  if (normalized === 'zh-hans' || normalized.startsWith('zh-hans-')) {
    return [language, 'zh-Hans', 'cmn-Hans', 'zh-CN', 'cmn-CN'];
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

function sameGeneration(
  left: PlaybackGeneration,
  right: PlaybackGeneration,
): boolean {
  return (
    left.contentGeneration === right.contentGeneration &&
    left.clockGeneration === right.clockGeneration
  );
}
