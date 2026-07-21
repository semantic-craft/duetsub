# 07 四站 adapter 方案逐站锁定

Type: grilling
Status: resolved
Blocked by: 01, 03

## Question

基于 `docs/EXTRACTION.md`、ticket 01 的 YouTube 调研、ticket 03 的真实请求样本，逐站锁定 adapter 方案，写到可实现的精度：

- 每站：match pattern、拦截点（JSON.parse 钩子 / fetch-XHR 钩子 / DOM）、字幕格式与解析器、轨道枚举与双轨配对规则、播放时钟来源、原生字幕层处理、SPA 导航/换集/seek/广告的重初始化策略。
- Netflix：`timedtexttracks` 元数据钩子 + timed text 请求；参考 NflxMultiSubs（MIT，可复用）。
- Prime Video：`www.primevideo.com` 国际站；`.ttml2` (EBU-TT)；广告时间轴风险的应对写法。
- HBO Max：新加坡区实际域名；`.vtt`；`CueBoxContainer` 选择器有效性。
- YouTube：按 ticket 01 的结论。
- 四站实现顺序（spec 里的建议路线：默认 Netflix 垂直切片先行，待确认）。

## Answer

2026-07-22 grilling 会话逐题拍板。本票不改 ticket 04 已冻结的 `SiteAdapter` / `TrackInfo` / `Cue` 契约；以下方案只定义四个 adapter 如何实现该契约。

用户拍板的关键取舍：

1. Netflix：manifest 只作快路径；缺失时允许自动串行切换原生中英轨抓取 TTML，结束后恢复原选项。
2. Prime Video：不逆向 opaque `playbackEnvelope`；以 DOM 菜单枚举、自动串行切轨抓 `.ttml2`。
3. HBO Max：DOM 枚举；第二轨必须由完整 subtitle playlist / API 映射驱动，不从单条 VTT URL 猜另一轨路径。
4. YouTube：无 POT 时自动 prime，抓到请求后恢复用户原字幕状态；无法可靠恢复则 fail closed，提示用户手动开一次。
5. 双轨不预合并；严格按原 cue 半开区间 `[start,end)`、`0ms` 容差分别调度，保留多对多与 unmatched cue。
6. `seeking` 立即清屏，`seeked` 再按新时钟恢复。
7. 广告采用 fail closed：进入或疑似进入广告即停显 DuetSub、恢复原生层，确认回到节目时钟才恢复。
8. 实现顺序锁定为 **Prime Video → HBO Max → Netflix → YouTube**。这是用户选择的风险优先顺序：先暴露证据最弱的 Prime/Max 阻断，再做 Netflix，证据最完整的 YouTube 最后。

### 1. 四站共用规则

#### 1.1 契约与内部状态

- MAIN world 仍然只做早期拦截、读取页面全局，以及按 ISOLATED 的明确请求无状态调用页面播放器原语并转发原始结果；不解析字幕、不构造目标 URL、不选轨、不保存字幕/用户状态。主动字幕 fetch 优先由 ISOLATED 执行；CORS/签名不允许时，改由播放器自动切轨产生请求并被动截获，不增加 MAIN fetch 业务层。
- ISOLATED 侧的 adapter 解析原始数据、生成 `TrackInfo` / `Cue`、保存站点私有的 `trackId → handle` 映射并实现 `fetchTrack()`。这个 handle 不进入公共契约。
- 每个 adapter 内部维护两个递增编号：
  - `contentGeneration`：一部影片/一集/一个 YouTube `videoId` 的轨道与 URL 生命周期。
  - `clockGeneration`：当前绑定的 `<video>` 与 seek/ad 时钟阶段。
