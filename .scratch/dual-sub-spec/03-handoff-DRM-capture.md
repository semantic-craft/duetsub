# 交接提示词：DuetSub ticket 03 的三个 DRM 站字幕抓取

> 用法：把下面「=== 提示词开始 ===」到「=== 提示词结束 ===」之间的整段，作为**新会话的第一条消息**发给接手 agent。
> 前提：接手 agent 要跑在**用户真正在用的这台机器**上，浏览器已登录用户的新加坡区 Netflix / Prime Video / HBO(Max) 账号。

=== 提示词开始 ===

你接手 DuetSub 项目 wayfinder 地图里的 **ticket 03（测试素材与真实请求样本）** 的收尾。这是一张 HITL task 票，用户会登录账号配合、并用真人鼠标完成自动化打不进去的点击。

## 先读这些（别跳过）
- 地图：`.scratch/dual-sub-spec/map.md`（尤其 Notes 段 7 条立场：账号固定新加坡区；Prime 走 www.primevideo.com 国际站；中文轨优先 `zh-Hant > zh-Hans > 机翻`；只支持桌面 Chrome 网页版）。
- 本票：`.scratch/dual-sub-spec/issues/03-test-titles-capture.md`——读它的 `## Progress so far`，YouTube 与 Prime 域名**已完成**，别重做。
- ticket 01 结论：`research/findings/youtube-subtitles.md`。
- ticket 04 架构决策：`.scratch/dual-sub-spec/issues/04-architecture-stack.md`（cue 模型、五层 seam、MAIN world document_start）。
- ticket 07（被本票阻塞、消费本票样本）：`.scratch/dual-sub-spec/issues/07-site-adapters.md`——看它每站要什么，倒推你要抓什么。
- 既有站点研究：`docs/EXTRACTION.md`。
- 我写好的抓取 snippet：`research/findings/site-samples/_capture/{netflix,primevideo,hbomax}.js`。

## 你的任务：抓齐 Netflix / Prime Video / HBO Max 三站，样本存 `research/findings/site-samples/`
每站要拿到：①一部同时有**官方英文轨 + 官方中文轨（优先繁体）**的标题片名 + 轨道语言标签原文；②一份**真实字幕文件样本**（URL 形态 + 响应体前若干行 + 格式）；③原生字幕容器/控件选择器有效性；④换集/seek/广告下时间轴的观察（能测则测）。

## 工具现实（重要，别踩我踩过的坑）
- **computer-use 的浏览器是 read 档**：能截图，但**点击/输入被拦**。所以 computer-use **不能**驱动浏览器字幕菜单或 DevTools，只能"看"。
- **claude-in-chrome** 上一会话连到了用户的**另一台机器**（且 Netflix 播放器吞掉了合成点击——可能与窗口非前台/连错机器有关）。若你要用它驱动，务必确认连的是**当前这台**机器、且浏览器窗口在**前台聚焦**。
- **最稳的路子 = 用户自助**：用户在自己已登录的浏览器里，按下面清单**亲手**开字幕菜单/切轨（真人输入不受上面两条限制），把每站 `copy(__duetDump())` 的结果贴回给你，你落盘 + 收尾。你负责讲清楚每一步、解析并保存样本、写 Answer。

## 逐站精确清单

