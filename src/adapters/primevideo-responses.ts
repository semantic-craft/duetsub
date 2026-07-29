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

export function alignPrimeChineseCuesToEnglish(
  englishCues: readonly Cue[],
  chineseCues: readonly Cue[],
): Cue[] {
  return chineseCues.filter((chineseCue) =>
    englishCues.some(
      (englishCue) =>
        englishCue.start < chineseCue.end &&
        chineseCue.start < englishCue.end,
    ),
  );
}

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
  fallbackTimelineOffsetMs?: number,
): {
  readonly inbox: PrimeTtmlResponseInbox;
  readonly cues?: Cue[];
} {
  const matches = inbox.filter(
    (response) =>
      response.trackId === track.id &&
      sameGeneration(response.generation, generation),
  );
  if (fallbackTimelineOffsetMs === undefined) return { inbox };

  for (const response of matches.toReversed()) {
    const cues = parsePrimeTtmlPayload(response.raw, track, parser).map(
      (cue) => ({
        ...cue,
        start: cue.start + fallbackTimelineOffsetMs,
        end: cue.end + fallbackTimelineOffsetMs,
      }),
    );
    if (isValidCueSet(cues)) {
      return {
        inbox: inbox.filter((candidate) => !matches.includes(candidate)),
        cues,
      };
    }
  }

  return { inbox };
}

function acceptedPrimeTtmlLanguages(language: string): readonly string[] {
  if (language.toLowerCase() === 'zh-hant') {
    return ['zh-Hant', 'cmn-Hant', 'zh-TW', 'cmn-TW'];
  }
  return [language];
}

function parsePrimeTtmlPayload(
  raw: string,
  track: TrackInfo,
  parser: NonNullable<TtmlParserOptions['parser']> | undefined,
): Cue[] {
  const cues = extractTtmlDocuments(raw)
    .flatMap((document) =>
      parseTtml(document, {
        language: track.language,
        acceptedSourceLanguages: acceptedPrimeTtmlLanguages(track.language),
        parser,
      }),
    )
    .flatMap((cue) => normalizePrimeCue(cue, track));
  const unique = new Map<string, Cue>();
  for (const cue of cues) {
    const key =
      `${cue.start}\u0000${cue.end}\u0000${cue.text}\u0000` +
      `${cue.language}\u0000${cue.position ?? ''}`;
    unique.set(key, cue);
  }
  return [...unique.values()].toSorted(
    (left, right) => left.start - right.start || left.end - right.end,
  );
}

function normalizePrimeCue(cue: Cue, track: TrackInfo): Cue[] {
  if (
    !track.language.toLowerCase().startsWith('en') ||
    !/\[CC\]/i.test(track.label)
  ) {
    return [cue];
  }
  if (/[♪♫]/u.test(cue.text)) return [];

  const text = cue.text
    .split('\n')
    .map((line) => line.replace(/\[[^\]\r\n]+\]/gu, '').trim())
    .filter((line) => line !== '' && !/^[-–—\s]*$/u.test(line))
    .join('\n')
    .trim();
  return text === '' ? [] : [{ ...cue, text }];
}

function extractTtmlDocuments(raw: string): string[] {
  const documents: string[] = [];
  let cursor = 0;

  while (cursor < raw.length) {
    const rootStart = raw.indexOf('<tt', cursor);
    if (rootStart < 0) break;
    const declarationStart = raw.lastIndexOf('<?xml', rootStart);
    const start =
      declarationStart >= cursor && declarationStart < rootStart
        ? declarationStart
        : rootStart;
    const rootEnd = raw.indexOf('</tt>', rootStart);
    if (rootEnd < 0) break;
    const end = rootEnd + '</tt>'.length;
    documents.push(raw.slice(start, end));
    cursor = end;
  }

  return documents;
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
