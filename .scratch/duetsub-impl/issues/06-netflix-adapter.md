# 06 — Netflix adapter

**What to build:** 在 `netflix.com/watch` 上，端到端显示官方双轨（或单轨+机翻），复用**共用 TTML parser（来自 ticket 02）**与生命周期 helper。

**Blocked by:** 03 — Prime Video 生命周期健壮性。（另：复用 ticket 02 的共用 TTML parser。）

**Status:** resolved

- [x] MAIN 在 `document_start` 装两个薄 hook：`JSON.parse` manifest 快路径（含 `timedtexttracks` + movie/viewable id 的对象原样转发）与 fetch/XHR OCA 观测（`text/xml` 预筛后原样转发）。
- [x] ISOLATED 以 XML magic + TTML 根元素校验 OCA 字幕（不拿 `?o=` 当过滤器）；响应归属给 pending `fetchTrack` handle 或无歧义的 `TrackInfo`。
- [x] adapter 枚举官方轨（过滤 None/forced-only/未 hydrated/无 text downloadable）；manifest 缺失时程序化打开字幕菜单并恢复原选项。
- [x] 复用共用 TTML parser 且支持 tick（不硬编码 `÷10^7`）；image-only 目标轨按 unavailable 处理（不 OCR），交给另一官方轨/机翻。
- [x] 同步 `#appMountPoint video`；开启时隐藏 `.player-timedtext`、否则恢复；复用 seek/广告/换集生命周期。
- [x] 分别记录静态 MAIN 是否命中 manifest、MAIN 是否看见自动切轨 OCA TTML；按 §G Netflix stop rule 验证；gate 失败以 unsupported stub 交付（不包 Worker、不用 debugger）。

## Answer

### Automated

- 从精确 baseline `5a6b8904d4149c2a4d7a932cfe1e7799afe83f6a` 创建 sibling worktree；Ticket 01–03、共享 TTML parser、lifecycle/generation seam 均存在，baseline 的 `npm test`、`npm run check`、`npm run build` 先通过后才 claim 本票。
- 按 TDD red → green 增加 Netflix parser/manifest/response ownership/URL activation seam，并为真人换集暴露的两个回归补测试：同内容 video/clock replacement 复用已枚举轨；请求发起时绑定内容 ID，使新集早到 TTML 可晋升到随后建立的 generation，旧内容 ID 响应仍 fail closed。
- 最终全量 `npm test`：28 files / 92 tests passed；`npm run check`、`npm run build`、`git diff --check` 通过；源码与测试中无 `[DEBUG-...]` 残留。
- Netflix IMSC fixture 以根元素 `ttp:tickRate="10000000"` 驱动 `t` 单位换算，覆盖 `227080000t → 22708ms`、实体、`span`、`br` 换行和毫秒边界；没有固定 `÷10^7`。
- manifest 纯解析过滤 None、forced-only、未 hydrated、无 text downloadable 与 image-only；单条可用官方文本轨仍会作为 `TrackInfo` 暴露，未接 Ticket 04 MT。
- response seam 只接受当前内容 ID 下的 pending owner，或唯一当前 `TrackInfo`；非 TTML 根、语言不符、歧义 owner 与旧内容 ID 均不能产出可消费 cue。pending 与 `onCues` 是互斥交付路径。
- 合并验收发现从 `/browse` SPA 进入 `/watch` 时，原来的 `https://www.netflix.com/watch/*` manifest match 不会重新执行 `document_start`。已按 SPEC 修为 MAIN/ISOLATED 匹配 `https://www.netflix.com/*`，MAIN 提前安装薄 hook，ISOLATED 在运行时仍只接受精确 `/watch/<id>`；Computer Use 复测站内导航无需重载即可出现 DuetSub toggle。
- 禁止项扫描未发现 Netflix runtime 引入 Worker、debugger、DRM 绕过、OCR、Ticket 04 MT、专有提取物或 GPL runtime 代码。

### Human

- 登录态 Computer Use 在《魷魚遊戲》真实播放页验证直接 `/watch` 装载：第 7 集出现英文 `How long are you gonna string us along like this?` 与繁中 `你要這樣耍我們到什麼時候？` 双轨 overlay。
- 静态 MAIN manifest 快路径：**NOT OBSERVED**；菜单枚举 fallback 成功。MAIN 明确记录多个 XML timed-text candidate，ISOLATED 完成 TTML 根、语言与 owner 校验并产出双轨；不是以“看见响应”代替端到端通过。
- 原生状态：先明确选择 `中文（繁體）`；双轨 ready 后 `.player-timedtext` 隐藏。关闭 DuetSub 后菜单重新显示勾选 `中文（繁體）`，菜单可关闭，原状态恢复。
- 同页换集 / video replacement：第 7 集 `/watch/81262757` 原生“下一集”切到第 8 集 `/watch/81262760`，无需刷新；随后出现英文 `Where the hell are you? / Can you hear me all right, sir?` 与繁中 `組長，你聽得到我的聲音嗎？ / 你這混小子人在哪裡？` 双轨 overlay。
- seek：将第 8 集真实进度精确定位到 `391/1993` 秒后继续播放，随后出现英文 `A whole team? / I need backup.` 与繁中 `你說什麼？支援？`；双轨与 native hide 均恢复。
- 正常顺播：第 7、8 集连续真实对白持续显示双轨；英文 CC 独有的声音提示在繁中无对应 cue 时只显示英文，符合官方轨时轴而非伪造翻译。

### Waived / not-run decision

- 真实广告进入/退出：用户明确指示“广告不用管”，因此只对该 gate 记 **WAIVED（user-approved）**。
- 除广告外，登录态双轨、菜单枚举与恢复、OCA/owner、顺播、seek、换集/video replacement 均有真人证据；本票改为 `resolved`。

### Modified files

- `.scratch/duetsub-impl/issues/06-netflix-adapter.md`
- `entrypoints/netflix-main.content.ts`
- `entrypoints/netflix.content.ts`
- `src/adapters/netflix-location.ts`
- `src/adapters/netflix-manifest.ts`
- `src/adapters/netflix-responses.ts`
- `src/adapters/netflix.ts`
- `src/content/controller.ts`
- `src/content/native-captions.ts`
- `src/content/site-ui.ts`
- `src/core/messages.ts`
- `src/core/ttml.ts`
- `src/main/netflix-hook.ts`
- `tests/fixtures/netflix-minimal.ttml`
- `tests/messages.test.ts`
- `tests/native-captions.test.ts`
- `tests/netflix-adapter.test.ts`
- `tests/netflix-location.test.ts`
- `tests/netflix-manifest.test.ts`
- `tests/netflix-responses.test.ts`
- `tests/ttml.test.ts`
