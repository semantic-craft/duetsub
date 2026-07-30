# DuetSub 实现就绪 Spec

Status: ready-for-implementation
Created: 2026-07-22
Supersedes: `.scratch/dual-sub-spec/` 规划树（ticket 08 终点）
Authoritative over: `README.md`（三站、Netflix-first 的旧表述已过时；以本 spec 的四站、Prime-first 为准）

本文件汇总 map 与 ticket 01–07 的全部已锁定决策，并在此就地拍板 ticket 06 的兜底细则，达到「实现会话可直接开工、无需再做决策」的精度。术语沿用规划树的 ubiquitous language（见 Further Notes 词汇表）。

---

## Problem Statement

用户在 Netflix、Prime Video、HBO Max、YouTube 上看片时，想同时看到**英文**与**繁体中文**两行字幕，用来做语言学习与理解校对。流媒体播放器一次只显示一条字幕轨；即便平台同时提供中英官方轨，也要反复进设置菜单来回切换，无法并排对照。已有的沉浸式翻译等方案要么是闭源专有、要么把单轨拆句机翻，时轴与官方轨对不齐，且把整段字幕发往第三方翻译。

## Solution

DuetSub 是一个可独立侧载并公开发布源码与构建产物的 Chrome MV3 扩展。在四个目标站的播放器控制栏注入一个 **toggle button**；用户点一下即在视频上叠加一层扩展自有的 **overlay**，英文在上、繁体中文在下，由真实 `<video>` 时钟驱动，与播放严格同步。

字幕来源优先用**登录用户当前已能取用的官方轨**：中英官方轨都在时直接并排，绝不机翻。只有某一侧没有官方轨时，才用用户自备 key 的 **DeepSeek / 千问 / 豆包或其他 OpenAI 兼容模型**补齐缺失的那一侧（**MT fallback**）；只有简体官方轨时用 **OpenCC** 转繁显示。供应商、模型与 key 在扩展 **options page** 本地配置、存 `chrome.storage.local`，只经 service worker 走 HTTPS 发往用户选定并授权的端点，绝不写日志、绝不外发观看数据。

产品红线（README）不变：只用平台已给当前观众的字幕轨，不下载视频、不绕过 DRM、不解锁地区限制轨、不上传观看数据。

## User Stories

### 核心双语观看

1. As a 观众, I want 点一下播放器上的 DuetSub 按钮就叠加中英双语字幕, so that 无需进平台设置菜单来回切轨。
2. As a 观众, I want 英文行在上、繁体中文行在下且置顶时也不反转行序, so that 阅读位置稳定、主辅关系一致。
3. As a 观众, I want 中英官方轨都存在时直接并排两条官方轨、完全不机翻, so that 得到平台校对过的高质量字幕。
4. As a 观众, I want 双语字幕严格贴合我正在播放的画面（0ms 容差、按原 cue 区间调度）, so that 字幕不早不晚、不与画面错位。
5. As a 观众, I want 一条长字幕与多条短字幕同屏时两侧都完整显示, so that 不因「配对失败」丢字幕。
6. As a 观众, I want 某一侧当前没有 active cue 时另一侧仍单独显示, so that 不因一侧空缺而整组消失。
7. As a 观众, I want DuetSub 工作时隐藏平台原生字幕层, so that 画面上不出现重复或第三行字幕。
8. As a 观众, I want 关闭 DuetSub 或它重置/卸载时平台原生字幕自动恢复, so that 我能随时切回平台原生体验。

### 机翻兜底与中文轨处理

9. As a 观众, I want 只有英文官方轨时自动用我配置的模型机翻出繁体中文那一行, so that 没有官方中文轨也能看双语。
10. As a 观众, I want 只有中文官方轨时自动机翻出英文那一行, so that 中文内容也能配上英文对照。
11. As a 观众, I want 只有简体官方轨时用 OpenCC 转成繁体显示, so that 与我的繁体阅读偏好一致。
12. As a 观众, I want 机翻生成的那一行行首有一个小小的内联 `MT` 标记、官方轨不标, so that 我一眼分清哪行是机器翻译、哪行是官方字幕。
13. As a 观众, I want 机翻行与对应官方行同色同字重同正体（不靠淡色或斜体作唯一线索）, so that 不与旁白/画外音等字幕语义混淆。
14. As a 观众, I want 机翻按整轨预热 + 沿播放位置滚动补翻, so that 当前与即将播放的字幕最先就绪、观看不卡顿。
15. As a 观众, I want 重看或往回拖时命中已翻译缓存, so that 不重复消耗我的模型额度、字幕秒出。
16. As a 观众, I want 中英官方轨都在时永不触发机翻, so that 不产生无谓的 API 费用。