- 整轨、轨表与 playlist 请求只绑定 `contentGeneration`，所以同内容 seek 不会作废合法下载；只有当前显示游标、广告响应和依赖当前分段时钟的请求同时校验 `clockGeneration`。generation 不符的结果丢弃，防止上一集或广告期响应污染当前画面。
- Netflix/Prime 的“自动切轨”是一次 acquisition batch：先记录用户原选项，串行处理 core 请求的目标轨，最后恢复原选项。只有站点的原生层 selector 已真机验证时才临时抑制切轨闪动；否则宁可显示短暂切换，也不猜 selector。每轨等待已验证响应最多 10 秒，只重试一次；任何失败都恢复菜单状态和已验证的原生层后 reject，不升级为 Worker 包裹或 `chrome.debugger` 方案。
- 每条已验证字幕响应只能走一条公开交付路径：若它属于 pending `fetchTrack()`，就在 adapter 内解析、累计并最终 resolve；否则只有能无歧义映射到当前 `TrackInfo` 时，才调用 `onCues()` 注册时保存的 callback。归属不明的响应忽略并记录诊断，不猜 track，也不让同一 Cue 被 core 摄入两次。

#### 1.2 Cue 归一化

- 所有时间统一为节目时间轴毫秒；过滤非有限时间、`end <= start`、纯空文本，按 `start`、`end`、源顺序稳定排序。
- 文本按源文档顺序递归抽取；普通 TTML/XML 空白按格式规则折叠，避免把源码缩进当字幕，只保留显式 `<br>` 与 `xml:space="preserve"` 的空白/换行。渲染端继续用 `textContent`，不保留可执行标记。
- `language` 取发起请求的 `TrackInfo.language`；响应内 `xml:lang` 只用于校验或细化，冲突时不得静默归错轨。
- 只有源格式明确表达垂直上方 region/line 时才写 `position:'top'`；其余省略、按 bottom。WebVTT 的 `position:50%` 是水平位置，不映射为 top。
- TTML 共用 parser 支持：clock time、offset time、tick、frame/subframe，读取 `ttp:tickRate`、`frameRate`、`frameRateMultiplier`、`subFrameRate`，处理 `<p begin end|dur>` 及父级 timing。`ttp:timeBase` 缺失时按 TTML 默认的 media 接受；显式出现其他 time base 时明确报 unsupported，不猜。
- 同轨完全重复 cue 按 `(trackId,start,end,text)` 去重；同轨真正同时活跃的多个 cue 不互相覆盖。

#### 1.3 双轨配对与调度

不创建新的 paired-cue 模型，也不按数组索引、精确起点、最近邻或全局 offset 配对。core 在时刻 `t = video.currentTime * 1000` 分别计算：

```text
enActive = English cues where start <= t < end
zhActive = Chinese cues where start <= t < end
```

- 容差固定 `0ms`，不延长任一 cue。
- 一条长 cue 可随时间先后与多条短 cue 同屏，天然形成一对多/多对一。
- 任一侧没有 active cue 时，另一侧仍单独显示；不得因“配对失败”丢字幕。
- 同侧多个 active cue 按源顺序以 `\n` 合并。任一 active cue 为 `top` 时，沿用 ticket 05 的整组置顶规则。
- 顺播用有序游标；seek 或时间倒退后对两轨二分定位。

#### 1.4 原生层、导航、seek 与广告

- 正常加载时保留平台原生字幕，只有 DuetSub 所需轨道已就绪、overlay 可渲染后才以作用域 CSS `visibility:hidden !important` 隐藏；不 remove、不用 `display:none`，以免平台停止取流。
- 已验证原生层 selector 的站点可在 acquisition batch 短暂隐藏它以避免切轨闪动；失败、reset、离开播放器或广告 suspend 时必须撤销样式。
- `seeking`：`clockGeneration++`、清当前 active 集与显示游标，并以 `seek-flush` 调用 `onReset()` 注册时保存的 callback，但保留同一 content generation 的完整 cue；`seeked` 在新时钟二分恢复，分段数据缺失时才补取。
- 同一内容内 `<video>` 被替换时按固定优先级处理：只有 content identity 相同、无已验证广告标志且新旧节目时钟连续，才解绑旧 listener、绑定新节点并按 `seek-flush` 重建；存在广告标志或连续性无法证明时进入 `ad-suspended`；内容 identity 改变则升级为 `episode` 或 `navigation` 完整 reset。
- 完整 reset：abort 在途请求，恢复旧原生层，清 TrackInfo/cue/URL/POT/playlist 映射，解绑旧 video，再为新 `contentGeneration` 重枚举。
- 不给已冻结的 `onReset` 增加 `ad` reason。经实现期验证的站点广告标志，或未通过上一条“同内容、无广告、时钟连续”安全重绑判据的非 seek video/src/duration/时钟域切换，会让 adapter 进入内部 `ad-suspended`：隔离广告响应、停显 DuetSub、恢复原生层并发 `seek-flush`。只有“已验证广告标志明确退出 + 页面 content id 仍是进入广告前的节目 + 节目 video 已重新绑定”三项同时成立才可恢复；没有可验证广告标志或任一项不成立，就保持停用到下一个 episode/navigation reset。

