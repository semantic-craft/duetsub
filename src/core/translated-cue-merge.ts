import type { Cue } from './contracts';

export function mergeTranslatedCues(
  current: readonly Cue[],
  incoming: readonly Cue[],
): Cue[] {
  const merged = new Map(
    current.map((cue) => [cueKey(cue), cue]),
  );
  for (const cue of incoming) merged.set(cueKey(cue), cue);
  return [...merged.values()].sort((left, right) =>
    left.start - right.start ||
    left.end - right.end
  );
}

function cueKey(cue: Cue): string {
  return `${cue.start}:${cue.end}:${cue.text}`;
}
