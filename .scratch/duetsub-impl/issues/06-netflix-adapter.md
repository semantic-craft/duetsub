# 06 — Netflix adapter

**What to build:** 在 `netflix.com/watch` 上，端到端显示官方双轨（或单轨+机翻），复用**共用 TTML parser（来自 ticket 02）**与生命周期 helper。

**Blocked by:** 03 — Prime Video 生命周期健壮性。（另：复用 ticket 02 的共用 TTML parser。）

**Status:** ready-for-agent

- [ ] MAIN 在 `document_start` 装两个薄 hook：`JSON.parse` manifest 快路径（含 `timedtexttracks` + movie/viewable id 的对象原样转发）与 fetch/XHR OCA 观测（`text/xml` 预筛后原样转发）。
- [ ] ISOLATED 以 XML magic + TTML 根元素校验 OCA 字幕（不拿 `?o=` 当过滤器）；响应归属给 pending `fetchTrack` handle 或无歧义的 `TrackInfo`。
- [ ] adapter 枚举官方轨（过滤 None/forced-only/未 hydrated/无 text downloadable）；manifest 缺失时程序化打开字幕菜单并恢复原选项。
- [ ] 复用共用 TTML parser 且支持 tick（不硬编码 `÷10^7`）；image-only 目标轨按 unavailable 处理（不 OCR），交给另一官方轨/机翻。
- [ ] 同步 `#appMountPoint video`；开启时隐藏 `.player-timedtext`、否则恢复；复用 seek/广告/换集生命周期。
- [ ] 分别记录静态 MAIN 是否命中 manifest、MAIN 是否看见自动切轨 OCA TTML；按 §G Netflix stop rule 验证；gate 失败以 unsupported stub 交付（不包 Worker、不用 debugger）。