### 2. Prime Video adapter（第一实现）

#### 已被样本证实

- Match pattern：`https://www.primevideo.com/*`；SG 账号实际 URL 可含 `/region/eu/`。
- 菜单实见 `English [CC]`、简中、繁中；时钟节点是 `#dv-web-player video`，`video.textTracks.length === 0`。
- 切轨会请求 `https://cf-timedtext.aux.pv-cdn.net/<asset>/<track>.ttml2`；响应 MIME 是 `application/octet-stream`，body 才是 UTF-8 TTML2，样本 `ttp:version="2"`、`xml:lang="en-US"`。
- 旧 `GetPlaybackResources.subtitleUrls` 没有出现；当前只见 `POST /cdp/playback/pes/StartSession`，其 `playbackEnvelope` 不透明，响应仅暴露 session token/回调间隔。
- Prime 的 seek、换集、广告与原生字幕层 selector 均未被本次样本证实。

#### 锁定方案

- `start()`：仅在播放器存在时激活。MAIN `document_start` patch fetch/XHR，候选 URL 必须是 `cf-timedtext.aux.pv-cdn.net` 的 `.ttml2`；响应转发后由 ISOLATED 再以 XML magic 和 TTML namespace 根元素校验，不能依赖 MIME。
- `onTracks()`：用已实测 accessible name `Subtitles and Audio Menu` 找入口；程序化打开菜单并记住原开合状态，MutationObserver 等待字幕分组挂载，扫描后恢复原开合状态。菜单项生成 generation-local id，内部保存 id→菜单项；中文/英文 label 归一化为 BCP-47，CC 与普通字幕都标 `source:'official'`。当前稳定 role/data attribute 与程序化开合能力是实现期 gate，不在本票猜 selector。
- `fetchTrack()`：不读、不解密 `playbackEnvelope`。把目标请求放入 acquisition batch，激活对应菜单项；pending DOM handle 是响应归属权威，`xml:lang` 只作校验，CC/type 仅在响应确实提供时校验。当前轨没有新请求时先切到另一项再切回。解析后 resolve，缓存只存在当前 content generation 内，批次完成后恢复原选项。
- Parser：走共用 TTML parser；递归抽取 `<p>/<span>/<br>`，保留 speaker label；样本 clock time `00:00:22.708` 应映射为 22,708ms。样式丢弃，只从可确定的 region 垂直 origin 映射 top。
- 时钟与 reset：`#dv-web-player video.currentTime`。只有已确认的页面 route/content id 或两轨共享的节目 asset identity 改变才开启新 content generation；共享 asset 可取页面内容 id，或经两轨切换证明保持不变的共同父路径，绝不能用各轨不同的 `.ttml2` 文件 URL。单独的 video identity/currentSrc/duration/非 seek 时钟变化按共用优先级处理：能证明同内容、无广告且时钟连续才重绑，否则进入 `ad-suspended`。是否发 `episode` 或 `navigation` 由“是否仍在同一播放器内换内容”判定。
- 原生层：策略锁定为 ready 后 scoped `visibility:hidden`、失败/reset/ad 时恢复；具体 selector 必须在实现期真机补录后才能写入 runtime。
- 广告：按共用 fail-closed 状态机处理，不积累“广告时长 offset”，不乐观沿用未知时钟。

