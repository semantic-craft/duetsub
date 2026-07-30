import type { Cue, TrackInfo } from '../core/contracts';
import {
  isMaxEnglishTraditionalChineseLanguagePair,
} from '../core/official-pair-selection';

const MIN_UNIQUE_ALIGNMENT_COVERAGE = 0.95;
const MAX_CHINESE_LEAD_MS = 250;

export type MaxOfficialPairCueResolution =
  | {
      readonly kind: 'ready';
      readonly policy:
        | 'original-timing'
        | 'english-cc-traditional-chinese';
      readonly topCues: readonly Cue[];
      readonly bottomCues: readonly Cue[];
    }
  | {
      readonly kind: 'unavailable';
      readonly reason: 'alignment-coverage';
    };

export function resolveMaxOfficialPairCues(input: {
  readonly top: TrackInfo;
  readonly bottom: TrackInfo;
  readonly topCues: readonly Cue[];
  readonly bottomCues: readonly Cue[];
}): MaxOfficialPairCueResolution {
  if (!usesVerifiedCompatibilityPolicy(input.top, input.bottom)) {
    return {
      kind: 'ready',
      policy: 'original-timing',
      topCues: input.topCues,
      bottomCues: input.bottomCues,
    };
  }

  const bottomCues = alignMaxChineseCuesToEnglish(
    input.topCues,
    input.bottomCues,
  );
  return bottomCues.length === 0
    ? { kind: 'unavailable', reason: 'alignment-coverage' }
    : {
        kind: 'ready',
        policy: 'english-cc-traditional-chinese',
        topCues: input.topCues,
        bottomCues,
      };
}

function alignMaxChineseCuesToEnglish(
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
    const primary = candidates.length === 1
      ? candidates[0]
      : candidates.length === 0
        ? firstEnglishCueAfterChineseStart(
          englishCues,
          nextEnglishIndex,
          chineseCue,
        )
        : undefined;
    if (primary === undefined) continue;

    uniquelyAlignedCount += 1;
    aligned.push(
      ...alignChineseCue(
        chineseCue,
        englishCues,
        englishCues.indexOf(primary),
      ),
    );
  }

  return chineseCues.length > 0 &&
      uniquelyAlignedCount / chineseCues.length >=
        MIN_UNIQUE_ALIGNMENT_COVERAGE
    ? aligned
    : [];
}

function firstEnglishCueAfterChineseStart(
  englishCues: readonly Cue[],
  startIndex: number,
  chineseCue: Cue,
): Cue | undefined {
  const candidates: Cue[] = [];
  for (let index = startIndex; index < englishCues.length; index += 1) {
    const candidate = englishCues[index];
    if (candidate.start - chineseCue.start > MAX_CHINESE_LEAD_MS) break;
    if (
      candidate.start > chineseCue.start &&
      candidate.start < chineseCue.end
    ) {
      candidates.push(candidate);
    }
  }
  if (candidates.length === 0) return undefined;
  const earliestStart = candidates[0].start;
  const earliest = candidates.filter(
    (candidate) => candidate.start === earliestStart,
  );
  return earliest.length === 1 ? earliest[0] : undefined;
}

function alignChineseCue(
  chineseCue: Cue,
  englishCues: readonly Cue[],
  primaryIndex: number,
): Cue[] {
  const primary = englishCues[primaryIndex];
  const primaryCapacity = spokenUnitCount(primary.text);
  const parsedUnits = splitDialogueUnits(chineseCue.text);
  const wrappedLines = nonEmptyLines(chineseCue.text);
  const followingCapacity = englishCues.slice(primaryIndex + 1).filter(
    (cue) =>
      cue.start < chineseCue.end &&
      chineseCue.start < cue.end &&
      spokenUnitCount(cue.text) > 0,
  ).length;
  const chineseUnits =
    parsedUnits.length <= primaryCapacity &&
      wrappedLines.length > primaryCapacity &&
      wrappedLines.length - primaryCapacity <= followingCapacity
      ? wrappedLines
      : parsedUnits;
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
  const lines = nonEmptyLines(text);
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

function nonEmptyLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

function usesVerifiedCompatibilityPolicy(
  top: TrackInfo,
  bottom: TrackInfo,
): boolean {
  if (
    top.source !== 'official' ||
    top.kind !== 'closed-captions' ||
    bottom.source !== 'official' ||
    bottom.kind !== 'subtitles'
  ) {
    return false;
  }
  return isMaxEnglishTraditionalChineseLanguagePair(
    'max',
    top.language,
    bottom.language,
  );
}
