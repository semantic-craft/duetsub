# 05 — Netflix 任意官方语言对

**What to build:** 在 Netflix 当前节目中，用 manifest 或可验证菜单元数据生成通用官方语言目录。用户选择非默认官方语言对后，两轨在顺播、seek、同页换集和 video replacement 中保持 generation-safe，并在关闭时恢复原生字幕。

**Blocked by:** 03 — 交付动态官方语言选择器。

**Status:** claimed

- [x] Netflix manifest 中所有可下载、非 forced-only 的官方文字轨按 canonical BCP-47 进入目录。
- [x] menu fallback 可解析通用机器语言码，但不从本地化 label 猜测未知语言。
- [x] manifest 与 menu 对同一语言的普通字幕、CC/SDH 变体有稳定且无歧义的匹配。
- [x] acquisition 严格取得当前 top/bottom 两轨，不调用 MT、OpenCC、ASR 或平台翻译路径。
- [x] 语言改变、seek、换集和 video replacement 后，旧 TTML 与旧菜单 handle 不可进入当前 pair。
- [x] catalog-only enumeration 与正式 acquisition 均恢复原字幕选项和菜单开合状态。
- [x] 自动证据分别覆盖 manifest 路径、menu fallback、响应 ownership、歧义与恢复失败。
- [ ] 登录态真人 gate 使用非默认官方语言对验证双行、切换、seek、换集、关闭与原字幕恢复。
- [x] 任一所选语言缺失时明确提示该语言不可用，并保持 Netflix 原生字幕可见。

## Verification (claimed)

Automated:

- `npm test` — PASS，41 个测试文件、166 个测试。
- `npm run check` — PASS。
- `npm run build` — PASS，Chrome MV3 production build。
- `git diff --check` — PASS。
- Netflix 定向证据覆盖任意 canonical BCP-47 manifest 目录与 forced-only 过滤、menu 机器码且不猜本地化 label、普通字幕与 CC/SDH 唯一匹配、`ja + zh-Hans` top/bottom acquisition、selection/seek/video-replacement stale ownership、catalog/acquisition 恢复，以及恢复失败 fail closed。

Logged-in human gate: **NOT RUN / blocked**。

- Chrome 有 Netflix 登录态，但停在 5 个 profile 的选择页；本票没有获授权代选会影响播放记录的 profile。
- 当前受控 Chrome 也未能确认已加载本 worktree 的 production build。
- 因此非默认官方语言对双行、manifest 路径、menu fallback、同一 media time 逐句、切换、seek、换集、video replacement、关闭与原字幕恢复均为 **NOT RUN**，不得视为 passed。