### 本地配置（options page，仅云端自备 key）

17. As a 首次用户, I want 在扩展 options page 选择翻译供应商（DeepSeek / 千问 / 豆包 / OpenAI 兼容 / 本机 Ollama·LM Studio）并选择或手动填写模型, so that 我能用云端额度或完全本地的模型做机翻兜底。
18. As a 用户, I want key 以掩码形式输入并存在本地 `chrome.storage.local`, so that key 不明文暴露、不进日志、不离开我的机器（除发往我选定的翻译端点）。
19. As a 用户, I want 未配置 key 时官方轨照常显示、只在需要机翻的那一侧给一次性提示引导我去配置, so that 缺 key 不会让整个字幕消失。
20. As a 用户, I want 目标语言与选轨链由扩展固定（繁中 / §C）、而模型来源可配, so that 常规配置简单、又能改用本地或其他模型。

### toggle button 交互

21. As a 观众, I want DuetSub 按钮出现在每个站点播放器控制栏内合适的位置, so that 我在熟悉的地方就能找到它。
22. As a 观众, I want 按钮明确显示 DuetSub 当前是开还是关, so that 我知道现在有没有生效。
23. As a 观众, I want DuetSub 默认关闭、由我主动点开, so that 不打扰我默认的平台体验。
24. As a 观众, I want 同一站点记住我上次开/关的选择, so that 换集或重进后不必每次重新开启。
25. As a 观众, I want 广告或拖动期间 overlay 内部临时清屏/挂起而按钮仍显示为「开」, so that 我不必在这些瞬间反复手动开关。

### 站点适配（四站）

26. As a Prime Video 观众（新加坡区、国际站 www.primevideo.com）, I want DuetSub 通过菜单枚举并自动串行切轨抓取 `.ttml2` 双轨, so that 无需我手动切字幕。
27. As a HBO Max 观众（play.hbomax.com）, I want DuetSub 由完整 subtitle playlist/API 映射驱动第二轨的 WebVTT, so that 第二轨来源可靠、不靠猜 URL。
28. As a Netflix 观众, I want DuetSub 优先走 manifest 快路径、缺失时自动切原生中英轨抓 TTML 并在结束后恢复我的原选项, so that 我的字幕设置不被永久改动。
29. As a YouTube 观众, I want DuetSub 在缺 POT 时自动 prime、抓到请求后恢复我的原字幕状态, so that 我原本的字幕开关状态不被留下副作用。
30. As a YouTube 观众, I want 官方创作者字幕优先、ASR 与平台自动翻译只作降级, so that 优先得到人工字幕质量。

### 健壮性（导航 / 换集 / seek / 广告）

31. As a 观众, I want 我拖动进度条时字幕立即清屏、松手后按新时钟恢复, so that 拖动期间不显示错位的旧字幕。
32. As a 观众, I want 站内换集时 DuetSub 重新枚举新集字幕并重绑新 `<video>`, so that 换集后双语继续工作。
33. As a 观众, I want SPA 导航离开播放页时 DuetSub 清理并恢复原生层, so that 不在非播放页残留 overlay。
34. As a 观众, I want 进入广告或疑似广告时 DuetSub 立即停显、恢复原生层，确认回到节目时钟才恢复（fail closed）, so that 广告不会导致字幕错轴或错配。
35. As a 观众, I want 某站点的适配 gate 无法满足时该站按 unsupported 处理而非显示坏字幕, so that 我不会看到时轴错乱或张冠李戴的字幕。

### 验证者视角

36. As a 实现/测试者, I want 每种字幕格式解析器都是可用真机 fixture 单测的纯函数, so that 时轴与文本抽取的正确性有回归保障。
37. As a 实现/测试者, I want 选轨与双轨调度是不碰 DOM/网络的纯逻辑, so that 核心行为可脱离浏览器快速验证。
38. As a 实现/测试者, I want 机翻批处理与缓存逻辑在 mock 掉供应商 HTTP 边界后可测, so that 兜底与容错路径有测试覆盖。
39. As a 实现/测试者, I want 每站 adapter 的 DOM/拦截行为有明确的真机验收 gate 与 stop rule, so that 「看见响应」不被误当成「适配完成」。
40. As a 实现/测试者, I want 双轨 `0ms` 严格调度只用完整轨/真实回放验证, so that 不用零碎样本冒充统计校准。

