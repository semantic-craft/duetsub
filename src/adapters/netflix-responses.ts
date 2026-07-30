import type { Cue, TrackInfo } from '../core/contracts';
import {
  samePlaybackGeneration,
  type PlaybackGeneration,
} from '../core/lifecycle';
import type { NetflixTtmlResponseMessage } from '../core/messages';
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
  currentGeneration: PlaybackGeneration,
  pending:
    | (NetflixResponseOwner & {
        readonly requestId: string;
        readonly contentIdentity: string;
        readonly armed: boolean;
      })
    | undefined,
  response: Pick<
    NetflixTtmlResponseMessage,
    | 'requestId'
    | 'contentIdentity'
    | 'generation'
    | 'trackId'
    | 'trackKind'
  >,
): NetflixResponseOwner | undefined {
  return (
      pending !== undefined &&
      pending.armed &&
      pending.requestId === response.requestId &&
      pending.contentIdentity === response.contentIdentity &&
      pending.track.id === response.trackId &&
      pending.track.kind === response.trackKind &&
      sameGeneration(pending.generation, currentGeneration) &&
      sameGeneration(response.generation, currentGeneration)
    )
    ? pending
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
  return samePlaybackGeneration(left, right);
}
