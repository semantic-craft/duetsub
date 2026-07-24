# 05 — HBO Max adapter

**What to build:** 在 `play.hbomax.com` 上，DuetSub 端到端显示官方双轨（或单轨+机翻），复用共享 core 与生命周期 helper。新增 Max 拦截、adapter、WebVTT parser。

**Blocked by:** 03 — Prime Video 生命周期健壮性（共享生命周期 helper）。

**Status:** resolved

- [x] MAIN 在 Max 媒体域转发 `.vtt` 与 subtitle playlist/API 候选原文；ISOLATED 判格式。
- [x] adapter 以 DOM track id/label（如 `en-US-subtitles`、`zh-Hant-TW-subtitles`）为权威枚举源，归一化 BCP-47、标 `official`；程序化开/关字幕菜单并恢复原开合状态。
- [x] 第二轨由**完整 subtitle playlist/API 映射**（DOM id → 完整 VTT 或 segment playlist）驱动，绝不从单条 VTT URL 猜另一轨；MAIN 看不到映射即 fail closed。
- [x] WebVTT parser 产出 `Cue[]`：毫秒正确、`<br>`/标签处理、实体解码、REGION/line 定位；非零 `X-TIMESTAMP-MAP` 须由 playlist/presentation 锚点换算（无锚点 fail closed）；仓库没有可验证的完整 Max VTT fixture，按本票约束改用明确标注为 synthetic 的最小 parser fixture。
- [x] 同步 `[data-testid="VideoElement"]`；开启时隐藏 `[data-testid="caption_renderer_overlay"]`、否则恢复；复用 ticket 03 的 seek/广告/换集生命周期。
- [x] 按 §G Max stop rule 在真机双轨片子（+ seek + 换集/video replacement）验证；真实广告 gate 经用户明确批准 WAIVED。

## Answer

### 自动证据

- 按 `mattpocock-skills:tdd` 做公开 seam 的垂直 red → green：纯 WebVTT parser；DOM track id + 完整 `playbackInfo`/DASH MPD 的纯映射；generation-bound response inbox；Max 英文主轨显示副本对齐。测试不检查私有调用次数，也没有为 Max DOM 编造 selector 单测。
- 英文主轨对齐以四个独立 RED 锁定后逐项 GREEN：延迟中文 cue 采用其原始起点所落入的英文区间；唯一候选覆盖率低于 95% 时整轨 fail closed；官方英文 CC 优先于普通英文字幕；明确的多对话行溢出只移到中文源区间覆盖的后续英文对白 cue。
- 2026-07-24 真机诊断发现同一 MPD 路径会从 `gcp.asia.prd.media.max.com` 跳转到 `akm.asia.prd.media.max.com`；先加入回归测试并确认 RED（映射返回 `{}`），再只允许“双方均为 HTTPS 官方 `*.prd.media.max.com` 且 pathname 完全相同”的跨 CDN 映射。非 Max host 或不同 pathname 仍返回空映射；目标测试现为 4 tests passed。
- 真机 MPD 还包含 intro + feature 多个非重叠 `Period`。纯映射测试锁定 Period start/duration、presentation anchor 偏移与 MPEGTS 局部媒体时钟；重叠、缺 duration 或无法验证的时间线继续返回空映射。
- 恢复播放时旧 intro VTT 会 404；纯选择测试锁定只从当前/未来 segment 开始，且 404 只能跳到完整 MPD 中已验证的下一 segment，并等待其 presentation time。无法唯一定位失败 URL、没有后继 segment 或非 404 均 fail closed。
- 换集前 Max 会在旧 URL 下预取下一集 `playbackInfo`。generation 测试先复现元数据被错误丢弃，再只迁移“manifest URL 与旧集 active manifest 可验证不同”的预取 metadata；旧 manifest、旧 VTT、未知归属响应全部丢弃，新 MPD 到齐前不进入双轨 ready。
- WebVTT parser 覆盖毫秒、标签/`<br>`、命名与数字实体、空白折叠、REGION/line top 定位；零 `X-TIMESTAMP-MAP` 直接使用节目时轴，非零 map 缺 presentation anchor 返回空，提供 MPEGTS→节目时间锚点后才换算。
- Max MAIN `document_start` hook 只观察/转发 `playbackInfo`、`.mpd`/`.m3u8` 与 `.vtt` 原文；解析、BCP-47、选轨、MPD `SegmentTimeline` 展开、VTT 获取和 cue 归一化均在 ISOLATED。单条 VTT 即使合法也不能建立 track ownership；缺 API+manifest 完整映射时 `fetchTrack` fail closed。
- adapter 只从当前可见 `[data-testid="VideoElement"]` 所属 `playerContainer` 内的 `player-ux-text-track-button` 枚举官方轨。真机发现 Max 在控制栏隐藏时保留唯一 menu button、仅设 `visibility:hidden`；入口仍可程序化打开完整菜单，因此不再错误等待入口“可见”，但仍严格要求 `playback_controls` 内唯一按钮。枚举不点击 track radio，原选择不变，并恢复菜单原开合状态。
- Max 内容 identity 使用已验证的 `/video/watch/<id>/<id>`；`[data-testid="VideoElement"]`、`[data-testid="caption_renderer_overlay"]`、seek、video replacement、content/clock generation 与 SSAI break fail-closed 接回 ticket 03 lifecycle reducer。原生层仍只在双轨 `tracks-ready` 后隐藏，reset/seek/ad/关闭时恢复。
- 最终全量复跑：`npm test` 为 30 files / 102 tests passed；`npm run check`、`npm run build`、`git diff --check` 均通过，`src/` 与 `tests/` 无 `[DEBUG-` 标记。生成 manifest 仍只有 `storage` 与既有四站 host，Max match 精确为 `https://play.hbomax.com/*`。
- 仓库无完整可验证的 Max VTT 文件；新增 `max-minimal.synthetic.vtt` 明确声明不是 Max 真机 fixture。没有把登录态抓到的完整 VTT、签名 query、token 或观看数据写入仓库。

