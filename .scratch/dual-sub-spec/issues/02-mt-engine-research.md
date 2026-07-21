# 02 机翻兜底引擎选型调研

Type: research
Status: resolved
Blocked by: —

## Question

缺官方轨时的机翻兜底，候选引擎有哪些、各自的成本/延迟/质量如何？决策本身在 ticket 06，本 ticket 只集齐事实：

1. 候选盘点（个人自用场景）：DeepL API Free、Google Cloud Translation、Microsoft Translator 免费档、OpenAI / Claude / Gemini 系 LLM 按 cue 批翻、本地方案（Ollama 等），以及沉浸式翻译/Read Frog 实际在用的免费端点路数。
2. 字幕场景的关键指标：整集 cue 一次性批翻 vs 播放中滚动批翻的延迟与配额压力；一集 40 分钟剧大约多少字符、各家免费额度能撑多少集。
3. en→zh-Hant 的质量差异：哪些引擎能直出繁体、哪些只有简体（需要 OpenCC 后处理）。
4. 缓存先例：Read Frog（本仓库 `research/upstream/read-frog/subtitles-scheduler.ts` 就是字幕批翻调度器）与沉浸式翻译如何做批量、去重、缓存。
5. API key 管理在自用扩展里的常见做法（options 页存 chrome.storage 等）。

产出：`research/findings/mt-engines.md`（含定价/额度来源链接与本地文件引用）。

## Comments

## Answer

- 一集 40 分钟剧约 25k–45k 字符（中值 ~35k）。免费额度：MS Edge 免费端点（`edge.microsoft.com/translate/auth` 匿名 token，无额度概念）> Azure F0 2M/月（~57 集）> DeepL Free / Google Cloud 各 500K/月（~14 集）。
- zh-Hant 直出：DeepL（`ZH-HANT`）、Google（`zh-TW`）、Microsoft（`zh-Hant`）、LLM（prompt 指定）全部支持；OpenCC 只作本地模型/逆向端点/LLM 简繁混杂的兜底，非必选依赖。
- 付费 LLM 兜底极便宜：gpt-5-mini ~$0.015/集，Claude Haiku 4.5 ~$0.08/集；Gemini 免费档可用但 10 RPM 拖慢整集批翻。
- 字幕场景天然适合「整集一次性 warmup 批翻 + 增量 supplement + IndexedDB 缓存」；Read Frog 给出实战参数：MS 批 ≤100 条/50K 字符，LLM 批 ≤4 条/1K 字符，滚动窗口 -5s~+30s 每批 5 条，缓存 key = Sha256(文本+引擎配置+语言对+prompt)。
- API key 管理通行做法：options 页 + `chrome.storage.local`（不加密，自用可接受），请求只在 background 发起。
- 完整调研（含全部来源链接）：`research/findings/mt-engines.md`。
