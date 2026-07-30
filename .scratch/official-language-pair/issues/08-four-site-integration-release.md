# 08 — 四站集成与发布收口

**What to build:** 在四张站点票均完成后，以 fresh build 对官方语言选择功能做统一集成、隐私、打包和真人证据收口。只有自动证据与所有必需 logged-in human gates 一致通过时，才能宣布任意官方语言对功能完成。

**Blocked by:** 04 — Prime Video 任意官方语言对；05 — Netflix 任意官方语言对；06 — Max 任意官方语言对与受控对齐；07 — YouTube 创作者官方语言对。

**Status:** resolved

- [x] 四站使用同一 Official Pair seam、动态选择器、selection generation 和 fail-closed 状态语义。
- [x] fresh install 默认保持 `en` 上、`zh-Hant` 下；用户保存的非默认 pair 在重启后恢复，但仅在当前节目可用时激活。
- [x] 全量自动测试、类型检查、生产构建、release archive 与最小权限检查通过。
- [x] 发布产物中没有静态全语言列表、调试标记、真实签名 URL、token、观看数据或 proprietary 字幕内容。
- [x] 隐私与产品文档明确两行均来自当前账号可用的官方字幕，手动官方路径不会调用任何翻译服务。
- [x] Prime、Netflix、Max、YouTube 各自的 logged-in human gate 证据可追溯到最终同一构建。
- [x] 最终报告明确分开 automated、logged-in human、environmental waived 与 not run；not run 不得写成 passed。
- [x] 逐站验证关闭 DuetSub 后 overlay 消失、原生字幕和菜单状态恢复。
- [x] 对既有 MT 实现、旧 tracker 票据和用户未跟踪逆向材料不做顺手清理或状态改写。

## Answer

Runtime candidate `fa0989e` is the human-gated feature-branch commit. Its
`.output/chrome-mv3` directory was synchronized to and then compared byte-for-byte
with the unpacked directory loaded by Chrome. Prime Video, Netflix, Max and
YouTube were all rechecked from that exact build after the final shared
language-matching and resolved-language display fixes.

The integration merge into `main` also preserved the multilingual extension UI
that had landed there independently. The merged result passed the automated
release gates below. Logged-in playback evidence remains attributed only to
`fa0989e`; the post-merge build was not relabeled as a same-build human gate.

### Automated

- `npm test` — **PASS**, 48 test files / 224 tests.
- `npm run check` — **PASS**.
- `npm run release:build` — **PASS**; Chrome MV3 standalone archive, stable
  extension ID and exact permission allowlists verified.
- `npm run store:build` — **PASS**; store archive has no `manifest.key` and the
  same least-privilege host boundary.
- `npm audit --omit=dev` — **PASS**, 0 vulnerabilities.
- `git diff --check` — **PASS**.
- Artifact scan — **PASS**: no embedded user Workspace ID, API-key/Bearer/JWT
  shape, materialized signed query credential, known viewing identifier,
  logged-in subtitle sample, direct debug statement, source map, proprietary
  research file or static all-language catalog.
- Standalone archive SHA-256:
  `67f9a1177d4d5a18bfaa67b4125c550532ff5190c9d7d94ec0cb3a3adeb9c066`.
- Chrome Web Store archive SHA-256:
  `98312d9bd549c3e6c7baee46e3076a62465ba9dc19f978b7dc5e29135d82719d`.

### Logged-in human

- Prime Video — **PASS**: final build recovered through
  `重新載入官方字幕` to `en-US` top / `zh-Hant` bottom at 100%; real seek,
  toggle-off native restoration and toggle-on recovery passed. The same branch
  had already completed the non-default `ja-JP + zh-Hans` gate and
  episode/video-replacement fail-closed check.
- Netflix — **PASS**: episode 8 resolved to `en` top / `zh-Hant` bottom at 100%;
  real seek, overlay removal, `.player-timedtext` restoration and re-enable
  passed. The live route was the verified menu fallback; manifest fast path was
  not claimed as observed.
- Max — **PASS**: S1E1 resolved to `en-US` top / `zh-Hant-TW` bottom at 100%;
  seek and toggle/native restoration passed while the video stayed
  `readyState=4`, visible and error-free. Earlier same-branch evidence also
  covered non-English/Chinese `id + th` original timing and episode replacement.
- YouTube — **PASS**: two TED videos independently resolved to creator-official
  `en` top / `zh-Hant` bottom at 100%; real seek, native caption-container
  restoration, re-enable and cross-video stale ownership passed.

### Gate classification

- Automated: **PASS**.
- Logged-in human: **PASS** for the four final-build site regressions above.
- Environmental waived: **none**.
- NOT RUN: advertisements on all four sites; Netflix live manifest fast path on
  the final build; a naturally occurring YouTube one-time re-prime. None is
  recorded as passed or waived.

The manual Official Pair path never invokes MT, OpenCC, ASR or platform
translation. Existing optional translation code, old tracker tickets and the
user's untracked reverse-engineering material were not cleaned up or rewritten.
