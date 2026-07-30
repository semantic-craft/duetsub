import type { Cue } from '../core/contracts';

export const MT_BATCH_SIZE = 8;

export function scheduleTranslationBatches(
  cues: readonly Cue[],
  playheadMs: number,
): Cue[][] {
  const chronological = [...cues].sort((left, right) =>
    left.start - right.start || left.end - right.end
  );
  const batches: Cue[][] = [];
  for (let index = 0; index < chronological.length; index += MT_BATCH_SIZE) {
    batches.push(chronological.slice(index, index + MT_BATCH_SIZE));
  }
  return batches.sort((left, right) =>
    distanceFromBatch(left, playheadMs) -
      distanceFromBatch(right, playheadMs) ||
    left[0]!.start - right[0]!.start
  );
}

function distanceFromBatch(
  batch: readonly Cue[],
  playheadMs: number,
): number {
  const first = batch[0]!;
  const last = batch[batch.length - 1]!;
  if (first.start <= playheadMs && playheadMs < last.end) return 0;
  return Math.min(
    Math.abs(first.start - playheadMs),
    Math.abs(last.end - playheadMs),
  );
}
