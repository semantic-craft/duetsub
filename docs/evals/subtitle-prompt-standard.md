# DuetSub 字幕翻译 Prompt 评测标准

状态：冻结于 2026-07-31。先按本标准评测，再决定 prompt 与默认模型是否可进入产品。

## 1. 范围

评测两个运行时 system prompt：

1. `film-tv`：Netflix、Prime Video、Max 的电影/电视剧字幕。
2. `youtube`：YouTube、YouTube Shorts 与其他 YouTube 视频字幕。

每个 prompt 都测试两个实际产品方向：

- 非繁体中文字幕 → 自然的繁体中文（`zh-Hant`）
- 非英文字幕 → 自然的英文（`en`）

候选模型固定为 `qwen3.7-flash`，通过阿里云百炼 OpenAI-compatible Responses API 调用。请求必须使用产品实际适配层，而不是另写一份与产品不一致的示例请求。

## 2. 输入与时间轴契约

模型接收按时间升序排列的小批 cue。每条 cue 必须包含稳定 `id`、`start_ms`、`end_ms`、`duration_ms`、`max_reading_units` 与原文 `text`。

模型只能翻译文字：

- 输出必须保留全部且仅保留原 `id`，不得重排、合并、拆分或漏掉 cue。
- cue 的开始时间、结束时间和顺序由播放器字幕轨负责；模型不得生成或修改时间戳。
- 翻译必须考虑 `duration_ms`，在不改变关键事实、否定、数字、专名和说话意图的前提下，为短 cue 采用更紧凑的表达。
- 同一批 cue 只为理解上下文而互相参考，不能把一个 cue 的文字移入另一个 cue。
- 模型负责翻译与语义压缩；DuetSub 在模型返回后以确定性排版器选择自然换行、保护代码/产品名/数字单位并统一省略号，仍不改变时间轴或 cue 映射。

这一契约借鉴本机 Immersive Translate 1.30.3 CRX 的干净室行为观察：字幕走独立场景、小批量翻译、以原字幕时间轴驱动显示，并维持逐条结果映射；不复制其实现代码或提示词。

## 3. 共通硬门槛

任一项失败，该次运行直接不通过，不以平均分抵消：

1. `/responses` 返回成功，产品解析器能读取 `output_text`。
2. `store=false` 与关闭思考的参数被服务接受。
3. 输出是唯一的合法 JSON 对象，不含 Markdown、解释、前后缀或思考内容。
4. 输出 ID 集合与输入完全一致；无空译文、漏译、增译、合并、拆分或重排。
5. 翻译后的 cue 仍使用原 `start`、`end` 和顺序。
6. 每条最多两行；一行优先，最多插入一个 `\n`。
7. 换行位于语义或语法边界；不得拆开姓名、数字与单位、紧密的修饰结构、动词与否定/助动成分。
8. `zh-Hant` 输出不得含可由 OpenCC 明确识别并转换的简体字形。
9. 不得出现意义反转、漏掉否定、关键数字/单位错误、错误归属说话者，或虚构原文没有的事实。

## 4. 可读速度与行长

以下是 DuetSub 的产品验收阈值，不冒充所有平台的统一交付规范：

| 使用场景与目标语言 | 理想阅读速度 | 硬上限 | 单行上限 |
| --- | ---: | ---: | ---: |
| 影视剧普通繁体中文字幕 | 9 字符/秒 | 9 字符/秒 | 16 个全角字符 |
| YouTube 繁体中文字幕 | 9 字符/秒 | 11 字符/秒 | 18 个全角字符 |
| 英文 | 17 字符/秒 | 20 字符/秒 | 42 个字符 |

计算时：

- 中文汉字、全角标点按 1 字符计；空白不计。
- 英文字符、数字、标点与词间空格均计入。
- 对不足 1 秒的 cue，以 1 秒作为速度分母，避免极短时间戳把指标放大到失真。
- 如果原文在现有时长内本身就无法完整表达，评测样例不得借此强迫模型删掉关键信息；该问题应归为上游断句/时间轴问题。

影视剧普通繁体中文字幕严格采用 Netflix 的 9 字符/秒与 16 个全角字符/行；不把其繁体中文 SDH 的 11 字符/秒、18 字符/行误作普通字幕标准。英文 20 字符/秒、最多两行与 42 字符/行来自 Netflix 英文 timed-text 规范。YouTube 官方确认字幕 cue 由文字和时间码组成，但没有发布同等精细的通用阅读速度表，因此 DuetSub 将 9 字符/秒作为理想值，并把 11 字符/秒、18 字符/行仅作为快语速 YouTube 的产品宽限值，不声称这是 YouTube 的平台强制值。

