import { describe, expect, it } from 'vitest';

import type { Cue } from '../src/core/contracts';
import { convertCuesToTraditional } from '../src/mt/opencc';
import type { SubtitlePromptProfile } from '../src/mt/prompt';
import { translateCueBatch } from '../src/mt/translator';

interface EvalCase {
  readonly name: string;
  readonly profile: SubtitlePromptProfile;
  readonly targetLanguage: 'en' | 'zh-Hant';
  readonly cues: readonly Cue[];
  readonly requiredPatterns?: Readonly<Record<number, readonly RegExp[]>>;
  readonly forbiddenPatterns?: Readonly<Record<number, readonly RegExp[]>>;
}

interface CapturedResponse {
  readonly httpStatus: number;
  readonly payload: unknown;
  readonly elapsedMs: number;
}

const filmEnglish: Cue[] = timedCues('en', [
  [2_800, "You don't get to walk away after what you did."],
  [2_200, 'Easy, cowboy. I was kidding.'],
  [3_200, "Dr. Reyes, Room 237. Ten-thirty. Don't be late."],
  [3_000, "Five grand says he won't make it past sunrise."],
  [3_400, 'Oh, brilliant. Because that worked so well last time.'],
  [4_000, "I didn't say she stole it—I said she knew who did."],
  [2_000, 'Get your hands off my sister.'],
  [2_500, 'Wait…\nDid you hear that?'],
]);

const filmChinese: Cue[] = timedCues('zh-Hans', [
  [3_000, '你以为道个歉，这事就算完了？'],
  [2_500, '少来这套，我不吃这一套。'],
  [3_200, '林警官，凌晨两点，西码头。'],
  [4_500, '不是我不信你，是我不能拿全船人的命去赌。'],
  [4_000, '好极了，上次听你的，我们差点把楼炸了。'],
  [3_500, '他没说不来，他说的是赶不上开场。'],
  [1_600, '放开我弟弟。'],
  [2_300, '等等……\n门外有人。'],
]);

const youtubeEnglish: Cue[] = timedCues('en', [
  [3_600, 'First, open Settings, then tap Privacy & Security.'],
  [3_400, "I'm using Blender 4.3 on an M3 MacBook Air."],
  [3_200, 'Set the resistor to 220 ohms, not 22.'],
  [5_000, 'Run `npm ci`—not `npm install`—so the lockfile stays authoritative.'],
  [4_200, 'This lens is $799, but the adapter adds another $129.'],
  [4_200, "I thought this was USB 3.2—sorry, it's actually USB4."],
  [4_000, "This may improve battery life, but I can't guarantee it."],
  [4_200, 'At 0:35, drag the Exposure slider down to minus 0.7.'],
]);

const youtubeChinese: Cue[] = timedCues('zh-Hans', [
  [3_800, '第一步，打开“设置”，然后点“隐私与安全性”。'],
  [3_600, '我这里用的是 M3 MacBook Air 和 Blender 4.3。'],
  [3_200, '电阻要设成 220 欧姆，不是 22 欧姆。'],
  [5_500, '运行 `npm ci`，别用 `npm install`，这样锁文件才是准的。'],
  [4_500, '这支镜头卖 799 美元，转接环还要再加 129 美元。'],
  [4_300, '我刚才说成 USB 3.2 了，抱歉，其实是 USB4。'],
  [4_000, '这个方法可能更省电，但我不能保证。'],
  [4_200, '到 0:35，把“曝光”滑块往下拉到 -0.7。'],
]);

const cases: readonly EvalCase[] = [
  {
    name: 'film-tv-en-to-zh-Hant',
    profile: 'film-tv',
    targetLanguage: 'zh-Hant',
    cues: filmEnglish,
    requiredPatterns: {
      3: [/(五千|5[,\s]?000)/u],
    },
    forbiddenPatterns: {
      3: [/(五萬|五万|50[,\s]?000)/u],
    },
  },
  {
    name: 'film-tv-zh-to-en',
    profile: 'film-tv',
    targetLanguage: 'en',
    cues: filmChinese,
    requiredPatterns: {
      3: [/(?:\b(ship|aboard|crew)\b|on board)/iu, /\b(risk|gambl\w*)\b/iu],
    },
    forbiddenPatterns: {
      7: [/\.{3}/u],
    },
  },
  {
    name: 'youtube-en-to-zh-Hant',
    profile: 'youtube',
    targetLanguage: 'zh-Hant',
    cues: youtubeEnglish,
    requiredPatterns: {
      3: [/(?:以.{0,12}為準|唯一依據|作為.{0,8}依據)/u],
    },
    forbiddenPatterns: {
      3: [/權威|保持為準/u],
    },
  },
  {
    name: 'youtube-zh-to-en',
    profile: 'youtube',
    targetLanguage: 'en',
    cues: youtubeChinese,
    requiredPatterns: {
      3: [/\b(authoritative|canonical|source of truth)\b/iu],
      4: [/\b(adds|extra|additional|another|plus)\b/iu],
      7: [/\b(down|lower)\b/iu],
    },
    forbiddenPatterns: {
      3: [/\baccurate\b/iu],
    },
  },
];

