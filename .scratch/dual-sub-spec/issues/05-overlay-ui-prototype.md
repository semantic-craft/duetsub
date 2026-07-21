# 05 双字幕 overlay UI 原型

Type: prototype
Status: resolved
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
- [双语字幕 overlay 行序、垂直节奏与安全区调研](../../../research/findings/overlay-ui-aesthetics.md) — BBC / EBU / W3C / Netflix / Apple 一手规范与项目推断边界。

## Answer

2026-07-22 以 Variant B 假 cue 原型逐题确认，overlay 固定采用以下规格；不做用户设置界面。

### 1. 行序与间距

- 英文在上，繁体中文在下；置顶时也不反转。
- 两行各自 `line-height: 1.28`，第二行额外间距 `0.10em`。该值是结合现有行高后的视觉 token，不宣称为字幕标准硬值。

### 2. 字号与繁体字形

- 中文为主阅读行，字号 `100%`；英文为辅助行，字号为中文的 `82%`。
- 基础字号按播放器容器高度计算：`clamp(0.86rem, 6.2cqh, 2.5rem)`，而非按浏览器 viewport 计算。窗口原型实测中文约 `28px` / 英文约 `23px`，全屏约 `36px` / `30px`。
- 中文行标 `lang="zh-Hant"`，字体栈固定为 `"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`；英文用系统 sans-serif。

### 3. 背景与文字处理

- 采用 Variant B：双语两行共用一块随内容宽度收缩的紧凑背景板，不用逐行独立板，也不用整宽背景带。
- 背景为约 `70%` 黑色，轻微阴影与 `2px` backdrop blur，`1px` 低对比边框，圆角 `0.28em`；内边距约 `0.34em 0.68em 0.42em`。
- 正常字幕文字保持白色正体，不加粗描边。共享背景负责跨明暗画面的稳定对比，并保留繁体字笔画内部空间。

### 4. 常态位置、控件避让与原生字幕

- 常态整组底部居中，背景板底边距播放器底边 `8.5%`。
- 平台播放器控件出现时，双语组整体上抬到 `18%`；不拆行，也不暂时隐藏 DuetSub 字幕。
- DuetSub overlay 工作时隐藏平台原生字幕层，停用、reset 或卸载时恢复，避免重复字幕或第三行。
- 窗口与全屏共用上述百分比；字体随播放器容器高度缩放。

### 5. 机翻行标识

- 只有 DeepSeek 生成的那一行在行首显示小型内联 `MT` 标签；官方轨不显示。
- 机翻正文保持与对应官方行相同的颜色、字重与正体，不用淡色作为唯一线索，也不用斜体，避免与旁白 / 画外音等字幕语义冲突。

### 6. `position: 'top'`

- 当前配对 cue 中只要任一条为 `position: 'top'`，顶部意图优先：整个双语背景板移到播放器顶部 `8%` 安全区。
- 组内仍是英文上、繁中下；不把两轨拆到画面上下两端，也不忽略 `top`。
- 下一组 cue 若均为 `bottom` 或缺省 position，整组回到底部规则。

### 原型验证

Chromium 自动检查覆盖 A/B/C、亮场/暗场、窗口/全屏、控件显隐、平台原生字幕显隐、中文/英文机翻、三种 `top` 情境。最终 Variant B 在窗口与全屏均无横向溢出；整组置顶时三种情境均保持单一 group、原行序和 `8%` 顶部 inset。

## Comments

- 2026-07-21（来自 ticket 04）：cue 模型已定为四字段 + 可选 `position?: 'top' | 'bottom'`（缺省 bottom）。本 ticket 需补一问：`position: 'top'` 时双语两行如何摆放（整组搬到顶部？还是仅跟随原生意图的那一轨？）。另：overlay 已定为 vanilla DOM 实现，原型不必用框架。