#### 实现期 stop rule

若 DOM 菜单不能稳定枚举/程序化激活、原菜单选项不能可靠恢复、找不到可安全隐藏/恢复的原生层 selector，或 MAIN 看不到切轨产生的 `.ttml2` 响应，Prime adapter 首版即判 unsupported；不得退回旧 `subtitleUrls` 假设。已知双轨 fixture 必须实际得到两组归属正确、非空、时间合法的 Cue 才算通过，不能只以“看见响应”验收；另须补测 seek、站内换集、一次真实广告及广告后对齐。

### 3. HBO Max adapter（第二实现）

#### 已被样本证实

- SG 实际播放域名与 match pattern：`https://play.hbomax.com/*`，不是 `play.max.com`。
- 菜单 DOM 暴露 `en-US-subtitles`、`en-US-closedcaptions`、`zh-Hans-SG-subtitles`、`zh-Hant-TW-subtitles`。
- 当前轨请求形态为 `https://akm.asia.prd.media.max.com/<asset>/t/<track>/<segment>.vtt?CMCD=…`，initiator 为 XHR、MIME `text/vtt`，body 以 `WEBVTT` 与 `X-TIMESTAMP-MAP` 开头。
- 时钟节点是 `[data-testid="VideoElement"]`；原生层当前是 `[data-testid="caption_renderer_overlay"]`，旧 `CueBoxContainer` 已失效。
- 站内换集会 SPA 改 URL 并替换 `<video>`；caption renderer 与 controls 也会重建。暂停态 +10 秒 seek 的 `video.currentTime` 连续；广告未测。

#### 锁定方案

- `start()`：MAIN patch fetch/XHR，只转发 Max 媒体域上的 `.vtt` 与 subtitle manifest/playlist 候选原文；ISOLATED 负责格式判断。
- `onTracks()`：以 DOM track id/label 为权威枚举源；通过实现期确认的设置按钮程序化打开菜单并记录原开合状态，扫描后恢复，MutationObserver 处理迟挂载或重建。去掉 `-subtitles` / `-closedcaptions` 后规范化语言，二者都标 `official`，内部保留字幕/CC 特征。若无法稳定打开、枚举或恢复菜单，按本站 stop rule 失败，不依赖用户预先打开一次。
- `fetchTrack()`：
  1. 从本内容捕获的完整播放清单/API 中取得 DOM track id/language 到完整 VTT 或 subtitle playlist URI 的稳定映射；若它是 HLS，再使用 `GROUP-ID`、`CHARACTERISTICS` 等属性，不能预设当前 seam 必为 HLS。
  2. 若映射明确指向单个完整 VTT，直接解析；若是有限 VOD segment playlist，依清单拉完目标轨 segment，在 adapter 内部去重累计后只由 `fetchTrack()` resolve 完整 `Cue[]`。
  3. DOM id 或一条当前轨 VTT URL 不足以推出另一轨 CDN path；无完整 playlist/API 映射时立即 fail closed，不推导 `<track>/<segment>` 模板。
- Max 的主动 VTT batch 与被动截获响应遵守共用的单一路径交付规则。
- WebVTT parser：解析 cue id/time/payload；读取 `REGION` 与 cue `line` 中判断垂直位置所需的字段，只丢其余视觉样式；`STYLE`、`NOTE` 可忽略。`<br>` 保留换行，`<i>/<b>/<u>/<c>/<v>` 仅留文本并解码实体。样本 `X-TIMESTAMP-MAP` offset 为 0；非零值必须先由 playlist/presentation metadata 建立 MPEGTS PTS 到页面节目时间轴的锚点并处理 33-bit wrap，缺锚点即 fail closed，不能直接把 `MPEGTS/90000 - LOCAL` 当作 `video.currentTime` offset。
- 时钟与隐藏：用 `[data-testid="VideoElement"].currentTime`；双轨 ready 后隐藏 `[data-testid="caption_renderer_overlay"]`，节点重建后重新施加，失败/reset/ad 时恢复。
- 换集：URL/content id 或 episode identity 改变时立即 abort、恢复旧原生层、清 playlist/cue/track 映射并发 `episode`；必须等待并绑定新 `<video>`，不能永久持有旧引用。普通 seek 仅 `seek-flush`，目标 segment 缺失时按 playlist 补取。

