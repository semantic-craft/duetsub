import type { Cue, TrackInfo } from '../core/contracts';
import type { PlaybackGeneration } from '../core/lifecycle';
import { parseTtml, type TtmlParserOptions } from '../core/ttml';

const MAX_BUFFERED_RESPONSES = 8;

export interface PrimeTtmlResponseObservation {
  readonly responseId: string;
  readonly trackId: string;
  readonly raw: string;
  readonly generation: PlaybackGeneration;
}

export type PrimeTtmlResponseInbox =
  readonly PrimeTtmlResponseObservation[];

export const EMPTY_PRIME_TTML_INBOX: PrimeTtmlResponseInbox = [];

export function recordPrimeTtmlResponse(
  inbox: PrimeTtmlResponseInbox,
  response: PrimeTtmlResponseObservation,
): PrimeTtmlResponseInbox {
  const withoutDuplicate = inbox.filter(
    ({ responseId }) => responseId !== response.responseId,
  );
  return [...withoutDuplicate, response].slice(-MAX_BUFFERED_RESPONSES);
}

export function retainPrimeTtmlResponsesForGeneration(
  inbox: PrimeTtmlResponseInbox,
  generation: PlaybackGeneration,
): PrimeTtmlResponseInbox {
  return inbox.filter((response) =>
    sameGeneration(response.generation, generation),
  );
}

export function consumePrimeTtmlResponse(
  inbox: PrimeTtmlResponseInbox,
  track: TrackInfo,
  generation: PlaybackGeneration,
  parser?: NonNullable<TtmlParserOptions['parser']>,
): {
  readonly inbox: PrimeTtmlResponseInbox;
  readonly cues?: Cue[];
} {
  const matches = inbox.filter(
    (response) =>
      response.trackId === track.id &&
      sameGeneration(response.generation, generation),
  );
  const remaining = inbox.filter((response) => !matches.includes(response));

  for (const response of matches.toReversed()) {
    const cues = parseTtml(response.raw, {
      language: track.language,
      acceptedSourceLanguages: acceptedPrimeTtmlLanguages(track.language),
      parser,
    });
    if (isValidCueSet(cues)) return { inbox: remaining, cues };
  }

  return { inbox: remaining };
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

function sameGeneration(
  left: PlaybackGeneration,
  right: PlaybackGeneration,
): boolean {
  return (
    left.contentGeneration === right.contentGeneration &&
    left.clockGeneration === right.clockGeneration
  );
}
