# YouTube — 真实请求样本与 ticket 01 验证项（ticket 03）

Date: 2026-07-21
采集环境：DuetSub 内置自动化浏览器（Chromium 148），**未登录**，无 Widevine。YouTube 字幕/播放器接口不依赖登录或 DRM，故此环境结论对真实桌面 Chrome 有效。

## 基准视频

- **`iG9CE55wbtY`** — “Do schools kill creativity? | Sir Ken Robinson | TED”
- 选它的理由：TED 社区人工翻译时代的视频，**同时有创作者/社区人工上传的 `.en` / `.zh-TW` / `.zh-CN` 轨**（皆无 `kind`），外加 `a.en`（ASR）。共 65 条轨、156 种 translationLanguages。
- 它用的是**旧式语言码 `zh-CN` / `zh-TW`**（不是 `zh-Hans`/`zh-Hant`）——正好压测 ticket 01 提的归一化：`zh-TW → 繁`、`zh-CN → 简`。
- SPA 导航验证用的第二个视频：**`Mh3_wYHdeVs`**（“Psychedelic Science | Fabian Oefner | TED Talks”，同样含 `.en`/`.zh-TW`/`.zh-CN`）。

轨道枚举（`getPlayerResponse().captions.playerCaptionsTracklistRenderer.captionTracks` 相关条目）：

| vssId | languageCode | kind | 性质 |
|---|---|---|---|
| `.en` | en | — | 官方（人工上传） |
| `a.en` | en | asr | ASR 降级源 |
| `.zh-TW` | zh-TW | — | 官方繁体（旧码） |
| `.zh-CN` | zh-CN | — | 官方简体（旧码） |

`translationLanguages` 里中文目标为现代码 `zh-Hans` / `zh-Hant`（用于 `tlang` 机翻兜底）。

## timedtext 请求的两种形态

### (a) player-response 里的 baseUrl —— **不带 pot**

`getPlayerResponse()` 的每条轨 `baseUrl` 参数键：
```
v, ei, caps, opi, exp, xoaf, xowf, hl, ip, ipbits, expire, sparams, signature, key, lang
```
关键：`signature` 覆盖的是 `sparams=ip,ipbits,expire,v,ei,caps,opi,exp,xoaf`——**`lang`/`kind` 不在签名内**，且四条轨（en/zh-TW/zh-CN/a.en）共用**同一个 signature**，仅 `lang`（及 asr 轨的 `kind=asr`）不同。baseUrl **不含 `pot`**（`hasPotInPlayerResponse: false`）。

### (b) 播放器实发的请求 —— **带 pot、fmt=json3、c=WEB**

启用字幕后播放器真正发出的请求（网络面板抓到）在 baseUrl 基础上追加：
```
potc=1 & pot=<~110ch, BotGuard 生成> & fmt=json3
& c=WEB & cver=2.20260715.04.00 & cplayer=UNIPLAYER
& cbrand=apple & cbr=Chrome & cbrver=148.x & cos=Macintosh & cosver=10_15_7 & cplatform=DESKTOP
& xorb=2 & xobt=3 & xovt=3
```
注意 ticket 01 曾推测网页播放器默认拉 srv3——**实测默认就是 `fmt=json3`**，本项目无需自己改 fmt。

## 验证项 ①：改写 lang/tlang/fmt 是否被签名/POT 拒绝 —— **不会**

用播放器那条 **带 pot** 的 URL 原样复用、只改 query，同源 `fetch`（`credentials:'include'`）实测：

| 改写 | HTTP | 响应体 | 结论 |
|---|---|---|---|
| 原样 `lang=en&fmt=json3`（带 pot） | 200 | 59007 B json3 | 基准成立 |
| `lang→zh-TW`（换第二官方轨） | 200 | 42777 B json3 | ✅ 复用同一 pot 拿到第二轨 |
| `lang→zh-CN` | 200 | 42968 B json3 | ✅ |
| `fmt→srv3` | 200 | 30138 B XML | ✅ fmt 可改 |
| `fmt→vtt` | 200 | 30848 B WebVTT | ✅ fmt 可改 |
| `tlang→zh-Hant`（服务器端机翻） | 200 | 47812 B json3 | ✅ tlang 兜底可用 |
| **删掉 pot（对照）** | 200 | **0 B（空）** | pot 是唯一闸门 |

并且**裸 fetch player-response baseUrl（本就无 pot）一律 200 + 空体**（en/zh-TW 各种 fmt 都试过）。

**判定**：`lang` / `tlang` / `fmt` 均不受 signature 或 POT 保护；pot 绑定的是会话/视频，可跨轨、跨格式复用。删 pot → 空体的对照坐实 pot 是唯一闸门。
→ DuetSub 的「拦截播放器一条 pot 请求，改 `lang` 取第二官方轨」策略**实测可行**；机翻兜底可直接用「官方轨 + `tlang=zh-Hant`」零依赖补齐（服务器端）。