### UI 补充（2026-07-22）

41. As a 观众, I want 播放器按钮上看到当前用官方双轨还是官方+机翻、以及翻译进度, so that 我知道字幕来源与延迟原因。
42. As a 观众, I want 机翻不佳时一键重新翻译（跳过缓存）, so that 不必清整个缓存。
43. As a 观众, I want 从播放器右键直接打开设置页, so that 配置模型少跳几步。
44. As a 注重隐私/离线的用户, I want 把翻译指向本机 Ollama/LM Studio 端点, so that 字幕完全不发往云端。

## Implementation Decisions

### A. 架构与技术栈（ticket 04，已冻结）

- **五层 seam + 薄 MAIN world**，映射到 MV3 三执行环境：
  - **MAIN world**：只 patch fetch/XHR/JSON.parse、读播放器全局，抓到原始数据即 postMessage 给 ISOLATED；不解析、不选轨、不构造 URL、不存字幕/用户状态。主动字幕 fetch 优先由 ISOLATED 做，CORS/签名不允许时改由播放器自动切轨被动截获，不在 MAIN 加 fetch 业务层。
  - **ISOLATED content script**：承载 site adapter（解析清单/响应、轨道枚举、`fetchTrack`、站点私有 `trackId→handle` 映射）、cue 归一化、synchronizer（video 时钟调度）、overlay 渲染、选轨策略。
  - **Service worker**：只做翻译模型调用（避开页面 CSP）与翻译缓存持久化；**不参与字幕实时路径**。
- **注入方式**：`content_scripts` 静态声明 `world: "MAIN"` + `run_at: "document_start"`，按四站 match pattern。这是保证「先于播放器任何脚本」的唯一方式；不用动态 `chrome.scripting`。
- **技术栈**：TypeScript(strict) + WXT（管 manifest/构建/HMR）+ vanilla DOM overlay（两行 `textContent` 直写，约 4Hz 更新，不引 React/Vue/Solid）。
- **代码组织**：单扩展；每站一对 entrypoint（ISOLATED adapter + MAIN hook，形态本不同，各写各的，不做「通用拦截器+配置」抽象）；共享 core 层放 cue 模型 / TrackInfo / 选轨 / synchronizer / overlay / MAIN↔ISOLATED 消息协议；mt 层放经 background 的 OpenAI-compatible 翻译 client。

### B. 核心数据契约（ticket 04，type shape 来自 grilling，直接采用）

```ts
interface Cue {
  start: number;                 // ms（节目时间轴）
  end: number;                   // ms
  text: string;                  // 保留 \n；不保留可执行标记
  language: string;              // 归一化 BCP-47
  position?: 'top' | 'bottom';   // 缺省 bottom；仅在源格式明确表达上方 region/line 时写 top
}

interface TrackInfo {
  id: string;
  language: string;                            // adapter 归一化为 BCP-47
  source: 'official' | 'asr' | 'platform-mt';  // 官方 / ASR / 平台自动翻译
  label: string;
}

interface SiteAdapter {
  id: 'netflix' | 'primevideo' | 'max' | 'youtube';
  start(): void;
  onTracks(cb: (tracks: TrackInfo[]) => void): void;
  onCues(cb: (trackId: string, cues: Cue[]) => void): void;
  fetchTrack(track: TrackInfo): Promise<Cue[]>;
  onReset(cb: (reason: 'navigation' | 'episode' | 'seek-flush') => void): void;
}
```

- Cue 只有四字段 + 可选定位；样式字段全部丢弃，由 overlay 硬编码。轨道级元数据进 `TrackInfo`，不塞进 cue。
- 枚举+取数在 adapter，**选轨策略在核心层一处、四站共用**，adapter 不选轨。

### C. 选轨与来源优先链（ticket 06 就地拍板；落实 map 立场 4「单官方轨时机翻补齐另一侧」）

核心层对**英文侧**与**中文侧**各自独立解析出唯一来源，取各侧可得的最佳来源：

