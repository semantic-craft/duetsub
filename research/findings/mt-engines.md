# 机翻兜底引擎选型调研（ticket 02）

Date: 2026-07-21
Scope: 只集事实，不做决策（决策在 ticket 06）。个人自用、侧载、用户在新加坡、目标语 zh-Hant。

---

## 1. 候选盘点

### 1.1 传统 MT API（有官方免费档）

| 引擎 | 免费额度（2026-07 现值） | 超额价格 | 直出 zh-Hant | 备注 |
|---|---|---|---|---|
| DeepL API Free | 500,000 字符/月，不滚存；key 以 `:fx` 结尾，走 `api-free.deepl.com`；繁忙时免费档请求降优先级 | Pro $5.49/月 + $25/M 字符 | ✅ 目标语码 `ZH-HANT`（另有 `ZH-HANS`、`ZH`） | 语言支持见官方文档 |
| Google Cloud Translation (v2/v3 NMT) | 500,000 字符/月永久免费（相当于 $10 抵扣），每月重置 | $20/M 字符 | ✅ 目标语码 `zh-TW` | 免费档覆盖 v2/v3 NMT，不含 document/Adaptive/LLM 翻译 |
| Azure Translator F0 | 2,000,000 字符/月永久免费（计量上另有 2M 字符/小时上限）；超限返 429/403，不产生费用 | S1 按量 $10/M 字符 | ✅ 目标语码 `zh-Hant` | 免费档不含文档翻译与自定义模型 |

来源：
- DeepL 免费档与限制：https://developers.deepl.com/docs/resources/usage-limits 、https://support.deepl.com/hc/en-us/articles/360021200939-DeepL-API-plans 、https://www.eesel.ai/blog/deepl-pricing 、https://chatscontrol.com/blog/deepl-api-pricing-plans-limits-2026
- DeepL ZH-HANT 支持（已直接核对官方 supported-languages 页）：https://developers.deepl.com/docs/getting-started/supported-languages
- Google 定价/免费档：https://cloud.google.com/translate/pricing 、https://chatscontrol.com/blog/google-cloud-translation-api-pricing-limits-2026 、https://apispine.com/google-cloud-translation/pricing
- Azure F0：https://azure.microsoft.com/en-us/pricing/details/translator/ 、https://learn.microsoft.com/en-us/azure/ai-services/translator/service-limits 、https://chatscontrol.com/blog/translation-api-free-tier-2026-deepl-google-azure

### 1.2 LLM 按 cue 批翻

| 引擎 | 免费额度 | 付费价格（2026-07） | zh-Hant | 备注 |
|---|---|---|---|---|
| Gemini API（Flash / Flash-Lite） | 有免费档；官方页已改为「限额个体化、在 AI Studio 查看」，不再公布固定数字。第三方追踪值约：Flash 档 10 RPM / 250K TPM / 250–1,500 RPD（按型号浮动）。2026-04 起 Pro 系不再入免费档 | Flash 付费档很便宜（低于 $1/M tokens 量级） | ✅ prompt 指定即可直出繁体 | RPD 太平洋时间午夜重置；免费档数字以 AI Studio 实测为准 |
| OpenAI（gpt-5-mini 档） | 无长期免费档 | $0.125/M in + $1.00/M out（gpt-5-mini）；gpt-5.4-mini $0.375/$2.25 | ✅ prompt 直出 | 一集成本约 $0.01–0.02（见 §2） |
| Claude（Haiku 4.5） | 无免费档 | $1/M in + $5/M out；Batch API 半价 | ✅ prompt 直出 | 一集约 $0.07–0.1 |
| Ollama 本地 | 完全免费 | — | 视模型；qwen/gemma 系可 prompt 出繁体但简繁混杂常见，建议 OpenCC 兜底 | 需本机跑模型；扩展需在 manifest 放行 `http://localhost:11434`；延迟取决于硬件 |

