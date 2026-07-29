# Map: DuetSub 双字幕实现就绪 spec

Label: wayfinder:map
Created: 2026-07-21

## Destination

一份实现就绪的 spec（`docs/SPEC.md`）：四站（Netflix / Prime Video / HBO Max / YouTube）双字幕 Chrome 扩展的全部关键决策锁定——架构、每站 adapter 方案、双轨选择与机翻兜底规则、overlay UI、验证方式——后续实现会话可直接开工，无需再做任何决策。实现本身不在本 map 内。

## Notes

- 领域：Chrome MV3 扩展；流媒体字幕拦截与双语并行渲染。既有研究见 `docs/EXTRACTION.md` 与 `research/upstream/`（NflxMultiSubs=MIT、DualSubs=Apache-2.0、Read Frog=GPL-3.0）、`research/proprietary/`（沉浸式翻译，仅本地研究）。
- 会话技能：决策类 ticket 用 /grilling + /domain-modeling；UI 类用 /prototype；调研类用 /research 子代理。
- 面向用户的叙述用中文。
- 制图时已锁定的立场（非 ticket，直接生效）：
  1. 纯规划——map 产出 spec，不做实现。
  2. 四站全入 spec；YouTube 研究空缺由 ticket 01 补。
  3. 仅自用侧载（load unpacked），不进 Chrome Web Store。许可证红线仅一条：`research/proprietary/` 的沉浸式翻译提取物不得进入 runtime 代码；GPL 参考源可自由参考。
  4. 官方双轨优先；只有单官方轨时机翻兜底补齐另一语言。
  5. 用户账号固定新加坡区；Prime Video 走 `www.primevideo.com` 国际站（storefront 显示 region/eu），adapter match pattern 与字幕请求形态需实测验证。
  6. 中文轨优先级硬编码：`zh-Hant > zh-Hans > 机翻兜底`，不做设置界面。
  7. 只支持桌面 Chrome 网页版播放器。

## Decisions so far

<!-- 每张已关闭 ticket 一行：gist + 链接 -->

- [01 YouTube 字幕体系研究](issues/01-youtube-subtitle-research.md) — 轨道枚举走 player response 的 captionTracks，字幕取 timedtext json3；2025 起 POT token 使裸 fetch 失效，须 MAIN world 拦截播放器请求并改参取第二轨；官方轨 = 创作者上传轨（无 kind），ASR 仅作降级、tlang 归入机翻兜底。详见 `research/findings/youtube-subtitles.md`。
- [02 机翻兜底引擎选型调研](issues/02-mt-engine-research.md) — 一集 ~35k 字符；MS Edge 免费端点（无额度、直出 zh-Hant、批量原生）与 Azure F0 2M/月最宽裕，DeepL/Google 各 500K/月≈14 集，付费 LLM 兜底 ~$0.015/集；Read Frog 的「整集 warmup + 滚动补翻 + IndexedDB 哈希缓存」是现成参数模板。详见 `research/findings/mt-engines.md`。
- [03 测试素材与真实请求样本](issues/03-test-titles-capture.md) — SG 真机样本锁定 Netflix=sin001 OCA TTML/IMSC、Prime=`.ttml2`、HBO Max=`play.hbomax.com` + WebVTT；三站原生 `textTracks` 均为空，Max 现用 `caption_renderer_overlay` 且换集会替换 video，Prime 旧 `GetPlaybackResources.subtitleUrls` seam 已不再可见。
- [04 架构与技术栈决策](issues/04-architecture-stack.md) — 采纳五层 seam + 薄 MAIN world（拦截转发归 MAIN、adapter/同步/渲染归 ISOLATED、DeepSeek+缓存归 SW）；manifest 静态声明 `world:"MAIN"` + `document_start`；cue 模型四字段 + 可选 `position:'top'|'bottom'`；选轨策略在核心层、adapter 只管枚举+取数+归一化；TS(strict) + WXT + vanilla DOM overlay；单扩展、每站一对 entrypoint（ISOLATED+MAIN）、共享 lib/core。
- [05 双字幕 overlay UI 原型](issues/05-overlay-ui-prototype.md) — 英文上/繁中下（间距 `0.10em`，字号比 82:100）；采用繁体优先字形与紧凑共享背景板；常态底部 `8.5%`、控件出现整组抬至 `18%` 并隐藏平台原生字幕；机翻行加内联 `MT`；任一 cue 为 top 时整组置顶 `8%` 且不反转行序。
- [06 机翻兜底细则](issues/06-mt-fallback-policy.md) — DeepSeek deepseek-chat + 用户自备 key（仅云端）；来源链 `zh-Hant > OpenCC(zh-Hans) > MT(en→zh-Hant)`，英文侧 `官方 > MT(zh→en)`，双向补齐、两侧皆官方则不翻；整轨 warmup + 滚动补翻、逐 cue 保时轴、IndexedDB 内容寻址缓存 + LRU；失败 fail-soft 不阻塞官方轨。细则在 `docs/SPEC.md` §C/§D 就地拍板。
- [07 四站 adapter 方案逐站锁定](issues/07-site-adapters.md) — Netflix/Prime 采用 DOM 枚举与自动切轨兜底，Max 必须取得完整 playlist/API、YouTube 自动 prime POT；双轨按原区间 `0ms` 调度，seek/广告 fail closed，实施顺序为 Prime → HBO Max → Netflix → YouTube。
- [08 汇总撰写 docs/SPEC.md](issues/08-write-spec.md) — 终点 ticket 完成：四站实现就绪 spec 落地 `docs/SPEC.md`（架构/契约/选轨链/机翻兜底/overlay/四站 adapter/新增 toggle button/新增 cloud-key options page/测试 seam/实现顺序）。map 到达 destination。

## Not yet specified

（均已在 `docs/SPEC.md` 就地拍板；destination 已达成。）

- ~~只有简中官方轨时是否用 OpenCC 转繁显示~~ → SPEC §C：用 OpenCC 转繁显示、不加 `MT` 标记（标注为「可否决」）。
- ~~机翻结果的缓存粒度与性能预算~~ → SPEC §D：IndexedDB 内容寻址缓存（key = hash(contentId+trackId+源文本+目标语言+模型)）+ LRU 容量上限；整轨 warmup + 滚动补翻、每请求限 N 条 cue。

## Out of scope

- Chrome Web Store 发布、隐私政策、GPL 合规工程（仅自用侧载，见 Notes 立场 3）。
- App / TV / 非 Chrome 浏览器端。
- 下载视频、绕过 DRM、解锁地区限制轨道、上传观看数据（README 产品红线，不重开）。
- 中英以外的语言对。
- 实现工作本身（destination 是 spec；实现是下一张 map 或直接 /implement）。
