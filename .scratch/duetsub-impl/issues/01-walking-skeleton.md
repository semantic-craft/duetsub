# 01 — Walking skeleton: MV3 shell + shared core + toggle（fake cues）

**What to build:** 一个能侧载运行的 MV3（WXT）扩展：在四个目标站的播放器里注入 DuetSub toggle button，点击后**用假 cue 数据**按 SPEC §F 渲染双语 overlay，由真实 `<video>` 时钟驱动。这是让后续每站「变成简单改动」的 prefactor 脊柱：MAIN↔ISOLATED 消息协议、纯 synchronizer（`0ms` `enActive/zhActive` 调度）、overlay 渲染器、toggle reducer。**不含任何真实字幕拦截。**

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] `wxt` 工程构建、Chrome load unpacked 成功；四站 content script 静态声明 `world:"MAIN"` + `run_at:"document_start"`；manifest 只申请 `storage` + 四站 host（**不含 localhost、不用 `<all_urls>`**）。
- [x] 每站真实播放页出现 DuetSub toggle button，默认关，开关状态按站点存 `chrome.storage.local` 并在重进后恢复。
- [x] 开启后渲染英上/繁中下两行 overlay（假 cue），符合 §F：紧凑共享背景板、82%/100% 字号、按容器高度的字号、常态底 `8.5%`/控件出现 `18%`/top 情境 `8%`、不反转行序。
- [x] synchronizer 从真实 `currentTime` 按 `start<=t<end`、`0ms` 计算 `enActive/zhActive`；一对多与单侧 cue 正确显示（纯函数，fixture 单测）。
- [x] toggle reducer 与 overlay 渲染器为纯函数并单测；MAIN↔ISOLATED 消息协议端到端传递假 track/cue。
- [x] 开启时隐藏平台原生字幕层、关闭/reset 时恢复（用每站 selector 占位；真实 selector 留各站 ticket）。
- [x] toggle button 右键/长按 popover 脚手架：**打开设置**可用、**状态读出**占位显示来源/进度、**重新翻译**占位（实际重翻待 ticket 04）。
- [x] 扩展图标（方向：双字幕条）以 16/48/128 提供并接入 manifest（源见 `../icon.svg`）。

## Answer

已完成 WXT/Chrome MV3 walking skeleton：四站各有静态 MAIN stub + ISOLATED core entrypoint；假 `TrackInfo` / `Cue` 经带 request id 的消息协议交付，ISOLATED 用真实 `<video>.currentTime` 驱动纯 synchronizer、overlay 与 toggle reducer。overlay、MT 标记、原生字幕层恢复、站点级 `chrome.storage.local`、右键/长按 popover、占位 options page 和 16/48/128 图标均已接入。

自动验证：`npm test`（3 files / 11 tests）、`npm run check`、`npm run build`、生成 manifest 机器断言、`npm audit --omit=dev` 均通过。最终 unpacked build 在全新 Chrome for Testing profile 的自包含 `<video>` smoke 页通过：默认关；一对多/单侧/top cue 随真实时钟切换；常态 `8.5%`、控件态 `18%`、top `8%`；MT 可见；原生层开时隐藏、关时恢复；站点状态刷新后保持；右键/长按 popover 与 options 页可打开。全量 `npm audit` 仍报告 WXT/Vitest 构建树中的 10 个 dev-only advisory；生产依赖审计为 0，且 `--force` 建议会把 WXT 降到破坏性旧版本，故未执行。

HITL 边界：Netflix / Prime Video / HBO Max / YouTube 四个真实登录播放页仍需用户做一次 load-unpacked 人工 pass；这里不宣称已登录四站验证。各站真实控制栏插入点与 Prime/YouTube 原生字幕 selector 仍按票面留给后续 adapter ticket。
