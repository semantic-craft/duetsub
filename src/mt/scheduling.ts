import type { Cue } from '../core/contracts';

export const MT_BATCH_SIZE = 8;

export function scheduleTranslationBatches(
  cues: readonly Cue[],
  playheadMs: number,
): Cue[][] {
  const prioritized = [...cues].sort((left, right) => {
    const leftDistance = distanceFromCue(left, playheadMs);
    const rightDistance = distanceFromCue(right, playheadMs);
    return leftDistance - rightDistance || left.start - right.start;
  });
  const batches: Cue[][] = [];
  for (let index = 0; index < prioritized.length; index += MT_BATCH_SIZE) {
    batches.push(prioritized.slice(index, index + MT_BATCH_SIZE));
  }
  return batches;
}

function distanceFromCue(cue: Cue, playheadMs: number): number {
  if (cue.start <= playheadMs && playheadMs < cue.end) return 0;
  return Math.min(
    Math.abs(cue.start - playheadMs),
    Math.abs(cue.end - playheadMs),
  );
}
