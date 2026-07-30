# 英中双语与纪录片字幕设计规范调研

Date: 2026-07-30
Scope: 英文在上、中文在下的桌面视频双语 overlay；只研究设计规范与产品取值，不修改 DuetSub runtime。
Source policy: 优先 BBC、Netflix、W3C/WAI、EBU 等一手来源。本文把交付规范、技术规范、成熟经验与 DuetSub 产品建议分开，不把某一平台的供应商规则写成普遍法律要求。

---

## 结论先行

1. **没有找到 BBC、Netflix、W3C、EBU 对“英中双语字号比例”的官方规定。**
   BBC 的字号与行高规则针对一个字幕流；Netflix 的英文和中文规则分别规定“能容纳多少字符”，都没有规定两个语言同时显示时谁大谁小。因此，下面的英中比例只能是 **DuetSub 产品建议**。

2. 用户希望“英文大一点、中文稍微小一点”，建议首轮采用：

   - English：`100%`
   - 中文：**`90%` 起测，允许在 `88%–92%` 内按字体回退校准**
   - 验收不看 CSS 百分比本身，而看截图中的实际 ink box：**英文大写/主体字形高度应比中文字形高约 `5%–10%`**

   当前截图对应的旧层级是 English `82%`、中文 `100%`，所以中文明显更大。改为 `100% / 90%` 后，两种语言的相对字号关系会发生约 `35.5%` 的反转式调整，适合作为“英文略大”的第一轮产品起点。拉丁字母通常只占 em box 的一部分，而汉字接近填满字框；W3C IMSC 也提醒，不同字体 metrics 会改变文字尺寸、换行与行高。因此仍须按实际字形验收，不能只看百分比。
   来源：[W3C IMSC 1.2 — Reference fonts and font metrics](https://www.w3.org/TR/ttml-imsc1.2/#text-profile-reference-fonts)（访问：2026-07-30）。

3. 建议把双语字幕当作**一个整体 cue group**：

   - English 固定在上，中文固定在下；
   - 两行一起上移、下移或隐藏，不在画面顶部时颠倒语言顺序；
   - prepared subtitles 默认整体水平居中；
   - 常态目标为每种语言一行、合计两行；源字幕确有双说话人或硬换行时，宁可临时出现 3–4 个视觉行，也不要截断或丢字。

4. 16:9 桌面默认布局建议：

   - English font size：约视频有效高度的 `6.2%–6.7%`
   - 中文 font size：English 的 `88%–92%`
   - 各行 `line-height: 1.20–1.25`
   - 两种语言之间额外 gap：`0.08–0.10em`
   - 文本最大宽度：画面宽度约 `68%`
   - 整组布局不得越出画面中央 `75%` 横向区域、中央 `90%` 纵向区域
   - 静止态最低行离底边至少约 `8.33%`；播放器控件出现时整组抬升

   其中只有 BBC/W3C 的字号、行高、安全区是来源规则；**英中比例与额外 gap 是 DuetSub 综合推导**。

5. 视觉处理建议：

   - 白色正常字重、语言对应的系统无衬线字体；
   - 首选**逐行**黑色半透明底板，而不是包住两种语言的大号 UI 卡片；
   - 底板建议从 `72%–80%` 黑色不透明度起测，左右 padding 约 `0.5em`；
   - 去掉当前截图里醒目的外框线；它更像浮层组件，不是成熟字幕的常见视觉语言；
   - 若不用底板，则使用黑色描边/阴影；IMSC 规定 text outline 不得超过字号的 `10%`；
   - 无论哪种方案，都至少达到 WCAG 普通文字 `4.5:1` 对比度。

---

## 规范层级

本文用四种标签避免误读：

| 标签 | 含义 |
|---|---|
| **交付规范** | BBC/Netflix 对交付给自家平台的字幕文件的明确规则；对其供应商是硬约束，但不是所有产品的普遍法律。 |
| **技术规范** | W3C IMSC/TTML、EBU-TT-D 等格式或渲染约束。 |
| **成熟经验** | 官方机构公布、但属于推荐或历史经验的做法。 |
| **DuetSub 建议** | 根据多份规范与当前产品场景推导的默认值，必须通过真实画面验收。 |

---

## 推荐参数矩阵

| 项目 | 一手规范给出的基线 | DuetSub 建议 | 性质 |
|---|---|---|---|
| 语言顺序 | W3C 认为同屏不超过两种语言是现实上限；没有规定谁在上 | English 上、中文下，位置变化时不翻转 | 产品决策 |
| 字号层级 | BBC 给单流 authored size/line-height；Netflix 分别按英文 42 字符和中文 16 字符适配 | English `100%`；中文先用 `90%`，在 `88%–92%` 校准 | 产品建议 |
| 视觉验收 | 字体 metrics 会改变实际大小和换行 | 英文字形实际高度比中文高 `5%–10%` | 产品建议 |
| 字体 | BBC 推荐宽的 sans-serif authoring font，并指出在线呈现宜用平台系统字体；Netflix 使用 proportional sans-serif 占位 | English：system-ui；繁中：PingFang TC / Microsoft JhengHei / Noto Sans TC 后备；保留正确 `lang` | 规范映射 |
| 行高 | BBC authored line height 为画面高约 `7%–8%`；validator 技术要求 `120%–125%` | 每行 `1.20–1.25`；不要依赖 `normal` | 规范映射 |
| 双语 gap | 没有官方 exact 值 | `0.08–0.10em`，且只作为已有 line-height 之外的微调 | 产品建议 |
| 行数 | BBC 横屏推荐最多两行；Netflix 每个单语事件最多两行 | 常态总计两行（每种语言一行）；源字幕硬断行时不丢内容 | 产品建议 |
| 英文行长 | Netflix English (USA/UK) 为 42 characters per line；BBC broadcast 37 字符，online 按区域宽度 | QA 软阈值 42；不改写官方轨文本 | 交付规范映射 |
| 中文行长 | Netflix 简中/繁中 Originals 为 16 字符/行 | QA 软阈值 16；不改写官方轨文本 | 交付规范映射 |
| 横向宽度 | BBC 16:9 online 行长约画面宽 `68%`，安全布局区为中央 `75%` | 文本 max-width `68%`；底板/阴影可扩到中央 `75%` 内 | 规范映射 |
| 纵向安全区 | BBC 16:9 中央 `90%`；W3C 最低行至少离底 `1/12` | 静止态 bottom inset `8.33%–8.5%`；控件出现时整组上移 | 规范映射 |
| 对齐 | BBC prepared subtitles 通常居中；Netflix 要求 center justified | 两种语言分别居中，整个 cue group 居中 | 规范映射 |
| 前景/底板 | BBC：白字黑底；背景按每行宽度计算，左右扩 `0.5em` | 白字 + 逐行 `72%–80%` 黑底，不要醒目外框 | 规范映射 + 产品建议 |
| 描边 | W3C 支持 outline/drop shadow；IMSC outline 不超过字号 `10%` | 无底板时约 `0.05–0.08em` 黑色描边；有底板时只保留很轻阴影 | 技术规范映射 |
| 对比度 | WCAG 普通文字至少 `4.5:1`，大字至少 `3:1` | 字幕按更严格的 `4.5:1` 验收 | 技术规范 + 产品建议 |
| 阅读速度 | Netflix 英文成人 `20 CPS`、中文成人 `9 CPS`；BBC `160–180 WPM` | 分语言做诊断，不把两行字符相加，也不自动截断官方字幕 | 交付规范映射 |
| 断行 | BBC/Netflix 都要求语义断行；W3C CLREQ 有中文行首行尾禁则 | 保留源硬换行；自动 wrap 时遵守英文短语边界和中文标点禁则 | 规范映射 |
| 纪录片 lower third | Netflix 明确指出纪录片常有大量 lower-third 图文，只抬升发生冲突的事件 | 冲突时整组上移；连续事件保持稳定，避免上下跳动 | 成熟经验映射 |

---

## 一、字号与视觉层级

### 1. 官方规范实际说了什么

**BBC**

- 16:9、4:3、1:1 视频的 authored font size 应能落在视频有效高度约 `7%–8%` 的 line-height 中；`7.5%` 是可接受示例。
  来源：[BBC Subtitle Guidelines v1.2.5 — Typography / Authoring font size](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Fonts)（访问：2026-07-30）。
- BBC 官方 validator 的技术要求讨论把横屏 computed font size 目标写为约 render area 高度的 `6.667%`，computed line-height 为 `120%–125%`。这是 BBC validator 的技术实现要求，不是“双语字号比例”。
  来源：[BBC ttml-validator — technical requirements, T.8–T.9](https://github.com/bbc/ttml-validator/discussions/10)（访问：2026-07-30）。

**Netflix**

- English 字号按视频分辨率和“横向可容纳 42 characters”决定，字体色为白色。
  来源：[Netflix English (USA) Timed Text Style Guide — Font Information](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide)（访问：2026-07-30）。
- Traditional Chinese 字号按视频分辨率和“横向可容纳 16 characters”决定，字体色为白色。
  来源：[Netflix Chinese (Traditional) Timed Text Style Guide — Font Information](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215994807-Chinese-Traditional-Timed-Text-Style-Guide)（访问：2026-07-30）。

**W3C IMSC**

- 字体回退会改变字形宽高，进而改变换行、行高和 bounding box 是否溢出；相同 CSS font-size 不能保证不同文字系统的可见字形同高。
  来源：[W3C IMSC 1.2 — Reference Fonts](https://www.w3.org/TR/ttml-imsc1.2/#text-profile-reference-fonts)（访问：2026-07-30）。

### 2. 为什么字号百分比仍需视觉验收

CSS 的 `font-size` 是 em square，不是字形实际可见高度。英文大写字母、x-height 与上下延伸通常不会填满 em square；汉字则通常接近填满字框。再加上 macOS/Windows 可能使用不同字体回退，`100% / 90%` 只能说明两个 em box 的比例，不能单独证明视觉比例。

因此，本轮建议用两层指标：

1. **实现起点**：English `100%`，中文 `90%`；
2. **视觉验收**：在实际截图中，English 主体字形高度比中文高 `5%–10%`。

若 macOS 的 PingFang TC 仍显大，中文可降至 `88%`；若 Windows 的 Microsoft JhengHei 显得过小，可升至 `92%`。不要为所有平台硬锁一个“官方比例”，因为这个官方比例不存在。

### 3. 与 BBC 尺寸基线的关系

若 English font-size 取视频高度约 `6.2%–6.7%`，并采用 `1.20` line-height，则 English 行框约为 `7.4%–8.0%`，与 BBC 横屏 `7%–8%` authored line-height 基线相符。中文按 `90%` 后约为 `5.6%–6.0%`，其行框约为 `6.7%–7.2%`。

这些数值用于 DuetSub overlay 的初始视觉 token，不表示 DuetSub 生成的 DOM 是 BBC EBU-TT-D 合规文件。

---

## 二、安全区、定位与纪录片 lower thirds

### 1. 安全区

BBC 对 16:9 online subtitles 的要求是：

- 不越出中央 `90%` 纵向区域，即上下至少各留 `5%`；
- 不越出中央 `75%` 横向区域，即左右至少各留 `12.5%`；
- 字幕行本身建议控制在画面宽约 `68%`；
- 当播放器控件或其他 overlay 可见时，应通过缩放、移动字幕或暂停呈现等方式避免遮挡。

来源：

- [BBC Subtitle Guidelines v1.2.5 — Line length](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Line-length)（访问：2026-07-30）。
- [BBC Subtitle Guidelines v1.2.5 — Positioning](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Positioning)（访问：2026-07-30）。

W3C Media Accessibility User Requirements 还要求，横排字幕的最低行至少位于画面底部以上 `1/12`，即约 `8.33%`。
来源：[W3C Media Accessibility User Requirements — CC-15](https://www.w3.org/WAI/PF/media-a11y-reqs/#cc-15)（访问：2026-07-30）。

**DuetSub 建议**

- 常态 bottom inset：`8.5%`；
- controls visible：整组抬升到播放器控件上方，不能只移动中文或英文；
- top cue：整组放在顶部安全区内，仍保持 English 上、中文下；
- max text width：`68%`；底板及 padding 不越出中央 `75%`。

### 2. 纪录片的特殊问题

Netflix 明确提醒，纪录片常在 lower third 放人物姓名、职务、地点和资料图表，因此需要抬升的字幕事件可能很多，但**不能简单地把所有事件永久抬高**；只处理实际冲突。
来源：[Netflix — Formatting: Positioning](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215623527-Formatting-Positioning)（访问：2026-07-30）。

Netflix 繁中纪录片规则还要求：

- 人物职务只在首次出现时翻译；
- 对话与人物 title 冲突时，用省略号处理被 title 打断的连续话语；
- archive clip 的 ticker/banner 仅在与情节相关时处理；
- 画面文字与对话冲突时，优先保留最影响剧情理解的信息。

来源：[Netflix Chinese (Traditional) Timed Text Style Guide — Documentary/Unscripted and On-screen Text](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215994807-Chinese-Traditional-Timed-Text-Style-Guide)（访问：2026-07-30）。

这些是字幕创作规则。DuetSub 显示官方轨时不应自行增删人物 title，但可以借鉴其空间策略：

- 避让 lower third 时把英中两行当成一个整体；
- 连续 cue 尽量保持同一位置，避免每句上下跳；
- 遮挡人物嘴部、画面文字或关键动作时，优先整体上移；
- 顶部也有重要文字时，选择较易读的位置，不把两种语言拆到画面两端。

---

## 三、行数、行长、行距与对齐

### 1. 行数

- BBC 对横屏/方形视频推荐最多两行；竖屏推荐最多三行。
  来源：[BBC Subtitle Guidelines v1.2.5 — Number of lines](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Number-of-lines)（访问：2026-07-30）。
- Netflix General Requirements 对单个 subtitle event 规定最多两行。
  来源：[Netflix Timed Text Style Guide — General Requirements / Line Treatment](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements)（访问：2026-07-30）。
- W3C 认为 pop-on captions 通常是一或两行，同屏两种自然语言已接近现实上限。
  来源：[W3C Media Accessibility User Requirements — CC-14 and CC-17](https://www.w3.org/WAI/PF/media-a11y-reqs/#cc-14)（访问：2026-07-30）。

这里必须区分：BBC/Netflix 的“两行”是**单语字幕事件**的 authoring 规则，不是现成的双语 overlay 总行数规则。

**DuetSub 建议**

- 常态目标：English 一行 + 中文一行，总计两行；
- 若官方 cue 自带硬换行或双说话人结构，允许临时出现 3–4 个视觉行；
- 不通过截断、缩略号或丢弃第二说话人来强行满足两行；
- 出现 3–4 行时应记录为视觉 QA 样本，检查遮挡与安全区。

### 2. 每行长度

**BBC**

- broadcast Teletext 上限 37 个等宽字符；
- 16:9 online 主要按渲染区域宽度约束，行宽建议约画面的 `68%`；
- 比字符数更重要的是字体、字号、实际字宽和 region 宽度。

来源：[BBC Subtitle Guidelines v1.2.5 — Line length](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Line-length)（访问：2026-07-30）。

**Netflix**

- English (USA)：42 characters per line。
  来源：[Netflix English (USA) — Character Limitation](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide)（访问：2026-07-30）。
- Traditional Chinese：Netflix Originals 16 characters per line；一般交付的自动 QC 上限可为 23，但 Originals 风格指南仍使用 16。
  来源：
  - [Netflix Chinese (Traditional) — Character Limitation](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215994807-Chinese-Traditional-Timed-Text-Style-Guide)（访问：2026-07-30）。
  - [Netflix — Maximum number of characters per line](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215274938-What-is-the-maximum-number-of-characters-per-line-allowed-in-Timed-Text-assets)（访问：2026-07-30）。

**DuetSub 建议**

- 把 English 42、中文 16 作为 QA 软阈值；
- 官方轨超过阈值时不自动改写文本；
- 优先保留源字幕的 hard break；
- 浏览器自动换行仍需受 `68%` 画面宽约束，不能为“塞进一行”把整个 cue group 拉到屏幕边缘。

### 3. 行高与双语 gap

- BBC authored line-height 为画面高度约 `7%–8%`；BBC validator 技术要求建议 `120%–125%`。
  来源：
  - [BBC Subtitle Guidelines v1.2.5 — Authoring font size](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Fonts)（访问：2026-07-30）。
  - [BBC ttml-validator — T.9 lineHeight](https://github.com/bbc/ttml-validator/discussions/10)（访问：2026-07-30）。
- W3C IMSC 1.2 建议明确设置 `tts:lineHeight`，因为不同实现的 `normal` 不一致。
  来源：[W3C IMSC 1.2 — lineHeight constraint](https://www.w3.org/TR/ttml-imsc1.2/#text-profile-constraints)（访问：2026-07-30）。

**DuetSub 建议**

- 每一语言行使用 `1.20–1.25`；
- English 与中文之间额外 gap 仅用 `0.08–0.10em`；
- gap 不是 line-height，不要把 `1.25` 行高再加 `0.25em` 后仍称为“125% 行高”；
- gap 的 `em` 基准应固定并在浏览器实测，避免因中文字号较小而产生不可预测的间距。

### 4. 对齐

- Netflix 要求字幕居中，放在画面顶部或底部。
  来源：[Netflix General Requirements — Positioning](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements)（访问：2026-07-30）。
- BBC 说明 prepared subtitles 通常在水平居中的 region 内居中；live subtitles 通常左对齐。
  来源：[BBC Subtitle Guidelines v1.2.5 — Horizontal positioning](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Horizontal-positioning)（访问：2026-07-30）。

**DuetSub 建议**

- 两种语言各自以自身文本宽度居中；
- cue group 的中心与视频中心一致；
- 不使用两端对齐或为了凑齐宽度拉大字距；
- 双说话人源字幕保留其换行结构，不擅自按画面人物左右位置拆开两种语言。

---

## 四、底板、描边、颜色与对比度

### 1. BBC 的现代默认

BBC 指南要求大多数字幕用白字黑底以确保可读性；背景宽度按**每一行**计算，而不是用一个覆盖所有行的大矩形。背景高度应覆盖行高，相邻行背景之间不留空洞；每行左右背景应额外延伸约 `0.5em`。
来源：

- [BBC Subtitle Guidelines v1.2.5 — Use white on black](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Colours)（访问：2026-07-30）。
- [BBC Subtitle Guidelines v1.2.5 — Background size](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Background-size)（访问：2026-07-30）。

WAI 说明网页播放器默认通常也是黑底白字，但浏览器和播放器对 author-defined styling/positioning 的支持不完全一致，且应允许用户调整字号、颜色和位置。
来源：[WAI — Captions/Subtitles: Positioning and Styling](https://www.w3.org/WAI/media/av/captions/#positioning-and-styling-captions)（访问：2026-07-30）。

### 2. 描边与阴影

W3C 的媒体无障碍需求要求支持较粗 outline 或 drop shadow，以提高文字对复杂背景的对比。IMSC 1.2 对 unblurred outline 的技术约束是：computed outline 不得超过同一 span font-size 的 `10%`。
来源：

- [W3C Media Accessibility User Requirements — CC-12](https://www.w3.org/WAI/PF/media-a11y-reqs/#cc-12)（访问：2026-07-30）。
- [W3C IMSC 1.2 — textOutline-unblurred](https://www.w3.org/TR/ttml-imsc1.2/#text-profile-constraints)（访问：2026-07-30）。

EBU 2004 的 Access Services 报告作为历史成熟经验，建议浅色文字配深色背景，并使用黑色 outline、黑色或半透明 box 来应对明亮或模糊背景。该报告是历史性建议，不是当前 EBU-TT-D 的精确 CSS 处方。
来源：[EBU I44-2004 — Access Services recommendations, p.21](https://tech.ebu.ch/docs/i/i044.pdf)（访问：2026-07-30）。

### 3. DuetSub 的选择

建议默认采用：

- `#FFFFFF` 文字；
- 每行 `72%–80%` 黑色底板；
- inline padding 约 `0.5em`；
- 无醒目的 1px 外边框；
- 只保留很轻的黑色阴影，避免底板 + 粗描边 + 外框三重叠加。

备选无底板模式：

- 黑色 outline 约 `0.05–0.08em`，绝不超过 `0.10em`；
- 配一层轻微 drop shadow；
- 必须在纯白、雪景、天空、火焰、快速运动和低码率模糊画面上逐帧检查。

WCAG 2.2 要求普通文字和背景至少 `4.5:1`，大字最低 `3:1`。字幕虽通常属于大字，DuetSub 仍建议按 `4.5:1` 验收，以覆盖较小窗口和中文缩小后的情况。
来源：[W3C WCAG 2.2 — Understanding Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)（访问：2026-07-30）。

---

## 五、阅读速度与时间

### 1. 来源规则

| 语言/机构 | 成人 | 儿童 | 来源 |
|---|---:|---:|---|
| Netflix English (USA/UK) | `20 CPS` | `17 CPS` | [English (USA) TTSG](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide)（访问：2026-07-30） |
| Netflix Traditional Chinese | `9 characters/s` | `7 characters/s` | [Chinese (Traditional) TTSG](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215994807-Chinese-Traditional-Timed-Text-Style-Guide)（访问：2026-07-30） |
| Netflix Simplified Chinese | `9 characters/s` | `7 characters/s` | [Chinese (Simplified) TTSG](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215986007-Chinese-Simplified-Timed-Text-Style-Guide)（访问：2026-07-30） |
| BBC | `160–180 WPM` 推荐值，可随节目节奏调整 | 未在该节给独立儿童值 | [BBC Subtitle Guidelines — Timing](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Timing)（访问：2026-07-30） |
| EBU I44-2004 历史经验 | 通常不超过 `140 WPM`，单行常见 2–3.5 秒 | 未分列 | [EBU I44-2004, p.21](https://tech.ebu.ch/docs/i/i044.pdf)（访问：2026-07-30） |

Netflix General Requirements 还规定每个 event 最短 `5/6` 秒、最长 `7` 秒。
来源：[Netflix General Requirements — Duration](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements)（访问：2026-07-30）。

### 2. DuetSub 如何使用这些值

DuetSub 显示的是平台已有官方轨，通常不能也不应重写其时长。因此：

- 阅读速度值用于 QA、调试和 MT 输出质量诊断；
- English 与中文分别计算，不把两行字符相加成一个 CPS；
- 不因为双语显示就把每种语言的容许 CPS 机械减半；没有官方规范支持这种算法；
- 不为通过阈值自动截断、删标点或提前换 cue；
- 对机器翻译可把中文 `9 characters/s`、英文 `20 CPS` 作为“简洁度”目标，但仍应服从原 cue 的时间轴与语义完整性。

---

## 六、断行与标点

### 1. 英文断行

BBC 与 Netflix 的共同原则是优先在自然语义边界断行。Netflix 明确建议：

- 在标点后断；
- 在 conjunction、preposition 前断；
- 不拆 article + noun、adjective + noun、subject pronoun + verb、auxiliary + verb、prepositional verb + preposition、first name + last name。

来源：

- [Netflix General Requirements — Line Treatment](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements)（访问：2026-07-30）。
- [BBC Subtitle Guidelines — Break at natural points](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/#Break-at-natural-points)（访问：2026-07-30）。

Netflix 还偏好 bottom-heavy pyramid，但应避免上行只剩一两个词。
来源：[Netflix English (USA) — Line Treatment](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide)（访问：2026-07-30）。

### 2. 中文断行

W3C《中文排版需求》给出的基本行首行尾禁则是：

- 顿号、逗号、分号、冒号、句号、问号、叹号、结束引号、结束括号等不应出现在行首；
- 开始引号、开始括号、开始书名号等不应出现在行尾；
- 横排中文中的完整西文单词，除可在连字符处分开外，不应跨行拆开。

来源：[W3C Requirements for Chinese Text Layout — Prohibition rules for line start/end](https://www.w3.org/International/clreq/#prohibition_rules_for_line_start_end)（访问：2026-07-30）。

Netflix 繁中还规定：

- 使用全角中文标点，双说话人的英文 hyphen 和缩写 period 除外；
- 问句必须有全角问号；
- 不在行/字幕末尾加顿号、逗号或句号；
- 不使用句号；
- ellipsis 使用 `U+2026`；
- 引号使用繁中样式 `「」`，嵌套时用 `『』`；
- 最多两行，多个合理断点时偏好 bottom-heavy pyramid。

来源：[Netflix Chinese (Traditional) — Punctuation, Quotations, Line Treatment](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215994807-Chinese-Traditional-Timed-Text-Style-Guide)（访问：2026-07-30）。

### 3. DuetSub 的边界

这些标点规则主要约束字幕创作。对平台官方轨：

- 保留原文、原标点、原 hard break；
- 不把 Netflix 风格强行套到 BBC、Prime、Max、YouTube 已交付的轨道上；
- 浏览器软换行时避免中文禁则字符孤立到行首/行尾；
- MT 生成的中文可采用繁中全角标点与 `U+2026`，但不能为了视觉统一篡改官方中文轨。

---

## 七、建议形成的 DuetSub 视觉验收卡

### A. 字号层级

- [ ] English 在上，中文在下。
- [ ] English CSS size 为 `100%`；中文从 `90%` 起测。
- [ ] 实际截图中 English 主体字形高度比中文字形高 `5%–10%`。
- [ ] macOS PingFang TC、Windows Microsoft JhengHei/Noto Sans TC 都通过，不只看单一机器。

### B. 布局

- [ ] 16:9 文本宽不超过画面约 `68%`。
- [ ] 整组不越出中央 `75%` 横向、中央 `90%` 纵向安全区。
- [ ] 静止态最低行 bottom inset 至少 `8.33%`。
- [ ] 播放器 controls 出现时英中整组抬升。
- [ ] top cue 不翻转两种语言顺序。

### C. 字体与节奏

- [ ] 两种语言都使用正常字重、对应语言的 sans-serif 字体。
- [ ] 每行 line-height 在 `1.20–1.25`。
- [ ] 双语额外 gap 约 `0.08–0.10em`，没有重复累计过大的 leading。
- [ ] 英文 42 字符、中文 16 字符边界样本不越界。

### D. 可读性

- [ ] 默认白字 + 逐行黑色半透明底板；无醒目外框。
- [ ] 文字对底板至少 `4.5:1`。
- [ ] 无底板模式的描边不超过 font-size 的 `10%`。
- [ ] 雪景、夜景、火焰、肤色、快速运动、低码率模糊画面均可读。

### E. 纪录片

- [ ] 人物姓名/职务 lower third 出现时字幕整组避让。
- [ ] 只抬升实际冲突的事件，不永久置顶。
- [ ] 连续 cue 不频繁上下跳。
- [ ] 画面顶部和底部同时有信息时，选择可读性更高的位置，不拆散两种语言。

### F. 内容完整性

- [ ] 官方轨文本、标点、timing 和 hard break 未被静默改写。
- [ ] 常态两行；源字幕确有结构性换行时允许 3–4 行而不丢字。
- [ ] 自动换行不拆英文紧密短语，也不产生中文行首/行尾禁则错误。

---

## 最终建议

当前最值得先验证的不是把中文从 `90%` 微调到 `88%`，而是把“CSS 百分比”改成“光学层级”验收：

> **English `100%`，中文 `90%` 起测；以 English 实际字形比中文高 `5%–10%` 为通过条件。**

同时保留成熟字幕的其余基线：`1.20–1.25` 行高、`0.08–0.10em` 双语 gap、16:9 文本宽约 `68%`、bottom inset 至少 `8.33%`、prepared subtitles 居中、白字配逐行黑色底板。

这套组合满足用户要的视觉主次，也忠实区分了“行业明文规则”和“DuetSub 为双语场景做的推导”。它仍需在真实纪录片 lower third、不同字体回退和长句样本中通过截图验收后，才能变成产品默认值。
