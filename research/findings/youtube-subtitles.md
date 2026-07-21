# YouTube 字幕体系调研（ticket 01）

Date: 2026-07-21
Ticket: `.scratch/dual-sub-spec/issues/01-youtube-subtitle-research.md`

结论面向 DuetSub 的场景：桌面 Chrome、内容脚本运行在已登录的真实浏览器页面内，与 yt-dlp 之类「浏览器外抓取」处境不同——这点直接影响第 2、4 节对 POT token 的评估。

## 1. 字幕轨枚举：`captions.playerCaptionsTracklistRenderer`

播放器响应（首载时是页面内联的 `ytInitialPlayerResponse`；SPA 换视频后来自 `POST /youtubei/v1/player` 的 InnerTube 响应）中：

```jsonc
"captions": {
  "playerCaptionsTracklistRenderer": {
    "captionTracks": [
      {
        "baseUrl": "https://www.youtube.com/api/timedtext?v=...&expire=...&signature=...&lang=en&fmt=srv3...",
        "name": { "simpleText": "English" },        // 部分客户端为 { "runs": [{ "text": "English" }] }
        "vssId": ".en",                              // 人工轨 ".<lang>"；ASR 轨 "a.<lang>"
        "languageCode": "en",                        // BCP-47：en / zh-Hans / zh-Hant（旧视频可见 zh / zh-CN / zh-TW）
        "kind": "asr",                               // 仅自动生成轨有此字段；人工上传轨无 kind
        "isTranslatable": true,
        "trackName": ""                              // 创作者命名多轨时非空
      }
    ],
    "audioTracks": [{ "captionTrackIndices": [0, 1] }],
    "translationLanguages": [                        // 可作为 tlang 目标的语言全集
      { "languageCode": "zh-Hans", "languageName": { "simpleText": "Chinese (Simplified)" } }
    ],
    "defaultAudioTrackIndex": 0
  }
}
```

要点：

- 枚举唯一可靠来源就是 player response；无字幕的视频整个 `captions` 键缺失。
- `baseUrl` 是已签名的 timedtext URL（含 `expire`/`signature`/`sparams` 等），有时效，不能久存。
- `name` 是展示名（含 "English (auto-generated)" 这类后缀），判断轨道性质不要用它，用 `kind` 和 `vssId`。
- 同一语言可同时存在人工轨与 ASR 轨（`.en` 与 `a.en` 并存）。

来源：
- https://levelup.gitconnected.com/how-to-download-youtube-captions-using-a-go-script-3b0ae6df6046
- https://medium.com/@aqib-2/extract-youtube-transcripts-using-innertube-api-2025-javascript-guide-dc417b762f49
- https://nadimtuhin.com/blog/ytranscript-how-it-works
- https://github.com/trldvix/youtube-transcript-api （vssId / kind 语义与本表一致）

## 2. `/api/timedtext`：参数、格式、cue 映射

### 请求参数

`baseUrl` 已带齐签名参数；实践中在其后追加/改写以下参数（未列入签名校验的部分可改）：

| 参数 | 含义 |
|---|---|
| `v` | 视频 id |
| `lang` | 源轨语言码 |
| `kind=asr` | 指定 ASR 轨（人工轨无此参数） |
| `name` | 命名轨的 trackName |
| `tlang=<code>` | 让服务器把该轨机翻成目标语言（自动翻译轨） |
| `fmt` | `json3` / `srv1` / `srv2` / `srv3`(YTT) / `vtt` / `ttml`；缺省为旧版 XML |
| `expire`,`signature`,`sparams`,`caps`,... | baseUrl 自带的签名与元数据，原样保留 |
| `c=WEB`, `potc=1`, `pot=<token>` | 2025 年起网页播放器实际请求携带的 Proof-of-Origin 参数（见下） |

### POT（Proof-of-Origin Token）现状——2025 年重要变化

- 自 2025 年（yt-dlp issue #13075，2025-05）起，部分视频的 timedtext 请求**必须带 `pot` 参数，否则返回空响应体**；浏览器页面自身的请求由 BotGuard 在页面内生成 pot 并附上，而从 baseUrl 裸拼的请求没有 pot。
- yt-dlp 的 PO Token Guide 确认 `web` 客户端的 Subs 请求在 POT 强制范围内；token 绑定 visitor/session 或 video id，且「仍在持续变化中」。
- **对 DuetSub 的含义**：不要在扩展里自己裸 fetch baseUrl（可能拿到空响应）。首选**拦截播放器自己发出的 timedtext 请求**（URL 已含有效 pot），第二语言轨用同一 URL 改写 `lang`/`kind`/`tlang`/`fmt` 再请求——pot 绑定的是会话/视频而非具体轨道，这是双字幕类扩展的通行做法；改参是否触发签名失败须在 ticket 03 用真实请求样本验证。