- **中文侧**：`官方 zh-Hant` > `OpenCC(官方 zh-Hans)` > `MT(en→zh-Hant)`。
- **英文侧**：`官方 en` > `MT(zh→en，源取 zh-Hant 或 zh-Hans)`。
- **两侧都有官方轨** → 一律不机翻（README 红线）。
- **两侧都无可用来源** → 该内容 DuetSub fail closed，不显示（不是报错，是无声不显）。
- 该优先链**硬编码**、不做设置界面（map 立场 6）。

> **就地拍板项（可否决）**：
> (a) 只有简中官方轨时用 **OpenCC 转繁**显示，而非显示原简体——理由：overlay 繁体优先已锁（ticket 05），显示简体与之不一致；OpenCC 是离线确定性脚本转换、无 API 成本、保真高于机翻。OpenCC 行**不加 `MT` 标记**（仍是官方内容）。若你更想直接显示简中，改此项即可。
> (b) 机翻**双向**（缺哪侧补哪侧），源自 map 立场 4 的「补齐另一语言」。若只想做 en→zh-Hant 单向，收窄此项。

### D. 机翻兜底细则（ticket 06 就地拍板）

- **引擎/模型/key**（2026-07-30）：默认仍为 DeepSeek；新增千问（阿里云百炼·中国区）、千问（阿里云百炼·新加坡区）与豆包（火山方舟·中国区）预设，并继续支持任意 OpenAI 兼容端点及**本机模型**（Ollama / LM Studio 等）。千问默认 `qwen3.7-flash`，并提供 `qwen3.7-plus`、`qwen3.7-max` 与 `qwen3.6-flash` 候选；模型栏始终可编辑，用户可手动填写其他模型 ID。豆包候选含 `doubao-seed-2-1-pro-260628`。供应商 / Workspace ID（仅千问）/ Base URL / key / 模型 / 联网搜索（仅千问）在 options page 配置、存 `chrome.storage.local`（详见 §I）；千问与豆包走各自 OpenAI 兼容 Responses API，DeepSeek、自定义与本机端点保持 Chat Completions。
- **繁体产出**：prompt 指定输出繁体中文；所有供应商的 zh-Hant 输出再过一遍 OpenCC(s2t) 作保险，避免偶发简体混入。
- **请求约束**：字幕翻译使用明确的 system prompt，锁定目标语言、逐项保序、不增删拆并、保留语气/专名/标点/换行，并给出 `{"translations":[...]}` JSON 输出样例。千问 Responses 默认使用 `reasoning.effort: none`，允许联网搜索时切换为 `low`，且始终不存储响应；豆包 Responses 使用 `thinking.type: disabled`、`text.format: json_object` 且不存储响应；DeepSeek 保持现有 JSON Output Chat Completions；自定义端点只发送通用 OpenAI-compatible 字段。
- **千问联网搜索**：仅作为默认关闭的显式用户选项；启用时按百炼 Responses API 文档添加 `tools: [{"type":"web_search"}]` 与低强度思考，由模型自行决定是否搜索。不得发送 Chat Completions 的 `enable_search`，也不暴露 Responses API 不支持的强制搜索、搜索策略、来源站点或角标来源设置。搜索开关进入翻译缓存身份，开关前后的结果不得互相命中。
- **批处理**：整轨 **warmup 预热 + 沿播放位置滚动补翻**（承 ticket 02 的 Read Frog 模板）。按播放头优先级分批（当前 cue 最高、其后若干条次高），每次模型请求限定 N 条 cue（避免单请求过长超时；一集 ~35k 字符分多批完成）。快进/跳转用 AbortController 取消在途请求。
- **翻译保时轴**：机翻**逐 cue 翻译、沿用官方源轨的 `start/end`**，不重新拆句、不做时间轴再对齐。译文写回对应 cue 的 `text`，时轴不变。
- **缓存**：service worker 侧 IndexedDB 持久化；key = `hash(contentId + trackId + 归一化源文本 + 目标语言 + 模型)`，内容寻址，重看/回拖命中。失效按内容 identity + 模型（换 key/模型自然 miss）；容量上限 + LRU 淘汰。
- **失败降级（fail-soft，永不阻塞官方轨）**：
  - 未配置 key：官方轨照显；需机翻的那侧显示一次性内联提示（点击去 options page），不整屏空白。
  - API 报错/超额：官方侧照显；受影响的机翻 cue 显示不显眼的「翻译失败」占位并静默退避重试；绝不清空整个 overlay。
  - 机翻失败绝不影响官方轨渲染与 toggle 状态。

