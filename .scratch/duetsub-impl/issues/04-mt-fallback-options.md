# 04 — 机翻兜底 + 设置页（DeepSeek + 缓存 + OpenCC）

**What to build:** 当片子只有单侧官方轨时补齐缺失一侧——机翻、OpenCC 简→繁——配一个可用的设置页、内容寻址缓存、fail-soft 降级。（按 §I：**统一 OpenAI 兼容端点**——默认 DeepSeek 云端，也支持本机 Ollama/LM Studio。）

**Blocked by:** 02 — Prime Video 官方双轨。（与 03 正交，可并行。）

**Status:** claimed

- [x] 设置页可选供应商（DeepSeek 云端 / OpenAI 兼容 / 本地）并填 Base URL·key(掩码)·模型，存 `chrome.storage.local`；SW 按 OpenAI 兼容协议统一调用；key 不写日志、除发往用户所配端点外不外发；本地端点走 `http://localhost/*` host_permission 并处理无鉴权/CORS；「测试连接」可校验端点。
- [x] 英文单官方轨 → DeepSeek 出繁中；中文单官方轨 → DeepSeek 出英文；仅简中官方轨 → OpenCC 出繁中（不机翻）；两侧皆官方 → 不机翻。
- [x] 机翻行显示内联 `MT` 标记；官方行与 OpenCC 行不标。
- [x] 整轨 warmup + 按播放头优先级滚动批翻；seek/导航 abort 在途请求；每请求限 N 条 cue；译文沿用源 cue 的 `start/end`（不重对齐）。
- [x] IndexedDB 缓存 key = `hash(contentId+trackId+源文本+目标语言+模型)`；重看/回拖命中；LRU 容量上限淘汰。
- [x] fail-soft：无 key 时机翻侧显示一次性内联提示、官方侧照显；API/额度错误时该 cue 显示不显眼「翻译失败」占位并静默退避；机翻失败绝不清空官方侧或翻转 toggle。
- [x] SW 翻译/配置 seam 以 mock 的 DeepSeek HTTP + mock storage 单测（批处理、缓存命中/miss、无 key 路径、fail-soft、保时轴）。

## Answer

### Automated evidence

- TDD 覆盖来源决策：官方英文+繁中不调用 MT；英文单轨补 zh-Hant；繁中单轨补英文；简中经 OpenCC 转 zh-Hant；官方英文+简中优先 OpenCC、不调用 MT。既有 overlay 行模型继续保证只有 MT 行显示 badge，OpenCC 行按非 MT 来源接入。
- 翻译 seam 覆盖播放头附近 batch 优先、固定每批最多 8 cue、译文保留原 `start/end`、无 key fail-soft、mock OpenAI-compatible 成功/格式失败、429/5xx 最多三次请求及可取消退避。controller 复用 Ticket 03 generation guard，并在 seek、reset、video replacement、销毁和设置变化时 abort 旧请求；旧 generation/revision 响应不合并。
- 配置 seam 覆盖 DeepSeek / OpenAI-compatible / 本地 provider；云端仅 HTTPS，HTTP 仅 `localhost` / `127.0.0.1` / `[::1]`，URL 禁止内嵌凭据。自定义 HTTPS host permission 仅在 Options 用户手势下按配置 hostname 请求；manifest 没有 `<all_urls>`。API key 使用 `type=password`，只存 `chrome.storage.local`，错误文本与日志不回显 key。
- IndexedDB seam 覆盖 hit/miss 与容量 LRU；SHA-256 cache key 绑定 content、track、归一化源文本、target language、provider、完整 endpoint（含端口/路径）与 model；失败占位和凭据不入缓存。
- 最终 `npm test`：15 files / 43 tests passed；`npm run check`、`npm run build`、`git diff --check` 全部通过。构建 manifest 已检查无 `<all_urls>`；构建产物的 secret-pattern scan 无命中。OpenCC 1.4.1 的当前 API 经 ctx7 核对，许可证为 MIT AND Apache-2.0；词典仅打入 service worker，四站 content script 保持约 28–38 kB。
- 2026-07-24 合并验收按 DeepSeek 官方当前文档更新默认 OpenAI base URL 为 `https://api.deepseek.com`、模型为 `deepseek-v4-flash` / `deepseek-v4-pro`，并对旧 `/v1` 与已弃用模型名做无损迁移。翻译请求显式关闭 V4 默认思考模式，按官方 JSON Output 约定使用含 JSON 样例的字幕 system prompt、`response_format: {"type":"json_object"}` 与 `max_tokens`；对应 red → green 回归后，合并树全量为 26 files / 77 tests passed。

### Human evidence

- **PARTIAL**：用 Computer Use 加载合并版 unpacked extension，设置页显示迁移后的 DeepSeek base URL 与 `deepseek-v4-flash`，既有 API key 仅以掩码显示。临时把表单改为 loopback 假端点与假 key：服务在线时显示「連線成功」，停止服务后显示「連線失敗（網路或 CORS）」；重新打开设置页后，真实配置恢复且未被覆盖。为避免未经明确授权重新保存或发送真实密钥，本次没有点击带真实 key 的「儲存」，也没有由代理发起真实 DeepSeek 请求。
- `NOT RUN`：未找到并播放可用的 Prime 英文单轨、繁中单轨或简中单轨内容，因此 MT/OpenCC 真机 fallback 未验收。
- `NOT RUN`：未在真实官方中英双轨内容上观察本构建的 service-worker 网络面，故“双轨场景零 MT 请求”只有纯来源决策与 controller 行为证据，没有真机网络证据。

### Waived / not-run gates

- 无 WAIVED。保存→重开、真实单轨 MT/OpenCC 与双官方轨零 MT 请求等必需 gate 仍未完整通过，故本票保持 `Status: claimed`，不得标记 resolved；map 的 Decisions so far 也不追加。
