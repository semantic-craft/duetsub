# 05 — HBO Max adapter

**What to build:** 在 `play.hbomax.com` 上，DuetSub 端到端显示官方双轨（或单轨+机翻），复用共享 core 与生命周期 helper。新增 Max 拦截、adapter、WebVTT parser。

**Blocked by:** 03 — Prime Video 生命周期健壮性（共享生命周期 helper）。

**Status:** claimed

- [x] MAIN 在 Max 媒体域转发 `.vtt` 与 subtitle playlist/API 候选原文；ISOLATED 判格式。
- [x] adapter 以 DOM track id/label（如 `en-US-subtitles`、`zh-Hant-TW-subtitles`）为权威枚举源，归一化 BCP-47、标 `official`；程序化开/关字幕菜单并恢复原开合状态。
- [x] 第二轨由**完整 subtitle playlist/API 映射**（DOM id → 完整 VTT 或 segment playlist）驱动，绝不从单条 VTT URL 猜另一轨；MAIN 看不到映射即 fail closed。
- [x] WebVTT parser 产出 `Cue[]`：毫秒正确、`<br>`/标签处理、实体解码、REGION/line 定位；非零 `X-TIMESTAMP-MAP` 须由 playlist/presentation 锚点换算（无锚点 fail closed）；仓库没有可验证的完整 Max VTT fixture，按本票约束改用明确标注为 synthetic 的最小 parser fixture。
- [x] 同步 `[data-testid="VideoElement"]`；开启时隐藏 `[data-testid="caption_renderer_overlay"]`、否则恢复；复用 ticket 03 的 seek/广告/换集生命周期。
- [ ] 按 §G Max stop rule 在真机双轨片子（+ seek + 真实广告）验证；gate 不满足则以 unsupported stub 交付。

## Answer

### 自动证据

- 按 `mattpocock-skills:tdd` 做三个公开 seam 的垂直 red → green：纯 WebVTT parser；DOM track id + 完整 `playbackInfo`/DASH MPD 的纯映射；generation-bound response inbox。测试不检查私有调用次数，也没有为 Max DOM 编造 selector 单测。
- WebVTT parser 覆盖毫秒、标签/`<br>`、命名与数字实体、空白折叠、REGION/line top 定位；零 `X-TIMESTAMP-MAP` 直接使用节目时轴，非零 map 缺 presentation anchor 返回空，提供 MPEGTS→节目时间锚点后才换算。
- Max MAIN `document_start` hook 只观察/转发 `playbackInfo`、`.mpd`/`.m3u8` 与 `.vtt` 原文；解析、BCP-47、选轨、MPD `SegmentTimeline` 展开、VTT 获取和 cue 归一化均在 ISOLATED。单条 VTT 即使合法也不能建立 track ownership；缺 API+manifest 完整映射时 `fetchTrack` fail closed。
- adapter 只从 live DOM `player-ux-text-track-button` 的 `aria-label` 与子 `player-ux-text-track-check-<track-id>` 枚举官方轨；枚举不点击任何 track radio，原选择不变，并按已验证的 track menu/dismiss seam 恢复菜单原开合状态。第二轨 URL 来自 `playbackInfo.textTracks` 与同一 manifest 的 MPD `lang + Role + SegmentTemplate` 唯一映射，不从已见 VTT 路径改字符串。
- Max 内容 identity 使用已验证的 `/video/watch/<id>/<id>`；`[data-testid="VideoElement"]`、`[data-testid="caption_renderer_overlay"]`、seek、video replacement、content/clock generation 与 SSAI break fail-closed 接回 ticket 03 lifecycle reducer。原生层仍只在双轨 `tracks-ready` 后隐藏，reset/seek/ad/关闭时恢复。
- 当前全量复跑：`npm test` 为 11 files / 32 tests passed；`npm run check`、`npm run build`、`git diff --check` 均通过。生成 manifest 仍只有 `storage` 与既有四站 host，Max match 精确为 `https://play.hbomax.com/*`。
- 仓库无完整可验证的 Max VTT 文件；新增 `max-minimal.synthetic.vtt` 明确声明不是 Max 真机 fixture。没有把登录态抓到的完整 VTT、签名 query、token 或观看数据写入仓库。

### 现场平台证据（不是本 build 验收）

- 在登录态 `play.hbomax.com` 的《龙族前传》播放页只读确认：唯一时钟 `[data-testid="VideoElement"]`、原生层 `[data-testid="caption_renderer_overlay"]`、控制栏 `[data-testid="playback_controls"]`。
- live 菜单确认字幕按钮为 `data-testid="player-ux-text-track-button"` / `role="radio"`，选择态为 `aria-checked`；子 check testid 暴露 `en-US-subtitles`、`en-US-closedcaptions`、`zh-Hans-SG-subtitles`、`zh-Hant-TW-subtitles` 等权威 id，label 与 `playbackInfo.textTracks.displayName` 对应。
- live 网络确认当前站点的完整来源不是猜测的单条 VTT：`playbackInfo` 给出 7 条 WebVTT text track 与当前 DASH manifest；MPD 以 `lang + Role(subtitle/caption) + SegmentTemplate + SegmentTimeline` 唯一映射英文普通字幕与繁中字幕的完整 VTT segment 列表。VTT/MPD 响应允许 `https://play.hbomax.com` CORS；完整响应仅在内存中检查，未落盘。

### 真人 gate

- **FAIL CLOSED（Computer Use，2026-07-24）**：已在登录态 Chrome 加载合并版 `.output/chrome-mv3`，并打开 `play.hbomax.com` 真实播放页。DuetSub toggle 可注入并启用；官方菜单现场同时枚举英语、英语 CC、简中、繁中等轨，播放与 seek 后原生英文字幕仍可用。
- 未观察到双轨 overlay；原生英文没有被提前隐藏。这意味着本次没有拿到可验证的完整 `track id → VTT/segment playlist` 双轨映射，按 stop rule 正确 fail closed。官方菜单里存在两种语言不等于完整映射取得两轨，不能记为通过。
- **NOT RUN**：换集/video replacement 与真实广告进入/退出；也未形成 adapter 自动开合菜单并恢复原状态的独立证据。

### Waived

- 无。没有请求或自行记录任何环境性 waiver。
