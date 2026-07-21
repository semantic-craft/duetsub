# 03 测试素材与真实请求样本

Type: task
Status: resolved
Blocked by: —

## Question

HITL task：用用户的新加坡区账号备齐每站的验证素材，锁定 adapter 方案前的事实基础。

1. 四站各找 1–2 部同时有官方英文轨和官方中文轨（优先繁体）的标题，记下片名与轨道语言标签原文。
2. Prime Video：确认实际观看域名（`www.primevideo.com`），抓 1 份真实字幕请求样本（`.ttml2`？），记录 URL 形态与响应格式。
3. HBO Max：确认新加坡区实际域名（`play.hbomax.com` / `play.max.com`），抓 1 份 `.vtt` 字幕请求样本，确认 `CueBoxContainer` 等选择器仍然有效。
4. Netflix：确认一部双轨标题的 `timedtexttracks` 元数据可见（DevTools 网络面板或 JSON.parse 钩子思路）。
5. YouTube：找 1 个同时有创作者上传中/英轨的视频作为基准样本。

产出：样本文件存 `research/findings/site-samples/`，清单写进本 ticket 的 Answer。

## Progress so far（2026-07-21 session 1 — 部分完成，已交接）

**已完成（自动化，样本已存）：**
- ✅ **YouTube 全部搞定**，含 ticket 01 交办的两个验证项。样本：`research/findings/site-samples/youtube.md`、`youtube-timedtext-en.json3.json`、`youtube-timedtext-zh-TW.json3.json`。
  - 验证项①：复用播放器截获的**带 pot** timedtext URL，改写 `lang`/`tlang`/`fmt` **均不被 signature/POT 拒绝**（signature 只覆盖 `sparams`，不含 lang/kind/fmt/tlang；pot 绑会话/视频；删 pot 对照 → 空体）。裸 fetch（无 pot）一律 200+空体。→「拦一条 pot 请求、改 lang 取第二官方轨」实测可行。
  - 验证项②：SPA 导航后 `window.ytInitialPlayerResponse` **过期**；`/youtubei/v1/player` 整场 fire **0 次**（预取）；可靠枚举走 `#movie_player.getPlayerResponse()` @ `yt-navigate-finish`。**修正 ticket 01 §4**，供 07 采纳。
  - 基准视频 `iG9CE55wbtY`（TED，含人工 `.en`/`.zh-TW`/`.zh-CN` + `a.en`；旧码 zh-TW/zh-CN）；双轨时间轴实测错位（427 vs 378 条，中文轨合并/丢句/整秒取整）→ 按时间重叠配对，非索引。
- ✅ **Prime Video 域名**：`www.primevideo.com`、`currentTerritory:"SG"`（登出态 geo-IP 确认）。match pattern = `https://www.primevideo.com/*`。
- ✅ **抓取 snippet 已写好**：`research/findings/site-samples/_capture/{netflix,primevideo,hbomax}.js`。

**Netflix 实测发现（在"连错的另一台机器"上驱动得到，机器/焦点因素待在正确机器复核）：**
- 合成点击/hover **打不进播放器**（center-click 未暂停，currentTime 继续走）——可能是 Netflix 吞非可信事件，也可能是目标窗口非前台/连错机器所致。真人鼠标与真实注入扩展不受影响。
- **页面上下文 `JSON.parse` 包裹抓不到 manifest**（console 注入、reload 后立即重注入都没抓到）→ 现版本疑似 **worker 内解析或早期引用捕获**。EXTRACTION.md 的「wrap JSON.parse」需在真实 MAIN/document_start 钩子下复核；Netflix 拦截 seam 可能要落在 **timed-text 文件请求（网络层）** 或 worker 钩子，而非 JSON.parse。
- 原生 `<video>.textTracks` **为空**；Netflix 自渲染到 `.player-timedtext`（验证了 EXTRACTION.md 的隐藏目标）。
- 媒体/字幕 CDN：`ipv4-c1xx-sin001-ix.1.oca.nflxvideo.net/range/<bytes>?o=1&v=29&e=<expiry>&t=<token>&sc=...`（`sin001`=新加坡 OCA）。字幕默认关，须开字幕才发 timedtext 请求。
- SG Netflix 账号可用，繁中 UI，双轨候选 = 《魷魚遊戲》Squid Game。

