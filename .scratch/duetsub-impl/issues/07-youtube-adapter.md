# 07 — YouTube adapter（+ POT priming、ASR/tlang）

**What to build:** 在 `youtube.com/watch` 上，端到端显示官方双轨（创作者字幕）或单轨+机翻，含 POT priming 与用户状态存/恢复、json3 解析、ASR/platform-mt 作兜底候选（按 §C/§D）。

**Blocked by:** 03 — Prime Video 生命周期健壮性。

**Status:** claimed

- [x] MAIN 在 `document_start` patch fetch/XHR 捕获带 POT 的完整 `/api/timedtext` 请求，并在 `yt-navigate-finish` 读 `#movie_player.getPlayerResponse()`；仅当 `videoDetails.videoId===URL v` 时转发 captions。
- [x] adapter 解析真实 `captionTracks`：无 `kind`=official、`kind==='asr'`=asr；`zh-TW/HK/MO`→Hant，`zh-CN/SG` 与裸 `zh`→Hans；id 用 `vssId+trackName` 稳定组合。
- [x] POT priming：当前 video 无真实 timedtext URL 时，ISOLATED 存用户原 caption 开/关状态、经 MAIN 驱动 `loadModule/setOption`、截获 POT 后恢复原状态；无法可靠恢复则 fail-closed 并提示用户手动开一次（不静默改偏好）。
- [x] `fetchTrack` 克隆带 POT 的真实请求改参并强制 `fmt=json3`（官方删 `kind=asr`、非平台 MT 删 `tlang` 等）；200 空体=POT 失效 → 只重 prime 一次仍空则 fail-closed；POT/URL 不跨 `videoId`。
- [x] json3 parser：过滤无 `segs`/窗口/`aAppend`/纯空白事件；`start=tStartMs`、`end=start+dDurationMs`、`text=segs.utf8 拼接`、保留 `\n`；对 ticket 03 两个 json3 fixture 单测。
- [ ] 同步 `#movie_player video`；原生层与广告按已验证 selector 处理；SPA（`yt-navigate-start/finish`）正确 reset；按 §G YouTube stop rule 验证。

## Answer

### Automated

- 从指定 baseline `5a6b8904d4149c2a4d7a932cfe1e7799afe83f6a` 建立独立 sibling worktree；开工前确认 Ticket 01–03 均为 `resolved` 且有 `## Answer`，共享 `SiteAdapter` / `TrackInfo` / `Cue` 与 lifecycle/generation seam 存在。baseline 的 `npm test`（8 files / 26 tests）、`npm run check`、`npm run build` 全部通过后才把本票改为 `claimed`。
- 按 TDD 逐个 red → green 覆盖：仅 `/watch?v=` 激活、captionTracks 纯解析与中文码归一化、创作者官方 > ASR > 平台 `tlang`、两个真实 json3 fixtures、过滤窗口/无 `segs`/`aAppend`/纯空白事件、POT request 完整克隆与 `kind/name/tlang/fmt` 改参、`videoId + contentGeneration + clockGeneration` guard、可恢复字幕状态判定、同 generation 最多一次 re-prime。
- MAIN 保持薄层：只捕获当前 watch video 的 GET timedtext request、转发 raw captions，并无状态执行 `getOption` / `loadModule` / `setOption` primitive；轨道解析、候选生成、POT/handle 生命周期、priming/恢复、json3 解析与选择全部在 ISOLATED/core。
- POT、完整 timedtext URL、track handle 与用户字幕 snapshot 只在内存中按当前 context 保存；YouTube runtime 无 `chrome.storage` / localStorage / sessionStorage / IndexedDB，也不输出这些值到 console。构建产物未包含测试占位 POT、真实签名或真实 fixture 文本。
- 最终自动 gate：`npm test` = 13 files / 40 tests passed；`npm run check` PASS；`npm run build` PASS；manifest 仍只有 `storage` 与既有四站 HTTPS host，YouTube MAIN/ISOLATED 均为静态 `document_start`。
- baseline 中没有 `research/findings/site-samples/_capture/youtube.js` 或其他 YouTube capture helper；Git 树与 Ticket 03/04/05 sibling baseline 均一致缺失。本票没有伪造 helper 或新增“真实采集”证据。

### Human

- **FAIL CLOSED（Computer Use，2026-07-24）**：登录态合并版在两个真实 TED 视频上注入 toggle；YouTube 原生英文字幕开启且持续正常显示，但没有取得可验证的 POT/timedtext 双轨或平台翻译，因此没有双轨 overlay，也没有提前隐藏原生字幕。
- **PARTIAL**：从 `arj7oStGLkU` 站内 SPA 切换到 `8KkKuTCFvzI` 后，URL/videoId、播放器和 DuetSub toggle 都更新，enabled 状态保持，未见旧片字幕残留。
- **NOT RUN**：初始字幕关闭状态下的 POT priming，以及开启/关闭两种状态的原 track/off 精确恢复。
- **NOT RUN**：真实官方/ASR 分类、真实 json3 获取、seek 与广告进入/退出。
- **NOT RUN**：现场确认 POT 不跨 videoId/generation，以及 200 空体在真实播放器中最多 re-prime 一次。
- 原生字幕容器和 `#movie_player` 广告信号仍未形成可据以新增 runtime selector 的证据；没有猜写 `.ytp-caption-window-container` 或 `ad-showing` 行为。

### Waived / Not Run

- **WAIVED：无。** 未获用户批准，不把任何真人 gate 写成 waiver。
- 上述必需真人 gate 未完成，所以 Ticket 07 保持 `claimed`，`.scratch/duetsub-impl/map.md` 不追加 Ticket 07。

### 修改文件

- `.scratch/duetsub-impl/issues/07-youtube-adapter.md`
- `entrypoints/youtube-main.content.ts`
- `entrypoints/youtube.content.ts`
- `src/adapters/youtube-priming.ts`
- `src/adapters/youtube-request.ts`
- `src/adapters/youtube-tracks.ts`
- `src/adapters/youtube-url.ts`
- `src/adapters/youtube.ts`
- `src/content/controller.ts`
- `src/content/site-ui.ts`
- `src/core/messages.ts`
- `src/core/track-selection.ts`
- `src/core/youtube-json3.ts`
- `src/main/youtube-hook.ts`
- `tests/messages.test.ts`
- `tests/track-selection.test.ts`
- `tests/youtube-json3.test.ts`
- `tests/youtube-priming.test.ts`
- `tests/youtube-request.test.ts`
- `tests/youtube-tracks.test.ts`
- `tests/youtube-url.test.ts`
