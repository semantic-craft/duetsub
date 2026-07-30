# DuetSub 影视剧与 YouTube 字幕翻译 Prompt 标准

- Date: 2026-07-31
- Scope: 为 DuetSub 的电影/电视剧与 YouTube 两类字幕翻译 system prompt、Responses API 可用性测试和后续模型横向评测建立同一把尺；不修改 runtime。
- Source policy: 只采用 Netflix、BBC、YouTube/Google、W3C、EBU 的一手资料，以及 DuetSub 当前源码所定义的真实接口。平台交付规范只在该平台内是硬规则，不把它冒充所有字幕的普遍规则。

---

## 结论先行

1. **应有两个内容 profile，但共享同一个不可破坏的 cue 协议。**
   影视剧 prompt 重点是人物口吻、关系、俚语、笑点/悬念、脏话强度、跨集术语一致性和镜头内阅读节奏；YouTube prompt 重点是创作者口吻、术语、数字/单位、否定词、代码、UI 标签和教程步骤。两者都必须逐条、同序、等数量输出，不合并、不拆分、不调换 cue。

2. **时间轴是上游事实，不应交给 LLM 改写。**
   WebVTT 把一个 cue 定义为带独立开始/结束时间的“一段与媒体对齐的文本”，并要求 cue 按开始时间排列；EBU-TT-D 也把 `begin`/`end` 定义为相关媒体时间线上的坐标。因此 DuetSub 应把时间作为每条翻译的阅读预算，而不是允许模型重打轴。来源：[W3C WebVTT §4.1](https://www.w3.org/TR/webvtt1/#webvtt-file-structure)、[EBU Tech 3380 §3.1](https://tech.ebu.ch/files/live/sites/tech/files/shared/tech/tech3380v1_0_1.pdf)。

3. **研究开始时的 DuetSub `HEAD` 请求体无法真正执行“按 cue 时长控制阅读速度”。**
   `HEAD` `753d706` 中的 `Cue` 有 `start`/`end`，但翻译请求只发送 `{"texts":[...]}`；模型看不到每条持续时间、内容 profile、说话人或术语表。该版本 prompt 虽要求逐条同序返回，却只能做笼统的“concise”，无法计算 CPS/WPM，也无法知道这是影视剧还是 YouTube。来源：[该版本请求构造](https://github.com/semantic-craft/duetsub/blob/753d7060a5800a7d98a2159ceaccc2a93e805bb5/src/mt/translator.ts#L155-L178)、[该版本 system prompt](https://github.com/semantic-craft/duetsub/blob/753d7060a5800a7d98a2159ceaccc2a93e805bb5/src/mt/translator.ts#L242-L257)、[Cue contract](https://github.com/semantic-craft/duetsub/blob/753d7060a5800a7d98a2159ceaccc2a93e805bb5/src/core/contracts.ts#L3-L9)。

4. **Netflix/BBC 的数值适合做影视剧 profile 与测试阈值，不是 YouTube 的官方硬限制。**
   Netflix：单 event 最多 2 行、24fps 下最短 20 帧（约 0.833 秒）、最长 7 秒；英文成人/儿童分别不超过 20/17 CPS，繁中为 9/7 CPS；英文 42 字/行，繁中 16 字/行。BBC 的目标阅读速度是 160–180 WPM，约每词 0.3 秒。来源：[Netflix General Requirements](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements)、[Netflix Timing Guidelines](https://partnerhelp.netflixstudios.com/hc/en-us/articles/360051554394-Timed-Text-Style-Guide-Subtitle-Timing-Guidelines)、[Netflix English (USA)](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide)、[Netflix Traditional Chinese](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215994807-Chinese-Traditional-Timed-Text-Style-Guide)、[BBC Subtitle Guidelines §4.1](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Target-minimum-timing)。

5. **可访问性标记是内容，不是噪声。**
   W3C 明确把不可见说话人、音乐、笑声和重要声音列为 caption 内容；YouTube 也要求手工字幕补入 `[applause]`、`[thunder]` 等信息。Prompt 必须翻译标记内部的自然语言，同时保留括号、说话人归属和相对位置；不得丢弃，也不得凭空添加。来源：[W3C Video Captions](https://www.w3.org/WAI/perspective-videos/captions/)、[YouTube Add subtitles & captions](https://support.google.com/youtube/answer/2734796)。

---

## 一、规范层级

| 标签 | 含义 | 在 DuetSub 测试中的处理 |
|---|---|---|
| **P0 产品硬约束** | DuetSub 接口与时间轴不变量 | 违反任一条即 hard fail，不用总分抵消 |
| **P1 平台交付规则** | Netflix/BBC/YouTube 对其字幕或 caption 的明确规则 | 对对应 profile 作为强验收项；不外推成跨平台法律 |
| **P2 语言/平台校准阈值** | CPS、CPL、WPM、行数等会随语言、年龄、画幅和平台改变的数值 | 记录超限率并做人审，不让模型为达数值而篡改事实 |
| **P3 DuetSub 设计推导** | 从一手规范和当前产品约束推出的 prompt/测试选择 | 需要真实片段回放验证，可迭代 |

关键区别：

- “输出数组必须等长同序”是 **P0**。
- “Netflix 繁中 16 字/行、成人 9 CPS”是 Netflix 的 **P1**，在 DuetSub 中作为影视剧的 **P2 基线**。
- YouTube 官方帮助页要求时间同步、可编辑每条时间戳、审校自动字幕，但没有公布一套适用于所有 YouTube 内容的统一 CPS/CPL/event-duration 数值。因此不能把 16 字/行或 9 CPS 写成“YouTube 官方硬规则”。来源：[YouTube Add subtitles & captions](https://support.google.com/youtube/answer/2734796)、[YouTube Edit or remove captions](https://support.google.com/youtube/answer/2734705)、[YouTube Use automatic captioning](https://support.google.com/youtube/answer/6373554)。

---

## 二、两个 prompt 共享的 P0 协议

### 2.1 输入与输出映射

System prompt 必须要求：

1. 每个输入 `cue_id` 恰好返回一次；
2. 输出 `cue_id` 集合、数量和顺序与输入完全一致；
3. 不合并、拆分、删除、复制或重排 cue；
4. 不返回 Markdown、解释、译注、置信度或思考过程；
5. 只返回约定 JSON；每条译文必须是非空字符串；
6. 不修改 `start_ms`、`end_ms`，最好根本不让模型输出时间字段；
7. 批内相邻 cue 只用于消歧和保持连贯，不得把后一条的信息提前写进前一条。

依据不是“某家模型偏好”，而是 timed-text 的数据模型：一个 WebVTT cue 是一段有自己时间范围的 time-aligned text，开始/结束时间决定它何时出现；W3C 还明确允许 cue 重叠，因此不能靠数组邻接擅自合并。来源：[W3C WebVTT cue block / cue timings](https://www.w3.org/TR/webvtt1/#webvtt-cue-block)。

### 2.2 建议的最小输入 schema

当前的 `{"texts":[...]}` 应升级为至少：

```json
{
  "profile": "film_tv",
  "source_language": "en",
  "target_language": "zh-Hant",
  "items": [
    {
      "cue_id": "c001",
      "start_ms": 12340,
      "end_ms": 15120,
      "text": "You have got to be kidding me."
    }
  ],
  "glossary": {
    "The Upside Down": "顛倒世界"
  }
}
```

其中：

- `cue_id` 用于验证逐条映射；
- `end_ms - start_ms` 是压缩译文的客观预算；
- `profile` 决定走影视剧还是 YouTube system prompt；
- `glossary` 用于人名、称谓、地名、作品名、频道术语和产品词的一致性；
- 相邻 `items` 可提供局部上下文，但输出仍必须逐条映射。

Netflix 要求跨集/跨季使用 KNP、称谓/formality 表保持一致；这直接支持向 prompt 提供 glossary，而不是要求模型每批重新猜。来源：[Netflix General Requirements — Consistency](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements#h_01EVT0E1BESWRB6Q52JXWJYJQ4)。

### 2.3 时间、字符和阅读速度

Prompt 的共同规则应是：

- 先保持事实、语义和语气，再在不丢关键内容的前提下压缩；
- 依据每条 `duration_ms` 控制目标语言长度；
- 不通过把词移到相邻 cue、删否定词、改数字、删专名来达标；
- 若无法同时满足忠实度和阅读速度，仍逐条输出最佳短译，并由产品 QA 标记超限；不要伪造“合规”。

推荐统计：

```text
duration_seconds = (end_ms - start_ms) / 1000
CPS = visible_target_characters / duration_seconds
WPM = target_words / duration_seconds * 60
```

“visible characters”是否计空格、标点、SDH 标记，必须由 DuetSub 的测试器统一定义；不要让每个模型自行解释。

影视剧初始基线：

| 目标语言/受众 | 阅读速度 | 行长 | 性质 |
|---|---:|---:|---|
| English adult | ≤ 20 CPS | ≤ 42 chars/line | Netflix 交付规则；DuetSub 影视剧校准基线 |
| English children | ≤ 17 CPS | ≤ 42 chars/line | 同上 |
| zh-Hant adult | ≤ 9 CPS | ≤ 16 chars/line | Netflix 交付规则；DuetSub 影视剧校准基线 |
| zh-Hant children | ≤ 7 CPS | ≤ 16 chars/line | 同上 |
| zh-Hant SDH adult | ≤ 11 CPS | ≤ 18 chars/line | Netflix 繁中 SDH 规则；只用于 SDH profile |
| zh-Hant SDH children | ≤ 9 CPS | ≤ 18 chars/line | 同上 |
| BBC English reference | 160–180 WPM，约 0.3 秒/词 | broadcast 37 fixed-width chars；online 按区域宽度 | BBC 基线，不与 Netflix CPS 混算 |

来源：[Netflix English reading speed/character limitation](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide)、[Netflix Traditional Chinese reading speed/character limitation](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215994807-Chinese-Traditional-Timed-Text-Style-Guide)、[BBC Timing](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Timing)、[BBC Line length](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Line-length)。

Netflix 的 CPS 计算计入空格和标点；在字符型语言中，半角标点和拉丁字符通常按 `0.5` 个字符计算，除非语言指南另有规定。测试器应固定采用同一算法，同时给出逐 cue CPS 和全文件平均值。来源：[Netflix — How is reading speed measured?](https://partnerhelp.netflixstudios.com/hc/en-us/articles/115001352212-How-is-reading-speed-measured-Do-punctuation-and-spaces-count)。

这些阈值用于诊断译文是否可读，不授权模型修改原始 cue 的持续时间。Netflix 的原生制作流程允许 merge、re-segmentation 和 re-timing 来改善阅读速度；“严格一进一出且不改轴”是 DuetSub 的产品约束，不是 Netflix 行业规则。

### 2.4 断句和换行

共同规则：

- cue 边界不可变；一个 cue 内允许按目标语言重新断行；
- 必须保留具有语义的结构：双说话人分行、说话人标记、声效与对应台词的归属；
- 普通视觉换行不应机械照抄源语言；应在目标语言的标点、分句或短语边界重排；
- 不拆开紧密语法单元，不在词中断行；
- 默认一行，必要时两行；影视剧横屏以两行为常规上限；
- 若只拿到纯文本、无法判断换行是语义还是视觉用途，应优先保留双说话人/标记换行，其余按目标语言可读性重排。

Netflix 要求最多两行，并优先在标点后、连词或介词前断行，且不能拆开冠词+名词、形容词+名词、主语代词+动词等单元；BBC 也要求在标点、从句和自然短语边界断开，并指出语言完整性优先于几何均衡。W3C WebVTT 说明显式换行会被播放器保留，而播放器也会按宽度自动换行，因此不必要的硬换行不应被大量生成。来源：[Netflix General Requirements — Line Treatment](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements)、[BBC Line breaks](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Line-breaks)、[W3C WebVTT caption cues with multiple lines](https://www.w3.org/TR/webvtt1/#introduction-caption)。

### 2.5 可访问性标记

共同规则：

- 保留并本地化必要的说话人 ID、重要声效、音乐、笑声和语气/音量信息；
- 保留原有 `[]`、双说话人前缀、音乐符号或 voice-span 的结构，不把标记改成普通台词；
- 不描述纯视觉动作来替代声音；
- 不删除“剧情、气氛或理解所需”的声音；
- 不凭文本猜测新的说话人、声音或舞台动作；
- 标记中的专名仍受 glossary 约束。

W3C 将“谁在说话”和音乐、笑声、噪声列为 caption 的必要信息；YouTube 手工字幕指引示例要求加入 `[applause]`、`[thunder]`；Netflix SDH 用方括号包住说话人/声效，并要求描述声音而非视觉动作。繁中 SDH 通常仍以两行对白为限，只有不可缺少的声音描述才可占第三行；不能把这个例外扩张到普通字幕。来源：[W3C Video Captions](https://www.w3.org/WAI/perspective-videos/captions/)、[YouTube Add subtitles & captions](https://support.google.com/youtube/answer/2734796)、[Netflix English (USA) — Speaker ID / Sound Effects](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide#h_01FG78Q61DP3W5R4S4J2DKQ6T7)、[Netflix Traditional Chinese — SDH Line Treatment](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215994807-Chinese-Traditional-Timed-Text-Style-Guide)。

---

## 三、电影/电视剧 system prompt 应额外约束什么

### 3.1 戏剧意义优先于逐字对应

影视剧 prompt 应明确：

- 译出人物当下的意图和潜台词，不做词典式逐词替换；
- 保持角色之间的亲疏、阶层、礼貌程度、年龄感和时代感；
- 同一角色、称谓、专名、地点、组织、作品名跨 cue/跨集一致；
- 保持脏话和冒犯性用语的**强度与意图等值**，不擅自净化，也不把轻度用语翻得更重；
- 故意口误、误读、结巴或方言只有在影响情节/人物塑造时才保留；
- 繁中面向多地区时，默认使用广泛可懂的繁中，不擅自塞入只在单一地区成立的方言俚语；
- 已有正式/通行作品名优先使用正式译名；未提供时按 glossary 或音译策略处理。

Netflix 要求目标语复制原作的 tone、register、class、formality，脏话强度与意图等值，并通过 KNP/术语表保持跨集一致；繁中指南还要求避免只有某一地区能懂的区域俚语。来源：[Netflix English (USA) — Special Instructions](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide#h_01FG78Q64GEJ9HW4E5GHDHFAAA)、[Netflix Traditional Chinese — Special Instructions](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215994807-Chinese-Traditional-Timed-Text-Style-Guide#h_01FG75MZ82N92G19B2PD7QG0HP)、[Netflix General Requirements — Consistency](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements)。

### 3.2 俚语、文化梗、笑点与悬念

Prompt 应要求：

- 俚语和文化指涉优先做目标语中**功能等值且自然**的短译，不附解释；
- 笑点保留 setup/payoff、误会点、双关功能和角色口吻；字面双关无法兼得时，优先保住情节功能；
- 不把 punchline、身份揭示或重大情节点提前到前一个 cue；
- 不为了“更顺”补出原文没有的解释或剧透。

这也是 Netflix subtitle template 明确要求向下游译者提供的上下文：文化指涉、俚语、习语、笑话、双关、讽刺、register、formality/class、tone、intent 和人物关系都需要被解释；字幕时间不得提前泄露 punchline 或重大情节点。BBC 同样要求保留幽默，将 setup 与 punchline 正确分段，并在 reaction shot 前清屏。来源：[Netflix Subtitle Templates — Annotations](https://partnerhelp.netflixstudios.com/hc/en-us/articles/219375728-Timed-Text-Style-Guide-Subtitle-Templates)、[Netflix Subtitle Timing Guidelines](https://partnerhelp.netflixstudios.com/hc/en-us/articles/360051554394-Timed-Text-Style-Guide-Subtitle-Timing-Guidelines)、[BBC Subtitle Guidelines — Humour](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Humour)。

### 3.3 镜头、节奏与 cue 边界

Prompt 只负责在既定时长里产生可读译文，不负责改轴。影视剧测试器应另外检查：

- 24fps 下 event 是否至少 20 帧（约 0.833 秒）且不超过 7 秒；
- 是否与对白、画面和镜头切换同步；
- 相邻 cue 的 gap 是否符合平台来源规则；
- 译文是否因过长而在短镜头中无法读完；
- 是否把 punchline 移到反应镜头之前。

Netflix 的最新 timing guide要求入点尽量落在第一帧声音附近、对白结束后可留约半秒阅读时间、shot change 附近按半秒窗口调整，并维持至少 2 帧 cue gap；这些是 authoring/retiming 规则。DuetSub 消费现成时间轴时应做 QA，不应让 LLM 擅自执行。来源：[Netflix Subtitle Timing Guidelines](https://partnerhelp.netflixstudios.com/hc/en-us/articles/360051554394-Timed-Text-Style-Guide-Subtitle-Timing-Guidelines)。

### 3.4 双说话人与画面文字

Prompt 应：

- 一条 cue 中两位说话人各占一行，保持先后和归属；
- 不把两人的句子揉成一个自然段；
- 画面文字/forced narrative 与对白标记分明，不混成一句；
- 只翻译输入中已提供的画面文字，不根据画面外推；
- 对话与画面文字冲突时，不擅自删除；当前 1:1 翻译层无法重排时，应保持输入内容并交给上游选择。

Netflix 的双说话人规则是每位说话人最多一行；画面文字只在与剧情相关时加入，且不应与对白放进同一个 subtitle event。来源：[Netflix English (USA) — Dual Speakers / On-screen Text](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide)、[Netflix Traditional Chinese — Dual Speakers / On-screen Text](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215994807-Chinese-Traditional-Timed-Text-Style-Guide)。

---

## 四、YouTube system prompt 应额外约束什么

### 4.1 不把 YouTube 翻成“影视对白”

YouTube prompt 应默认内容可能是教程、评测、访谈、演讲、播客、游戏、Vlog 或 Shorts：

- 保持创作者/主持人的直接口吻、节奏和 CTA，不擅自文学化或戏剧化；
- 口头语可自然化，但不得改变主张、承诺、比较、警告、赞助披露或结论；
- 相邻 cue 用于还原跨 cue 的完整句子，但仍逐条输出；
- 若源轨是 ASR，对口音、方言、背景噪声导致的可疑专名或术语要保守：优先保留原串或 glossary 形式，不自信地“纠正”成另一个事实。

YouTube 明确提醒自动字幕会因发音、口音、方言和背景噪声误转，必须审校；W3C 还给出自动字幕把 “4 to 5 minutes / not preheat” 错成 “45 minutes / know to preheat” 的安全性示例。来源：[YouTube Use automatic captioning](https://support.google.com/youtube/answer/6373554)、[W3C Transcribing Audio to Text](https://www.w3.org/WAI/media/av/transcribing/)。

### 4.2 术语、专名、代码与 UI 标签

YouTube prompt 应要求：

- 频道名、人物名、产品名、型号、品牌、API、库、命令、文件名和 UI 可见标签使用 glossary 或原文官方写法；
- 代码、命令、参数、路径、URL、变量、快捷键和占位符视为不可翻译 token，逐字符保留；
- UI 标签如 `Save`、`File > Tools` 在没有官方本地化 glossary 时保留原文，以便观众能在画面上找到；
- 不把品牌换成“本地类似品牌”，不把技术术语改成泛义词；
- 同一术语在整段视频内只用一个译法。

Google 官方开发者文档规范要求用页面上出现的 UI label 指称按钮/菜单，代码、参数、路径、输入字符串等使用精确代码形式；这不是 YouTube caption 的格式硬规则，但适合作为技术/教程视频翻译的 **P3 内容完整性规则**。来源：[Google UI elements and interaction](https://developers.google.com/style/ui-elements)、[Google Code in text](https://developers.google.com/style/code-in-text)。

### 4.3 数字、单位、否定和教程步骤

YouTube prompt 应把以下项目列为高风险 token：

- 数字、范围、小数点、百分比、币种、版本号、日期、时间、端口、剂量和单位；
- `not`、`never`、`except`、`only`、`before`、`after`、`unless` 等改变条件的词；
- “先 A、再 B”“可选”“不要”“如果失败则”等步骤关系；
- 示例输入和期望输出。

规则：

1. 不得近似、换算、补零或改变单位，除非输入明确要求本地化换算；
2. 不得把 `4 to 5` 变成 `45`，不得丢否定；
3. 保持步骤顺序、条件、分支和可选性；
4. 一个 cue 里的动作不要移动到另一个 cue；
5. 简洁化只能删无信息的口头填充，不能删操作对象、参数、结果和警告。

W3C 的自动字幕示例表明数字范围和否定词错误会直接反转安全指令；Google 的 procedure 规范要求按顺序呈现动作、命令、占位符和结果，并把每个动作作为清晰步骤。来源：[W3C Transcribing Audio to Text](https://www.w3.org/WAI/media/av/transcribing/)、[Google Procedures](https://developers.google.com/style/procedures)。

### 4.4 YouTube 的时间轴与阈值

YouTube 官方定义 subtitle/caption 文件包含每行出现时刻的 timestamps，Studio 允许逐条编辑两个 timestamp；官方还要求自动字幕必须审校，但没有在这些创作者规范中给出统一的最短/最长 cue、CPS 或每行字符数。来源：[YouTube Supported subtitle and closed caption files](https://support.google.com/youtube/answer/2734698)、[YouTube Edit or remove captions](https://support.google.com/youtube/answer/2734705)、[YouTube Use automatic captioning](https://support.google.com/youtube/answer/6373554)。

因此 DuetSub 应：

- 绝不改动 YouTube 原始 cue 时间；
- 用目标语言 CPS/CPL 做 **P2 诊断**，首轮可借用 Netflix 的英语/繁中阈值作为保守起点；
- 分开统计人工轨和 ASR 轨，不能把 ASR 源错当翻译质量问题；
- 针对 Shorts、长教程、访谈/播客分别校准，不能用一个数值掩盖内容差异；
- 超限时优先生成更短但完整的译文；若仍超限，记录 QA，不跨 cue 搬运步骤或数字。

---

## 五、建议的两个 system prompt 规则骨架

这里不是最终英文文案，而是必须被实现和测试覆盖的规则清单。

### 5.1 Film/TV profile

```text
ROLE
Professional film/TV subtitle translator.

OUTPUT CONTRACT
JSON only; exactly one translation per cue_id; same IDs and order.
Never merge, split, omit, duplicate, reorder, annotate, or retime cues.

TRANSLATION
Natural target-language subtitles, not word-for-word prose.
Preserve plot facts, intent, characterization, relationships, register,
class/formality, humor function, setup/payoff, and equivalent profanity strength.
Never reveal a punchline or plot fact earlier than its source cue.
Use the glossary consistently across scenes and episodes.

READABILITY
Use each cue's duration as a length budget.
Prefer concise spoken language; preserve essential names, negation, numbers,
plot information, and accessibility markers.
Reflow normal line breaks at target-language semantic boundaries.
Preserve two-speaker and sound-label structure; normally use at most two lines.

ZH-HANT
Use natural, widely understandable Traditional Chinese; never Simplified Chinese.
Do not inject narrowly regional slang unless source characterization requires it.
```

### 5.2 YouTube profile

```text
ROLE
Professional translator for YouTube tutorials, reviews, interviews, podcasts,
Vlogs, gaming, talks, and Shorts.

OUTPUT CONTRACT
JSON only; exactly one translation per cue_id; same IDs and order.
Never merge, split, omit, duplicate, reorder, annotate, or retime cues.

TRANSLATION
Preserve the creator's direct voice and exact claims; do not cinematicize.
Use neighboring cues only for disambiguation and sentence continuity.
Keep terminology and names consistent with the glossary.
Treat numbers, ranges, units, negation, conditions, sequence, warnings,
code, commands, paths, URLs, placeholders, product names, and UI labels as
high-risk content; never invent, normalize, convert, or silently correct them.
For suspicious ASR names/terms, preserve the source form rather than guess.

READABILITY
Use each cue's duration as a length budget.
Remove only non-substantive fillers when needed; never remove steps or facts.
Preserve accessibility markers and speaker ownership.
Reflow line breaks at target-language semantic boundaries.

ZH-HANT
Use natural Traditional Chinese; never Simplified Chinese.
```

---

## 六、Responses API / 模型评测标准

### 6.1 Hard-fail gates

任一项失败，本次 batch 判失败：

1. 返回体不是可解析的约定 JSON；
2. 数量、`cue_id`、顺序不一致，或有空译文；
3. 合并、拆分、遗漏、复制或跨 cue 搬运信息；
4. 输出 Markdown、解释、译注或额外字段；
5. 目标为 `zh-Hant` 却出现系统性的简体字形；
6. 关键数字、否定、单位、代码、命令、URL、占位符被改变；
7. 说话人/声效/音乐标记丢失或归属变化；
8. glossary 中的锁定译名不一致；
9. punchline/揭示被提前；
10. 模型尝试返回或更改时间轴。

### 6.2 100 分评分表

| 维度 | 分值 | 自动/人审 |
|---|---:|---|
| 协议与逐条映射 | 20 | 自动；同时受 hard-fail gate |
| 语义忠实度（事实、否定、指代、因果） | 20 | 双人盲审 |
| 自然度与简洁度 | 15 | 双人盲审 |
| 时间预算与阅读速度 | 15 | 自动统计 CPS/CPL/WPM + 回放 |
| 断句、换行与跨 cue 连贯 | 10 | 自动结构检查 + 人审 |
| profile 特性 | 10 | 影视：人物/语气/笑点；YouTube：术语/步骤/技术 token |
| 可访问性标记 | 5 | 自动标记守恒 + 人审 |
| 一致性（glossary、人物、术语） | 5 | 自动术语扫描 + 人审 |

建议通过线：

- 无 hard fail；
- 总分 ≥ 85；
- 影视剧与 YouTube 两个 profile 各自 ≥ 80；
- 数字/否定/代码/标记保真率 100%；
- 逐条映射成功率 100%；
- 不能只报平均分，必须列出 P95 延迟、失败重试、超限 cue 比例和每类错误计数。

### 6.3 最小测试集

影视剧至少覆盖：

- 同一角色在亲密/正式场景中的称谓变化；
- 俚语、文化指涉、讽刺、双关和笑点 payoff；
- 脏话强度与被 bleep 的内容；
- 专名/作品名/跨集 glossary；
- 两位说话人同 cue；
- 短时长高信息 cue；
- 跨 cue 长句、打断、停顿；
- `[door slams]`、`[laughs]`、音乐等 SDH；
- 画面文字/forced narrative；
- punchline 后紧接反应镜头。

YouTube 至少覆盖：

- 教程编号步骤和可选/条件分支；
- `4 to 5`、小数、百分比、版本号、日期、时间、单位；
- 否定词和安全警告；
- 命令、参数、路径、URL、代码、占位符；
- UI label 与菜单路径；
- 品牌、频道名、API/库/型号；
- ASR 中疑似误识别的专名、口音和背景噪声；
- 主持人/嘉宾多说话人；
- `[applause]`、`[laughter]`、环境声；
- Shorts 快语速与长教程跨 cue 句子。

每个 case 应保存：

- 输入 JSON；
- 期望保持不变的 tokens/markers/IDs；
- 可接受译法的语义要求，而不是只存唯一“标准答案”；
- 自动指标；
- 两名审校者对自然度、忠实度和 profile 适配的独立评分；
- 实际视频时间轴回放结果。

---

## 七、实现前的 stop rule

如果模型仍只收到 `texts[]`：

- 可以测试 JSON 协议、等长同序、基本自然度和部分上下文连贯；
- **不能宣称已经测试了按 cue 时长控制 CPS/WPM**；
- **不能宣称两个 profile 已真正分流**，除非调用点确实根据站点/内容类型选择了不同 system prompt；
- **不能把短 cue 的超限归咎于模型**，因为模型未收到 duration；
- **不能要求模型可靠识别 ASR 错误、角色、画面文字或说话人**，除非输入提供相应元数据。

只有在输入包含稳定 `cue_id`、`start_ms`、`end_ms`、`profile`，并且响应经过 schema/ID/token 校验后，才可以把评测结论写成“DuetSub 更新后的 Responses API 字幕翻译可用性”。

---

## 一手来源

- [Netflix — Timed Text Style Guide: General Requirements](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements)
- [Netflix — Subtitle Timing Guidelines](https://partnerhelp.netflixstudios.com/hc/en-us/articles/360051554394-Timed-Text-Style-Guide-Subtitle-Timing-Guidelines)
- [Netflix — Subtitle Templates](https://partnerhelp.netflixstudios.com/hc/en-us/articles/219375728-Timed-Text-Style-Guide-Subtitle-Templates)
- [Netflix — English (USA) Timed Text Style Guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide)
- [Netflix — Chinese (Traditional) Timed Text Style Guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215994807-Chinese-Traditional-Timed-Text-Style-Guide)
- [Netflix — How is reading speed measured?](https://partnerhelp.netflixstudios.com/hc/en-us/articles/115001352212-How-is-reading-speed-measured-Do-punctuation-and-spaces-count)
- [BBC — Subtitle Guidelines v1.2.5](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/)
- [YouTube — Add subtitles & captions](https://support.google.com/youtube/answer/2734796)
- [YouTube — Edit or remove captions](https://support.google.com/youtube/answer/2734705)
- [YouTube — Use automatic captioning](https://support.google.com/youtube/answer/6373554)
- [YouTube — Supported subtitle and closed caption files](https://support.google.com/youtube/answer/2734698)
- [Google — Procedures](https://developers.google.com/style/procedures)
- [Google — UI elements and interaction](https://developers.google.com/style/ui-elements)
- [Google — Code in text](https://developers.google.com/style/code-in-text)
- [W3C — WebVTT](https://www.w3.org/TR/webvtt1/)
- [W3C WAI — Video Captions](https://www.w3.org/WAI/perspective-videos/captions/)
- [W3C WAI — Transcribing Audio to Text](https://www.w3.org/WAI/media/av/transcribing/)
- [EBU — EBU-TT-D Subtitling Distribution Format, Tech 3380](https://tech.ebu.ch/files/live/sites/tech/files/shared/tech/tech3380v1_0_1.pdf)
