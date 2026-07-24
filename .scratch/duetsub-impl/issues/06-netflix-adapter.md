# 06 — Netflix adapter

**What to build:** 在 `netflix.com/watch` 上，端到端显示官方双轨（或单轨+机翻），复用**共用 TTML parser（来自 ticket 02）**与生命周期 helper。

**Blocked by:** 03 — Prime Video 生命周期健壮性。（另：复用 ticket 02 的共用 TTML parser。）

**Status:** claimed

- [x] MAIN 在 `document_start` 装两个薄 hook：`JSON.parse` manifest 快路径（含 `timedtexttracks` + movie/viewable id 的对象原样转发）与 fetch/XHR OCA 观测（`text/xml` 预筛后原样转发）。
- [x] ISOLATED 以 XML magic + TTML 根元素校验 OCA 字幕（不拿 `?o=` 当过滤器）；响应归属给 pending `fetchTrack` handle 或无歧义的 `TrackInfo`。
- [x] adapter 枚举官方轨（过滤 None/forced-only/未 hydrated/无 text downloadable）；manifest 缺失时程序化打开字幕菜单并恢复原选项。
- [x] 复用共用 TTML parser 且支持 tick（不硬编码 `÷10^7`）；image-only 目标轨按 unavailable 处理（不 OCR），交给另一官方轨/机翻。
- [x] 同步 `#appMountPoint video`；开启时隐藏 `.player-timedtext`、否则恢复；复用 seek/广告/换集生命周期。
- [ ] 分别记录静态 MAIN 是否命中 manifest、MAIN 是否看见自动切轨 OCA TTML；按 §G Netflix stop rule 验证；gate 失败以 unsupported stub 交付（不包 Worker、不用 debugger）。

## Answer

### Automated

- 从精确 baseline `5a6b8904d4149c2a4d7a932cfe1e7799afe83f6a` 创建 sibling worktree；Ticket 01–03、共享 TTML parser、lifecycle/generation seam 均存在，baseline 的 `npm test`（8 files / 26 tests）、`npm run check`、`npm run build` 先通过后才 claim 本票。
- 按 TDD red → green 增加 Netflix parser/manifest/response ownership/URL activation seam。最终 `npm test`：11 files / 38 tests passed；`npm run check`、`npm run build`、`git diff --check` 通过。
- Netflix IMSC fixture 以根元素 `ttp:tickRate="10000000"` 驱动 `t` 单位换算，覆盖 `227080000t → 22708ms`、实体、`span`、`br` 换行和毫秒边界；没有固定 `÷10^7`。
- manifest 纯解析过滤 None、forced-only、未 hydrated、无 text downloadable 与 image-only；单条可用官方文本轨仍会作为 `TrackInfo` 暴露，未接 Ticket 04 MT。
- response seam 只接受当前 generation 的 pending owner，或唯一当前 `TrackInfo`；非 TTML 根、语言不符、歧义 owner 与旧 generation 均不能产出可消费 cue。pending 与 `onCues` 是互斥交付路径。
- 合并验收发现从 `/browse` SPA 进入 `/watch` 时，原来的 `https://www.netflix.com/watch/*` manifest match 不会重新执行 `document_start`。已按 SPEC 修为 MAIN/ISOLATED 匹配 `https://www.netflix.com/*`，MAIN 提前安装薄 hook，ISOLATED 在运行时仍只接受精确 `/watch/<id>`；Computer Use 复测站内导航无需重载即可出现 DuetSub toggle。
- 禁止项扫描未发现 Netflix runtime 引入 Worker、debugger、DRM 绕过、OCR、Ticket 04 MT、专有提取物或 GPL runtime 代码。

### Human

- 登录态 Computer Use 已加载合并版并在《魷魚遊戲》真实播放页验证：直接加载 `/watch` 与修复后的 `/browse`→`/watch` SPA 两条路径都能注入 toggle；真实菜单可枚举繁中、英文/英文 CC、简中等文本轨。
- 程序化枚举期间字幕菜单打开，并在获取超时后恢复关闭；原先选择的繁中原生字幕继续显示。
- 静态 MAIN 是否命中可消费 manifest：**未证实**；自动切轨时 MAIN 是否看见 OCA TTML 且 ISOLATED 完成 TTML 根/owner 校验：**未证实**。
- 官方双轨 overlay 未出现，原生 `.player-timedtext` 没有被提前隐藏，表现为正确 fail closed 而非端到端 PASS。
- 正常顺播：**PARTIAL**（真实内容持续播放并保留原生字幕，但无双轨 overlay）。
- seek：**NOT RUN**。
- 换集与 video replacement：**NOT RUN**。
- 真实广告进入/退出：**NOT RUN**。

### Waived / not-run decision

- 用户未批准任何 waiver；manifest/OCA owner、双轨 overlay、seek、换集与广告等必需 gate 未完成，因此本票保持 `claimed`，不更新 map、不宣称端到端 PASS。

### Modified files

- `.scratch/duetsub-impl/issues/06-netflix-adapter.md`
- `entrypoints/netflix-main.content.ts`
- `entrypoints/netflix.content.ts`
- `src/adapters/netflix-location.ts`
- `src/adapters/netflix-manifest.ts`
- `src/adapters/netflix-responses.ts`
- `src/adapters/netflix.ts`
- `src/content/controller.ts`
- `src/content/site-ui.ts`
- `src/core/messages.ts`
- `src/core/ttml.ts`
- `src/main/netflix-hook.ts`
- `tests/fixtures/netflix-minimal.ttml`
- `tests/messages.test.ts`
- `tests/netflix-location.test.ts`
- `tests/netflix-manifest.test.ts`
- `tests/netflix-responses.test.ts`
- `tests/ttml.test.ts`
