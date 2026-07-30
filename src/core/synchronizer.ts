import type { Cue } from './contracts';

export interface SynchronizerState {
  readonly timeMs: number;
  readonly top: TrackCursor;
  readonly bottom: TrackCursor;
}

interface TrackCursor {
  readonly nextIndex: number;
  readonly activeIndices: readonly number[];
}

export interface SynchronizerResult {
  readonly topActive: readonly Cue[];
  readonly bottomActive: readonly Cue[];
  readonly state: SynchronizerState;
}

export function synchronizeCues(
  topCues: readonly Cue[],
  bottomCues: readonly Cue[],
  timeMs: number,
  previous?: SynchronizerState,
): SynchronizerResult {
  const canAdvance = previous !== undefined && timeMs >= previous.timeMs;
  const top = canAdvance
    ? advanceCursor(topCues, timeMs, previous.top)
    : locateCursor(topCues, timeMs);
  const bottom = canAdvance
    ? advanceCursor(bottomCues, timeMs, previous.bottom)
    : locateCursor(bottomCues, timeMs);

  return {
    topActive: top.activeIndices.map((index) => topCues[index]),
    bottomActive: bottom.activeIndices.map((index) => bottomCues[index]),
    state: { timeMs, top, bottom },
  };
}

function locateCursor(cues: readonly Cue[], timeMs: number): TrackCursor {
  const nextIndex = upperBoundStart(cues, timeMs);
  const activeIndices: number[] = [];

  for (let index = 0; index < nextIndex; index += 1) {
    if (timeMs < cues[index].end) activeIndices.push(index);
  }

  return { nextIndex, activeIndices };
}

function advanceCursor(
  cues: readonly Cue[],
  timeMs: number,
  cursor: TrackCursor,
): TrackCursor {
  const activeIndices = cursor.activeIndices.filter(
    (index) => timeMs < cues[index].end,
  );
  let nextIndex = cursor.nextIndex;

  while (nextIndex < cues.length && cues[nextIndex].start <= timeMs) {
    if (timeMs < cues[nextIndex].end) activeIndices.push(nextIndex);
    nextIndex += 1;
  }

  return { nextIndex, activeIndices };
}

function upperBoundStart(cues: readonly Cue[], timeMs: number): number {
  let low = 0;
  let high = cues.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (cues[middle].start <= timeMs) low = middle + 1;
    else high = middle;
  }

  return low;
}