### E. 双轨配对与调度（ticket 07，已冻结；Max 例外于 2026-07-24 批准）

- Prime Video / Netflix / YouTube **不预合并、不建 paired-cue 模型、不按索引/起点/最近邻/全局 offset 配对**。核心层在 `t = video.currentTime * 1000` 分别计算：

```text
enActive = English cues where start <= t < end
zhActive = Chinese cues where start <= t < end
```

- 容差固定 **`0ms`**，不延长任一 cue。长 cue 天然与多条短 cue 一对多/多对一同屏。
- 任一侧无 active cue 时另一侧仍单独显示；不得因配对失败丢字幕。
- 同侧多个 active cue 按源顺序以 `\n` 合并。任一 active cue 为 `top` 时沿用整组置顶规则。
- 顺播用有序游标；seek 或时间倒退后对两轨二分定位。
- **Max 官方双轨例外**：普通官方英文字幕优先；只有节目没有普通英文字幕时才退回官方英文 CC。英文 CC 可作为音频主时钟尝试受控对齐：每条中文 cue 只使用其**原始起点**查找当时唯一 active 的英文 cue；唯一候选存在时，显示副本采用该英文 cue 的完整 `[start,end)`，源 cue 不改写。多个中文 cue 落入同一英文 cue 时按中文源顺序同屏合并；不猜固定延迟、最近邻或文本语义。
- 当一个中文源 cue 明确含多个对话行、当前英文 cue 的可说话单元不足，且该中文源区间还覆盖后续英文 cue 时，才把溢出行依源顺序移到后续有对白的英文 cue；没有说话人前缀或句末标点的显式换行，也只有在每条溢出行都能一对一落到源区间覆盖的后续英文对白 cue 时才按行拆分。不做翻译语义重排。Max 只有在不少于 **95%** 的中文 cues 都能取得上述唯一候选时才启用英文主轨对齐；低于门槛时不应用该对齐副本，保留英中两条官方轨各自的原始 cue 区间，不丢弃整对字幕。该门槛来自 2026-07-24 两集登录态完整 VTT 的内存核验（258/263，98.10%；英文 CC 310/314，98.73%），不是伪造 fixture；2026-07-31 登录态节目同时验证了低覆盖率原始时序回退。

### F. Overlay 渲染规格（ticket 05 基线，2026-07-30 更新字号层级）

- **行序/间距**：英文上、繁中下，置顶不反转；两行各 `line-height: 1.28`，第二行额外 `0.10em`。
- **字号/字形**：英文为主行 `100%`、中文为辅行 `90%`；基础字号按播放器容器高度 `clamp(13.76px, 6.2cqh, 40px)`（等价于 16px 根字号下的 `0.86rem`–`2.5rem`，但端点不得受宿主页面根字号污染；cqh，非 viewport）；中文行 `lang="zh-Hant"`，字体栈 `"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif`，英文系统 sans-serif。
- **背景**：Variant B——双语两行共用一块随内容宽度收缩的紧凑背景板；约 70% 黑、轻阴影、`2px` backdrop blur、`1px` 低对比边框、圆角 `0.28em`、内边距约 `0.34em 0.68em 0.42em`；文字白色正体不描边。
- **位置/避让**：常态整组底部居中、背景板底边距播放器底 `8.5%`；平台控件出现时整组上抬到 `18%`（不拆行、不隐藏 DuetSub）。窗口与全屏共用该百分比、字体随容器缩放。
- **`position:'top'`**：当前配对任一 cue 为 top，整组背景板移到播放器顶部 `8%` 安全区；组内仍英上繁下；下一组均为 bottom/缺省则回底部。
- **`MT` 标识**：任一翻译模型生成的行首显示小型内联 `MT`；官方轨（含 OpenCC 转繁）不标。

### G. 四站 adapter 方案（ticket 07，已逐站冻结——实现直接引用该 ticket）