const runLive = process.env.RUN_LIVE_QWEN_EVAL === '1';

describe.skipIf(!runLive)('Qwen 3.7 Flash subtitle prompt live evaluation', () => {
  it('passes both prompt profiles in both directions twice', async () => {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    expect(apiKey, 'DASHSCOPE_API_KEY must be present').toBeTruthy();
    const baseUrl = process.env.QWEN_EVAL_BASE_URL ??
      'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const failures: string[] = [];
    const records: Record<string, unknown>[] = [];

    for (let repetition = 1; repetition <= 2; repetition += 1) {
      for (const evalCase of cases) {
        const captures: CapturedResponse[] = [];
        const fetcher: typeof globalThis.fetch = async (input, init) => {
          const startedAt = performance.now();
          const response = await fetch(input, init);
          const payload = await response.clone().json().catch(() => undefined);
          captures.push({
            httpStatus: response.status,
            payload,
            elapsedMs: Math.round(performance.now() - startedAt),
          });
          return response;
        };
        const result = await translateCueBatch(
          {
            contentId: `live-${evalCase.name}`,
            trackId: 'source',
            promptProfile: evalCase.profile,
            targetLanguage: evalCase.targetLanguage,
            cues: evalCase.cues,
            config: {
              provider: 'qwen-cn',
              baseUrl,
              apiKey: apiKey!,
              model: 'qwen3.7-flash',
            },
            skipCache: true,
          },
          { fetch: fetcher },
        );
        const capture = captures.at(-1);
        const rawOutput = readRawOutput(capture?.payload);
        const caseFailures = validateResult(
          evalCase,
          result,
          rawOutput,
          capture,
        );
        failures.push(
          ...caseFailures.map((failure) =>
            `${evalCase.name} run ${repetition}: ${failure}`
          ),
        );
        const record = {
          case: evalCase.name,
          repetition,
          resultStatus: result.status,
          httpStatus: capture?.httpStatus,
          elapsedMs: capture?.elapsedMs,
          model: readRecord(capture?.payload)?.model,
          responseStatus: readRecord(capture?.payload)?.status,
          usage: readRecord(capture?.payload)?.usage,
          translations: result.cues.map((cue) => cue.text),
          failures: caseFailures,
        };
        records.push(record);
        console.log(`QWEN_EVAL_RESULT ${JSON.stringify(record)}`);
      }
    }

    console.log(`QWEN_EVAL_SUMMARY ${JSON.stringify({
      calls: records.length,
      failures,
    })}`);
    expect(failures).toEqual([]);
  }, 180_000);
});

function timedCues(
  language: string,
  values: readonly (readonly [durationMs: number, text: string])[],
): Cue[] {
  let start = 0;
  return values.map(([durationMs, text]) => {
    const cue = {
      start,
      end: start + durationMs,
      text,
      language,
    };
    start = cue.end + 250;
    return cue;
  });
}

