# 02 — 贯通固定非默认官方语言对 tracer

**What to build:** 用本地 smoke 播放器和官方假轨贯通一条完整运行路径：日语官方轨在上、简体中文官方轨在下，经 top/bottom controller、selection generation、synchronizer 和国际化 overlay 显示。该路径证明运行时可以脱离 English/Traditional-Chinese 特例，但暂不提供用户选择器。

**Blocked by:** 01 — 扩展 Official Pair seam。

**Status:** resolved

- [x] smoke 场景提供可验证的官方 `ja` 与 `zh-Hans` 轨，并按真实 video clock 同步显示。
- [x] top 行使用动态 `lang="ja"` 与主字号，bottom 行使用动态 `lang="zh-Hans"` 与辅字号。
- [x] overlay 根据语言设置文字方向和 CJK 字体后备，不再依赖 English/Chinese 固定 class。
- [x] selection generation 参与异步结果归属；偏好改变后，旧字幕、旧错误与旧状态不得覆盖新 pair。
- [x] 任一官方侧缺失、歧义或为空时双语 fail closed，overlay 清空且原生字幕保持可见。
- [x] 该官方路径不会发送 MT、OpenCC、ASR 或平台翻译请求。
- [x] 自动测试覆盖 `ja + zh-Hans`、`de + fr`、RTL + LTR、script/region 与 stale response。
- [x] 自动测试、类型检查和构建通过，现有四站默认路径没有新增回归。

## Answer

- 共享 controller、synchronizer 与 overlay model 已从 English/Chinese 角色改为 top/bottom 位置角色；现有四站仍以默认 `en` 上 / `zh-Hant` 下运行，既有选轨、MT、OpenCC、ASR 与 platform-MT 路径未删除或改写。
- 本地 fake smoke 现在只提供官方 `ja` 与 `zh-Hans` 轨和 cue；两侧均由真实 video clock 调度，固定 tracer 通过 Official Pair seam 校验轨道与非空 cue 后才进入 `tracks-ready`。
- `PlaybackGeneration` 增加 `selectionGeneration`；共享接受逻辑、四站 adapter/response ownership 与 YouTube request context 均比较该 generation。选择变化会立即清除 ready 状态、恢复原生字幕，并让旧 cue、错误和状态失效。
- overlay 行使用动态 `lang` / `dir`、`unicode-bidi: plaintext`、top 100% / bottom 90% 和 ja / zh-Hans / zh-Hant / ko 字体后备；无效语言方向 fail closed 为 `auto`。
- 任一所选官方轨缺失、歧义或 cue 为空时不显示双语 overlay，原生字幕保持可见；固定 tracer 消息只标记为 `official`，不发送 MT、OpenCC、ASR 或平台翻译请求。

Automated verification:

- `npm test` — PASS，39 个测试文件、153 个测试。
- `npm run check` — PASS。
- `npm run build` — PASS，Chrome MV3 production build。
- `git diff --check` — PASS。

Logged-in human gates 未运行；本票没有执行四站非默认官方语言对真机验证，也没有实现动态选择器、偏好持久化、Options UI 或任何站点通用化。下一 frontier 是 Ticket 03。
