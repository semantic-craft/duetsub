# 06 — Max 任意官方语言对与受控对齐

**What to build:** 在 Max 当前节目中，让动态官方语言选择驱动完整 DOM、playbackInfo、MPD 与 VTT 映射。任意非默认语言对先按两条官方轨的原生时序显示；只有经过真人证据批准的 pair alignment policy 才能重排 bottom 显示副本。

**Blocked by:** 03 — 交付动态官方语言选择器。

**Status:** resolved

- [x] Max 官方目录从当前播放器的可验证 DOM 轨生成，并与完整 playbackInfo/MPD 资源唯一映射。
- [x] top/bottom 选择取代 English-primary/Chinese-secondary 默认选择，不从单条 VTT 或 label 猜测轨道归属。
- [x] 非白名单语言对保留两条官方轨的原始 cue 区间和文本。
- [x] 现有已验证 English-primary/Traditional-Chinese 对齐作为显式兼容 policy 保留，不扩张为全语言默认。
- [x] 新 alignment policy 只能使用 cue 区间和已有硬换行；禁止固定 offset、翻译、文本改写或语义重排。
- [x] 对齐唯一覆盖率低于门槛时保留两条官方轨的原始 cue 区间，不猜 offset、
      不丢整对字幕；只有通过门槛才标记为受控对齐。
- [x] 自动证据覆盖任意 BCP-47 映射、原生时序默认、白名单选择、覆盖率失败和 selection generation。
- [x] 登录态真人 gate 按用户指定的英上繁中下验证双行、seek、换集 /
      video replacement、关闭和菜单恢复；另以印尼语 + 泰语验证任意官方语言对。
- [x] 真人 gate 同时确认 video 画面持续可见，不复发 overlay 合成导致的黑画面回归。

## Answer

- Max 的 DOM、playbackInfo、MPD 与 VTT 资源按结构化机器语言码唯一映射到共享 Official Pair seam；任意 pair 默认保留两条官方轨原始时序。
- 只有精确 `en-US` closed captions + `zh-Hant-TW` subtitles 进入既有白名单对齐；覆盖率不足时保留原始双轨，不猜 offset、不改写文本、不丢弃整对。
- 非英中 `id + th` 已通过真人原始时序 gate；用户指定的英上繁中下又在最终运行候选 `fa0989e` 上覆盖 seek、关闭/恢复和 video 可见性。

## Automated verification

- `npm test` — PASS，47 个测试文件、203 个测试。
- `npm run check` — PASS。
- `npm run release:build` — PASS，Chrome MV3 production zip 与最小权限边界校验通过。
- `git diff --check` — PASS。

## Logged-in human gate

**PASS.** 2026-07-31 在登录态 Max
《President Curtis》S1E1《Pilot》上，用已同步到 Chrome 实际 unpacked 加载目录的
最终构建完成以下核验：

- 用户指定的 `en-US` 上方 + `zh-Hant-TW` 下方达到
  `官方美国英语 + 官方中文（繁体，台湾） · 100%`。同一媒体时间 `632.3s`
  实际显示 `You want me to carry three loose / rulers out of the White House`
  与 `你要我拿著三把散裝的尺走出白宮`。
- 点击 `重新載入官方字幕` 后先清空旧状态，再恢复相同语言对、相同媒体时间与相同
  两行字幕；无需刷新播放页。
- seek `632.3s → 651.784s → 632.3s` 时，中间实际显示
  `the testicle vestibule.` / `兄弟隧道、蛋蛋前廳`，回跳后恢复原两行。
- 关闭 DuetSub 后，两条 overlay line 均为 `display:none`，Max 原生
  `zh-Hant-TW-subtitles` 重新可见且原生菜单保持关闭；重新开启后保存的英上中下
  自动恢复，原生 caption renderer 仅在双轨 ready 后隐藏。
- 全程真实 video 保持 `display:inline`、`visibility:visible`，未复发黑画面。

随后在《The Captain's Wife》（S2E4）验证只有英语 CC、没有普通英语字幕的节目：
旧兼容对齐未达到门槛时，产品保留英中两条官方轨的原始时序，仍达到
`官方美国英语 + 官方中文（繁体，台湾） · 100%`。从 S2E4 切到 S2E5《退休》后，
旧 overlay 文本立即清空，页面未刷新、DOM 中始终只有一个 video；新集随后自动恢复
`en-US` 上方 + `zh-Hant-TW` 下方，例如 `- Okay, um, U.S. Senator. /
He killed someone.` 与 `好‥`。新 video 为 `readyState=4`、
`display:inline`、`visibility:visible`，原生 caption renderer 仅在双轨 ready 后
隐藏。

此外，最终逻辑的前一构建已在同一《Pilot》中用 `id` 上方 + `th` 下方验证任意
非英中官方语言对达到 100%，强制重载后同对恢复；本次 Max 选择与换集改动不触及该
原始时序路径。

最终同构建回归于 2026-07-31 使用与 unpacked 加载目录逐文件一致的 runtime candidate
`fa0989e`。S1E1《Pilot》达到
`官方美国英语 + 官方中文（繁体，台湾） · 100%`，实际选择为上方 `en-US`、
下方 `zh-Hant-TW`；真实 seek 后两条官方行继续更新。关闭 DuetSub 后 overlay
消失，原生 caption renderer 立即可见；重新开启后 100% 双轨恢复并再次隐藏原生层。
全程 video 保持 `readyState=4`、`display:inline`、`visibility:visible`。

Final automated release gate: **PASS**，47 个测试文件 / 220 个测试、TypeScript、
standalone/store Chrome MV3 archives、least-privilege manifest verification、
artifact privacy scan 与 `git diff --check` 全部通过。

Ads：**NOT RUN** on the final candidate。**WAIVED：无。**