## 5. `film-tv` 专项标准

影视 prompt 必须：

- 保留人物身份、关系、礼貌等级、时代感和前后对白中的指代。
- 保留俚语、粗口、讽刺、笑点、双关、威胁和犹豫的功能与强度；不可翻成解释性说明。
- 优先自然可演的对白，不使用书面报告腔或逐词硬译。
- 保留剧情关键的专名、称谓、数字、时间、地点和因果/否定。
- 仅在阅读速度确有需要时压缩冗余，且不淡化或“净化”原意。
- 正确处理停顿、打断、省略和跨 cue 连续句，不为连续句擅加解释性省略号。

## 6. `youtube` 专项标准

YouTube prompt 必须：

- 保留口播的论证/教程顺序、步骤编号、条件、否定、警告和行动指令。
- 保留产品名、频道名、软件界面标签、代码、命令、专业术语、数字、单位、价格与版本号。
- 把自动字幕式碎片放回相邻 cue 语境理解，但仍逐 cue 输出，不跨 cue 搬移信息。
- 译文应像自然口播字幕，不改写成论文或营销文案。
- 语气词和口头重复只有在不承载态度、节奏或纠正信息时才可为阅读速度轻量压缩。
- 不得把不确定表达、免责声明、赞助披露或纠错改成更确定的陈述。

## 7. 固定用例矩阵

每个 profile、每个目标语言至少一批 8 条 cue，并重复两次，共至少 8 次真实 API 调用。

### 影视剧覆盖

- 低声威胁与否定
- 俚语/粗口强度
- 反讽或笑点
- 人名、地名、称谓
- 金额、日期、时刻
- 两人快速交替
- 两行语义断句
- 短时长高信息 cue

### YouTube 覆盖

- 教程步骤与 UI 标签
- 软件/硬件版本号
- 数值、单位与价格
- 代码或命令片段
- 自动字幕碎片与跨 cue 上下文
- 主播自我纠正
- 不确定表达或免责声明
- Shorts 式短时长口播

## 8. 质量评分

通过全部硬门槛后，每个方向按 100 分评分：

| 维度 | 权重 |
| --- | ---: |
| 语义忠实与关键事实 | 30 |
| 目标语言自然度与人物/口播语域 | 20 |
| 时长适配与字幕简洁度 | 20 |
| cue 边界、断句与两行布局 | 15 |
| 影视或 YouTube 专项表现 | 10 |
| 繁体纯度、拼写与标点 | 5 |

合格线：

- 四个「profile × 目标语言」组合都不得低于 85 分。
- 总平均不得低于 88 分。
- 两次重复运行均须保持硬门槛全通过。
- 任一致命语义错误即不通过。

语义与语域由人工/代理依据原文逐条复核，不让候选模型给自己的输出打分。自动检查只负责 JSON、ID、时间轴、行数、繁体字形、阅读速度与固定锚点。

## 9. 可用性记录

每次调用记录但不保存凭据：

- HTTP 状态与 Responses `status`
- 模型实际返回的 `model`
- 总耗时
- 输入、输出和总 token
- 是否触发重试

8-cue 批次的目标是中位耗时不高于 6 秒，单次不高于 15 秒（不含外部网络故障或明确的 429 退避）。凭据只从现有环境或系统钥匙串注入，不写入仓库、测试报告或日志。

## 10. 进入默认模型的条件

只有同时满足以下条件，才可把 Qwen 默认值从 `qwen3.6-flash` 改为 `qwen3.7-flash`：

1. 账户 `/models` 实际可见 `qwen3.7-flash`。
2. 新 Responses API 的最小真实调用成功。
3. 两套 prompt、两个方向、两次重复全部通过硬门槛与分数线。
4. 单元测试、TypeScript 检查、构建和 release verifier 全部通过。

## 11. 一手参考

- [Alibaba Cloud：通过 OpenAI Responses API 调用千问](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-responses)
- [Netflix：Timed Text General Requirements](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements)
- [Netflix：Subtitle Timing Guidelines](https://partnerhelp.netflixstudios.com/hc/en-us/articles/360051554394-Timed-Text-Style-Guide-Subtitle-Timing-Guidelines)
- [Netflix：English (USA) Timed Text Style Guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide)
- [Netflix：Chinese (Traditional) Timed Text Style Guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215994807-Chinese-Traditional-Timed-Text-Style-Guide)
- [YouTube：Add subtitles and captions](https://support.google.com/youtube/answer/2734796)
- [YouTube：Use automatic captioning](https://support.google.com/youtube/answer/6373554)
- [W3C：WebVTT](https://www.w3.org/TR/webvtt1/)
