# 01 — 扩展 Official Pair seam

**What to build:** 在不改变现有用户行为的前提下，引入 Official Track Catalog、Language Pair Preference、官方轨变体和 top/bottom 解析 seam，使后续任意官方语言对不再依赖 English/Chinese 特例。这是一张行为保持的 prefactor 票，为后续 tracer bullet 降低改动风险。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Official Track Catalog 只包含当前内容的官方、非 forced-only 字幕，排除 ASR 与平台翻译。
- [x] 语言匹配覆盖 exact、script、region 与歧义失败规则；`zh-Hans` 不匹配 `zh-Hant`，裸 `zh` 不被默认为任一 script。
- [x] 相同 canonical tag 不能组成语言对，`zh-Hans` 与 `zh-Hant` 可以。
- [x] 同语言多个官方变体默认选择普通字幕，再选择 CC/SDH；站点证据 policy 可覆盖该顺序。
- [x] 轨道元数据结构化区分普通字幕与 CC/SDH，不再要求共享选择逻辑解析展示 label。
- [x] 默认 `en` 上、`zh-Hant` 下的解析结果与当前可用官方双轨行为一致。
- [x] 新 seam 有独立纯测试，原有运行路径、自动测试、类型检查与构建保持通过。

## Answer

- 新增 `official-pair-selection` 深模块，通过单一 `resolveOfficialPair` seam 隐藏 official catalog 过滤、BCP-47 canonical/script/region 匹配、歧义失败、变体排序和站点 policy 接点。
- 新增版本化 `LanguagePairPreference`、默认 `en` 上 / `zh-Hant` 下偏好、top/bottom discriminated-union 解析结果。
- `TrackInfo` 新增结构化 `kind` 与 forced-only 标记；四站轨道生产点、消息校验和既有 Max/Prime 兼容选择均消费结构字段，不由共享选择逻辑解析展示 label。
- 新增 12 个公开 seam 纯测试，覆盖 official/forced/ASR/platform-MT 过滤、普通字幕优先与稳定目录顺序、exact/script/region、裸 `zh` 歧义、跨 script 拒绝、相同 canonical tag 拒绝、`zh-Hans + zh-Hant` 和默认英繁解析。

Automated verification:

- `npm test` — PASS，38 个测试文件、147 个测试。
- `npm run check` — PASS。
- `npm run build` — PASS，Chrome MV3 production build。
- `git diff --check` — PASS。

Logged-in human gates 未运行；Ticket 01 是行为保持的纯 prefactor，不以自动测试替代后续站点真人 gate。
