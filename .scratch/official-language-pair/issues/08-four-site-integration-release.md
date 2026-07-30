# 08 — 四站集成与发布收口

**What to build:** 在四张站点票均完成后，以 fresh build 对官方语言选择功能做统一集成、隐私、打包和真人证据收口。只有自动证据与所有必需 logged-in human gates 一致通过时，才能宣布任意官方语言对功能完成。

**Blocked by:** 04 — Prime Video 任意官方语言对；05 — Netflix 任意官方语言对；06 — Max 任意官方语言对与受控对齐；07 — YouTube 创作者官方语言对。

**Status:** claimed

- [ ] 四站使用同一 Official Pair seam、动态选择器、selection generation 和 fail-closed 状态语义。
- [ ] fresh install 默认保持 `en` 上、`zh-Hant` 下；用户保存的非默认 pair 在重启后恢复，但仅在当前节目可用时激活。
- [ ] 全量自动测试、类型检查、生产构建、release archive 与最小权限检查通过。
- [ ] 发布产物中没有静态全语言列表、调试标记、真实签名 URL、token、观看数据或 proprietary 字幕内容。
- [ ] 隐私与产品文档明确两行均来自当前账号可用的官方字幕，手动官方路径不会调用任何翻译服务。
- [ ] Prime、Netflix、Max、YouTube 各自的 logged-in human gate 证据可追溯到最终同一构建。
- [ ] 最终报告明确分开 automated、logged-in human、environmental waived 与 not run；not run 不得写成 passed。
- [ ] 逐站验证关闭 DuetSub 后 overlay 消失、原生字幕和菜单状态恢复。
- [ ] 对既有 MT 实现、旧 tracker 票据和用户未跟踪逆向材料不做顺手清理或状态改写。
