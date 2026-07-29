# 08 汇总撰写 docs/SPEC.md

Type: task
Status: resolved
Blocked by: 04, 05, 06, 07

## Question

终点 ticket（AFK）：把 map 全部已锁定决策与各 ticket 结论汇总成实现就绪的 `docs/SPEC.md`——架构、四站 adapter 方案、轨道选择与机翻兜底规则、overlay UI 规格、验证方案（用 ticket 03 的测试素材）、实现顺序建议。写完后本 map 到达 destination。

## Answer

2026-07-22 完成，产出 [`docs/SPEC.md`](../../../docs/SPEC.md)。

- 汇总 ticket 04/05/07 已锁定决策；就地拍板 ticket 06 兜底细则（来源优先链、双向机翻、OpenCC 转繁、warmup + 滚动补翻、IndexedDB 内容寻址缓存、fail-soft 降级）。其中「OpenCC 转繁」与「双向机翻」两项在 SPEC §C 标注为可否决。
- 本次会话新增两块范围并入 spec：播放器控制栏 **toggle button**（单一用途、默认关、按站记忆、`ad-suspended` 内部对用户透明）与 **options page**（**仅云端** DeepSeek 自备 key，manifest 不申请 localhost 权限）。
- 测试 seam 定为 parser(纯函数 + ticket 03 真机 fixture) + core(纯逻辑 + 边界 mock) + SW 翻译/配置(mock HTTP 边界)；adapter DOM 走 ticket 07 真机验收 gate，不单测。
- 实现顺序沿用 ticket 07：Prime Video → HBO Max → Netflix → YouTube。

map 到达 destination；实现为下一张 map 或直接 /implement。

## Comments
