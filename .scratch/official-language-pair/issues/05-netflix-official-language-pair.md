# 05 — Netflix 任意官方语言对

**What to build:** 在 Netflix 当前节目中，用 manifest 或可验证菜单元数据生成通用官方语言目录。用户选择非默认官方语言对后，两轨在顺播、seek、同页换集和 video replacement 中保持 generation-safe，并在关闭时恢复原生字幕。

**Blocked by:** 03 — 交付动态官方语言选择器。

**Status:** verified

- [x] Netflix manifest 中所有可下载、非 forced-only 的官方文字轨按 canonical BCP-47 进入目录。
- [x] menu fallback 优先解析通用机器语言码；对 Netflix 当前不再携带 `lang` 的菜单，只允许英语、简/繁中文、日语、韩语的明确中英文 label alias，未知本地化 label 继续 fail closed。
- [x] manifest 与 menu 对同一语言的普通字幕、CC/SDH 变体有稳定且无歧义的匹配。
- [x] acquisition 严格取得当前 top/bottom 两轨，不调用 MT、OpenCC、ASR 或平台翻译路径。
- [x] 语言改变、seek、换集和 video replacement 后，旧 TTML 与旧菜单 handle 不可进入当前 pair。
- [x] catalog-only enumeration 与正式 acquisition 均恢复原字幕选项和菜单开合状态。
- [x] 自动证据分别覆盖 manifest 路径、menu fallback、响应 ownership、歧义与恢复失败。
- [x] 登录态真人 gate 使用英语在上、繁体中文在下验证双行、切换、seek、换集、关闭与原字幕恢复。
- [x] 任一所选语言缺失时明确提示该语言不可用，并保持 Netflix 原生字幕可见。

## Verification (verified)

Automated:

- `npm run release:build` — PASS：47 个测试文件、209 个测试，`tsc --noEmit`、Chrome MV3 production zip 与 least-privilege release verification 全部通过。
- `git diff --check` — PASS。
- 实际加载目录与 worktree build 的 `netflix-main.js`、`netflix.js` SHA-256 一致。
- Netflix 定向证据覆盖任意 canonical BCP-47 manifest 目录与 forced-only 过滤、menu 机器码、明确 label alias 与未知 label fail closed、普通字幕与 CC/SDH 唯一匹配、`ja + zh-Hans` top/bottom acquisition、selection/seek/video-replacement stale ownership、catalog/acquisition 恢复，以及恢复失败 fail closed。
- 新增播放器 DOM 重建回归：同一 player/video identity 下，Netflix 移除 DuetSub host 后，controller reconciliation 会重新挂载 toggle 与 overlay。
- 新增缓存字幕回放回归：只重放当前页已记录的签名 OCA 根路径，明确排除 `/range/` 媒体分片并按普通字幕/CC 类型过滤；不保存正文、不新增权限、不接触 DRM。

Logged-in human gate: **PASS**。

- 当前 production build 在《鱿鱼游戏》第 7 集 `/watch/81262757` 通过 menu fallback 暴露 `en`、`zh-Hant`、`zh-Hans`、`ko`、`ja` 五种明确语言；选择英语在上、繁体中文在下后状态为 `官方英语 + 官方繁体中文 · 100%`。
- 第 7 集真实双行包括 `God created man on the sixth day.` / `上帝是在第六天創造了世界上的人類`，以及 seek 后 `Okay. If this is the order we play / the game, the front numbers are better.` / `對，如果是玩遊戲的順序 / 前面的號碼比較有利`；视频始终 `display:block`、`visibility:visible`。
- ±10 秒 seek 会清空过期显示并恢复当前双行；没有旧 generation 字幕串入。
- 关闭 DuetSub 后两条 overlay 均隐藏，`.player-timedtext` 恢复为可见，原生菜单仍勾选 `中文（繁體）`；重新开启后英语/繁中双行恢复，原生层只在双轨 ready 后隐藏。
- 原生“下一集”从第 7 集切到第 8 集 `/watch/81262760` 时，旧 overlay 文本立即清空，transient video replacement 后收敛为 1 个 ready video、1 个 toggle、1 个 overlay，并自动恢复 `100%`。
- 第 8 集 seek 到约 393 秒后真实显示 `He was just an old man you met here.` / `他只是你在這裡 / 第一個認識的老人而已`；最终视觉复核又显示 `-Where the hell are you? / -Chief, can you hear me?` / `-組長，你聽得到我的聲音嗎？ / -你這混小子人在哪裡？`。
- Netflix 专属语言菜单实测宽 `480px`，状态/字段标签 `18px`，选项与操作项 `20px`，下拉框高 `56px`；不再受 Netflix 根字号 `10px` 缩小。
- 本轮未命中 manifest 快路径；真人证据明确来自可验证 menu fallback 与当前页缓存 TTML 回放，不把未观察路径记为通过。