四站共用规则：MAIN 只早期拦截+无状态转发；ISOLATED adapter 解析并维护 `contentGeneration`（内容/集/videoId 生命周期）与 `clockGeneration`（video 与 seek/ad 时钟阶段）两个递增编号，generation 不符的响应丢弃；每条已验证响应只走一条交付路径（属 pending `fetchTrack` 则内部 resolve，否则仅在无歧义映射当前 TrackInfo 时走 `onCues`）；正常加载保留原生层、双轨就绪后才 scoped `visibility:hidden` 隐藏、失败/reset/ad 恢复；`seeking` 清屏发 `seek-flush`、`seeked` 二分恢复；广告 fail-closed 状态机。

- **Prime Video（第一实现）**：match `https://www.primevideo.com/*`；DOM 菜单枚举 + 自动串行切轨抓 `cf-timedtext.aux.pv-cdn.net` 的 `.ttml2`（EBU-TT/TTML，响应 MIME 不可信、由 XML magic + TTML namespace 校验）；时钟 `#dv-web-player video`；不逆向 opaque `playbackEnvelope`。
- **HBO Max（第二实现）**：match `https://play.hbomax.com/*`（**非** play.max.com）；DOM track id/label 权威枚举；第二轨**必须**由完整 subtitle playlist/API 映射驱动，不从单条 VTT URL 猜另一轨；WebVTT，`X-TIMESTAMP-MAP` 非零须先建 MPEGTS→节目时轴锚点（缺锚点 fail closed）；时钟 `[data-testid="VideoElement"]`、原生层 `[data-testid="caption_renderer_overlay"]`。
- **Netflix（第三实现）**：match `https://www.netflix.com/*` 仅 `/watch/<id>`；双薄 hook——`JSON.parse` 快路径（`timedtexttracks`+movieId）+ fetch/XHR 观测 OCA TTML（`text/xml` 预筛、XML magic + TTML 根元素判定，不拿 `?o=` 当过滤器）；共用 TTML parser 支持 tick，不照抄固定 `÷10^7`；时钟 `#appMountPoint video`、原生层 `.player-timedtext`；image-only 目标轨按 unavailable 交给另一官方轨/机翻，不引入 OCR。
- **YouTube（第四实现）**：match `https://www.youtube.com/*` 仅 `/watch?v=`；MAIN `document_start` patch fetch/XHR 抓 `/api/timedtext`（带 POT）、监听 `yt-navigate-finish` 读 `#movie_player.getPlayerResponse()`；无 POT 时 ISOLATED 决定 prime/恢复、MAIN 无状态执行 `loadModule/setOption` 原语；`fetchTrack` 克隆真实带 POT 请求改参强制 `fmt=json3`；200 空体=POT 失效只重 prime 一次仍空则 fail closed；官方(无 kind) 优先、asr 降级、`tlang` 归机翻兜底。

### H. toggle button（新增，就地拍板）

- 每站在**已真机验证的**播放器控制栏插入点注入 DuetSub 按钮（插入点属各站 ticket 07 的实现期 gate）。
- 主操作 = 点击开/关 DuetSub overlay；按钮视觉反映当前开/关。
- 右键/长按弹出小 popover，仅三项：**状态读出**（官方双轨 / 官方+MT / 翻译中… / 缺轨需配 key / 出错）、**重新翻译**（跳过缓存强制重翻当前视频）、**打开设置**（跳 options page）。**不含轨道覆盖**（选轨按 §C 硬编码）、**不含任何样式项**（§F 锁定）。
- **默认关闭**；开启状态**按站点**记入 `chrome.storage.local`，重进/换集恢复上次选择。v1 不做独立「自动启用」设置项。
- 按钮为**开**但内部处于 `ad-suspended`/seeking 时，overlay 按 E/G 临时清屏/挂起，**按钮仍显示开**（挂起对用户透明）。
- 开且轨道就绪→隐藏原生层；关/reset/挂起→恢复原生层。

### I. options page + manifest 权限（新增；2026-07-22 改为统一 OpenAI 兼容端点）

