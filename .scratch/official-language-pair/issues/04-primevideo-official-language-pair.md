# 04 — Prime Video 任意官方语言对

**What to build:** 在 Prime Video 当前节目中，把机器可验证的全部官方字幕语言接入动态目录。用户可以选择非默认官方语言对，扩展可靠取得两轨、处理选择切换期间的陈旧响应，并恢复 Prime 原字幕和菜单状态。

**Blocked by:** 03 — 交付动态官方语言选择器。

**Status:** verified

- [x] Prime 目录从机器可验证的语言元数据生成通用 BCP-47 官方选项，不维护本地化语言名称猜测字典。
- [x] 缺少可验证语言码的 radio fail closed，不以 label 猜测未知语言。
- [x] 同语言普通字幕与 CC/SDH 作为结构化变体解析；未经站点证据批准时沿用通用变体优先级。
- [x] acquisition 不再搜索固定 English CC 与 Traditional Chinese pair，而是严格取得当前 top/bottom 两轨。
- [x] 语言选择改变时，上一批 TTML、timeline offset、错误与状态全部因 selection generation 失效。
- [x] 任意失败都恢复进入 acquisition 前的原字幕选项及菜单开合状态。
- [x] 自动证据覆盖通用语言枚举、pair ownership、串行 acquisition、陈旧响应和恢复失败。
- [x] 登录态真人 gate 选择该节目实际存在的非默认官方语言对；优先验证 `ja + zh-Hans`。
- [x] 同一 media time 逐句确认两行分别来自对应官方轨，并验证关闭、seek、换集和 video replacement 后的状态恢复。

## Verification

- Automated: PASS. Prime public-seam TDD covers machine BCP-47 metadata, structured subtitle/CC/SDH/forced variants, exact serial top/bottom acquisition, selection-generation ownership, restore failure precedence, cached-track replay, Prime `jp` / `cmn-Hans` aliases, browser-null TTML attributes, and manual official-track reload invalidation. On 2026-07-30 the full release gate passed with 47 test files / 203 tests.
- Logged-in human gate: **PASS** on Prime Video `校外`, season 1 episode 1, using `ja-JP + zh-Hans`. The first automatic attempt timed out; the user-requested `重新載入官方字幕` action recovered without a page refresh and reached `官方日语（日本） + 官方简体中文 · 100%`.
- Same-media-time evidence at `32.8s`: top `“グレアム 44”` (`ja-JP`), bottom `（44号 格雷厄姆）` (`zh-Hans`). After a seek round trip (`32.8s → 45s → 32.8s`) the same two official lines returned.
- Close/restore evidence: disabling DuetSub kept `zh-hans_Subtitle_Dialog` selected, kept the Prime subtitle menu closed, restored the native simplified-Chinese line, and hid the DuetSub overlay. Re-enabling restored the verified pair.
- Episode/video-replacement evidence: switching from episode 1 `君子协定` to episode 2 `训练` cleared both old overlay lines. Episode 2 did not expose the selected complete pair, so DuetSub failed closed with the native `zh-hans_Subtitle_Dialog` visible and the Prime menu still closed; no episode-1 cue leaked.
