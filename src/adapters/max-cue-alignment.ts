import type { Cue, TrackInfo } from '../core/contracts';

const MIN_UNIQUE_ALIGNMENT_COVERAGE = 0.95;

export function selectMaxEnglishPrimaryTrack(
  tracks: readonly TrackInfo[],
): TrackInfo | undefined {
  const officialEnglish = tracks.filter(
    (track) =>
      track.source === 'official' &&
      (track.language.toLowerCase() === 'en' ||
        track.language.toLowerCase().startsWith('en-')),
  );
  return officialEnglish.find((track) =>
    track.id.toLowerCase().endsWith('-closedcaptions')
  ) ??
    officialEnglish.find((track) =>
      track.id.toLowerCase().endsWith('-subtitles')
    ) ??
    officialEnglish[0];
}

export function alignMaxChineseCuesToEnglish(
  englishCues: readonly Cue[],
  chineseCues: readonly Cue[],
): Cue[] {
  const aligned: Cue[] = [];
  const activeEnglish: Cue[] = [];
  let nextEnglishIndex = 0;
  let uniquelyAlignedCount = 0;

  for (const chineseCue of chineseCues) {
    while (
      nextEnglishIndex < englishCues.length &&
      englishCues[nextEnglishIndex].start <= chineseCue.start
    ) {
      activeEnglish.push(englishCues[nextEnglishIndex]);
      nextEnglishIndex += 1;
    }

    const candidates = activeEnglish.filter(
      (englishCue) => chineseCue.start < englishCue.end,
    );
    activeEnglish.splice(
      0,
      activeEnglish.length,
      ...candidates,
    );
    if (candidates.length !== 1) continue;

    uniquelyAlignedCount += 1;
    aligned.push(
      ...alignChineseCue(
        chineseCue,
        englishCues,
        englishCues.indexOf(candidates[0]),
      ),
    );
  }

  return chineseCues.length > 0 &&
      uniquelyAlignedCount / chineseCues.length >=
        MIN_UNIQUE_ALIGNMENT_COVERAGE
    ? aligned
    : [];
}

function alignChineseCue(
  chineseCue: Cue,
  englishCues: readonly Cue[],
  primaryIndex: number,
): Cue[] {
  const primary = englishCues[primaryIndex];
  const chineseUnits = splitDialogueUnits(chineseCue.text);
  const primaryCapacity = spokenUnitCount(primary.text);
  if (
    primaryCapacity === 0 ||
    chineseUnits.length <= primaryCapacity
  ) {
    return [{
      ...chineseCue,
      start: primary.start,
      end: primary.end,
    }];
  }

  const aligned = [{
    ...chineseCue,
    start: primary.start,
    end: primary.end,
    text: chineseUnits.slice(0, primaryCapacity).join('\n'),
  }];
  let nextEnglishIndex = primaryIndex + 1;

  for (const unit of chineseUnits.slice(primaryCapacity)) {
    while (nextEnglishIndex < englishCues.length) {
      const candidate = englishCues[nextEnglishIndex];
      nextEnglishIndex += 1;
      if (candidate.start >= chineseCue.end) break;
      if (
        chineseCue.start < candidate.end &&
        spokenUnitCount(candidate.text) > 0
      ) {
        aligned.push({
          ...chineseCue,
          start: candidate.start,
          end: candidate.end,
          text: unit,
        });
        break;
      }
    }
  }

  return aligned;
}

function spokenUnitCount(text: string): number {
  return splitDialogueUnits(text).filter(
    (unit) => !/^(?:[-–—]\s*)?\[[^\]]+\]$/.test(unit),
  ).length;
}

function splitDialogueUnits(text: string): string[] {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const units: string[] = [];
  let current = '';

  for (const line of lines) {
    if (
      current !== '' &&
      (/^[-–—]\s*\S/.test(line) ||
        /[.!?。！？…]["'”’)]*$/.test(current))
    ) {
      units.push(current);
      current = line;
    } else {
      current = current === '' ? line : `${current}\n${line}`;
    }
  }
  if (current !== '') units.push(current);
  return units;
}