来源：
- https://github.com/yt-dlp/yt-dlp/issues/13075 （"removing the pot=… causes the response body to be empty"）
- https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide （web 客户端 Subs 需 POT；token 绑定语义）

### 格式与 cue 映射

**json3**（`fmt=json3`，推荐）：

```jsonc
{ "events": [
  { "tStartMs": 5000, "dDurationMs": 3000,
    "segs": [ { "utf8": "Hello " }, { "utf8": "world", "tOffsetMs": 400 } ],
    "aAppend": 1,          // ASR 滚动追加行，双语并排显示应跳过
    "wWinId": 1, "wpWinPosId": 2 }  // 窗口/定位事件可忽略
] }
```

映射到 `{ start, end, text, language }`：

- `start = tStartMs`（ms）；`end = tStartMs + dDurationMs`
- `text = segs.map(s => s.utf8).join("")`；过滤无 `segs` 的事件（纯样式/窗口定义）、`aAppend===1` 的事件、纯 `"\n"` 段
- `language` 不在响应体里，取自发起请求时所选轨的 `languageCode`（或 `tlang` 目标码）——response 与 track 元数据必须配对携带
- ASR 轨的 seg 带 `tOffsetMs`（逐词卡拉OK时间）与 `acAsrConf`，双语场景只需整行文本，可忽略

**srv3 / YTT**：XML（`<timedtext><body><p t="5000" d="3000">…`），是 YouTube 自家全功能格式（pen 样式、窗口定位、逐音节卡拉OK、竖排、ruby），网页播放器默认拉取的就是它；解析成本高于 json3，除非要保真样式否则不选。**vtt** 标准 WebVTT，可用浏览器现成解析器，但会丢 seg 级信息。三者内容同源，本项目取 json3 即可。

来源：
- https://nadimtuhin.com/blog/ytranscript-how-it-works （json3 事件结构与过滤规则）
- https://github.com/arcusmaximus/YTSubConverter （srv3/YTT 格式能力）
- https://summarize.sh/docs/timestamps.html （json3 字段：tStartMs/dDurationMs/segs）

## 3. 三类轨道的辨别与「官方轨」边界建议

| 轨道类型 | 数据特征 |
|---|---|
| 创作者上传轨 | `captionTracks` 条目，**无 `kind`**，`vssId` 形如 `.zh-Hant` |
| ASR 自动生成轨 | `captionTracks` 条目，`kind === "asr"`，`vssId` 形如 `a.en`，`name` 带 "(auto-generated)" |
| 平台自动翻译轨 | **不在** `captionTracks` 里，是「某条 `isTranslatable` 轨 + `tlang` 参数」请求出来的衍生物；可选目标语言列在 `translationLanguages` |

**建议边界（供 spec 采纳）**：

1. **官方轨 = 创作者上传轨**（无 `kind` 字段的 captionTracks 条目），语言码归一化后匹配 `zh*` / `en*`。中文归一化需覆盖 `zh-Hant`/`zh-TW`/`zh-HK` → 繁、`zh-Hans`/`zh-CN`/`zh` → 简，再按 map 既定优先级 `zh-Hant > zh-Hans` 选取。
2. **ASR 轨不算官方轨**，但当英文侧没有人工轨时，`a.en` 可作为「优于纯机翻」的英文源轨降级使用（它是官方管线产物、时间轴精确；标注区分即可）。
3. **`tlang` 自动翻译轨等同机翻兜底**，与项目自带的机翻兜底同层：只有单官方轨时，优先用「官方轨 + `tlang`」补齐另一语言（服务器端、零额外依赖），失败再走扩展自己的翻译器。

依据：`kind`/`vssId` 语义见第 1 节来源；边界取舍是结合 map 立场 4（官方双轨优先、机翻兜底）的本项目建议。

## 4. 注入与时钟

- **MAIN world：需要。** 首载时 `ytInitialPlayerResponse` 虽可从内联 `<script>` 文本正则出来（ISOLATED world 可读 DOM），但 SPA 换视频后新的 player response 走 `/youtubei/v1/player` XHR，DOM 里没有。可靠方案是注入 MAIN world 脚本做两件事之一（或都做）：
  1. 读 `window.ytInitialPlayerResponse` / `document.querySelector('#movie_player').getPlayerResponse()`；
  2. patch `fetch`/`XMLHttpRequest`，捕获 `/youtubei/v1/player`（轨道枚举）与 `/api/timedtext`（含 pot 的真实字幕 URL 及响应体）。
  鉴于第 2 节的 POT 结论，**方案 2 的 timedtext 拦截几乎是必需的**；MV3 下用 `chrome.scripting.registerContentScripts({world: 'MAIN'})` 或 manifest `world: "MAIN"` 声明，经 `window.postMessage`/CustomEvent 与 ISOLATED world 通信。
