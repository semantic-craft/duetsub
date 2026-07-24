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
- 生成 manifest 中 Netflix MAIN/ISOLATED 均只匹配 `https://www.netflix.com/watch/*`、`run_at: document_start`；运行时再次校验精确 `/watch/<id>`。MAIN 不按 host、扩展名或 `?o=` 过滤响应，不保存业务状态或 URL。
- 禁止项扫描未发现 Netflix runtime 引入 Worker、debugger、DRM 绕过、OCR、Ticket 04 MT、专有提取物或 GPL runtime 代码。

### Human

- 静态 MAIN 是否命中 manifest：**NOT RUN**。
- 自动切轨时 MAIN 是否看见 OCA TTML，且 ISOLATED 完成 TTML 根/owner 校验：**NOT RUN**。
- 原字幕选项与菜单开闭状态是否恢复：**NOT RUN**。
- 官方双轨 overlay 与原生 `.player-timedtext` 双轨 ready 后隐藏/关闭或失败后恢复：**NOT RUN**。
- 正常顺播：**NOT RUN**。
- seek：**NOT RUN**。
- 换集与 video replacement：**NOT RUN**。
- 真实广告进入/退出：**NOT RUN**。
- 原因：现有 `chrome://extensions/` 页面属于受保护的 Chrome 内部页，当前验收控制面不能接管；因此本 worktree 的 `.output/chrome-mv3` 未被加载。没有改用 debugger、CDP、Worker 或其他绕过手段。仅见 manifest 或响应也不会被计作端到端通过。

### Waived / not-run decision

- 用户未批准任何 waiver；上述真人 gate 全部保持 **NOT RUN**。必需 gate 未完成，因此本票保持 `claimed`，不更新 map、不宣称端到端 PASS。

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
