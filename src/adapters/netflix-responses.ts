import type { Cue, TrackInfo } from '../core/contracts';
import {
  samePlaybackGeneration,
  type PlaybackGeneration,
} from '../core/lifecycle';
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

export function resolveNetflixUnownedResponseGeneration(
  observedContentIdentity: string | undefined,
  _observedGeneration: PlaybackGeneration,
  currentContentIdentity: string | undefined,
  currentGeneration: PlaybackGeneration,
): PlaybackGeneration | undefined {
  if (
    observedContentIdentity === undefined ||
    currentContentIdentity === undefined ||
    observedContentIdentity !== currentContentIdentity
  ) {
    return undefined;
  }
  return {
    contentGeneration: currentGeneration.contentGeneration,
    clockGeneration: currentGeneration.clockGeneration,
    selectionGeneration: currentGeneration.selectionGeneration ?? 0,
  };
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
  return recordOwnedNetflixTtmlResponse(
    inbox,
    response,
    parser,
    false,
    false,
  );
}

export function claimNetflixTtmlResponseForSelectedTrack(
  inbox: NetflixTtmlResponseInbox,
  responses: readonly {
    readonly responseId: string;
    readonly raw: string;
  }[],
  owner: NetflixResponseOwner,
  parser?: NonNullable<TtmlParserOptions['parser']>,
): {
  readonly inbox: NetflixTtmlResponseInbox;
  readonly claimedResponseId: string | undefined;
} {
  const matches = responses.flatMap((response) =>
    recordOwnedNetflixTtmlResponse(
      EMPTY_NETFLIX_TTML_INBOX,
      { ...response, owner },
      parser,
      true,
      true,
    ),
  );
  if (matches.length !== 1) {
    return { inbox, claimedResponseId: undefined };
  }

  const claimed = matches[0];
  return {
    inbox: [
      ...inbox.filter(
        ({ responseId }) => responseId !== claimed.responseId,
      ),
      claimed,
    ].slice(-MAX_BUFFERED_RESPONSES),
    claimedResponseId: claimed.responseId,
  };
}

function recordOwnedNetflixTtmlResponse(
  inbox: NetflixTtmlResponseInbox,
  response: {
    readonly responseId: string;
    readonly raw: string;
    readonly owner: NetflixResponseOwner;
  },
  parser: NonNullable<TtmlParserOptions['parser']> | undefined,
  allowMissingSourceLanguage: boolean,
  allowUnderspecifiedSourceLanguage: boolean,
): NetflixTtmlResponseInbox {
  const cues = parseTtml(response.raw, {
    language: response.owner.track.language,
    acceptedSourceLanguages: acceptedNetflixTtmlLanguages(
      response.owner.track.language,
    ),
    allowMissingSourceLanguage,
    allowUnderspecifiedSourceLanguage,
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

export function recordNetflixTtmlResponseForUniqueTrack(
  inbox: NetflixTtmlResponseInbox,
  response: {
    readonly responseId: string;
    readonly raw: string;
    readonly generation: PlaybackGeneration;
    readonly candidates: readonly TrackInfo[];
  },
  parser?: NonNullable<TtmlParserOptions['parser']>,
): NetflixTtmlResponseInbox {
  const candidates = response.candidates.filter(
    (track, index) =>
      response.candidates.findIndex(({ id }) => id === track.id) === index,
  );
  const matches = candidates.flatMap((track) =>
    recordNetflixTtmlResponse(
      EMPTY_NETFLIX_TTML_INBOX,
      {
        responseId: response.responseId,
        raw: response.raw,
        owner: { track, generation: response.generation },
      },
      parser,
    ),
  );
  if (matches.length !== 1) return inbox;

  return [
    ...inbox.filter(
      ({ responseId }) => responseId !== response.responseId,
    ),
    matches[0],
  ].slice(-MAX_BUFFERED_RESPONSES);
}

export function claimNetflixTtmlResponseForPending(
  inbox: NetflixTtmlResponseInbox,
  responses: readonly {
    readonly responseId: string;
    readonly raw: string;
  }[],
  owner: NetflixResponseOwner,
  parser?: NonNullable<TtmlParserOptions['parser']>,
): {
  readonly inbox: NetflixTtmlResponseInbox;
  readonly claimedResponseId: string | undefined;
} {
  const matches = responses.flatMap((response) =>
    recordNetflixTtmlResponse(
      EMPTY_NETFLIX_TTML_INBOX,
      {
        ...response,
        owner,
      },
      parser,
    ),
  );
  if (matches.length !== 1) {
    return { inbox, claimedResponseId: undefined };
  }

  const claimed = matches[0];
  return {
    inbox: [
      ...inbox.filter(
        ({ responseId }) => responseId !== claimed.responseId,
      ),
      claimed,
    ].slice(-MAX_BUFFERED_RESPONSES),
    claimedResponseId: claimed.responseId,
  };
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
      selectionGeneration: generation.selectionGeneration ?? 0,
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
  return samePlaybackGeneration(left, right);
}