来源：
- Gemini 官方限额页（已核对，数字个体化）：https://ai.google.dev/gemini-api/docs/rate-limits
- Gemini 免费档第三方追踪：https://tinkerllm.com/blog/gemini-api-free-tier-limits-rate-quotas/ 、https://www.aifreeapi.com/en/posts/gemini-api-free-tier-rate-limits 、https://tokenmix.ai/blog/gemini-api-free-tier-limits
- OpenAI 定价：https://developers.openai.com/api/docs/pricing 、https://pricepertoken.com/pricing-page/model/openai-gpt-5-mini
- Anthropic 定价：https://www.cloudzero.com/blog/claude-api-pricing/ 、https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration
- Ollama：https://ollama.com （本地免费；模型质量为本调研评估，非引用）

### 1.3 「免费端点」路数（沉浸式翻译 / Read Frog 实际在用）

这类端点无需用户申请 key，是两家扩展默认体验的基石：

1. **Microsoft Edge 免费端点**（Read Frog 在用，代码已核对）：
   - 先 `GET https://edge.microsoft.com/translate/auth` 拿匿名 JWT；
   - 再 `POST https://api-edge.cognitive.microsofttranslator.com/translate?from=..&to=..&api-version=3.0`，body 为 `[{Text},...]` 数组，天然支持批量；
   - 来源：read-frog `src/utils/host/translate/api/microsoft.ts`（https://github.com/mengxi-ream/read-frog ，GPL-3.0）。
   - 支持 `to=zh-Hant` 直出繁体（Azure Translator 同引擎）。
2. **Google 免费 web 端点**（Read Frog 在用，代码已核对）：
   - `POST https://translate-pa.googleapis.com/v1/translateHtml`，带公开 API key（`X-Goog-API-Key`，wt_lib 客户端标识）；
   - 已知坑：端点按 HTML 解析，换行会被折叠（read-frog `google.ts` 注释里详述）；
   - 来源：read-frog `src/utils/host/translate/api/google.ts`。
3. **沉浸式翻译**：登录后免费提供 Google、Microsoft、GLM-4 Flash、硅基流动四路（经其官方代理）；未登录也可直接用 Microsoft/Google/腾讯交互翻译。其本地 CRX 提取物（`research/proprietary/immersive-translate-1.30.3/`）只包含字幕请求拦截层，不含 MT 端点代码。
   - 来源：https://immersivetranslate.com/en/download/ 、https://sspai.com/post/83943 、本地 `research/proprietary/immersive-translate-1.30.3/SOURCE.md`
4. Read Frog 另有 `deepl.ts` / `deeplx.ts`（DeepLX 是社区逆向的 DeepL 免费接口，稳定性差、易封，简体为主）。

风险共性：免费端点无 SLA、可能随时改版或加风控；个人自用量级（每天几集）远低于整页翻译场景，实测被限风险低，但需有降级路径。

---

## 2. 字幕场景指标

### 2.1 一集 40 分钟剧的字符量（估算，非引用）

- 典型 40–42 分钟剧集：约 550–750 条 cue；
- 英文对白语速 ~140–160 wpm、有效对白占时 50–70% → 约 4,000–7,000 词；
- 折合 **约 25,000–45,000 字符（含空格），取中值 ~35,000 字符/集**。
- 交叉验证：该量级与常见英文 SRT 文件 30–45 KB 文本体积一致。

### 2.2 免费额度能撑几集（按 35k 字符/集）

| 引擎 | 月免费额度 | 约可翻集数/月 |
|---|---|---|
| DeepL Free | 500K 字符 | ~14 集 |
| Google Cloud | 500K 字符 | ~14 集 |
| Azure F0 | 2M 字符 | ~57 集（约每天 2 集） |
| MS Edge 免费端点 | 无公布额度（匿名 token） | 实测不限，个人量级无压力 |
| Gemini 免费档 | 按请求数限（RPM/RPD） | 整集批翻若切成 ~10–40 个请求，一天数集可行，但 10 RPM 意味着一集要排队数分钟 |
| gpt-5-mini（付费） | — | ~35k 字符 ≈ 9–12K tokens 入 + 相近出 → **~$0.01–0.02/集**，$5 能翻几百集 |
| Claude Haiku 4.5（付费） | — | ~$0.07–0.1/集 |
| Ollama | 无限 | 无限（受本机速度限制） |

