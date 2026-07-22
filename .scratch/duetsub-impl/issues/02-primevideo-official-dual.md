# 02 — Prime Video：官方双轨字幕（happy path）

**What to build:** 在真实 `primevideo.com` 且同时有英文+中文官方轨的片子上，点开 DuetSub 即抓取并渲染**两条官方轨**、与视频同步、隐藏原生层。建 Prime MAIN hook、Prime ISOLATED adapter（菜单枚举 + acquisition batch + `fetchTrack`）、以及**共用 TTML parser**。只覆盖顺播。**首个真实产品 demo。**

**Blocked by:** 01 — Walking skeleton。

**Status:** resolved

- [x] MAIN 在 `document_start` patch fetch/XHR，转发 `cf-timedtext.aux.pv-cdn.net` 的 `.ttml2` 原始响应；ISOLATED 以 XML magic + TTML namespace 校验（不信 MIME）。
- [x] adapter 用播放器菜单（accessible name）枚举字幕轨，label 归一化 BCP-47，标 `source:'official'`。
- [x] `fetchTrack` 驱动 acquisition batch：记录原选项 → 串行切到目标轨 → 恢复原选项；pending DOM handle 是响应归属权威。
- [x] 共用 TTML parser 把去敏最小合法 `.ttml2` fixture 转成 `Cue[]`：毫秒时间正确（clock-time `00:00:22.708`→`22708`）、`<br>/<span>` 文本抽取、position 映射；对该 fixture 单测。
- [x] 核心层按 §C 选出英文+中文官方轨；两轨作为真实双语同步 `#dv-web-player video` 渲染，原生层隐藏。
- [x] 真机双官方轨片子验证：得到两组归属正确、非空、时间合法的 `Cue`，同步显示。

## Answer

### 自动测试 / 构建证据

- 已实现 Prime MAIN fetch/XHR 薄观测、运行时消息校验、Prime `SiteAdapter`、菜单 acquisition batch、共享 TTML parser、官方双轨纯函数选择，并接回 ticket 01 的 toggle / synchronizer / overlay。
- 最终构建复跑 `npm test`：6 files / 18 tests passed；覆盖 TTML clock-time `00:00:22.708 → 22708`、文本/实体/空白/position、官方轨选择、消息畸形 payload，以及 ticket 01 的 synchronizer/toggle/overlay 回归。
- 最终构建复跑 `npm run check`、`npm run build` 均通过。
- 生成 manifest 仍仅有 `storage` + 四站 host；无 `scripting`、`localhost`、`<all_urls>`；四条 MAIN content script 均为 `document_start`。

### 真机 Prime 证据

- 已在登录态 Prime 播放器 live 验证唯一时钟 `#dv-web-player video`、菜单 accessible name `Subtitles and Audio Menu`、English [CC] / 中文（繁體）真实 radio、以及 scoped 原生字幕层 `#dv-web-player .atvwebplayersdk-captions-overlay`。
- 在最终无调试日志构建中，稳定播放后真实点击 DuetSub，约 3 秒到达 `官方英文 + 官方繁中 · 100%`。acquisition 期间收到两个不同 `.ttml2` 资源（HTTP 200；响应 `Content-Length` 分别为 80,154 与 54,299 bytes），实际 parser 的非空、有限、递增时间 Cue 校验全部通过。
- `video.currentTime = 74,521ms` 时 overlay 同步显示英文 `Nobody goes off trail / and nobody walks alone.` 与官方繁中 `不偏離軌道、不特立獨行`；后续无 active cue 时自动清屏。原始选项恢复为 `中文（繁體）`、菜单恢复关闭；双轨 ready 后 scoped 原生层为 `visibility:hidden`。
- 关闭 DuetSub 后 overlay 清屏、同一原生层恢复 `visibility:visible`，原选项与菜单状态不变。
- 完整整集字幕与请求 URL/token 均未落盘；repo 只保存去敏的最小合法 TTML fixture。
- 按用户补充要求，live DOM 还确认沉浸式翻译 quick button 位于 Prime `atvwebplayersdk-nexttitle-button` 的同一父容器并排在其前；DuetSub 采用该稳定插入 seam，不依赖哈希 class、不复制其实现。

### 仍需人工完成的 gate

- ticket 02 无剩余人工 gate；登录态 Prime 双官方轨 gate 已通过。
- 现场还观察到两个不扩大本票的边界：沉浸式翻译同时接管 Prime 字幕时会缓存/改写同一 seam，因此 gate 临时关闭其“当前网站字幕翻译”并在结束后恢复；播放器刚构建且 storage 已为开启时的一次过早自动恢复会 fail-closed，属于 ticket 03 的生命周期/重建范围，明确手动点击 happy path 不受影响。
