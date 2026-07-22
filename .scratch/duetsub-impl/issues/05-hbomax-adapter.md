# 05 — HBO Max adapter

**What to build:** 在 `play.hbomax.com` 上，DuetSub 端到端显示官方双轨（或单轨+机翻），复用共享 core 与生命周期 helper。新增 Max 拦截、adapter、WebVTT parser。

**Blocked by:** 03 — Prime Video 生命周期健壮性（共享生命周期 helper）。

**Status:** ready-for-agent

- [ ] MAIN 在 Max 媒体域转发 `.vtt` 与 subtitle playlist/API 候选原文；ISOLATED 判格式。
- [ ] adapter 以 DOM track id/label（如 `en-US-subtitles`、`zh-Hant-TW-subtitles`）为权威枚举源，归一化 BCP-47、标 `official`；程序化开/关字幕菜单并恢复原开合状态。
- [ ] 第二轨由**完整 subtitle playlist/API 映射**（DOM id → 完整 VTT 或 segment playlist）驱动，绝不从单条 VTT URL 猜另一轨；MAIN 看不到映射即 fail closed。
- [ ] WebVTT parser 产出 `Cue[]`：毫秒正确、`<br>`/标签处理、实体解码、REGION/line 定位；非零 `X-TIMESTAMP-MAP` 须由 playlist/presentation 锚点换算（无锚点 fail closed）；对 ticket 03 的 VTT fixture 单测。
- [ ] 同步 `[data-testid="VideoElement"]`；开启时隐藏 `[data-testid="caption_renderer_overlay"]`、否则恢复；复用 ticket 03 的 seek/广告/换集生命周期。
- [ ] 按 §G Max stop rule 在真机双轨片子（+ seek + 真实广告）验证；gate 不满足则以 unsupported stub 交付。