- 标准 MV3 options page（经扩展 action / chrome://extensions 打开）。**翻译服务**区块：
  - **供应商**下拉：`DeepSeek`（默认）/ `千问（阿里云百炼·中国区）` / `千问（阿里云百炼·新加坡区）` / `豆包（火山方舟·中国区）` / `OpenAI 兼容`（自定义云端）/ `本地`（Ollama、LM Studio 等本机 OpenAI 兼容端点）。
  - **Workspace ID / Base URL**：DeepSeek、豆包的 Base URL 预设并隐藏；千问显示独立 Workspace ID 输入框，用户只填控制台中的 `ws-…`，扩展按中国区（华北 2）或新加坡区自动生成阿里云推荐的业务空间专属 Responses API 地址，并在重新打开设置时从已存地址回填 Workspace ID；自定义/本地时显示 Base URL（本地默认形如 `http://localhost:11434/v1`）。
  - **联网搜索**：仅千问显示，默认关闭；开启后使用百炼 Responses API 的 `web_search` 工具和 `reasoning.effort: low`，明确告知搜索由模型按需决定，并提示可能增加延迟与费用。
  - **API Key**（掩码）：云端必填；本地无鉴权时可留空。
  - **模型**：DeepSeek、千问、豆包均给出当前候选；候选不构成锁定，用户可自行选择或手动填写其他模型 ID；自定义/本地同样可填。
  - **测试连接**按钮 + 状态徽标（未配置 / 已配置 / 测试通过）。
  - 目标语言 `zh-Hant`、选轨链 §C、机翻方向自动——只读展示、不可改。
- 持久化 `chrome.storage.local`；SW 读取供翻译调用。key 不写日志、除发往用户所配端点外不外发。
- **manifest 权限**：`storage`；安装时 `host_permissions` 只含四站域名。DeepSeek、千问、豆包与自定义云端共用 `optional_host_permissions: ["https://*/*"]`，本机端点只声明 `http://localhost/*`、`http://127.0.0.1/*`、`http://[::1]/*` 三条 optional host pattern。options page 仅在用户点击储存或测试时，按当前配置的精确 origin 调用 `chrome.permissions.request`；拒绝或旧配置尚未授权时，SW 不发请求、官方字幕照常显示，并提示回设置页授权。这里的 HTTPS wildcard 只是可申请范围，不是安装即授予的 `<all_urls>`。`world:"MAIN"` 声明式 content script 由 WXT 生成，无需额外 `web_accessible_resources`。

### J. 实现顺序（ticket 07，已锁）

**Prime Video → HBO Max → Netflix → YouTube**（风险优先：先暴露证据最弱的 Prime/Max 阻断，YouTube 证据最完整放最后）。此顺序**取代** README 里「Netflix 垂直切片先行」的旧建议。每站受其 ticket 07 stop rule 约束；未过 gate 的站以 unsupported stub 交付，不上坏 adapter。

## Testing Decisions

**什么是好测试**：只断言外部行为（给定输入/fixture → 输出），不断言实现细节。解析器测「真机字幕文件 → 得到的 `Cue[]`」，不测内部解析步骤；调度测「采样时刻的 active 集合」，不测游标机制。

**分层 seam（已与用户确认）**：

