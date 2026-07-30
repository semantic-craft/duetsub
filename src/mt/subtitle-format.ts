import type { SubtitlePromptProfile } from './prompt';

export function formatSubtitleTranslation(
  value: string,
  profile: SubtitlePromptProfile,
  targetLanguage: 'en' | 'zh-Hant',
): string {
  const normalized = value.trim().replace(/\.{3,}/gu, '…');
  const lineLimit = targetLanguage === 'en'
    ? 42
    : profile === 'film-tv' ? 16 : 18;
  const existingLines = normalized.split(/\r?\n/u).map((line) => line.trim());
  const flat = joinExistingLines(existingLines, targetLanguage);
  if (readingUnits(flat, targetLanguage) <= lineLimit) return flat;
  const splitAt = bestSplitIndex(flat, targetLanguage, lineLimit);
  if (splitAt === undefined) return flat;
  return `${flat.slice(0, splitAt).trimEnd()}\n${
    flat.slice(splitAt).trimStart()
  }`;
}

function joinExistingLines(
  lines: readonly string[],
  targetLanguage: 'en' | 'zh-Hant',
): string {
  if (targetLanguage === 'en') {
    return lines.join(' ').replace(/\s+/gu, ' ').trim();
  }
  return lines.reduce((joined, line) => {
    if (joined === '') return line;
    const separator = /[A-Za-z0-9`]$/u.test(joined) &&
        /^[A-Za-z0-9`]/u.test(line)
      ? ' '
      : '';
    return `${joined}${separator}${line}`;
  }, '');
}

function bestSplitIndex(
  text: string,
  targetLanguage: 'en' | 'zh-Hant',
  lineLimit: number,
): number | undefined {
  let best: { index: number; score: number } | undefined;
  const totalUnits = readingUnits(text, targetLanguage);
  for (let index = 1; index < text.length; index += 1) {
    const left = text.slice(0, index).trimEnd();
    const right = text.slice(index).trimStart();
    const leftUnits = readingUnits(left, targetLanguage);
    const rightUnits = readingUnits(right, targetLanguage);
    if (leftUnits > lineLimit || rightUnits > lineLimit) continue;
    const strength = boundaryStrength(text, index, targetLanguage);
    if (strength < 0) continue;
    const balancePenalty = Math.abs(leftUnits - totalUnits / 2);
    const score = strength - balancePenalty;
    if (best === undefined || score > best.score) {
      best = { index, score };
    }
  }
  return best?.index;
}

function boundaryStrength(
  text: string,
  index: number,
  targetLanguage: 'en' | 'zh-Hant',
): number {
  const before = text[index - 1] ?? '';
  const after = text[index] ?? '';
  const left = text.slice(0, index).trimEnd();
  const right = text.slice(index).trimStart();
  const previousNonSpace = left.at(-1) ?? '';
  const nextNonSpace = right[0] ?? '';
  if ((left.match(/`/gu)?.length ?? 0) % 2 === 1) return -1;
  if (
    targetLanguage === 'zh-Hant' &&
    /[A-Za-z0-9_]/u.test(previousNonSpace) &&
    /[A-Za-z0-9_]/u.test(nextNonSpace)
  ) {
    return -1;
  }
  if (
    targetLanguage === 'zh-Hant' &&
    /(?:而非|不是|別用|别用|執行|运行)$/u.test(left) &&
    right.startsWith('`')
  ) {
    return -1;
  }
  if (
    targetLanguage === 'en' &&
    isEnglishNameBoundary(left, right)
  ) {
    return -1;
  }
  if (
    /\d/u.test(previousNonSpace) &&
    /[%％°℃元圓美歐欧號号秒分時瓦伏]/u.test(nextNonSpace)
  ) {
    return -1;
  }
  if (before === after && /[—–…]/u.test(before)) return -1;
  if (/\s/u.test(before) || /\s/u.test(after)) {
    if (/[。！？.!?]/u.test(previousNonSpace)) return 130;
    if (/[，；：、,;:—–…]/u.test(previousNonSpace)) return 115;
    return 100;
  }
  if (targetLanguage === 'en') return -1;
  if (/[。！？!?]/u.test(before)) return 150;
  if (/[，；：、,;:—–…]/u.test(before)) return 135;
  if (/[（〔【《〈「『‘“([{]/u.test(before)) return -1;
  if (/[，。！？；：、,.!?;:%％）〕】》〉」』’”)\]}]/u.test(after)) {
    return -1;
  }
  if (/[A-Za-z0-9_`]/u.test(before) && /[A-Za-z0-9_`]/u.test(after)) {
    return -1;
  }
  if (/\d/u.test(before) && /[%％°℃元]/u.test(after)) return -1;
  if (/[但而然所其別再]/u.test(after)) return 75;
  return 20;
}

function isEnglishNameBoundary(left: string, right: string): boolean {
  if (left.endsWith('&') || right.startsWith('&')) return true;
  const previousWord = left.match(/([A-Za-z0-9][A-Za-z0-9.:-]*)$/u)?.[1];
  const nextWord = right.match(/^([A-Za-z0-9][A-Za-z0-9.:-]*)/u)?.[1];
  if (previousWord === undefined || nextWord === undefined) return false;
  const isNameToken = (word: string): boolean =>
    /^[A-Z0-9][A-Za-z0-9.:-]*$/u.test(word);
  return isNameToken(previousWord) && isNameToken(nextWord);
}

function readingUnits(
  text: string,
  targetLanguage: 'en' | 'zh-Hant',
): number {
  if (targetLanguage === 'en') return text.length;
  return [...text].reduce((total, character) => {
    if (/\s/u.test(character)) return total;
    return total + (/[\u0000-\u007f]/u.test(character) ? 0.5 : 1);
  }, 0);
}
