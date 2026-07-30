# 06 — Max 任意官方语言对与受控对齐

**What to build:** 在 Max 当前节目中，让动态官方语言选择驱动完整 DOM、playbackInfo、MPD 与 VTT 映射。任意非默认语言对先按两条官方轨的原生时序显示；只有经过真人证据批准的 pair alignment policy 才能重排 bottom 显示副本。

**Blocked by:** 03 — 交付动态官方语言选择器。

**Status:** claimed

- [x] Max 官方目录从当前播放器的可验证 DOM 轨生成，并与完整 playbackInfo/MPD 资源唯一映射。
- [x] top/bottom 选择取代 English-primary/Chinese-secondary 默认选择，不从单条 VTT 或 label 猜测轨道归属。
- [x] 非白名单语言对保留两条官方轨的原始 cue 区间和文本。
- [x] 现有已验证 English-primary/Traditional-Chinese 对齐作为显式兼容 policy 保留，不扩张为全语言默认。
- [x] 新 alignment policy 只能使用 cue 区间和已有硬换行；禁止固定 offset、翻译、文本改写或语义重排。
- [x] 对齐唯一覆盖率低于门槛时整对 fail closed，并恢复 Max 原生字幕。
- [x] 自动证据覆盖任意 BCP-47 映射、原生时序默认、白名单选择、覆盖率失败和 selection generation。
- [ ] 登录态真人 gate 用非英中官方语言对验证双行、seek、换集/video replacement、关闭和菜单恢复。
- [ ] 真人 gate 同时确认 video 画面持续可见，不复发 overlay 合成导致的黑画面回归。

## Automated verification

- `npm test` — PASS，40 个测试文件、163 个测试。
- `npm run check` — PASS。
- `npm run build` — PASS，Chrome MV3 production build。
- `git diff --check` — PASS。

## Logged-in human gate

**NOT RUN / blocked.** 2026-07-30 已确认 Chrome 的 Max 登录态、可播放片源和
1280×720 可见 video（`readyState = 4`）均可用；但当时生效的 DuetSub 来自主仓库
`.output/chrome-mv3`，不是本 worktree 构建。
浏览器安全策略禁止代理打开扩展管理页，因此无法停用旧副本并加载本票构建；旧构建的
可见画面不计入本票 gate。

仍须用本 worktree 的 `.output/chrome-mv3` 完成非英中官方语言对双行、seek、换集 /
video replacement、关闭、菜单恢复和画面持续可见核验。Ticket 保持 `claimed`；
未写 Answer，未标 resolved。
