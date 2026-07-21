# 双语字幕 overlay：行序、垂直节奏与安全区调研（ticket 05）

Date: 2026-07-22  
Scope: 只调研双语两行 overlay 的行序、行距/行高、可读性与安全区；不替 ticket 做最终决策，不改 prototype 或 runtime。仅采用 W3C/WAI、BBC、EBU、Netflix、Apple 的一手资料。

---

## 结论先行

针对已经由用户选定的 **English 在上、繁中在下**：

- 三档间距中，当前原型首选 **紧（`0.10em`）**。
- `0.10em` **不是任何规范明文规定的双语行间距**。BBC 当前指南要求字幕显式采用约 `120%` line-height，而当前原型的两行已经继承 `line-height: 1.28`，第二行还会额外叠加 margin。因此三档中最小的 `0.10em` 最接近紧凑字幕节奏；同字号简化计算时，总 baseline rhythm 已约为 `1.38em`，并不等于“只有 0.10em 行高”。
- 该推导只用于在 `0.10em / 0.24em / 0.48em` 三个候选中选一个原型起点。最终仍需按实际英文/繁中字体、不同字号与窗口宽度检查 layout box；不能把额外 `gap` 本身宣称为 BBC 合规值。
- 没有找到任何一手标准规定双语 overlay 必须“原文在上”或“译文在下”。英文在上、繁中在下应记录为本项目的用户决策，而非行业规范。

一句话判断：**当前原型选紧档 `0.10em`，但把它写成基于“已有 1.28 行高”的设计推断，不写成规范硬值。**

---

## 一手来源明确规定了什么

### 1. BBC：当前指南要求 120% 行高，横屏行框约占画面高 7%–8%

BBC 当前 Subtitle Guidelines v1.2.5 写明：横屏最多两行，`tts:lineHeight` 应显式设为 `120%`，横屏 authored line height 应占视频高度约 `7%–8%`；16:9 在线字幕应在垂直中央 `90%` 内，即上下各留 `5%`。默认靠下，遮住嘴、画面文字、重要动作或播放器控件时整体移上。

来源：[BBC Subtitle Guidelines v1.2.5（Number of lines / Positioning）](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Number-of-lines)

BBC 在 2026 年公开的 EBU-TT-D validator requirements 进一步给出：

- 横屏视频的计算字号目标约为 render area 高度的 `6.667%`；
- `tts:lineHeight` 验证目标为 `120%–125%`；
- 小于 `100%` 或大于 `130%` 被视为错误范围，`normal` 会被警告；
- 引用 region 的上下左右边界应在画面的 `5%–95%` 安全范围内。