### 真人证据（Computer Use，登录态 Chrome，2026-07-24）

- **PASS — 英文主轨对齐**：在《退休》开头以 100ms 间隔同帧采样真实 video 时钟和 DuetSub 英中两行；原先可重复的约 0.4–2.0 秒中文滞后已消失。实测同段依次同屏出现 `blind singer` / `盲人歌手`、`John Lennon! / Time.` / `約翰藍儂 / 時間到`、`Stevie Wonder.` / `史提夫溫達`。
- 两集完整 VTT 只在内存核验：一集唯一英文候选覆盖 258/263（98.10%）；另一集普通英文字幕仅 233/314（74.20%）并正确 fail closed，改选同集官方英文 CC 后为 310/314（98.73%）并进入 ready。没有把缺口用固定 offset 或最近邻补齐。
- 多行溢出回归在真人片段通过：`You used to share a gardener.` 只显示 `你們以前請了同一名園丁`，随后 `Siegfried.` 才显示 `齊格菲`。官方源偶尔会把同一 cue 内两位说话人的中英文行序写成相反顺序；本票不做文本语义或机翻重排。
- 在 `.output/chrome-mv3` 最终构建上播放《天后与草莓》S2E1，完整 `playbackInfo + MPD` 映射取得英语普通字幕与繁体中文两轨；屏幕和 accessibility tree 同时出现两轨，例如 `No! Get up! Get up!` / `不可以,快起來‥`。
- 向前跳转 10 秒后双轨继续同步，例如 `Hey, lady... / It's cool.` 与 `老媽 / 太太,你不能‥` 同屏；不是停留在 seek 前的 stale cue。
- 修正后再次执行真实 10 秒 seek，跳转后的 `Roy.` / `萊`, `Innocent.` / `無罪`, `Ted Kennedy? / Yes.` / `泰德甘迺迪 / 對` 依英文 cue 推进，没有复现 seek 前 stale cue。
- 关闭 DuetSub 后开关值为 `0`，双语 overlay 消失，Max 原生英文字幕恢复；重新开启后开关值为 `1`，原生层重新隐藏，并再次出现英语 + 繁中双轨。
- 官方字幕菜单可正常打开与关闭；关闭前后原选择始终为“英语”，菜单同时真实枚举英语、英语 CC、简中、繁中、印尼语、泰语、马来语，扩展没有改选 radio，也没有把菜单留在错误开合状态。
- 从 S2E1 切到 S2E2 后 URL 与 video/content identity 均替换；新一集重新取得两轨并同屏显示 `to call me back...` / `珍妮特史東終於回我電話了`，证明 video replacement 后不是沿用上一集 response。
- 最终构建上直开《The Captain's Wife》后双轨稳定出现，例如 `Could it be your hundreds of thousands` / `會不會是因為你多年來不停消遣她們?`；原生 `[data-testid="caption_renderer_overlay"]` 的 inline/computed visibility 均为 `hidden`。
- 通过 DevTools 仅把真实 video 时钟放到片尾 5 秒，随后由 Max 自己执行 countdown、SPA URL 更新与 video replacement，从《The Captain's Wife》切到下一集《退休》。未刷新页面时，新集已自动恢复双轨，例如 `John Lennon! / Time.` / `盲人歌手`，随后 `God. / Unbelievable.` / `-你們又得零分了 / -天啊`；检查到唯一可见 video、DuetSub overlay 存在、原生 caption renderer 仍隐藏。
- 修正后又通过 Max 剧集菜单完成《退休》与相邻集之间的 SPA video replacement；新 video 不刷新页面即重新取得英文 CC + 繁中完整映射并恢复双轨。关闭 DuetSub 时原生字幕恢复，重新开启且双轨 ready 后原生层才隐藏。
- 最终换集后的 Console 不含任何 `[DuetSub]` 错误或 `[DEBUG-HBO-REPLACE]` 标记；普通 Max/Braze 网络告警与本票无关。
- 诊断期间完整映射曾同时覆盖 7 条官方轨；所有响应只在内存与 DevTools 中检查，临时诊断日志已移除，没有把签名 URL、token、观看数据或 proprietary payload 写入仓库。

### Waived / Not run

- **WAIVED — 真实广告**：本次播放与换集没有遇到真实广告；用户在本会话明确指示“广告不用管”，因此仅此 gate 按用户批准记录 WAIVED，没有用普通正片或单条 VTT 冒充广告 PASS。