- **播放时钟**：`#movie_player video.html5-main-video`（`<video class="video-stream html5-main-video">`）的 `currentTime`。监听 `timeupdate`（约 4Hz，字幕粒度足够）+ `seeking`/`seeked`；Read Frog 也是这么做的（见第 5 节）。不要用播放器 UI 的进度条 DOM。
- **SPA 导航与重初始化**：YouTube 是 SPA，换视频不重载页面、内容脚本不会重跑。监听 `document` 上的 `yt-navigate-finish`（导航完成后触发）作为主信号；已知它偶发不触发或触发时 DOM 未就绪，成熟做法是叠加 `yt-navigate-start`/`popstate` + MutationObserver 兜底。重初始化流程：确认 URL 是 `/watch` 且 `v=` 变化 → 清空 cue 缓存与当前索引 → 重新取 player response 枚举轨 → 重新拉双轨字幕。注意 `<video>` 元素本身跨导航复用，事件监听可以保留，但必须防止旧视频 cue 残留（Read Frog 的 `reset()` 即为此设计）。

来源：
- https://github.com/Zren/ResizeYoutubePlayerToWindowSize/issues/72 （yt-navigate-start/finish 语义）
- https://zenn.dev/harness/articles/youtube-playlist-date-sorter?locale=en （SPA 下内容脚本不重跑、yt-navigate-finish 用法）
- https://github.com/Qrytics/shortsBlocker （yt-navigate-finish + MutationObserver 兜底模式）

## 5. Read Frog 实现要点（本地 `research/upstream/read-frog/`）

上游：read-frog@9bb7f9e（2026-07-20，GPL-3.0，仅支持 YouTube；见 `research/upstream/read-frog/PROVENANCE.md`）。

- **cue 模型**（`types.ts`）：`SubtitlesFragment { text, start, end, translation? }`——单数组、翻译作为可选字段挂在原文 cue 上，而非两条独立轨。时间单位 ms。状态机仅 `idle | loading | error`。
- **调度器**（`subtitles-scheduler.ts`）：
  - 以 `HTMLVideoElement` 为唯一时钟，监听 `timeupdate` + `seeking`，每次用 `currentTime*1000` 在有序数组里线性 `find` 命中 `start <= t < end` 的 cue；索引变化才写 store（jotai atom），避免重复渲染。
  - `supplementSubtitles()` 支持增量合并：按 `start` 作 key 去重，新片段若带 `translation` 就地补到已有 cue 上，且若补的是当前正显示的 cue 会强制刷新——这是「原文先显示、译文异步到达」的流式设计，DuetSub 双官方轨场景同样适用（两轨到达时间不同/机翻兜底异步补齐）。
  - `reset()` 清空 cue 与索引——即换视频重初始化的钩子。错误态 5 秒自动隐藏。
- **显示规则**（`display-rules.ts`）：`displayMode` 决定渲染——`translationOnly` 模式要求 `translation` 存在才渲染；`isAwaitingTranslation` 用「当前 cue 无译文」或全局 loading 态驱动加载指示。
- **渲染**（`subtitle-lines.tsx`）：两行两个组件 `MainSubtitle` / `TranslationSubtitle`，各自独立的字体/字号（`fontScale/100` 转 em）/颜色/字重配置；译文行按目标语言设置 `dir` 与 `lang` 属性（RTL 与字体正确性）。对 DuetSub 的启示：两行样式独立配置 + 译文行标 `lang`，中文行应设 `lang="zh-Hant"`/`"zh-Hans"`。
- **对照差异**：Read Frog 是「单源轨 + 自己机翻」模型；DuetSub 是「双官方轨」模型，但其 cue 合并（按 start 对齐）、video 时钟调度、增量补翻译三个机制可直接借鉴。注意 GPL-3.0——只借鉴思路，不复制代码进 runtime。

## 与后续 ticket 的接口

- ticket 03（真实请求样本）需验证：改写截获的 timedtext URL 的 `lang`/`tlang`/`fmt` 参数是否被签名/pot 校验拒绝；`yt-navigate-finish` 后 `/youtubei/v1/player` 响应的捕获时序。
- 双轨对齐：两条官方轨的 cue 时间轴不保证一一对应（各自打轴），spec 需定对齐策略（按时间重叠配对，而非 Read Frog 的 start 精确相等）。