**本会话结束时尚余（现已在下方 Answer 完成）：** Netflix / Prime Video / HBO Max 三站的字幕轨清单 + 真实字幕文件样本（`.ttml2` / `.vtt` / Netflix TTML），HBO Max 实际域名 + `CueBoxContainer`/`playback_controls` 选择器有效性。交接提示词：`.scratch/dual-sub-spec/03-handoff-DRM-capture.md`。

## Answer

2026-07-22 在用户实际使用、已登录新加坡区账号的桌面 Chrome 上完成三站复核。抓取只保存响应格式、短 body head 与去敏后的 URL 形态；Netflix 的临时签名参数值和 Max 的 CMCD 值均未落盘。

### Netflix

**可复现操作：**
1. 打开 `https://www.netflix.com/watch/*` 并开始播放《魷魚遊戲》；本次素材为第 1 季第 4 集「即使被困住也要選邊站」。
2. 在切轨前启用 Network response 监听；若用 `_capture/netflix.js`，不能只凭 `?o=` 判定字幕，因为该形态也覆盖普通 OCA 媒体分片，必须再以 `text/xml`、XML magic 和 TTML 根元素筛选。
3. 打开「音訊和字幕」，记录菜单原文；本次同时看到 `中文（繁體）`、`中文（簡體）`、`英語 (CC)`、`英語`。
4. 切到 `中文（繁體）`，再切到 `英語 (CC)`；后一次切轨触发真实 TTML 响应。复测结束时切回繁中。
5. 记录 `video.currentTime`、`video.textTracks.length` 和 `.player-timedtext`；用播放器的「快轉尋找」做一次 +10 秒 seek。

**关键事实：**
- 英语 CC 样本来自 `ipv4-c110-sin001-ix.1.oca.nflxvideo.net/?o=…&v=…&e=…&t=…`，HTTP 200、`text/xml`，CDP 解码后的字符串长度为 106,837；根元素声明 TTML IMSC 1.1 text profile，`xml:lang="en"`、`nttm:textType="CC"`。`sin001` 也再次证明本次走新加坡 OCA。
- 原生 `video.textTracks.length === 0`；Netflix 仍自渲染到 `.player-timedtext`。
- 暂停状态下 +10 秒从 1653.22494 跳到 1663.226；`.player-timedtext` 前后都存在。目标点没有可见 cue，因此这里只证明时钟与容器连续，不声称文本对齐正确。
- 页面 `JSON.parse` seam 仍未观察到 `timedtexttracks`；当前可靠证据是切轨产生的 timed-text 网络响应。真实 MAIN/document_start 或 worker hook 是否能读 manifest，留给 adapter 实现验证，不能继续把页面 JSON.parse 当既定方案。

样本：`research/findings/site-samples/netflix-capture.json`。

### Prime Video

**可复现操作：**
1. 使用 `https://www.primevideo.com/region/eu/*`（账号 territory 为 SG）打开《指环王：力量之戒》第 1 季第 1 集「往昔阴影」。match pattern 仍应是 `https://www.primevideo.com/*`。
2. 在播放前启用 Network response 监听或粘贴 `_capture/primevideo.js`，然后打开 `Subtitles and Audio Menu`。
3. 记录菜单原文；本次同时看到 `English [CC]`、`中文（简体）`、`中文（繁體）`。
4. 切到 `中文（繁體）`，再切到 `English [CC]`；英语切轨产生真实 `.ttml2` 响应。
5. 用 `#dv-web-player video` 读取时钟与原生轨状态；本次未触发广告。临时并行播放会话随后碰到平台 stream-count limit，因此没有把 seek/换集结果写成结论。