### 2.3 整集一次性批翻 vs 播放中滚动批翻

**整集一次性（warmup）**：
- 拿到整轨后一次提交。经 MS 免费端点（每请求 ≤100 条 / ≤50K 字符，Read Frog 的实测参数）一集 600 cue 只需 6–7 个请求，几秒内完成；DeepL/Google/Azure 同理，一集只花一次额度，无播放期延迟。
- LLM 整集批翻：35k 字符按 1–4k 字符/请求切分为 10–40 个请求；Gemini 免费档 10 RPM 下需 1–4 分钟跑完（可接受：开播前后台跑）；付费 OpenAI/Claude 并发跑几十秒。
- 配额压力最小、可整集缓存，是字幕场景的自然形态（字幕轨在开播时即完整可得）。

**播放中滚动批翻**：
- Read Frog 现行 LLM 路径：`timeupdate` 触发，窗口=当前时间 -5s 到 +30s（`TRANSLATE_LOOK_AHEAD_MS=30_000`），每次最多 5 条（`TRANSLATION_BATCH_SIZE=5`），串行（`isTranslating` 互斥）。
- 一集 ~600 cue → 至少 ~120 次调用；对 Gemini 免费档 10 RPM 是持续压力，seek 后要等新窗口翻完（loading 态）。
- 优点：只为实际观看的部分付费/耗额度；缺点：请求数多、seek 体验差。
- 来源：read-frog `src/entrypoints/subtitles.content/translation-coordinator.ts`、`src/utils/constants/subtitles.ts`。

---

## 3. en→zh-Hant 直出能力

| 引擎 | 直出繁体 | 说明 |
|---|---|---|
| DeepL | ✅ `ZH-HANT` | 官方 supported-languages 已核对（含 glossary/TM 支持） |
| Google（Cloud 与免费端点） | ✅ `zh-TW` | 台湾用语习惯 |
| Microsoft/Azure（含 Edge 免费端点） | ✅ `zh-Hant` | 与付费 Azure 同引擎 |
| OpenAI / Claude / Gemini | ✅ prompt 指定「台灣繁體中文」 | 偶发简繁混杂/大陆用语，稳妥做法：prompt 约束 + OpenCC `s2twp` 兜底过一遍（幂等，对已是繁体的文本无害） |
| Ollama 本地模型 | ⚠️ 视模型 | 中文强的模型（qwen 系等）可出繁体但混杂率更高，建议必挂 OpenCC |
| DeepLX 等逆向端点 | ⚠️ | 常只稳定出简体，需 OpenCC |

结论：主流四家（DeepL/Google/MS/LLM）都能直出繁体，OpenCC 是「保险丝」而非必经路径；只有本地模型和逆向端点强依赖它。

---

## 4. 批量 / 去重 / 缓存先例（Read Frog 精读）

本地文件：`research/upstream/read-frog/subtitles-scheduler.ts`（+ 上游仓库 https://github.com/mengxi-ream/read-frog ，commit 见 `research/upstream/read-frog/PROVENANCE.md`，GPL-3.0——可借鉴思路，若抄代码则 DuetSub 需 GPL 兼容）。

**分层架构**（关注点分离很干净）：

