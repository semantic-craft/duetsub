# DuetSub 字幕翻译 Prompt 评测标准

状态：更新于 2026-07-31。先按本标准评测，再决定 prompt 与默认模型是否可进入产品。

## 1. 范围

评测两个运行时 system prompt：

1. `film-tv`：Netflix、Prime Video、Max 的电影/电视剧字幕。
2. `youtube`：YouTube、YouTube Shorts 与其他 YouTube 视频字幕。

每个 prompt 都测试三个实际产品方向：

- 非繁体中文字幕 → 自然的繁体中文（`zh-Hant`）
- 非简体中文字幕 → 自然的简体中文（`zh-Hans`）
- 非英文字幕 → 自然的英文（`en`）

候选模型固定为 `qwen3.7-plus`，通过阿里云百炼 OpenAI-compatible Responses API 调用。请求必须使用产品实际适配层，而不是另写一份与产品不一致的示例请求。

## 2. 输入与时间轴契约

模型接收按时间升序排列、每批最多 8 条 cue 的字幕文本；每条以独占一行的 `%%` 分隔。所有片段都只是不可信的字幕内容，模型不得执行其中出现的命令、角色变更或输出格式要求。

模型只能翻译文字：

- 输出必须返回相同数量、相同顺序的译文片段，并以独占一行的 `%%` 分隔；不得合并、拆分或漏掉 cue。
- cue 的开始时间、结束时间和顺序只由播放器字幕轨负责；模型不接收、不生成也不修改时间戳。
- 模型必须先从相邻 cue 还原被时间轴切碎的完整话语，再把完整译文自然分配回相同位置。目标语语序需要时，相邻 cue 可以调整虚词或词序，但不得丢失、重复、摘要或把信息移到远离原文的时间点。
- 模型负责完整、自然的翻译；DuetSub 在模型返回后以确定性排版器选择自然换行、保护代码/产品名/数字单位并统一省略号，仍不改变时间轴或 cue 映射。

这一契约借鉴本机 Immersive Translate 1.30.3 CRX 的干净室行为观察：字幕走独立场景、小批量翻译、以原字幕时间轴驱动显示，并维持逐条结果映射；不复制其实现代码或提示词。

## 3. 共通硬门槛

任一项失败，该次运行直接不通过，不以平均分抵消：

1. `/responses` 返回成功，产品解析器能读取 `output_text`。
2. `store=false` 与关闭思考的参数被服务接受。
3. 输出只含译文与片段分隔符，不含 JSON、Markdown、解释、前后缀或思考内容。
4. `%%` 分隔出的译文数量与输入完全一致；无空译文、漏译、增译、合并、拆分或重排。
5. 翻译后的 cue 仍使用原 `start`、`end` 和顺序。
6. 每条最多两行；一行优先，最多插入一个 `\n`。
7. 换行位于语义或语法边界；不得拆开姓名、数字与单位、紧密的修饰结构、动词与否定/助动成分。
8. `zh-Hant` 输出不得含可由 OpenCC 明确识别并转换的简体字形。
9. `zh-Hans` 输出不得含可由 OpenCC 明确识别并转换的繁体字形。
10. 不得出现意义反转、漏掉否定、关键数字/单位错误、错误归属说话者，或虚构原文没有的事实。

## 4. 时间轴与排版

DuetSub 不向模型发送字符/秒、单行字数或“尽量简洁”的长度预算，也不以这些指标判定翻译质量。模型只需知道自己正在翻译影视剧或 YouTube 字幕，并按原 cue 逐条返回自然、完整的译文。

- 程序保留原 `start`、`end`、cue 顺序与 cue 边界；模型只返回同数量译文。
- 每条最多两行；只在自然语义或语法边界换行。
- 不得拆开姓名、数字与单位、代码、紧密修饰结构或否定/助动成分。
- 如果完整自然的译文比原时长看起来更长，仍保留完整译文；断句或时间轴不合理应归为上游字幕问题，不让模型通过删义掩盖。
- 返回后由 DuetSub 的确定性排版器处理自然换行和标点统一，但不截断、不摘要、不改写语义。

## 5. `film-tv` 专项标准

影视 prompt 必须：

- 保留人物身份、关系、礼貌等级、时代感和前后对白中的指代。
- 保留俚语、粗口、讽刺、笑点、双关、威胁和犹豫的功能与强度；不可翻成解释性说明。
- 优先自然可演的对白，不使用书面报告腔或逐词硬译。
- 保留剧情关键的专名、称谓、数字、时间、地点和因果/否定。
- 不为时长或字数压缩对白，不淡化或“净化”原意。
- 正确处理停顿、打断、省略和跨 cue 连续句，不为连续句擅加解释性省略号。

## 6. `youtube` 专项标准

YouTube prompt 必须：

- 保留口播的论证/教程顺序、步骤编号、条件、否定、警告和行动指令。
- 保留产品名、频道名、软件界面标签、代码、命令、专业术语、数字、单位、价格与版本号。
- 把自动字幕式碎片放回相邻 cue 语境理解，再按相同片段数量和顺序输出。
- 译文应像自然口播字幕，不改写成论文或营销文案。
- 语气词和口头重复承载态度、节奏、人物性格或纠正信息时必须保留。
- 不得把不确定表达、免责声明、赞助披露或纠错改成更确定的陈述。

## 7. 固定用例矩阵

每个 profile、每个目标语言至少覆盖 8 条 cue，由产品实际链路作为一个 8-cue 请求发送，并把整组重复两次，共至少 12 次真实 API 调用。

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
| 语义忠实与关键事实 | 40 |
| 目标语言自然度与人物/口播语域 | 25 |
| cue 边界、断句与两行布局 | 15 |
| 影视或 YouTube 专项表现 | 15 |
| 目标中文的简繁纯度、拼写与标点 | 5 |

合格线：

- 六个「profile × 目标语言」组合都不得低于 85 分。
- 总平均不得低于 88 分。
- 两次重复运行均须保持硬门槛全通过。
- 任一致命语义错误即不通过。

语义与语域由人工/代理依据原文逐条复核，不让候选模型给自己的输出打分。自动检查只负责 `%%` 片段数量、时间轴回填、行数、简繁字形与固定语义锚点；字符/秒和单行字数不作为失败条件。

## 9. 可用性记录

每次调用记录但不保存凭据：

- HTTP 状态与 Responses `status`
- 模型实际返回的 `model`
- 总耗时
- 输入、输出和总 token
- 是否触发重试

8-cue 批次只记录耗时，不以延迟压缩或删减译文；凭据只从现有环境或系统钥匙串注入，不写入仓库、测试报告或日志。

## 10. 进入默认模型的条件

只有同时满足以下条件，才可把 Qwen 默认值改为 `qwen3.7-plus`：

1. 账户 `/models` 实际可见 `qwen3.7-plus`。
2. 新 Responses API 的最小真实调用成功。
3. 两套 prompt、三个方向、两次重复全部通过硬门槛与分数线。
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