#### 实现期 stop rule

本次真机没有捕获 master/subtitle playlist，上游 DualSubs 只能证明该类 seam 曾存在，不能证明当前页面 MAIN 一定看得到。实现期若无法稳定程序化打开/枚举/恢复菜单，抓不到完整 playlist/API，不能建立 presentation timeline anchor，ISOLATED 因 CORS/credentials 无法拉任一 playlist/segment，或请求全部位于不可见 worker 内，Max adapter 不得宣称完成；恢复原生层并记录 gate 失败。广告验收必须通过真机找到可靠的进入和退出 signal，找不到就不得宣称 Max 广告场景完成；另须验证跨 segment seek 回拉。

### 4. Netflix adapter（第三实现）

#### 已被样本证实

- Match pattern：`https://www.netflix.com/*`，仅 `/watch/<id>` 激活。
- 菜单实见繁中、简中、English CC、English 等官方轨。
- 切轨会产生 `*.oca.nflxvideo.net/?o=…&v=…&e=…&t=…` 响应；该 URL 形态也用于媒体分片，不能仅凭 query 判字幕。可靠判据是响应 `text/xml`、XML magic 与 TTML namespace 根元素；IMSC 1.1 只是本次样本 profile，不是必需过滤条件。
- 样本是 TTML/IMSC 1.1 text profile：`timeBase="media"`、`tickRate="10000000"`、`xml:lang="en"`、`textType="CC"`。
- `video.textTracks.length === 0`；时钟是 `video.currentTime`，原生层 `.player-timedtext` 已验证。暂停态 +10 秒时钟连续，但换集、广告未测。
- 页面晚注入 `JSON.parse` 未观察到 `timedtexttracks`；解析可能更早或位于 worker。NflxMultiSubs 的 MIT 实现是快路径参考，不是当前 seam 已成立的证据。

#### 锁定方案

- `start()`：MAIN `document_start` 同时装两个薄 hook：
  1. manifest 快路径：包裹 `JSON.parse`，发现带 `textTracks || timedtexttracks` 与 movie/viewable id 的候选时全部原样转发；由 ISOLATED 结合播放器 DOM、当前内容与后续 OCA 请求关联，MAIN 不用 URL watch id 做业务过滤。
  2. 必备观测路径：包裹 fetch/XHR，先以 OCA host + 响应头 `Content-Type: text/xml` 廉价预筛，避免克隆普通媒体分片；再转发 URL、status、headers、raw body，由 ISOLATED 以 XML magic + TTML 根元素最终判定，绝不把 `?o=` 当字幕过滤器。