1. **SubtitlesScheduler（本地已有）**：纯显示调度。持 `SubtitlesFragment[] {text,start,end,translation?}`；`timeupdate`/`seeking` 驱动按 `start<=t<end` 找当前 cue；关键接口 `supplementSubtitles()` —— 译文是**增量补给**的，按 `start` 时间戳作为 cue 身份合并去重（Map keyed by start），当前正在显示的 cue 若刚拿到译文会强制刷新。含 error 态 5s 自动隐藏。
2. **TranslationCoordinator（上游）**：滚动窗口驱动器。见 §2.3；另用三个 `Set<start>`（translating/translated/failed）做**请求级去重**，失败 cue 不重试（除非手动 clearFailed），失败时按显示模式降级（translationOnly 模式回填原文，双语模式留空）。
3. **microsoftWarmupTranslate（上游 `src/utils/subtitles/warmup/microsoft-warmup.ts`）**：整集预热路径（MS 免费端点专用）。整轨切块：每块 ≤100 条 且 ≤50,000 字符，`Promise.allSettled` 并发提交，失败块只警告不阻塞——**这就是「整集一次性批翻」的现成参数**。
4. **BatchQueue（上游 `src/utils/request/batch-queue.ts`，LLM 专用）**：攒批器。默认每批 ≤1,000 字符 / ≤4 条（`constants/translate.ts`）；带 dispatch gate（下游令牌桶没空位时批继续吸收新任务而不是提早 flush）；批内文本用分隔符拼接、按分隔符切分结果，条数不匹配抛 `BatchCountMismatchError` 并可回退逐条重试（`enableFallbackToIndividual`）；指数退避 1s→8s；支持按 dedup key 让重复请求搭车同批。
5. **持久缓存（上游 `translation-queues.ts`）**：Dexie/IndexedDB `translationCache`，key = Sha256(准备后文本 + providerConfig + 源语 + 目标语 [+ LLM 时的完整 prompt/上下文])——换引擎或换 prompt 自动失效，同集重看/重进零请求。
6. **超时随批量缩放**：`20s + 15ms/字符，上限 120s`（`constants/translate.ts`），照顾免费档慢模型。

**沉浸式翻译**：闭源，本地提取物只覆盖字幕获取层（XHR/fetch 钩子拦截 Netflix/Prime/Max 的字幕请求，`target-site-rules.json` 有三站的 `subtitleUrlRegExp`）；其 MT 侧公开可查的是免费引擎清单（§1.3），批量/缓存内部实现无一手来源，不作结论。

---

## 5. 自用扩展的 API key 管理常见做法

- **通行模式（Read Frog / 沉浸式翻译均如此）**：options 页表单输入 key → 存 `chrome.storage.local`（Read Frog 把整个 providersConfig 连同 key 存扩展 storage，见其 `src/entrypoints/options/` 与 config storage）。
- `chrome.storage` **不加密**，任何拿到本机 profile 的人可读——官方文档明示不应存放高敏凭据；但对「个人自用、本机、免费档 key」是普遍接受的权衡。来源：https://developer.chrome.com/docs/extensions/reference/api/storage
- 细节惯例：
  - 用 `chrome.storage.local` 而非 `sync`（key 不该同步到别的机器/账号）；
  - options 页输入框 `type="password"` + 显隐切换；只在 background/service worker 里发起带 key 的请求，不把 key 注入 content script 世界；
  - `host_permissions` 声明各 API 域名（本地 Ollama 则是 `http://localhost:11434/*`）；
  - key 永不进 git（DuetSub 侧载场景天然满足：key 只存在用户浏览器 storage 里）。
- LLM 路线注意：浏览器直连 OpenAI/Anthropic 需要 CORS 放行；扩展 background fetch 不受页面 CORS 限制（MV3 host_permissions 即可），Anthropic 另有 `anthropic-dangerous-direct-browser-access` 头的浏览器直连模式。

---

## 6. 与后续决策（ticket 06）相关的事实小结

- 免费额度排序：MS Edge 免费端点（无额度概念）> Azure F0 2M > DeepL/Google 各 500K。全部直出 zh-Hant。
- 每集 ~35k 字符：付费 LLM 兜底也极便宜（gpt-5-mini ~$0.015/集）；Gemini 免费档可用但受 RPM 拖慢整集批翻。
- 字幕场景天然适合「整集 warmup + 增量 supplement + IndexedDB 缓存」——Read Frog 三层（warmup / coordinator / scheduler）已给出经过实战的参数：MS 批 100 条/50K 字符，LLM 批 4 条/1K 字符，滚动窗口 30s/批 5 条。
- OpenCC 只在本地模型/逆向端点/LLM 简繁混杂兜底时需要，不是必选依赖。
- GPL-3.0 边界：Read Frog 思路可学，逐行搬运则 DuetSub 需接受 GPL；immersive-translate 提取物（proprietary）只可作行为证据，禁止进 runtime 代码。