1. **Parser seam（最高性价比，纯函数）**：`(raw, opts) => Cue[]`，每格式一套（Netflix TTML/IMSC、Prime EBU-TT `.ttml2`、Max WebVTT、YouTube json3）。用 ticket 03 已抓的真机 fixtures（`research/findings/site-samples/` 的 netflix/primevideo/hbomax/youtube 样本）断言：cue 数、边界毫秒、文本抽取（`<br>`/`<span>`、实体解码、空白折叠）、`position` 映射、**时间戳单位正确**（Netflix 100ns tick、VTT `X-TIMESTAMP-MAP`、json3 ms）。
2. **Core seam（纯逻辑，边界 mock）**：选轨来源链（C 节）、双轨 `0ms` 调度（E 节的 `enActive`/`zhActive`）、cue 归一化（ms/排序/过滤/去重）、toggle 状态 reducer、OpenCC 应用判定。`chrome.*`/网络/DOM 在边界 mock。
3. **SW 翻译+配置 seam（mock HTTP 边界 + mock storage）**：`(Cue[], config) => 译文Cue[]`，端点走 OpenAI 兼容协议、覆盖云端与本地两类 config。断言批处理分组、缓存命中/miss、缓存 key 稳定性（端点/模型入 key）、失败→fail-soft、未配置 key 路径、保时轴（译文不改 `start/end`）。
4. **Adapter DOM/拦截 → 不做单测**：走 ticket 07 每站 stop rule 的**真机人工回放验收**（菜单能否稳定枚举/程序化切轨/恢复、MAIN 能否看见字幕请求、POT prime 后状态能否恢复、seek/换集/**真实广告**进出信号、双轨 fixture 是否产出两组归属正确、非空、时间合法的 Cue）。「看见响应」不算通过；`0ms` 严格调度只用完整轨/真实回放验证。

**被测模块**：parser（四格式）、core（选轨/调度/归一化/toggle）、mt（批处理/缓存/容错）。**Prior art**：无（greenfield）；本 spec 建立的这三套即首批测试套件，fixtures 已由 ticket 03 就绪。

## Out of Scope

- Chrome Web Store 后台建档、审核与正式上架（公开 GitHub 仓库、独立构建、隐私政策、商店素材与发布流程已纳入）。
- ~~本机/自托管模型~~ —— **2026-07-22 纳入范围**：统一 OpenAI 兼容端点已支持本机模型（Ollama/LM Studio），见 §D/§I；本 spec 其余「仅云端」旧表述以该更新为准。
- App / TV / 非 Chrome 浏览器；移动端。
- 下载视频、绕过 DRM、解锁地区限制轨、上传观看数据（README 红线）。
- 中英以外的语言对。
- **通用或跨站的官方轨拆句/时间轴再对齐**——Prime Video / Netflix / YouTube 仍走官方双轨 + `0ms` 调度，机翻也逐 cue 保时轴；仅保留 §E 明确批准的 Max 英文主轨显示副本对齐，不引入沉浸式翻译式的 OT/w6e 拆句或 ET 对齐。
- 播放器内除单一 toggle button 外的设置 UI；运行时增删站点。

## Further Notes

### 许可证红线（实现期硬约束）

- `research/proprietary/` 的沉浸式翻译提取物、以及仓库根的两份逆向分析 HTML（`immersive-translate-reverse-report.html` / `-analysis.html`）**不得进入 runtime 代码**——它们与提取物同属专有逆向，只作理解层交叉印证。
- 实现从开源上游 + 自己的真机抓包写起：`nflx-multisubs`(MIT，署名可复用)、`dualsubs-universal`(Apache-2.0；其 WebVTT/EXTM3U 子模块是 GPL-3.0，未复制、勿引)、`read-frog`(GPL-3.0/商用双许可，**仅研究参考**，除非 DuetSub 采 GPL 或购商用许可)。
- **ticket 07 是四站适配的权威方案**；两份 HTML 报告是二级参考，冲突时以 ticket 07 + ticket 03 真机样本为准（例：HBO Max 是 `play.hbomax.com` 非报告里的 `play.max.com`）。

### 区域前提

用户账号固定新加坡区；Prime Video 走国际站 `www.primevideo.com`（URL 可含 `/region/eu/`）。四站的原生层 selector、菜单可枚举性、广告进出信号等均以 ticket 07 的实现期真机 gate 为准。

### 词汇表（ubiquitous language）

- **DuetSub**：本扩展。**overlay**：扩展自有的双语字幕层。**toggle button**：播放器控制栏内的开关按钮。
- **MAIN world / ISOLATED world**：MV3 页面主世界（拦截转发）/ 隔离内容脚本世界（核心逻辑）。**service worker**：跑翻译模型调用与缓存。
- **Cue / TrackInfo / SiteAdapter**：B 节契约。**official / asr / platform-mt**：轨道来源。**MT fallback**：配置模型的机翻兜底。**OpenCC**：简→繁脚本转换。
- **contentGeneration / clockGeneration**：内容与时钟阶段的递增编号。**acquisition batch**：一次记录原选项→串行切轨抓取→恢复原选项的过程。**seek-flush / ad-suspended / fail closed**：拖动清屏 / 广告挂起 / 证据不足即停用。**POT**：YouTube timedtext 的鉴权 token。

### 与规划树的关系

本 spec 达成 map destination；ticket 08 到此关闭。ticket 06 的开放细则已在本文件 C/D 节就地拍板（其中 OpenCC-转繁 与 双向机翻 两项为「就地拍板、可否决」，已在 C 节标注）。README 的三站/Netflix-first 表述过时，以本 spec 为准。

**2026-07-22 更新**：模型来源由「仅云端 DeepSeek」改为**统一 OpenAI 兼容端点**（云端 + 本机 Ollama/LM Studio），已改动 §D / §I / Out of Scope 及用户故事 17/20/44；实现票 04 的设置页与权限验收随之扩展。播放器内按钮增加「状态读出 / 重新翻译 / 打开设置」小 popover（§H），仍不含轨道覆盖与样式项。