- `onTracks()`：manifest 候选中过滤 None、forced-only、未 hydrated 与无 text downloadable 的项，用真实 id/language/label 生成 `TrackInfo`；只有 core 所需中英目标轨均可获取时才结束枚举。缺任一目标或任一 downloadable 不可用时，使用实现期确认的字幕设置按钮程序化打开菜单，记录原开合状态，扫描 generation-local TrackInfo/DOM handle 后恢复；候选 `data-uia="selector-audio-subtitle"` 来自当前 MIT 上游但未在 ticket 03 样本验证，必须作为实现 gate。DOM label 只需覆盖本项目英文、繁中、简中目标；CC 与普通字幕都标 `official`。
- `fetchTrack()`：manifest 有 text downloadable URL 时由 ISOLATED 直接尝试 fetch；CORS/签名失败则进入 acquisition batch，不把主动下载搬进 MAIN。DOM 路径串行激活目标项，以 pending handle、XML language 与存在时的 `textType` 关联下一条 TTML，解析后缓存；当前轨无新请求时切走再切回。URL/cue 仅存当前 watch generation，不持久化临时签名。
- Parser：走共用 TTML parser，不能照抄 NflxMultiSubs 的固定 `begin/end ÷ 10,000,000`。样本只证实根含 `tickRate=10000000`，未保存 `<p>` 的实际时间表达式；parser 必须支持 tick 并在实现期验证真实 cue 形态。递归抽取 span/br。若目标轨只有 image downloadable、无法产生文本 Cue，则该轨视为不可用，交给核心的另一官方轨/机翻策略；本票不引入 OCR。
- 时钟与隐藏：绑定 `#appMountPoint video`（找不到时退到当前播放器内唯一 video）的 `currentTime`；ready 后隐藏 `.player-timedtext`，失败/reset/ad 时恢复。
- 生命周期：离开/进入 `/watch` 发 `navigation`；watch id/content identity 改变发 `episode`。同一 id 下 video identity/currentSrc 改变严格走共用优先级：只有无广告标志且新旧节目时钟连续才按 `seek-flush` 重绑，无法证明则进入 `ad-suspended`；确认内容改变再升级为 `episode`。history push/replace、URL observer 与 video MutationObserver 共同供信号。

#### 实现期 stop rule

必须分别记录“静态 MAIN 是否命中 manifest”和“MAIN 是否看见自动切轨的 OCA TTML”。若两者都失败，菜单无法稳定枚举/切轨/恢复，或已知双轨 fixture 不能得到两组归属正确、非空、时间合法的 Cue，Netflix adapter fail closed、恢复原选项/原生层；首版不包裹 Worker constructor、不使用 debugger 权限。另须真机验证换集、URL/video identity 与广告阶段。

### 5. YouTube adapter（第四实现）

#### 已被样本证实

- `#movie_player.getPlayerResponse()` 在 `yt-navigate-finish` 返回当前视频轨表；`window.ytInitialPlayerResponse` SPA 后过期，`/youtubei/v1/player` 可能整场不请求。
- 播放器实发 `/api/timedtext` 带 POT；player response 的 baseUrl 不带。删 POT 得 200 空体；复用同一真实请求改 `lang`、`tlang`、`fmt` 已实测成功，播放器本次默认已是 json3。
- `loadModule('captions')` / `setOption('captions','track',…)` 在页内可调用；能否稳定产出 POT 请求并无副作用恢复，仍是实现 gate。
- 人工英文 427 条、繁中 378 条，存在译者署名、合句、丢句与整秒/毫秒轴差异，坐实不能按索引或起点相等配对。

#### 锁定方案

