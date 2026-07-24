# Map: DuetSub 实现（duetsub-impl）

Created: 2026-07-22

## Destination

一个可用的 DuetSub 扩展：四站（Prime Video / HBO Max / Netflix / YouTube）按 [`docs/SPEC.md`](../../docs/SPEC.md) 实现就绪——点按钮显示官方双语字幕、缺官方轨时 DeepSeek/OpenCC 兜底、含设置页。

## Authority

- 权威规格：[`docs/SPEC.md`](../../docs/SPEC.md)（实现就绪 spec）。
- 规划树（决策来源）：`.scratch/dual-sub-spec/`。
- 红线：`research/proprietary/` 提取物与两份逆向 HTML **不得进 runtime**；从 MIT/Apache 上游 + 真机抓包写起。

## Dependency graph

```text
01 skeleton ─▶ 02 Prime happy ─┬─▶ 03 Prime robustness ─┬─▶ 05 HBO Max
                               │                        ├─▶ 06 Netflix
                               │                        └─▶ 07 YouTube
                               └─▶ 04 MT + 设置页
```

- 04（MT + 设置页）正交，只被 02 阻塞，可与 03 并行；落地后所有 adapter 经共享 core 选轨自动继承。
- 06（Netflix）复用 02 的共用 TTML parser。

## Frontier

- 已完成：**01、02、03**。当前 frontier：**04、05、06、07**；05/06/07 复用 03 的生命周期 seam，04 保持正交。
- 纪律（沿用规划树）：一次会话一张票；开工前把票 Status 改 `claimed`；完成写 `## Answer`、Status 改 `resolved`、在本 map 勾一行。用 `/implement` 走 frontier，票间清上下文。

## Decisions so far

<!-- 每张 resolved ticket 一行 -->

- **01 walking skeleton**：采用 WXT 每站一对静态 MAIN/ISOLATED entrypoint；MAIN 仅通过版本化消息协议转发假 `TrackInfo`/`Cue`，核心时钟、纯 synchronizer、overlay model/renderer、站点 toggle storage 与 UI 全在 ISOLATED；四站登录态真机 pass 保留为 HITL。
- **02 Prime official dual**：保留静态 MAIN `document_start` 薄 fetch/XHR 观测；ISOLATED 以 live accessible menu 枚举并串行 acquisition、pending DOM handle + TTML 根语言认领响应、finally 恢复用户状态；共享 TTML parser 与官方 en/zh-Hant 选择接回 ticket 01 overlay，登录态明确点击 happy path 已过双轨 gate。
- **03 Prime lifecycle robustness**：共享纯 lifecycle reducer 统一 seek/ad/native/generation 决策；Prime 仅用 live 标题+集标题 identity 驱动 content reset，并以 generation-bound track/TTML + 有界预取 inbox 处理 seek、换集和 video replacement；顺播/seek/换集/重绑真机通过，真实广告 gate 按用户批准记环境性 WAIVED、未猜 selector。

## UI 决策（2026-07-22 已拍板，已回填 spec + 票）

- **模型来源**：统一 OpenAI 兼容端点（DeepSeek 云端 + 本机 Ollama/LM Studio）→ 改动 §D/§I/Out-of-Scope、ticket 04（设置页多供应商 + localhost 权限）。
- **播放器内按钮**：开/关 + 右键 popover（状态读出 / 重新翻译跳缓存 / 打开设置）；**不做**轨道覆盖与样式项 → §H、ticket 01。
- **图标**：双字幕条方向，SVG 源见 [`icon.svg`](icon.svg)，16/48/128 在 ticket 01 scaffold 时生成。
