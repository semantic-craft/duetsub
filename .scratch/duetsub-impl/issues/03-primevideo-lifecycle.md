# 03 — Prime Video：生命周期健壮性（seek / 广告 / 换集 / generation）

**What to build:** 把 Prime 打磨到在 seek、换集、广告切换、`<video>` 替换下 DuetSub 都正确，并做 `contentGeneration`/`clockGeneration` 记账。**抽出后续站点复用的共享生命周期 helper。**

**Blocked by:** 02 — Prime Video 官方双轨。

**Status:** resolved

- [x] `seeking` 清屏并发 `seek-flush`；`seeked` 在新时钟二分重定位 active cue；同内容 seek 不重取轨。
- [x] 站内换集重枚举轨、重绑新 `<video>`、按 §E/§G reset；overlay 在新内容恢复。
- [x] 广告路径以纯 `ad-suspended` seam fail closed：overlay inactive、原生层恢复、toggle 保持开启，退出必须同时满足可靠信号与节目时钟连续。**Prime 真机广告 gate：环境性 WAIVED（2026-07-22；用户确认当前账号/地区无广告），不是 PASS；未接未验证 selector，也未按时长推断。**
- [x] `contentGeneration`/`clockGeneration` 守卫丢弃过期响应（上一集/旧时钟），不污染当前显示。
- [x] 生命周期 helper（`seek-flush`、`ad-suspended`、原生层隐藏/恢复、generation 守卫）抽入共享 core，供 Max/Netflix/YouTube 复用。

## Answer

### 自动证据

- 新增纯 `playback lifecycle` reducer：seek flush/恢复、content/clock generation、旧 generation 响应拒绝、ad-suspended、可靠广告退出条件、video replacement fail-closed、overlay/native 决策均由行为测试覆盖；测试不依赖内部字段调用次数。
- controller 以 live Prime 标题 + 集标题 identity 驱动 content reset，不使用 pathname；video replacement 先恢复原生层并解绑旧 video，新时钟 ready 后才重新枚举。Prime adapter 为枚举、track request、pending/预取 TTML 响应绑定发起时 generation，过期结果不交付。
- 真机暴露了一个 ticket 02 happy-path 未覆盖的 race：Prime 可能在 DuetSub 发起 track request 前已取回 TTML，之后切换 radio 只复用播放器内存而不再发网络请求。按 TDD 先得到缺少 Prime response inbox 的红测试，再加入最多 8 条、仅内存、以当前官方 radio + generation 绑定的 Prime 专用 inbox；同 generation 预取可消费，换集/换时钟后旧响应不可见。
- 最终复跑 `npm test`：8 files / 26 tests passed；`npm run check`、`npm run build`、`git diff --check` 全部通过，ticket 01/02 回归保持绿色。

### Prime 真机证据

- 在登录态 Prime、sibling worktree 的 `.output/chrome-mv3` 构建上，正常顺播达到 `官方英文 + 官方繁中 · 100%`；同一时刻 overlay 显示英文 `We are losing the light.` 与官方繁中 `把握光線吧`，原生层内容仍在但 `visibility:hidden`。
- 实际拖动 Prime seek bar 后，toggle 保持开启，状态回到 `官方英文 + 官方繁中 · 100%`；新时钟约 `836s` 显示英文 `This mark was left as a trail / for Orcs to follow.` 与繁中 `這個印記是留給半獸人追隨的信號`，且 seek 窗口内 `.ttml2` 请求数为 0。
- 从第 1 集切到第 2 集时，verified identity 暂时为空的过渡阶段状态为“等待可验证的 Prime 内容身份”，两个 overlay 均立即 hidden、toggle 仍开启；identity 变为“第 1 季，第 2 集 随波逐流”后重新达到双轨 100%，新集 cue 可见。
- 再切回第 1 集时媒体源标识已改变；过渡期旧 overlay 为空，完成后仍只有两个已安装扩展各自的一套 toggle/overlay，没有累积旧实例，本分支实例重新双轨 ready。
- 现场同时安装的旧 DuetSub 实例全程保持关闭。沉浸式翻译的“当前网站字幕翻译”会接管同一 Prime seam，验收时按 ticket 02 已记录边界临时关闭，结束后已恢复；两个 DuetSub toggle 也恢复为关闭。

### 环境性 waiver

- 当前账号/地区没有出现真实广告，用户明确批准把“真实广告进入/退出验证”记为环境性 **WAIVED**。本票只保留已测试的 fail-closed `ad-suspended`/可靠退出 seam；没有把隐藏语义节点、猜测 selector 或播放时长当成广告证据。