- `start()`：match pattern 覆盖 `https://www.youtube.com/*`，adapter 只在 `/watch?v=` 激活，保证从首页 SPA 进入 watch 时 hook 已存在。MAIN `document_start` patch fetch/XHR 捕获 `/api/timedtext` 的完整 URL/raw body；监听 `yt-navigate-finish`，有限重试读取 `#movie_player.getPlayerResponse()`，只在 response `videoDetails.videoId === URL v` 时原样转发 captions 区块。不以 `/youtubei/v1/player` 或 `ytInitialPlayerResponse` 为主路径。
- `onTracks()`：解析真实 `captionTracks`；无 `kind` 为 `official`，`kind==='asr'` 为 `asr`。id 使用 `vssId + trackName` 的稳定组合。`zh-TW/HK/MO` 归入 Hant，`zh-CN/SG` 与裸 `zh` 归入 Hans；保留可判定 region。`translationLanguages` 与 `isTranslatable` 仅保存在 adapter 私有能力数据中；本票不伪造无法表达底层源轨的 `platform-mt` TrackInfo，其候选生成/源轨优先级由 ticket 06 在不改 04 类型的前提下锁定。
- POT priming：当前 video generation 没有真实 timedtext URL 时，ISOLATED 保存用户原 caption track/off 状态并决定 prime/恢复步骤，MAIN 只无状态返回页面 getter 原值、执行 `loadModule` / `setOption` 原语并转发结果；截获 POT 后 ISOLATED 立即要求恢复原状态。若实现期无法可靠读取或恢复状态，则不静默改变偏好，`fetchTrack()` reject 并提示用户手动开启一次。
- `fetchTrack()`：首选完整克隆当前视频已截获、带 POT 的真实请求，再按目标精确改参并强制 `fmt=json3`：官方轨删除旧 `kind=asr`，目标无命名时删除旧 `name`，非平台 MT 请求删除旧 `tlang`，需要时才设置新的 `lang/kind/name/tlang`。这与样本验证路径一致。若命名轨或目标轨确需不同 signed baseUrl，组合该 baseUrl 与现有 POT/client 参数属于实现 gate，失败不得猜签名。使用 `credentials:'include'`；200 空体视为 POT 失效，只重新 prime 一次，仍为空即 fail closed。POT 与 URL 不跨 `videoId` 使用；`tlang` 的启用策略仍由 ticket 06 决定。
- json3 parser：过滤无 `segs`、窗口定义、`aAppend===1`、纯空白/纯换行事件；`start=tStartMs`、`end=start+dDurationMs`、`text=segs.map(utf8).join('')`，保留 `\n`；忽略逐词 `tOffsetMs/acAsrConf`，`language` 来自 TrackInfo，position 缺省 bottom。
- 时钟与隐藏：`#movie_player video.html5-main-video.currentTime`。原生层候选 `.ytp-caption-window-container` 尚未被本地样本验证；只有实现期确认后才写入 runtime，且同样遵守 ready 后隐藏、失败/reset/ad 时恢复。
- SPA：`yt-navigate-start` 只让旧 generation 失效、不读新数据，并立即以 `seek-flush` 调用已保存的 reset callback 清屏；`yt-navigate-finish` 再完成一次 `navigation` reset。若 URL 无新 `v`，恢复原生层、清理并解绑 video；若有新 `v`，校验后再重绑定、重枚举。`popstate` 与 `#movie_player` MutationObserver 只作 finish 漏发兜底并执行同一迁移。YouTube 通常复用 video，不能把“video 未替换”当作内容未变。
- 广告 detector 候选为 `#movie_player` 的 `ad-showing` class，由 MutationObserver 监听进入/退出并按共用 `ad-suspended` 状态机处理。该 class 必须先经真机验证；若失效或退出条件不可靠，就保持 fail closed 到下一个 navigation reset。

#### 实现期 stop rule

验证静态 MAIN 是否确实先于 player 保存 fetch 引用、原生 caption selector、POT priming 后状态恢复，以及广告期 POT/时钟行为。任一恢复动作不可靠时，保留原生层并要求用户手动触发，不留下隐藏的持久偏好变化。

### 6. 交给 ticket 08 / 实现验收的风险清单

以下都是**已锁定应如何失败或验证**的实现 gate，不再是方案决策：

- Prime：菜单稳定 DOM、程序化切轨、MAIN 对 `.ttml2` 的可见性、content identity、seek、换集、真实广告及广告后对齐、原生层 selector。
- HBO Max：当前 master/subtitle playlist/API 是否 MAIN 可见、DOM id 与 playlist track 的映射、非零 `X-TIMESTAMP-MAP`、segment discontinuity/seek 回拉、真实广告。
- Netflix：document_start manifest 命中与否、OCA 请求是否在 MAIN 或 worker、菜单 DOM/程序化切轨、直接 fetch 签名/CORS、换集与广告；image-only 目标轨按 unavailable 处理。
- YouTube：早期 fetch/XHR hook、POT 重新 prime、原字幕状态可恢复性、原生层 selector、广告期 POT/时钟。
- 广告共用 gate：每站都必须用真实广告验证出可靠的进入和退出 signal；找不到就不得宣称该站广告场景完成，不能以“时钟看似连续”替代 fail-closed 检测。
- 四站共用：只用完整轨/真实回放验证 `0ms` 严格调度；不得用两个各 14-event 的 YouTube 片段样本声称统计校准完成。

## Comments
