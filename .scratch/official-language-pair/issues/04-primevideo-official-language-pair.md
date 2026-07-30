# 04 — Prime Video 任意官方语言对

**What to build:** 在 Prime Video 当前节目中，把机器可验证的全部官方字幕语言接入动态目录。用户可以选择非默认官方语言对，扩展可靠取得两轨、处理选择切换期间的陈旧响应，并恢复 Prime 原字幕和菜单状态。

**Blocked by:** 03 — 交付动态官方语言选择器。

**Status:** claimed

- [x] Prime 目录从机器可验证的语言元数据生成通用 BCP-47 官方选项，不维护本地化语言名称猜测字典。
- [x] 缺少可验证语言码的 radio fail closed，不以 label 猜测未知语言。
- [x] 同语言普通字幕与 CC/SDH 作为结构化变体解析；未经站点证据批准时沿用通用变体优先级。
- [x] acquisition 不再搜索固定 English CC 与 Traditional Chinese pair，而是严格取得当前 top/bottom 两轨。
- [x] 语言选择改变时，上一批 TTML、timeline offset、错误与状态全部因 selection generation 失效。
- [x] 任意失败都恢复进入 acquisition 前的原字幕选项及菜单开合状态。
- [x] 自动证据覆盖通用语言枚举、pair ownership、串行 acquisition、陈旧响应和恢复失败。
- [ ] 登录态真人 gate 选择该节目实际存在的非默认官方语言对；优先验证 `ja + zh-Hans`。
- [ ] 同一 media time 逐句确认两行分别来自对应官方轨，并验证关闭、seek、换集和 video replacement 后的状态恢复。

## Verification

- Automated: PASS. Prime public-seam TDD covers machine BCP-47 metadata, structured subtitle/CC/SDH/forced variants, exact serial top/bottom acquisition, selection-generation ownership, restore failure precedence, and the narrow English-CC + Traditional-Chinese-subtitles compatibility alignment policy. Full repository gates are recorded with the commit handoff.
- Logged-in human gate: **NOT RUN / blocked**. On 2026-07-30 the signed-in Chrome profile could play Prime Video `校外` season 1 episode 1 and exposed machine subtitle ids including `ja-jp_Subtitle_Dialog`, `zh-hans_Subtitle_Dialog`, `zh-hant_Subtitle_Dialog`, and `en-us_Caption_Dialog`. Chrome automation then refused `chrome://extensions` by security policy, so the exact unpacked worktree build could not be loaded. The already-installed DuetSub was an older build (fixed-pair status and no language selectors), and was not accepted as evidence for this ticket.
- Therefore the non-default-pair, same-media-time, switch/seek, episode/video-replacement, close, and native subtitle/menu restoration checks remain NOT RUN. The ticket stays `claimed`; no Answer is recorded.