**关键事实：**
- 样本 URL 为 `https://cf-timedtext.aux.pv-cdn.net/<asset>/<track>.ttml2`，HTTP 200、MIME `application/octet-stream`、74,664 bytes；body 是 UTF-8 TTML2，`ttp:version="2"`、`xml:lang="en-US"`，首个 cue 从 `00:00:22.708` 开始。
- 播放时钟选择器 `#dv-web-player video` 有效；探针所见 `video.textTracks.length === 0`。
- 2026-07-22 的实际播放器会话没有出现旧的 `GetPlaybackResources` / 可读 `subtitleUrls`。观察到的是 `POST /cdp/playback/pes/StartSession`，请求带不透明 `playbackEnvelope`，响应只暴露 session token/回调间隔；所以 ticket 07 不能继续假定 `subtitleUrls.languageCode / trackGroupId / timedTextTrackId / url` 是当前可读 seam，必须围绕真实切轨请求或更早的 MAIN/worker seam 重新验证枚举方案。
- 本次没有广告，不能据此关闭 Prime 广告前后 cue 对齐风险。

样本：`research/findings/site-samples/primevideo-capture.json`。

### HBO Max

**可复现操作：**
1. 访问 `https://play.max.com/`；SG 账号实际重定向并在 `https://play.hbomax.com/` 播放，因此本站 match pattern 应以 `https://play.hbomax.com/*` 为准。
2. 打开《龙族前传》第 1 季第 1 集「龙的传人 / The Heirs of the Dragon」，在切轨前启用 Network/PerformanceResourceTiming 观察。
3. 打开「音频和字幕设置」，记录菜单原文；本次同时看到 `英语`、`英语 CC`、`中文（简体）`、`中文（繁体）`。DOM 同时暴露 `en-US-subtitles`、`en-US-closedcaptions`、`zh-Hans-SG-subtitles`、`zh-Hant-TW-subtitles`。
4. 切到 `中文（繁体）`，等待播放，再切回 `英语`；从真实 XHR resource 读取 `.vtt` URL，并对同一 URL 取短 body head。
5. 检查 cue/controls 选择器，做一次暂停态 +10 秒 seek；再从播放器集数抽屉切到第 2 集，比较 URL、`video` 元素身份与挂载点。

**关键事实：**
- SG 可用；实际播放 host 是 `play.hbomax.com`，不是 `play.max.com`。
- 主节目字幕 URL 形态为 `https://akm.asia.prd.media.max.com/<asset>/t/<track>/<segment>.vtt?CMCD=…`，真实请求 initiator 为 XHR，HTTP 200、`text/vtt`，响应以 `WEBVTT` 和 `X-TIMESTAMP-MAP` 开头。
- 旧 `[data-testid="CueBoxContainer"]` 已失效；当前 `[data-testid="caption_renderer_overlay"]` 存在。`[data-testid="playback_controls"]` 仍有效；原生 `video.textTracks.length === 0`。
- 暂停态 +10 秒从 81.536053 到 91.536，caption renderer 前后存在。
- 播放器内从第 1 集切到第 2 集会做 SPA URL 变化并**替换 `<video>` 元素**；第 2 集按账号进度从约 1437.99 秒恢复，caption renderer 与 playback controls 在换集后都重新存在。adapter 因此必须把换集视为重绑定事件，不能永久持有旧 video 引用。
- 本次没有广告，不能声称广告时间轴已经验证。

样本：`research/findings/site-samples/hbomax-capture.json`。

### 完整样本清单

- `research/findings/site-samples/netflix-capture.json`
- `research/findings/site-samples/primevideo-capture.json`
- `research/findings/site-samples/hbomax-capture.json`
- `research/findings/site-samples/youtube.md`
- `research/findings/site-samples/youtube-timedtext-en.json3.json`
- `research/findings/site-samples/youtube-timedtext-zh-TW.json3.json`
- 复现辅助：`research/findings/site-samples/_capture/{netflix,primevideo,hbomax}.js`

## Comments
