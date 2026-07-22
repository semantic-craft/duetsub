# 04 — 机翻兜底 + 设置页（DeepSeek + 缓存 + OpenCC）

**What to build:** 当片子只有单侧官方轨时补齐缺失一侧——机翻、OpenCC 简→繁——配一个可用的设置页、内容寻址缓存、fail-soft 降级。（按 §I：**统一 OpenAI 兼容端点**——默认 DeepSeek 云端，也支持本机 Ollama/LM Studio。）

**Blocked by:** 02 — Prime Video 官方双轨。（与 03 正交，可并行。）

**Status:** ready-for-agent

- [ ] 设置页可选供应商（DeepSeek 云端 / OpenAI 兼容 / 本地）并填 Base URL·key(掩码)·模型，存 `chrome.storage.local`；SW 按 OpenAI 兼容协议统一调用；key 不写日志、除发往用户所配端点外不外发；本地端点走 `http://localhost/*` host_permission 并处理无鉴权/CORS；「测试连接」可校验端点。
- [ ] 英文单官方轨 → DeepSeek 出繁中；中文单官方轨 → DeepSeek 出英文；仅简中官方轨 → OpenCC 出繁中（不机翻）；两侧皆官方 → 不机翻。
- [ ] 机翻行显示内联 `MT` 标记；官方行与 OpenCC 行不标。
- [ ] 整轨 warmup + 按播放头优先级滚动批翻；seek/导航 abort 在途请求；每请求限 N 条 cue；译文沿用源 cue 的 `start/end`（不重对齐）。
- [ ] IndexedDB 缓存 key = `hash(contentId+trackId+源文本+目标语言+模型)`；重看/回拖命中；LRU 容量上限淘汰。
- [ ] fail-soft：无 key 时机翻侧显示一次性内联提示、官方侧照显；API/额度错误时该 cue 显示不显眼「翻译失败」占位并静默退避；机翻失败绝不清空官方侧或翻转 toggle。
- [ ] SW 翻译/配置 seam 以 mock 的 DeepSeek HTTP + mock storage 单测（批处理、缓存命中/miss、无 key 路径、fail-soft、保时轴）。
