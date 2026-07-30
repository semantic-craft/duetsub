# Qwen 3.7 Flash 字幕 Prompt 实测报告

日期：2026-07-31
结论：通过 DuetSub 的影视剧与 YouTube 字幕翻译门槛，可作为千问供应商的新默认模型。

## 1. 实测范围

- 模型：`qwen3.7-flash`
- 接口：阿里云百炼 OpenAI-compatible Responses API
- 产品路径：DuetSub 实际 `translateCueBatch` 适配层，不使用旁路示例脚本
- Prompt：`film-tv` 与 `youtube`
- 方向：英文 → 繁体中文、中文 → 英文
- 重复：每个组合两次，共 8 次真实请求、64 条 cue
- 凭据：只从现有 `DASHSCOPE_API_KEY` 环境注入，未写入仓库、报告或日志

账户的模型列表实际包含 `qwen3.7-flash`，最终 8 次响应的 `model` 也均为 `qwen3.7-flash`。

合并主线后，使用北京地域的 Workspace 专属 Responses 地址又执行了一轮 8 次真实请求。首轮有 1 条把“全船人”弱化成 bare `everyone`，严格语义门槛因此判为失败；prompt 加入场所／载体范围硬检查并升至 `subtitle-v10-scope-hard-check` 后，原评分标准不变，完整复跑 8 / 8 通过。

## 2. 最终自动证据

| 指标 | 结果 |
| --- | ---: |
| HTTP 200 / Responses `completed` | 8 / 8 |
| `x_billing_type=response_api` | 8 / 8 |
| `reasoning_tokens=0` | 8 / 8 |
| JSON、cue ID、数量与顺序 | 64 / 64 |
| 原 `start/end` 不变 | 64 / 64 |
| 两行、行长与阅读速度 | 64 / 64 |
| 代码、产品名、房号、数字与单位未跨行拆开 | 64 / 64 |
| 繁体字形检查 | 32 / 32 |
| 固定语义锚点 | 全部通过 |
| 重试 | 0 |

合并前通过轮的耗时基准：

- 中位数：1.988 秒
- 经验 P95 / 最慢：2.571 秒
- 输入 token：11,060
- 输出 token：1,803
- 总 token：12,863

## 3. 质量评分

评分遵循同目录的冻结标准，在硬门槛全部通过后由代理逐条对照原文复核：

| 组合 | 分数 | 复核摘要 |
| --- | ---: | --- |
| `film-tv` 英 → 繁中 | 94 | 人物语气、反讽、否定、五千金额和两行对白均保留 |
| `film-tv` 中 → 英 | 95 | 船上人员范围与冒险动作均保留，口语自然 |
| `youtube` 英 → 繁中 | 96 | UI、版本、代码、价格、方向与 `authoritative` 工作流语义完整 |
| `youtube` 中 → 英 | 96 | 步骤、纠错、不确定性、额外价格和方向完整 |
| **平均** | **95.25** | 高于 88 分总线，四个组合均高于 85 分 |

无致命语义错误。最终结果满足冻结标准的全部默认模型条件。

## 4. 本地回归与发布校验

| 校验 | 结果 |
| --- | --- |
| `npm test` | 233 项通过；1 项真实 API 测试默认跳过 |
| `npm run check` | TypeScript 通过 |
| `npm run build` | Chrome MV3 生产构建通过 |
| `npm run release:build` | zip 与 release verifier 通过 |
| 发布包 | `duetsub-0.1.6-chrome.zip`，25 个文件，least-privilege host boundary 通过 |
| `git diff --check` | 通过 |

真实 API 测试通过 `RUN_LIVE_QWEN_EVAL=1` 显式开启；合入主线后还必须提供 Workspace 专属的 `QWEN_EVAL_BASE_URL`，因此不会在普通离线回归中意外消耗用户额度。

## 5. 迭代中发现并关闭的问题

首轮仅看协议会误判为“可用”；人工复核实际发现过以下问题：

- `five grand` 一次被错译为五万；
- “全船人的命去赌”一度丢失船上范围或冒险动作；
- 软件语境的 `authoritative` 被直译为不自然的「權威性／保持為準」；
- `down`、额外价格等操作细节曾被弱化；
- 模型换行曾拆开 ``npm install``、`USB 3.2`、`799 美元` 与 `M3 MacBook Air`。

最终版本以 profile 专属 prompt 解决语义与语域，以本地确定性排版解决不稳定换行；验证器同时覆盖这些回归点。时间轴从始至终只由源 cue 驱动，模型不生成或修改时间戳。

合并后的 Workspace 首轮再次复现“全船人”范围偶发丢失，证明该门槛不是只对固定旧输出生效。最终版本把此项升级为影视 profile 的输出前硬检查，随后在同一 Workspace、同一模型和同一 8 组请求上全部通过。

## 6. 默认值决定

- 千问中国区与新加坡区的新配置默认模型：`qwen3.7-flash`
- `qwen3.6-flash`：保留为手动候选，不再作为千问默认
- DuetSub 的全局默认供应商：仍为 DeepSeek
- 用户已经保存的显式模型：不被静默覆盖

## 7. 参考

- [Alibaba Cloud：通过 OpenAI Responses API 调用千问](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-responses)
- [Netflix：Chinese (Traditional) Timed Text Style Guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215994807-Chinese-Traditional-Timed-Text-Style-Guide)
- [Netflix：English (USA) Timed Text Style Guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide)
- [Netflix：Subtitle Timing Guidelines](https://partnerhelp.netflixstudios.com/hc/en-us/articles/360051554394-Timed-Text-Style-Guide-Subtitle-Timing-Guidelines)
- [YouTube：Add subtitles and captions](https://support.google.com/youtube/answer/2734796)
- [YouTube：Use automatic captioning](https://support.google.com/youtube/answer/6373554)
- [W3C：WebVTT](https://www.w3.org/TR/webvtt1/)