## 验证项 ②：SPA 导航后 /youtubei/v1/player 的捕获时序 —— 结论**修正 ticket 01**

在 `iG9…` 页装 `PerformanceObserver('resource')` + `yt-navigate-*` 监听后，点击相关视频 SPA 跳到 `Mh3…`，实测：

- 事件序：`yt-navigate-start`（**仍带旧 URL**）→ …timedtext(en,pot)… → `yt-navigate-finish`（**带新 URL**，≈+955ms）→ `yt-page-data-updated`。
- **`window.ytInitialPlayerResponse` 在 SPA 导航后是过期的**：跳到 `Mh3…` 后它仍返回 `iG9…` 的 videoDetails 与轨表。**adapter 绝不能读这个全局。**
- **`#movie_player.getPlayerResponse()` 返回的是新视频**（`Mh3…`，与 URL 一致），含正确的 `.en`/`.zh-TW`/`.zh-CN`/`a.en`。`getPlayerResponse_isFresh: true`。
- **`/youtubei/v1/player` 整个会话 fire 了 0 次**——两个视频的 player response 都走了预取/内联。**依赖拦截该 XHR 来枚举轨道会漏掉视频。**

**判定（供 ticket 07 采纳，修正 ticket 01 §4）**：
1. 导航信号用 `yt-navigate-finish`（此时 URL 已是新视频）；`yt-navigate-start` 尚是旧 URL，别用它读数据。
2. 轨道枚举用 **MAIN world 调 `#movie_player.getPlayerResponse()`**（可靠、随导航刷新），**不要**读 `window.ytInitialPlayerResponse`（过期），**也不要**只依赖拦截 `/youtubei/v1/player`（预取时根本不发）。
3. pot 仍须靠**拦截播放器实发的 `/api/timedtext`** 获取；若用户没开字幕，播放器不会发该请求——需 MAIN world 主动 `loadModule('captions')` + `setOption('captions','track',{languageCode})` 触发一条，拦下 pot 后改 `lang` 取第二轨。（实测 `loadModule`/`setOption` 在页内可调。）
4. `getPlayerResponse()` 是 Polymer 元素实例方法，仅 MAIN world 可达——MAIN hook 仍必要，但其枚举职责从「拦 XHR」改为「调 getPlayerResponse」。

补充：本次晚注入的 `fetch` patch **没抓到**播放器自己的 timedtext 请求（base.js 先跑并把 `fetch` 别名进闭包）——反向印证 ticket 04 决策 2「MAIN hook 必须 `document_start` 先于 base.js」。网络层证据一律以 DevTools/PerformanceObserver 为准。

## 双轨对齐：实测坐实「按时间重叠配对，非按索引」

同一视频 en vs zh-TW 的 json3（样本见同目录 `youtube-timedtext-en.json3.json` / `youtube-timedtext-zh-TW.json3.json`）：

- 条数不同：**en 427 条、zh-TW/zh-CN 各 378 条**。
- en 首条正文 `tStartMs=27103`（精确到 ms）；zh-TW 首条是 `t=0` 的**译者署名**「譯者: …\n審譯者: …」——**英文侧无对应**（unmatched cue，须保留）。
- zh-TW `t=25000`（时长 7000ms）**合并了两句英文**（`27103` "Good morning. How are you?" + `31129` "It's been great, hasn't it?"），**并丢掉**了中间的 `29702` "(Audience) Good."；中文轴取整秒（25000/32000/36000…），英文轴是精确 ms。
- 多行用 `\n`（如 en `43096` "There have been three themes\nrunning through the conference,"）——对应 cue 模型「换行保留 `\n`」。

→ 两条官方轨的时间轴、分句、条数都不保证一一对应；配对必须按时间重叠、并保留任一侧未配上的 cue。

## json3 → cue 映射（人工轨实测）

- 人工上传轨的 events 键并集就是 `{tStartMs, dDurationMs, segs}`——**无 `aAppend`/`wWinId`/`wpWinPosId`/`tOffsetMs`**。ticket 01 列的过滤规则（跳过 `aAppend===1`、无 `segs`、窗口定义、逐词 `tOffsetMs`）主要针对 **ASR 轨**；人工轨基本不触发，但解析器仍应保留这些过滤以兼容 ASR 降级源。
- `start = tStartMs`；`end = tStartMs + dDurationMs`；`text = segs.map(s=>s.utf8).join('')`（保留 `\n`）。
- `language` 不在响应体内，取自请求所用 `lang`（或 `tlang` 目标）——response 必须与 track 元数据配对携带。
