# 05 双字幕 overlay UI 原型

Type: prototype
Status: claimed
Blocked by: —

## Question

用假 cue 数据做一个 overlay 原型（/prototype），让用户对着真东西拍板：

1. 行序：中文在上还是英文在上；两行间距。
2. 样式：字号比例（中文行 vs 英文行）、描边/阴影/背景条、繁体字形渲染效果。
3. 位置：贴底居中？被平台原生控件遮挡时怎么办；是否隐藏原生字幕层。
4. 单轨+机翻兜底时，机翻行要不要视觉上区分（如淡色/斜体标记）。
5. 全屏与窗口模式下的表现。

产出：原型链接为 ticket 资产；拍板结论写进 Answer。

## Assets

- [打开 DuetSub overlay UI prototype（Variant B）](../prototypes/overlay-ui-prototype/index.html?variant=B) — THROWAWAY 静态原型；三种结构用 `?variant=A|B|C` 切换，假 cue 与全部观察条件见页面。
- [原型运行说明](../prototypes/overlay-ui-prototype/README.md) — 仓库根目录一条命令启动。

## Comments

- 2026-07-21（来自 ticket 04）：cue 模型已定为四字段 + 可选 `position?: 'top' | 'bottom'`（缺省 bottom）。本 ticket 需补一问：`position: 'top'` 时双语两行如何摆放（整组搬到顶部？还是仅跟随原生意图的那一轨？）。另：overlay 已定为 vanilla DOM 实现，原型不必用框架。
