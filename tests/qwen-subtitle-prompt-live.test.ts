import { describe, expect, it } from 'vitest';

import type {
  Cue,
  TranslationTargetLanguage,
} from '../src/core/contracts';
import {
  convertCuesToSimplified,
  convertCuesToTraditional,
} from '../src/mt/opencc';
import type { SubtitlePromptProfile } from '../src/mt/prompt';
import { MT_BATCH_SIZE } from '../src/mt/scheduling';
import { translateCueBatch } from '../src/mt/translator';

interface EvalCase {
  readonly name: string;
  readonly profile: SubtitlePromptProfile;
  readonly targetLanguage: TranslationTargetLanguage;
  readonly cues: readonly Cue[];
  readonly requiredPatterns?: Readonly<Record<number, readonly RegExp[]>>;
  readonly forbiddenPatterns?: Readonly<Record<number, readonly RegExp[]>>;
  readonly combinedRequiredPatterns?: readonly RegExp[];
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
  [2_000, 'But if it did, we could move you.'],
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

const fragmentedFilmEnglish: Cue[] = timedCues('en', [
  [1_800, "Then, at o'dark 30, next time you're up,"],
  [1_600, 'out of bed; you will put'],
  [1_600, 'on your gun and your vest,'],
  [1_800, 'and you will do it all over again.'],
  [1_400, "You're a cop"],
  [1_300, "because you don't know"],
  [1_300, 'how not to be one.'],
  [2_800, '"I love and revere all sentient beings" crap.'],
]);

const omissionRegressionEnglish: Cue[] = timedCues('en', [
  [2_200, 'What we have is the Explorers program.'],
  [2_500, 'And, actually, Detective Moretta helps run it.'],
  [1_800, 'You want to be an Explorer?'],
  [1_800, "You're missing the point here."],
  [1_500, 'Can you abuse it?'],
  [1_000, 'Yes, sir.'],
  [1_800, 'He owes you money, sir?'],
  [1_400, 'How much money, sir?'],
]);

const netflixOmissionBatchEnglish: Cue[] = timedCues('en', [
  [1_000, 'Okay.'],
  [2_000, 'I heard from this boy at our school'],
  [2_000, 'that you guys, like, have junior police kids'],
  [1_500, "work for y'all."],
  [2_200, 'What we have is the Explorers program.'],
  [2_500, 'And, actually, Detective Moretta helps run it.'],
  [1_200, 'Remember him?'],
  [1_000, 'Hi.'],
]);

const netflixSegmentBoundaryEnglish: Cue[] = timedCues('en', [
  [1_500, "I'm gonna go to work"],
  [1_300, 'on movie sets.'],
  [1_200, '(rowdy shouts, whooping)'],
  [1_400, "Hey, hey, they're gonna take"],
  [1_300, 'one look at my ass'],
  [1_300, 'on my motorcycle,'],
  [1_300, "and they're gonna make me"],
  [1_000, '(whooping)'],
]);

const netflixMultilineEnglish: Cue[] = timedCues('en', [
  [2_000, 'Hey, look, look.\nCome on, guys.'],
  [2_200, 'Possible stolen vehicle\nat 455 Tiffany Circle.'],
  [1_800, 'I tried to\nsave her life!'],
  [1_800, 'Put the gun down!\nPut the gun down!'],
  [2_600, 'Turn around, put your hands\non the car, spread your legs.'],
  [1_800, 'Besides, I miss you guys.'],
  [2_200, "So, I guess it's a suspicious death, right?"],
  [1_800, "No, it's not\na suspicious death."],
]);

const netflixCompleteUtteranceEnglish: Cue[] = timedCues('en', [
  [2_400, 'Tell Dewey to take our suspect back with him.'],
  [1_700, 'So, anyway, I got this blond.'],
  [1_700, 'I got her bent over a sofa,'],
  [1_500, "but I'm inebriated."],
  [1_200, 'Right?'],
  [1_500, 'What happened next?'],
  [1_400, 'She pushed me away.'],
  [1_300, 'Then she left.'],
]);

const netflixMultilineOmissionEnglish: Cue[] = timedCues('en', [
  [1_600, "I'm intoxicated."],
  [2_000, 'And I-I pass out\non top of her'],
  [1_800, "and I'm smoking a cigar."],
  [1_800, 'I burn a hole\nin her sofa.'],
  [2_000, "Open your ears.\nWhy don't you try\nto be a man?"],
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
      6: [/(?:如果|要是|真.{0,4}(?:的話|就))/u, /(?:搬|換|轉移|調)/u],
    },
    forbiddenPatterns: {
      3: [/(五萬|五万|50[,\s]?000)/u],
    },
  },
  {
    name: 'film-tv-en-to-zh-Hans',
    profile: 'film-tv',
    targetLanguage: 'zh-Hans',
    cues: filmEnglish,
    requiredPatterns: {
      3: [/(五千|5[,\s]?000)/u],
      6: [/(?:如果|要是|真.{0,4}(?:的话|就))/u, /(?:搬|换|转移|调)/u],
    },
    forbiddenPatterns: {
      3: [/(五萬|五万|50[,\s]?000)/u],
    },
  },
  {
    name: 'film-tv-fragments-en-to-zh-Hant',
    profile: 'film-tv',
    targetLanguage: 'zh-Hant',
    cues: fragmentedFilmEnglish,
    combinedRequiredPatterns: [
      /(?:起[床牀]|下[床牀])/u,
      /槍/u,
      /防彈(?:衣|背心)/u,
      /(?:重來|再來|重新|重複|從頭來)/u,
      /警察/u,
      /因為/u,
      /不知/u,
      /(?:怎麼|如何)/u,
      /(?:愛|熱愛).{0,16}(?:敬|尊)/u,
      /(?:眾生|有感知)/u,
      /(?:鬼話|屁話|胡說|去他的)/u,
    ],
  },
  {
    name: 'film-tv-fragments-en-to-zh-Hans',
    profile: 'film-tv',
    targetLanguage: 'zh-Hans',
    cues: fragmentedFilmEnglish,
    combinedRequiredPatterns: [
      /(?:起床|下床)/u,
      /枪/u,
      /防弹(?:衣|背心)/u,
      /(?:重来|再来|重新|重复|从头来)/u,
      /警察/u,
      /因为/u,
      /不知/u,
      /(?:怎么|如何)/u,
      /(?:爱|热爱).{0,16}(?:敬|尊)/u,
      /(?:众生|有感知)/u,
      /(?:鬼话|屁话|胡说)/u,
    ],
  },
  {
    name: 'film-tv-omissions-en-to-zh-Hans',
    profile: 'film-tv',
    targetLanguage: 'zh-Hans',
    cues: omissionRegressionEnglish,
    requiredPatterns: {
      0: [/我们/u, /(?:探索|少年警探)/u],
      1: [/(?:其实|实际上|事实上)/u, /莫雷塔/u, /(?:帮|协助)/u],
      2: [/你/u, /想/u, /(?:加入|成为|当)/u, /(?:探索|少年警探)/u],
      3: [/你/u, /(?:没|不)/u, /(?:重点|要点)/u],
      4: [/你/u, /能/u, /滥用/u],
      5: [/(?:是|好)/u, /(?:长官|先生)/u],
      6: [/他/u, /欠/u, /[你您]/u, /钱/u],
      7: [/多少/u],
    },
  },
  {
    name: 'film-tv-netflix-batch-en-to-zh-Hans',
    profile: 'film-tv',
    targetLanguage: 'zh-Hans',
    cues: netflixOmissionBatchEnglish,
    requiredPatterns: {
      1: [/我/u, /听|听说/u, /学校/u, /男生|男孩/u],
      2: [/你们/u, /少年警探|探索/u],
      3: [/(?:为|给)/u, /你们/u, /(?:工作|干活|做事)/u],
      4: [/我们/u, /(?:探索|少年警探)/u, /项目/u],
      5: [/(?:其实|实际上|事实上)/u, /莫雷塔/u, /(?:帮|协助)/u],
      6: [/(?:记得|记住)/u, /他/u],
    },
  },
  {
    name: 'film-tv-netflix-segment-boundary-en-to-zh-Hant',
    profile: 'film-tv',
    targetLanguage: 'zh-Hant',
    cues: netflixSegmentBoundaryEnglish,
    combinedRequiredPatterns: [
      /(?:工作|上班)/u,
      /(?:片場|電影)/u,
      /(?:摩托車|機車)/u,
      /(?:屁股|臀部)/u,
      /(?:讓|使)我/u,
    ],
  },
  {
    name: 'film-tv-netflix-multiline-en-to-zh-Hant',
    profile: 'film-tv',
    targetLanguage: 'zh-Hant',
    cues: netflixMultilineEnglish,
    requiredPatterns: {
      0: [/看/u, /(?:快點|加油|來吧)/u, /(?:各位|大家|夥計|你們)/u],
      1: [/(?:可能|疑似)/u, /(?:失竊|被偷|贓車)/u, /455/u, /蒂芬妮/u],
      2: [/我/u, /(?:救|挽救)/u, /她/u],
      3: [/(?:放下|把.{0,4}放下)/u, /槍/u],
      4: [/(?:轉身|轉過身|轉過去)/u, /手/u, /車/u, /腿/u],
      5: [/我/u, /想/u, /你們/u],
      6: [/(?:可疑|離奇)/u, /(?:死亡|死因)/u],
      7: [/(?:不|不是)/u, /(?:可疑|離奇)/u, /(?:死亡|死因)/u],
    },
  },
  {
    name: 'film-tv-netflix-complete-utterance-en-to-zh-Hans',
    profile: 'film-tv',
    targetLanguage: 'zh-Hans',
    cues: netflixCompleteUtteranceEnglish,
    requiredPatterns: {
      0: [/杜威/u, /嫌疑人/u, /带/u],
      1: [/(?:金发|金发女)/u],
      2: [/沙发/u],
      3: [/(?:醉|喝多|酒)/u],
      4: [/(?:对吧|是吧|对不对)/u],
      5: [/(?:后来|接下来|然后)/u],
      6: [/她/u, /推/u, /我/u],
      7: [/她/u, /离开|走/u],
    },
  },
  {
    name: 'film-tv-netflix-multiline-omission-en-to-zh-Hans',
    profile: 'film-tv',
    targetLanguage: 'zh-Hans',
    cues: netflixMultilineOmissionEnglish,
    requiredPatterns: {
      0: [/(?:醉|喝多|酒)/u],
      1: [/我/u, /(?:昏|晕|失去意识)/u, /她/u, /身上/u],
      2: [/(?:抽|吸)/u, /雪茄/u],
      3: [/我/u, /(?:烧|烫)/u, /洞/u, /沙发/u],
      4: [/(?:听|耳朵)/u, /(?:为什么|为何)/u, /(?:试|尝试)/u, /男人/u],
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
    name: 'youtube-en-to-zh-Hans',
    profile: 'youtube',
    targetLanguage: 'zh-Hans',
    cues: youtubeEnglish,
    requiredPatterns: {
      3: [/(?:以.{0,12}为准|唯一依据|作为.{0,8}依据)/u],
    },
    forbiddenPatterns: {
      3: [/权威|保持为准/u],
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

describe.skipIf(!runLive)('Qwen 3.7 Plus subtitle prompt live evaluation', () => {
  it('passes both prompt profiles in all three directions twice', async () => {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    expect(apiKey, 'DASHSCOPE_API_KEY must be present').toBeTruthy();
    const baseUrl = process.env.QWEN_EVAL_BASE_URL;
    expect(
      baseUrl,
      'QWEN_EVAL_BASE_URL must be a workspace-specific Responses API base URL',
    ).toMatch(
      /^https:\/\/ws-[a-z0-9-]+\.(?:cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com\/compatible-mode\/v1$/u,
    );
    const failures: string[] = [];
    const records: Record<string, unknown>[] = [];
    const requestedCase = process.env.QWEN_EVAL_CASE;
    const selectedCases = requestedCase === undefined
      ? cases
      : cases.filter((evalCase) => evalCase.name === requestedCase);
    expect(selectedCases.length, `unknown QWEN_EVAL_CASE ${requestedCase}`)
      .toBeGreaterThan(0);

    for (let repetition = 1; repetition <= 2; repetition += 1) {
      for (const evalCase of selectedCases) {
        for (
          let batchStart = 0;
          batchStart < evalCase.cues.length;
          batchStart += MT_BATCH_SIZE
        ) {
          const batchNumber = batchStart / MT_BATCH_SIZE + 1;
          const batchCase = sliceEvalCase(
            evalCase,
            batchStart,
            batchStart + MT_BATCH_SIZE,
          );
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
              cues: batchCase.cues,
              config: {
                provider: 'qwen-cn',
                baseUrl: baseUrl!,
                apiKey: apiKey!,
                model: 'qwen3.7-plus',
                webSearchEnabled: false,
              },
              skipCache: true,
            },
            { fetch: fetcher },
          );
          const productResult = result.status !== 'ok'
            ? result
            : {
                ...result,
                cues: evalCase.targetLanguage === 'zh-Hant'
                  ? convertCuesToTraditional(result.cues)
                  : evalCase.targetLanguage === 'zh-Hans'
                  ? convertCuesToSimplified(result.cues)
                  : result.cues,
              };
          const capture = captures.at(-1);
          const rawOutput = readRawOutput(capture?.payload);
          const caseFailures = validateResult(
            batchCase,
            productResult,
            rawOutput,
            capture,
          );
          failures.push(
            ...caseFailures.map((failure) =>
              `${evalCase.name} run ${repetition} batch ${batchNumber}: ${failure}`
            ),
          );
          const record = {
            case: evalCase.name,
            repetition,
            batch: batchNumber,
            resultStatus: productResult.status,
            httpStatus: capture?.httpStatus,
            elapsedMs: capture?.elapsedMs,
            model: readRecord(capture?.payload)?.model,
            responseStatus: readRecord(capture?.payload)?.status,
            usage: readRecord(capture?.payload)?.usage,
            translations: productResult.cues.map((cue) => cue.text),
            failures: caseFailures,
          };
          records.push(record);
          console.log(`QWEN_EVAL_RESULT ${JSON.stringify(record)}`);
        }
      }
    }

    console.log(`QWEN_EVAL_SUMMARY ${JSON.stringify({
      calls: records.length,
      failures,
    })}`);
    expect(failures).toEqual([]);
  }, 420_000);
});

function sliceEvalCase(
  evalCase: EvalCase,
  start: number,
  end: number,
): EvalCase {
  return {
    ...evalCase,
    cues: evalCase.cues.slice(start, end),
    requiredPatterns: slicePatterns(evalCase.requiredPatterns, start, end),
    forbiddenPatterns: slicePatterns(evalCase.forbiddenPatterns, start, end),
  };
}

function slicePatterns(
  patterns: Readonly<Record<number, readonly RegExp[]>> | undefined,
  start: number,
  end: number,
): Readonly<Record<number, readonly RegExp[]>> | undefined {
  if (patterns === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(patterns)
      .map(([index, value]) => [Number(index), value] as const)
      .filter(([index]) => start <= index && index < end)
      .map(([index, value]) => [index - start, value]),
  );
}

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
  const rawTranslations = Array.isArray(rawOutput)
    ? rawOutput
    : typeof rawOutput === 'string'
    ? rawOutput.trim().split(/\r?\n\s*%%\s*\r?\n/u)
    : undefined;
  if (
    !Array.isArray(rawTranslations) ||
    rawTranslations.length !== expectedRawSegmentCount(evalCase.cues) ||
    !rawTranslations.every((item) =>
      typeof item === 'string' && item.trim() !== ''
    )
  ) {
    failures.push('raw output did not preserve source segment count');
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
    const semanticText = evalCase.targetLanguage === 'en'
      ? cue.text.replace(/\n/gu, ' ')
      : cue.text.replace(/\n/gu, '');
    for (const pattern of evalCase.requiredPatterns?.[index] ?? []) {
      if (!pattern.test(semanticText)) {
        failures.push(`cue ${index} is missing semantic anchor ${pattern}`);
      }
    }
    for (const pattern of evalCase.forbiddenPatterns?.[index] ?? []) {
      if (pattern.test(semanticText)) {
        failures.push(`cue ${index} contains rejected wording ${pattern}`);
      }
    }
    if (evalCase.targetLanguage === 'zh-Hant') {
      const converted = convertCuesToTraditional([cue])[0]!.text;
      if (converted !== cue.text) {
        failures.push(`cue ${index} contains Simplified Chinese forms`);
      }
    } else if (evalCase.targetLanguage === 'zh-Hans') {
      const converted = convertCuesToSimplified([cue])[0]!.text;
      if (converted !== cue.text) {
        failures.push(`cue ${index} contains Traditional Chinese forms`);
      }
    }
  });
  const combined = result.cues.map((cue) => cue.text).join('\n');
  for (const pattern of evalCase.combinedRequiredPatterns ?? []) {
    if (!pattern.test(combined)) {
      failures.push(`combined translation is missing semantic anchor ${pattern}`);
    }
  }
  return failures;
}

function expectedRawSegmentCount(cues: readonly Cue[]): number {
  return cues.reduce((total, cue) => {
    const displayedLines = cue.text
      .split(/\r?\n/u)
      .filter((line) => line.trim() !== '');
    return total + Math.max(1, displayedLines.length);
  }, 0);
}

function hasUnsafeLineBreak(
  text: string,
  targetLanguage: TranslationTargetLanguage,
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
  if (targetLanguage !== 'en') {
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
  const functionCall = output.find((item) =>
    readRecord(item)?.type === 'function_call' &&
    readRecord(item)?.name === 'return_subtitle_translations' &&
    typeof readRecord(item)?.arguments === 'string'
  );
  const argumentsText = readRecord(functionCall)?.arguments;
  if (typeof argumentsText === 'string') {
    try {
      const parsed = readRecord(JSON.parse(argumentsText) as unknown);
      const translations = parsed?.translations;
      if (Array.isArray(translations)) {
        if (translations.every((item) => typeof item === 'string')) {
          return translations;
        }
        return translations.map((item, id) => {
          const record = readRecord(item);
          return record?.id === id && typeof record.text === 'string'
            ? record.text
            : undefined;
        });
      }
    } catch {
      return undefined;
    }
  }
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
  return texts.join('');
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : undefined;
}
