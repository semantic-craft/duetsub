# 07 — YouTube 创作者官方语言对

**What to build:** 在 YouTube 当前视频中，动态目录只展示两条可取得的 creator official captions。用户选择后完成 POT priming、json3 获取、SPA 切换、seek 和原字幕状态恢复；ASR 与 platform MT 不参与该功能。

**Blocked by:** 03 — 交付动态官方语言选择器；既有 07 — YouTube adapter（+ POT priming、ASR/tlang）完成其未通过的真人门禁。

**Status:** claimed

- [x] Official Track Catalog 只接纳无 ASR 标记的 creator captions，排除 `kind=asr` 与所有 `tlang` platform MT 候选。
- [x] 两条所选官方轨的 POT request、track handle 和响应都绑定当前 video、clock 与 selection generation。
- [x] 语言切换期间的旧 POT、旧 json3、200 空体重试和旧状态不得跨 generation 复用。
- [x] POT priming 前记录字幕开关和原 track/off，结束或失败后精确恢复；无法验证恢复时 fail closed。
- [x] SPA 导航、seek 与 video replacement 后重新解析当前视频目录，不保留上一视频语言 handle 或 cue。
- [x] 自动证据覆盖 creator official 过滤、pair 请求、一次 re-prime、状态恢复与 stale response。
- [ ] 登录态真人 gate 在同一视频中取得两条 creator official captions 并显示非默认语言对。
- [ ] 真人 gate 覆盖初始字幕开/关两种状态、原轨恢复、seek、SPA 切换和 POT 不跨 videoId。
- [x] 未完成的广告或 selector 证据不得猜写为通过；没有获批的门禁不得标记 WAIVED。

## Verification status (claimed)

### Automated

- Baseline `a7a366f`: `npm test` PASS（40 files / 159 tests），`npm run check` PASS，`npm run build` PASS。
- TDD red：首轮定向运行出现 6 个预期失败；审计后再以 3 个红测复现无 generation POT 被接纳、导航后仍转发未绑定 POT，以及 URL `kind=asr` 漏网。
- Final: `npm test` PASS（41 files / 164 tests），`npm run check` PASS，`npm run build` PASS，`git diff --check` PASS。
- 运行目录只交付 creator official handles；对象字段或 URL 标记的 ASR，以及 `tlang` platform MT，都不会进入本票 catalog 或 acquisition。
- 两条 creator official 请求复用同一代 POT snapshot；content / clock / selection 任一 generation 不同即判 stale。并发空体只共享一次 re-prime，旧 snapshot 改走新 snapshot，不发起第二次 re-prime。
- MAIN 的 `set-caption-track` generation 随其触发的 timedtext observation 原样返回；无 generation observation fail closed，`yt-navigate-start` 清除关联后不再转发未绑定 POT。旧 json3 在读取响应体后再次校验 generation。
- priming 串行化；同一 video 上旧 generation 先恢复原 track/off，再允许新 generation priming。videoId 已变化时禁止旧恢复。

### Existing blocker

- `.scratch/duetsub-impl/issues/07-youtube-adapter.md` 仍为 `claimed`：旧真人证据只有一次 fail-closed 和一次 SPA partial；真实 POT 双轨、初始字幕开/关、原 track/off、seek 与一次 re-prime 均未通过。

### Logged-in human gates

- **NOT RUN / blocked（2026-07-30）**：已连接真实 Chrome，但自动化安全策略禁止访问扩展管理页，无法加载或核实当前页运行的是本 worktree 的 unpacked build。为避免把未知来源的既有 DuetSub 实例当成本票证据，未继续两条 creator official 视频的播放验收。
- **NOT RUN**：同一视频非默认 creator official pair、初始字幕开启状态、初始字幕关闭状态、原 track/off 精确恢复、seek、SPA、video replacement、POT 不跨 videoId。
- **NOT RUN**：广告与任何新增 selector 证据。
- **WAIVED：无。**

真人 gate 与既有 blocker 均未通过，因此本票保持 `claimed`，不写 `## Answer`，不标记 `resolved`。
