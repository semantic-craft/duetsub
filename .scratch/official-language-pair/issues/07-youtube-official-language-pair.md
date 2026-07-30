# 07 — YouTube 创作者官方语言对

**What to build:** 在 YouTube 当前视频中，动态目录只展示两条可取得的 creator official captions。用户选择后完成 POT priming、json3 获取、SPA 切换、seek 和原字幕状态恢复；ASR 与 platform MT 不参与该功能。

**Blocked by:** 03 — 交付动态官方语言选择器；既有 07 — YouTube adapter（+ POT priming、ASR/tlang）完成其未通过的真人门禁。

**Status:** resolved

- [x] Official Track Catalog 只接纳无 ASR 标记的 creator captions，排除 `kind=asr` 与所有 `tlang` platform MT 候选。
- [x] 两条所选官方轨的 POT request、track handle 和响应都绑定当前 video、clock 与 selection generation。
- [x] 语言切换期间的旧 POT、旧 json3、200 空体重试和旧状态不得跨 generation 复用。
- [x] POT priming 前记录字幕开关和原 track/off，结束或失败后精确恢复；无法验证恢复时 fail closed。
- [x] SPA 导航、seek 与 video replacement 后重新解析当前视频目录，不保留上一视频语言 handle 或 cue。
- [x] 自动证据覆盖 creator official 过滤、pair 请求、一次 re-prime、状态恢复与 stale response。
- [x] 登录态真人 gate 在同一视频中取得两条 creator official captions 并显示非默认语言对。
- [x] 真人 gate 覆盖初始字幕开/关两种状态、原轨恢复、seek、SPA 切换和 POT 不跨 videoId。
- [x] 未完成的广告或 selector 证据不得猜写为通过；没有获批的门禁不得标记 WAIVED。

## Answer

- YouTube Official Track Catalog 只保留 creator official caption handles；对象字段或 URL 中的 `kind=asr`、所有 `tlang` platform MT 与无 generation observation 均 fail closed。
- POT snapshot、请求 handle、json3 响应和一次性 re-prime 绑定 content/clock/selection generation；导航或选择变化后旧 POT、旧空体重试、旧 cue 和旧状态不能进入当前视频。
- priming 前后的原生字幕 track/off 状态按序恢复；恢复无法验证时不显示 overlay。动态语言菜单只显示当前视频可取得的官方目录。

### Automated

- Final runtime candidate `fa0989e`: `npm test` **PASS**（47 files / 220 tests），`npm run check` **PASS**，`npm run release:build` **PASS**，`npm run store:build` **PASS**，`git diff --check` **PASS**。
- TDD 覆盖无 generation POT、导航后未绑定 POT、对象字段与 URL `kind=asr`、`tlang`、并发空体一次 re-prime、恢复序列和跨 videoId stale ownership。
- 运行目录只交付 creator official handles；对象字段或 URL 标记的 ASR，以及 `tlang` platform MT，都不会进入本票 catalog 或 acquisition。
- 两条 creator official 请求复用同一代 POT snapshot；content / clock / selection 任一 generation 不同即判 stale。并发空体只共享一次 re-prime，旧 snapshot 改走新 snapshot，不发起第二次 re-prime。
- MAIN 的 `set-caption-track` generation 随其触发的 timedtext observation 原样返回；无 generation observation fail closed，`yt-navigate-start` 清除关联后不再转发未绑定 POT。旧 json3 在读取响应体后再次校验 generation。
- priming 串行化；同一 video 上旧 generation 先恢复原 track/off，再允许新 generation priming。videoId 已变化时禁止旧恢复。

### Logged-in human gate

- **PASS** on 2026-07-31 with the unpacked directory byte-identical to runtime candidate `fa0989e`.
- TED `iG9CE55wbtY` resolved to `官方英语 + 官方繁体中文 · 100%`; the actual menu values were `en` on top and `zh-Hant` below, and both displayed lines updated from creator official captions.
- A real seek-slider key action advanced playback from about `828s` to `835s`; the next displayed pair belonged to the new media time and no old cue flashed back.
- Disabling DuetSub removed both overlay lines and restored the native caption container to `display:block`, `visibility:visible`; re-enabling restored the official pair.
- Navigating the same tab to TED `Mh3_wYHdeVs` cleared the previous video's state. The new video independently reached `官方英语 + 官方繁体中文 · 100%`, exposed a smaller video-specific official catalog, and displayed new English/Traditional-Chinese lines without old-video leakage.
- A previous integration-branch logged-in run covered a non-default pair, native-caption-on/off and SPA lifecycle; the final candidate repeated off-state restoration, seek and cross-video ownership. No one-time re-prime was artificially triggered.

Ads and a naturally occurring one-time re-prime: **NOT RUN**. **WAIVED: none.**