function validateResult(
  evalCase: EvalCase,
  result: Awaited<ReturnType<typeof translateCueBatch>>,
  rawOutput: unknown,
  capture: CapturedResponse | undefined,
): string[] {
  const failures: string[] = [];
  if (capture?.httpStatus !== 200) {
    failures.push(`HTTP ${capture?.httpStatus ?? 'missing'}`);
  }
  if (result.status !== 'ok') {
    failures.push(`translation status ${result.status}`);
    return failures;
  }
  if (result.cues.length !== evalCase.cues.length) {
    failures.push('cue count changed');
  }
  const rawTranslations = readRecord(rawOutput)?.translations;
  if (
    !Array.isArray(rawTranslations) ||
    rawTranslations.length !== evalCase.cues.length ||
    !rawTranslations.every((item, id) =>
      readRecord(item)?.id === id &&
      typeof readRecord(item)?.text === 'string'
    )
  ) {
    failures.push('raw output did not preserve object ids');
  }
  result.cues.forEach((cue, index) => {
    const source = evalCase.cues[index];
    if (source === undefined) return;
    if (cue.start !== source.start || cue.end !== source.end) {
      failures.push(`cue ${index} timeline changed`);
    }
    if (cue.text.trim() === '') failures.push(`cue ${index} is empty`);
    if (cue.text.split('\n').length > 2) {
      failures.push(`cue ${index} exceeds two lines`);
    }
    if (hasUnsafeLineBreak(cue.text, evalCase.targetLanguage)) {
      failures.push(`cue ${index} splits a protected token or unit`);
    }
    if (/```|^\s*(translation|譯文|翻譯)[:：]/imu.test(cue.text)) {
      failures.push(`cue ${index} contains wrapper text`);
    }
    for (const pattern of evalCase.requiredPatterns?.[index] ?? []) {
      if (!pattern.test(cue.text)) {
        failures.push(`cue ${index} is missing semantic anchor ${pattern}`);
      }
    }
    for (const pattern of evalCase.forbiddenPatterns?.[index] ?? []) {
      if (pattern.test(cue.text)) {
        failures.push(`cue ${index} contains rejected wording ${pattern}`);
      }
    }
    if (evalCase.targetLanguage === 'zh-Hant') {
      const converted = convertCuesToTraditional([cue])[0]!.text;
      if (converted !== cue.text) {
        failures.push(`cue ${index} contains Simplified Chinese forms`);
      }
    }
    const durationSeconds = Math.max(1, (cue.end - cue.start) / 1_000);
    const readingUnits = evalCase.targetLanguage === 'zh-Hant'
      ? traditionalChineseReadingUnits(cue.text)
      : cue.text.replace(/\n/g, '').length;
    const hardLimit = evalCase.targetLanguage === 'zh-Hant'
      ? evalCase.profile === 'film-tv' ? 9 : 11
      : 20;
    if (readingUnits / durationSeconds > hardLimit) {
      failures.push(
        `cue ${index} reading speed ${
          (readingUnits / durationSeconds).toFixed(1)
        } > ${hardLimit}`,
      );
    }
    const lineLimit = evalCase.targetLanguage === 'zh-Hant'
      ? evalCase.profile === 'film-tv' ? 16 : 18
      : 42;
    cue.text.split('\n').forEach((line, lineIndex) => {
      const lineUnits = evalCase.targetLanguage === 'zh-Hant'
        ? traditionalChineseReadingUnits(line)
        : line.length;
      if (lineUnits > lineLimit) {
        failures.push(
          `cue ${index} line ${lineIndex + 1} length ${lineUnits} > ${lineLimit}`,
        );
      }
    });
  });
  return failures;
}

function traditionalChineseReadingUnits(text: string): number {
  return [...text].reduce((total, character) => {
    if (/\s/u.test(character)) return total;
    return total + (/[\u0000-\u007f]/u.test(character) ? 0.5 : 1);
  }, 0);
}

function hasUnsafeLineBreak(
  text: string,
  targetLanguage: 'en' | 'zh-Hant',
): boolean {
  const lines = text.split('\n');
  if (lines.length < 2) return false;
  const left = lines[0]!.trimEnd();
  const right = lines[1]!.trimStart();
  if ((left.match(/`/gu)?.length ?? 0) % 2 === 1) return true;
  if (
    /\d$/u.test(left) &&
    /^(?:[%％°℃元圓美元歐姆欧姆號号]|ohms?\b|kg\b|g\b|km\b|m\b|cm\b|mm\b|ms\b|s\b)/iu
      .test(right)
  ) {
    return true;
  }
  if (targetLanguage === 'zh-Hant') {
    return /[A-Za-z0-9_]$/u.test(left) &&
      /^[A-Za-z0-9_]/u.test(right);
  }
  const previousWord = left.match(/([A-Za-z0-9][A-Za-z0-9.:-]*)$/u)?.[1];
  const nextWord = right.match(/^([A-Za-z0-9][A-Za-z0-9.:-]*)/u)?.[1];
  return previousWord !== undefined &&
    nextWord !== undefined &&
    /^[A-Z0-9][A-Za-z0-9.:-]*$/u.test(previousWord) &&
    /^[A-Z0-9][A-Za-z0-9.:-]*$/u.test(nextWord);
}

function readRawOutput(payload: unknown): unknown {
  const output = readRecord(payload)?.output;
  if (!Array.isArray(output)) return undefined;
  const texts = output.flatMap((item) => {
    const content = readRecord(item)?.content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) =>
      readRecord(part)?.type === 'output_text' &&
        typeof readRecord(part)?.text === 'string'
        ? [readRecord(part)!.text as string]
        : []
    );
  });
  if (texts.length === 0) return undefined;
  try {
    return JSON.parse(texts.join('')) as unknown;
  } catch {
    return undefined;
  }
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : undefined;
}
