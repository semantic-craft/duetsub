# 03 — 交付动态官方语言选择器

**What to build:** 在播放器内交付用户可操作的上方/下方语言选择器。选项只来自当前节目的 Official Track Catalog；有效选择即时重载并保存为全局本地偏好，Options 页面可查看和恢复默认值。

**Blocked by:** 02 — 贯通固定非默认官方语言对 tracer。

**Status:** resolved

- [x] 长按或右键 DuetSub 按钮可打开上方语言、下方语言和交换上下操作。
- [x] 两个选择器只展示当前内容真实枚举的官方语言，不展示静态全语言列表、ASR 或任何翻译候选。
- [x] 完全相同的 canonical tag 不能同时选择；`zh-Hans` 与 `zh-Hant` 可同时选择。
- [x] 只有两侧均有效时才保存并开始 acquisition；最后一次有效选择存入 `chrome.storage.local`。
- [x] 没有已保存值时使用 `en` 上、`zh-Hant` 下的内存默认值，首次启动不做隐式写入。
- [x] 打开选择器可执行 catalog-only enumeration，但不得隐藏原生字幕，并必须恢复站点菜单与原字幕选择。
- [x] 用户改变语言对时立即清空 overlay、恢复原生字幕；新 pair 双轨 ready 后才能再次隐藏原生字幕。
- [x] Options 页面显示当前全局偏好并可恢复默认，不承诺某语言在其他节目可用。
- [x] smoke 场景可完整演示选择、交换、刷新后恢复、缺轨提示和旧响应失效。

## Answer

- 播放器内既有长按 / 右键 popover 现已显示当前 Official Track Catalog 的上方、下方选择器和交换操作；选择值经公开 Official Pair seam canonicalize，并在两侧均属于当前目录且不相同时才生效。
- 新增 `duetsub:official-language-pair:v1` 本地偏好 seam；缺值或无效值只返回内存默认 `en` / `zh-Hant`，不做启动写入。Options 显示当前全局偏好并通过删除该键恢复默认，不提供静态全语言 picker。
- 打开 popover 可在关闭状态执行 catalog-only enumeration；controller 不进入 tracks-ready、不隐藏原生字幕。现有 Prime / Netflix / Max 目录枚举恢复合同与 YouTube 只读目录合同保持不变。
- 有效选择先递增 `selectionGeneration`、清空 overlay、恢复原生字幕并绑定 adapter 新 generation，再持久化并重新枚举 / acquisition；旧成功、失败、状态和 fake request 均不能覆盖新选择。只有两条官方轨与非空 cue 都属于当前 generation 时才再次 tracks-ready。
- 手动官方语言对走独立 official-only acquisition；未保存偏好时保留现有默认运行路径。未删除或改写 MT、OpenCC、ASR / platform MT，未加入静态语言表，也未实现四站通用语言元数据或真人 gate。
- fake smoke 支持 catalog-only、选择、交换、刷新后本地恢复、默认偏好缺轨 fail closed 和 request ownership；页面写明可复现步骤。

Automated verification:

- `npm test` — PASS，40 个测试文件、159 个测试。
- `npm run check` — PASS。
- `npm run build` — PASS，Chrome MV3 production build。
- `git diff --check` — PASS。

Logged-in human gates: **NOT RUN**。本票只完成共享动态选择器与本地 smoke；没有把自动证据记为 Prime Video、Netflix、Max 或 YouTube 的真人语言对 gate。

未执行：Ticket 04–08 的站点通用化、真人逐句 / 同 media time、seek、换集 / video replacement、广告与 release gate。下一并行 frontier 为 Ticket 04–07。