### Netflix（match pattern `https://www.netflix.com/*`）
候选标题：《魷魚遊戲》(Squid Game，剧集，SG 区繁中 UI 已确认可用)；或任何有官方英文 + 官方繁中的片。
1. 打开该剧一集的 watch 页，开始播放。
2. F12 → Console，粘贴 `research/findings/site-samples/_capture/netflix.js` 全文，回车（打印 `[duet] armed`）。
3. 打开「字幕/音訊」菜单，**截图或记下列出的语言**（重点确认 English、中文(繁體)、中文(簡體) 是否都在）——这是轨道清单的可靠来源。
4. 把字幕切到**繁體中文**，等 ~5s；再切到 **English**，等 ~5s。（切轨会触发 Netflix 拉取该轨 TTML 文件）
5. Console 运行 `copy(__duetDump())`，把结果存 `research/findings/site-samples/netflix-capture.json`（或贴回）。
6. **已知坑**：页面上下文的 `JSON.parse` 钩子**大概率抓不到 manifest 的 `timedtexttracks`**（现版本疑似 worker 内解析）。所以：轨道语言以**第 3 步的菜单**为准；字幕文件样本以**第 4 步切轨触发的 `*.oca.nflxvideo.net/...?o=...` 请求**为准（snippet 的 fetch/XHR 钩子会抓到 URL + 响应体前 400 字 + 判断格式）。想要原始 `timedtexttracks` JSON，可在 DevTools Network 面板找那条返回含 `timedtexttracks` 的响应手动 copy；抓不到就以「菜单语言 + 文件样本」为准，并在 Answer 里注明该 seam 需在真实 MAIN/document_start 钩子下复核。
7. 顺带确认并写进样本：原生 `<video>.textTracks` 为空、Netflix 自渲染到 `.player-timedtext`（隐藏目标）、媒体 CDN 是 `sinNNN` OCA（新加坡）。

### Prime Video（match pattern `https://www.primevideo.com/*`；域名 + SG territory 已确认）
候选标题：Amazon 原创（Reacher / The Boys / The Lord of the Rings: The Rings of Power）里有官方英文 + 官方繁中的；或亚洲授权片。先用字幕菜单确认双轨。
1. 打开播放页开始播放；F12 → Console，粘贴 `_capture/primevideo.js` 全文。
2. 字幕菜单切**繁中**等 ~5s、再切 **English** 等 ~5s。
3. `copy(__duetDump())` → 存 `research/findings/site-samples/primevideo-capture.json`。
4. 目标事实：字幕文件是 **`.ttml2`（EBU-TT/TTML 家族）**；`GetPlaybackResources` 响应里的 `subtitleUrls` 记录含 `languageCode / trackGroupId / timedTextTrackId / url`（用 `trackGroupId` 配官方轨对）；播放时钟 `#dv-web-player video`。
5. **广告时间轴风险**：若播放中插了广告，观察并记录广告前后 cue 时间是否错位（EXTRACTION.md 警告过）——这条直接回填 map「Not yet specified」的广告/seek 时间轴项。

### HBO Max（域名待确认——这是本站第一要务）
1. **先确认实际播放域名**：`play.max.com`？`play.hbomax.com`？还是别的？把它写下来。Max 在新加坡的可用性/品牌不确定；**若该账号在 SG 根本没有 HBO/Max**，如实记录"SG 不可用"并跳过——这本身就是 ticket 07/scope 的有效结论，别硬编。
2. 若可用：打开一部 HBO 原创（House of the Dragon / The Last of Us 等，含英文 + 繁中）的播放页；F12 → Console 粘贴 `_capture/hbomax.js`（它会先报 `host` 和 `CueBoxContainer`/`playback_controls` 选择器是否存在）。
3. 字幕切**繁中**、再切 **English**；`copy(__duetDump())` → 存 `research/findings/site-samples/hbomax-capture.json`。
4. 目标事实：字幕文件是 **`.vtt`（WebVTT）**；原生 cue 容器 `[data-testid="CueBoxContainer"]`、控件插入点 `[data-testid="playback_controls"]` 是否仍有效。

## 收尾（wayfinder 协议，务必照做）
1. 三站样本都落到 `research/findings/site-samples/` 后，在 ticket 03 文件写 **`## Answer`**：逐站的精确操作清单（即上文，按实测校正）+ 每站关键事实 + 样本文件清单；把 `Status: claimed` 改为 **`Status: resolved`**。
2. 在 `map.md` 的 `## Decisions so far` **追加一行**：`- [03 测试素材与真实请求样本](issues/03-test-titles-capture.md) — <一句 gist>`。
3. 若发现某站结论影响 map 的「Not yet specified」（如 Prime 广告时间轴），顺手更新那一段。
4. 决策类问题（比如选哪部片、HBO 不可用要不要移出 scope）逐题问用户拍板，别替用户决定。
5. 一次会话只解决这一张票（03）。ticket 07 留给后续会话。

=== 提示词结束 ===
