# 07 — YouTube adapter（+ POT priming、ASR/tlang）

**What to build:** 在 `youtube.com/watch` 上，端到端显示官方双轨（创作者字幕）或单轨+机翻，含 POT priming 与用户状态存/恢复、json3 解析、ASR/platform-mt 作兜底候选（按 §C/§D）。

**Blocked by:** 03 — Prime Video 生命周期健壮性。

**Status:** ready-for-agent

- [ ] MAIN 在 `document_start` patch fetch/XHR 捕获带 POT 的完整 `/api/timedtext` 请求，并在 `yt-navigate-finish` 读 `#movie_player.getPlayerResponse()`；仅当 `videoDetails.videoId===URL v` 时转发 captions。
- [ ] adapter 解析真实 `captionTracks`：无 `kind`=official、`kind==='asr'`=asr；`zh-TW/HK/MO`→Hant，`zh-CN/SG` 与裸 `zh`→Hans；id 用 `vssId+trackName` 稳定组合。
- [ ] POT priming：当前 video 无真实 timedtext URL 时，ISOLATED 存用户原 caption 开/关状态、经 MAIN 驱动 `loadModule/setOption`、截获 POT 后恢复原状态；无法可靠恢复则 fail-closed 并提示用户手动开一次（不静默改偏好）。
- [ ] `fetchTrack` 克隆带 POT 的真实请求改参并强制 `fmt=json3`（官方删 `kind=asr`、非平台 MT 删 `tlang` 等）；200 空体=POT 失效 → 只重 prime 一次仍空则 fail-closed；POT/URL 不跨 `videoId`。
- [ ] json3 parser：过滤无 `segs`/窗口/`aAppend`/纯空白事件；`start=tStartMs`、`end=start+dDurationMs`、`text=segs.utf8 拼接`、保留 `\n`；对 ticket 03 两个 json3 fixture 单测。
- [ ] 同步 `#movie_player video`；原生层与广告按已验证 selector 处理；SPA（`yt-navigate-start/finish`）正确 reset；按 §G YouTube stop rule 验证。
