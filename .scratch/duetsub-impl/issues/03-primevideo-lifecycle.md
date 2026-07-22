# 03 — Prime Video：生命周期健壮性（seek / 广告 / 换集 / generation）

**What to build:** 把 Prime 打磨到在 seek、换集、广告切换、`<video>` 替换下 DuetSub 都正确，并做 `contentGeneration`/`clockGeneration` 记账。**抽出后续站点复用的共享生命周期 helper。**

**Blocked by:** 02 — Prime Video 官方双轨。

**Status:** ready-for-agent

- [ ] `seeking` 清屏并发 `seek-flush`；`seeked` 在新时钟二分重定位 active cue；同内容 seek 不重取轨。
- [ ] 站内换集重枚举轨、重绑新 `<video>`、按 §E/§G reset；overlay 在新内容恢复。
- [ ] 广告切换触发 fail-closed `ad-suspended`：隐藏 overlay、恢复原生层；仅当已验证广告信号退出且节目时钟连续才恢复。**真机广告验证。**
- [ ] `contentGeneration`/`clockGeneration` 守卫丢弃过期响应（上一集/广告期），不污染当前显示。
- [ ] 生命周期 helper（`seek-flush`、`ad-suspended`、原生层隐藏/恢复、generation 守卫）抽入共享 core，供 Max/Netflix/YouTube 复用。