来源：[BBC Subtitle Guidelines technical requirements for EBU-TT-D（2026，T.8、T.9、T.17.9）](https://github.com/bbc/ttml-validator/discussions/10)

BBC 的用户研究说明其既有字幕指南让每行约占播放器高度 `8%`。`6.667% × 1.20 = 8.000%`，与上面的当前技术要求相互吻合。该研究覆盖 40 名字幕用户和 8 类设备；实际使用数据中，92% 的交互保持或重新选择默认字号。

来源：[BBC — How big should subtitles be?](https://bbc.github.io/gaad/how_big_should_subtitles_be/index.html)

**适用含义：** BBC 给的是单个字幕文本块的**总 line-height / baseline rhythm**，不是两个独立语言行之间的 CSS `gap`。如果从 `line-height: 1` 起算，它对应约 `0.20–0.25em` 的总 leading；当前原型已经是 `1.28`，所以不能再把这段 leading 当成额外 gap 重复添加。

### 2. EBU：应显式控制 line height；不要依赖 CSS `normal`

EBU-TT-D 提醒：不同 CSS presentation processor 对同一字体的 `normal` 会产生不同 line height。EBU-TT 的 legacy mapping 也明确把行位置与行距交给字体 metrics 与 `lineHeight`；其中给出 `1c/1c` 的紧凑 Teletext 等价映射，以及 `lineHeight: 1.25c`、`fontSize: 0.8c` 的 relaxed 映射示例。

来源：

- [EBU Tech 3380 — EBU-TT-D Subtitling Distribution Format（lineHeight）](https://tech.ebu.ch/files/live/sites/tech/files/shared/tech/tech3380v1_0.pdf)
- [EBU Tech 3360 — EBU STL Mapping to EBU-TT（row spacing / lineHeight）](https://tech.ebu.ch/docs/tech/tech3360.pdf)

**适用含义：** 对网页 overlay 应显式设置行高并在实际字体上验证；EBU 的 cell-based legacy 示例不是现代双语网页字幕的直接像素/em 处方。

### 3. W3C/WAI：最多同时两种语言是现实上限；底部要留出明确余量

W3C Media Accessibility User Requirements 记录：

- pop-on captions 通常为一或两行；
- 同屏自然语言在现实上“不要超过两种”是合理上限；
- 对横排 LTR/RTL 字幕，最低一行应至少位于画面底部以上 `1/12`（约 `8.33%`）处。

来源：[W3C Media Accessibility User Requirements（CC-14 至 CC-17）](https://www.w3.org/WAI/PF/media-a11y-reqs/#cc-15)

WAI 的网页字幕说明还指出，大多数网页播放器的默认呈现是黑底白字，并且浏览器/播放器对 author-defined positioning 与 styling 的支持不完全一致。

来源：[WAI — Captions/Subtitles，Positioning and Styling Captions](https://www.w3.org/WAI/media/av/captions/#positioning-and-styling-captions)

**适用含义：** DuetSub 的两种语言已经到达 W3C 所述的现实同屏上限，应避免再加常驻第三行标签。底部静止态宜把整组字幕放在可见安全区内；`8.33%` 是比泛化的 `5%` 更保守的底部起点。

### 4. Netflix：最多两行；字幕作为一个整体在顶部或底部，并避开画面内容

Netflix General Requirements 明确：

- 最多两行；
- 字幕居中，并放在画面顶部或底部；
- 应避开画面内文字；顶部和底部都冲突时，放在更容易阅读的位置。

来源：[Netflix — Timed Text Style Guide: General Requirements，Line Treatment / Positioning](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements)

Netflix 另说明，当用户选择最大字幕字号时，两行字幕可能覆盖 lower third 的大部分，因此定位必须以最大尺寸考虑，并在撞到文字、嘴部或重要动作时整体抬升。

来源：[Netflix — Why do the positioning rules talk about the “lower third”?](https://partnerhelp.netflixstudios.com/hc/en-us/articles/38232550483347-Why-do-the-positioning-rules-talk-about-the-lower-third)

Netflix 的语言规范中还出现一种与位置有关的视觉形状规则：底部字幕偏好下行较长的“bottom-heavy pyramid”，顶部字幕偏好上行较长。这是单语折行形状规则，不是双语语言顺序规则。

来源：[Netflix — Catalan Timed Text Style Guide，Line Treatment](https://partnerhelp.netflixstudios.com/hc/en-us/articles/5519503237779-Catalan-Timed-Text-Style-Guide)

**适用含义：** 两个语言行应作为一个 cue group 一起移动，不能在播放器控件出现时只抬其中一行。规范不支持因 `position:'top'` 就自动颠倒 English/繁中顺序。

### 5. Apple：传统字幕轨为两行预留约 15% 画面高度，并支持顶/底定位

Apple QuickTime subtitle track geometry 建议：未启用自由垂直定位时，subtitle track 高度为视频高度的 `15%`，用于容纳两行字幕，并放在底部 `15%`；启用 Vertical Placement 时，字幕可位于视频顶部或底部。

来源：[Apple — Subtitle track header size and placement](https://developer.apple.com/documentation/quicktime-file-format/subtitle_track_header_size_and_placement)

**适用含义：** 这是媒体容器几何规范，不是 CSS 设计系统，但能作为 sanity check：常态两行 block 不应轻易吞掉远超约 `15%` 的画面高度。双语且字号不等时仍需用窗口/全屏样本实测。

---

## 从规范到本原型的设计推断

以下均为 **DuetSub 推断**，不是来源明文：

| 项目 | 原型建议 | 推断依据与边界 |
|---|---|---|
| 行序 | English 上、繁中下 | 用户已选定；无一手标准规定双语语言先后。上下位置切换时保持顺序稳定，比自动翻转更可预测，但仍应由 ticket 单独拍板 `top` 行为。 |
| 两行视觉间距 | **紧，`0.10em`** | BBC 当前默认节奏约 120%；当前原型自身已有 `line-height: 1.28`，gap 是在此之上的附加值。三档里 `0.10em` 最少重复累计，`0.24em` 与 `0.48em` 会进一步增加遮挡。 |
| CSS 实现 | 显式 line-height；gap 只作微调 | EBU 说明 `normal` 跨 renderer 不稳定。最终要检查“字号 + line-height + margin/gap”的总结果，不能重复累计后仍声称是 1.2–1.25。 |
| 底部安全区 | 静止态最低行至少离底部约 `8.33%`；控件出现时整组抬升 | W3C CC-15 给出 `1/12`；Netflix 要求避开 lower-third 内容/控件并为最大字号留空间。这里把规范转成 overlay inset，仍需按“行框底边还是 baseline”统一测量口径。 |
| 横向安全区 | 左右至少 `5%`，即最大内容宽度不超过 `90%` | BBC 当前 validator 的 region 安全边界为 5%–95%。 |
| 顶部安全区 | 至少保留 `5%`；`8%` 是更保守原型值 | BBC 给 region 5% minimum；没有找到与 W3C bottom `1/12` 对称的 top 强制值。 |
| `position:'top'` | 规范只支持 top/bottom 与避让，不替项目决定“整组置顶 / 分轨保留 / 强制置底” | Netflix 和 Apple 证明 top placement 合法；没有来源解决双语两行的产品策略，仍须逐题问用户。 |

### 为什么选紧 `0.10em`

规范没有规定 `0.10em`。选择它的关键是当前原型并非 `line-height: 1`：两行已经各自使用 `line-height: 1.28`，`margin-top` 只是附加间距。若用同字号作简化，`1.28 + 0.10 ≈ 1.38em` 的 baseline rhythm 已高于 BBC 的 1.20；英文行实际较小，仍需截图检查，但不会等同于“字形只隔 0.10em”。

### 为什么暂不选中 `0.24em` 或松 `0.48em`

`0.24em` 与 `0.48em` 都会叠加在现有 1.28 line-height 之上。同字号简化时，分别约为 `1.52em` 与 `1.76em` 的 baseline rhythm：中档已接近一般正文的 WCAG 适配测试量级，松档还会扩大遮挡，并让同一时刻同一句话更像两个不相干 cue。二者可保留为对照样本，不宜作为当前默认。

### `0.10em` 的实现警告

两个独立 block 的字号不同，CSS margin 的 `em` 基准也取决于接收 margin 的元素；因此上面的 `1.38em` 只是同字号解释用近似值。应把 `0.10em` 视为本轮三档比较用的视觉 token；进入实现票后，以浏览器实际 layout box 和繁中 fallback 字体截图重新校准总节奏。

---

## 不应误用的通用网页文字规则

WAI Technique C21 建议一般 text block 使用 `1.5–2` 的行距来帮助部分认知障碍用户追踪文本，但该页面同时明确：WCAG techniques 是满足标准的示例，并非强制要求。它讨论的是一般文本块，不是短时出现、需要减少画面遮挡的字幕默认样式。

来源：[WAI — Technique C21: Specifying line spacing in CSS](https://www.w3.org/WAI/WCAG22/Techniques/css/C21)

因此，本票不应拿 `1.5` 直接否定 BBC 的字幕专用 `1.20–1.25`。更合理的处理是：默认值优先字幕规范；若未来开放用户样式，应保证放大 line-height 后不裁切、不互相覆盖，也不越过 safe area。

---

## 对 ticket 05 下一步提问的影响

本调研只足以支持下一问采用以下表述，不替用户拍板：

> 行序已定为 English 上、繁中下。官方规范没有给双语 exact `em`；BBC 的默认节奏约为 120%，而当前原型已经是 1.28 行高，三档里最合理的是再加紧档 `0.10em`。这是设计推断，不是规范硬值。建议选紧档，同时在窗口/全屏和繁中 fallback 字体下复核。是否确认？

其余字号比例、描边/背景条、机翻区分和 `position:'top'` 仍需各自逐题决定；本调研不能替代这些选择。
