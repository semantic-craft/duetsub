# DuetSub 官方双语语言选择差量规范

Status: design-ready, implementation not started
Date: 2026-07-30
Baseline: `v0.1.6` / `1f77a34`

## 1. 结论

该功能可行，且不需要改变 DuetSub 的 DRM、网络或视频边界。

四站适配器已经用 `TrackInfo.language` 承载 BCP-47 语言标签，并能按轨道句柄取得字幕。主要改动集中在共享选择、生命周期、控制器、overlay 和播放器内菜单；Prime 与 Netflix 另需泛化语言元数据识别，Max 与 Prime 的英中专用对齐逻辑需退出默认路径。

本规范锁定以下产品定义：

- 两行都必须来自当前账号、当前节目实际提供的 `official` 字幕轨。
- 用户分别选择上方语言和下方语言，例如官方日语 `ja` 在上、官方简体中文 `zh-Hans` 在下。
- 任一所选语言不存在时，双语 overlay 不显示，原生字幕立即恢复，并明确提示缺失项。
- 本路径不使用 MT、OpenCC、ASR、YouTube platform MT，也不隐式回退到英语或繁体中文。
- 现有 MT 实现暂时保留，但与手动官方语言对完全隔离；删除 MT 不属于本次范围。
- 主选择界面只展示当前节目真实枚举出的官方语言。静态“全世界语言列表”不作为主界面。

## 2. 当前实现差距

底层轨道合同已经是通用语言模型，见 `src/core/contracts.ts`；但以下层仍把双语固定为 English / Traditional Chinese：

- `src/core/track-selection.ts`：选择结果、缺失侧、MT 目标和语言匹配写死为 `en` / `zh-Hant`。
- `src/content/controller.ts`：cue、状态、翻译计划和渲染输入写死为 `english` / `chinese`。
- `src/core/overlay-model.ts`、`src/content/overlay-view.ts`：行 id、`lang`、字体和 CSS 类写死。
- `entrypoints/options.html`：只有翻译端点设置，没有官方语言偏好。
- `src/adapters/max-cue-alignment.ts` 与 Prime 的 pair filter：把 English 当主轨、Chinese 当副轨。

因此，这不是只增加两个 `<select>`；需要先把“语言角色”和“画面位置”解耦。

## 3. Ubiquitous language

- **Official Track Catalog**：当前账号、当前节目、当前内容 generation 下，经站点适配器验证的官方字幕轨目录。
- **Language Pair Preference**：用户保存的 `{ top, bottom }` BCP-47 偏好。
- **Track Variant**：同一语言的普通字幕、CC/SDH 等官方变体。
- **Resolved Pair**：从 Official Track Catalog 为 top / bottom 各解析出的唯一官方轨。
- **Selection Generation**：语言偏好版本；用于让旧语言请求在切换后失效。
- **Pair Alignment Policy**：特定站点、特定语言对经过真人证据批准后才允许启用的时序对齐策略。

## 4. 产品规则

### 4.1 目录与选择

1. 目录只收录 `track.source === 'official'` 且非 forced-only 的字幕轨。
2. UI 按 canonical BCP-47 语言去重；同语言的轨道变体由解析模块选择，不把技术轨道 id 暴露为普通设置。
3. top 与 bottom 不能是相同 canonical tag。
4. `zh-Hans` 与 `zh-Hant` 是不同选择，可以同时使用。
5. 当前节目的目录变更时重新解析已保存偏好；不得预测下一节目或其他站点的可用语言。
6. 已保存偏好不可用时保留偏好值，但本次播放 fail closed，等待用户从当前目录重新选择。

### 4.2 官方轨变体优先级

同一 canonical language 有多个官方轨时：

1. 普通字幕优先于 CC/SDH；
2. forced-only 永不参与；
3. 其余同级按 adapter 提供的稳定目录顺序选择；
4. 只有已记录真人证据证明某站点的 CC 是可靠对齐主轨时，内部站点 policy 才可覆盖第 1 项。

`TrackInfo` 应增加结构化字段，不再从 label 猜变体：

```ts
type OfficialTrackKind = 'subtitles' | 'closed-captions';

interface TrackInfo {
  id: string;
  language: string;
  source: 'official' | 'asr' | 'platform-mt';
  label: string;
  kind: OfficialTrackKind;
}
```

## 5. BCP-47 规则

1. 只用 `Intl.getCanonicalLocales` 校验并 canonicalize；无效标签不进入目录。
2. 存储保留 canonical tag，不擅自补写 script 或 region。
3. 匹配顺序：
   - exact canonical tag；
   - 相同 language + 相同显式 script，region 不同；
   - 偏好未指定 region/script 且候选只有一个无歧义 script family 时，允许 base-language 匹配。
4. Chinese 必须 script-safe：
   - `zh-CN` / `zh-SG` 可与 `zh-Hans` 归入同一兼容组；
   - `zh-TW` / `zh-HK` / `zh-MO` 可与 `zh-Hant` 归入同一兼容组；
   - `zh-Hans` 不得匹配 `zh-Hant`；
   - 裸 `zh` 不默认解释为简中或繁中。若目录同时存在多个中文 script family，则返回歧义，不猜。
5. 其他同 base language、不同 script 的组合（例如 `sr-Latn` / `sr-Cyrl`）同样不得互配。

## 6. 深模块与 interface

新增 `src/core/official-pair-selection.ts`。它隐藏目录过滤、BCP-47 匹配、变体排序、站点 policy 和失败原因；controller 与测试只跨这一个 seam。

```ts
type CanonicalLanguageTag = string;

interface LanguagePairPreference {
  readonly version: 1;
  readonly top: CanonicalLanguageTag;
  readonly bottom: CanonicalLanguageTag;
}

interface OfficialLanguageOption {
  readonly language: CanonicalLanguageTag;
  readonly label: string;
}

type OfficialPairResolution =
  | {
      readonly kind: 'ready';
      readonly catalog: readonly OfficialLanguageOption[];
      readonly top: TrackInfo;
      readonly bottom: TrackInfo;
    }
  | {
      readonly kind: 'unavailable';
      readonly catalog: readonly OfficialLanguageOption[];
      readonly reason:
        | 'same-language'
        | 'top-missing'
        | 'bottom-missing'
        | 'both-missing'
        | 'ambiguous-language';
    };

function resolveOfficialPair(input: {
  readonly siteId: SiteId;
  readonly tracks: readonly TrackInfo[];
  readonly preference: LanguagePairPreference;
}): OfficialPairResolution;
```

模块返回 discriminated union，不返回带多个 optional 字段的布尔对象。语言显示名由 `Intl.DisplayNames` 生成，adapter 的官方 label 只作后备展示，不参与跨语言猜测。

## 7. 存储与迁移

- 新键：`duetsub:official-language-pair:v1`
- 存储：`chrome.storage.local`
- 结构：`{ version: 1, top: 'en', bottom: 'zh-Hant' }`
- 未找到新键时，内存默认值为现有行为 `en` 上、`zh-Hant` 下；用户首次保存时再写入，不做启动时隐式写迁移。
- 现有 `duetsub:enabled:<site>` 与翻译端点设置保持不变。
- v1 不增加按站点或按节目覆盖。用户最后一次选择成为全局偏好；每个节目仍以自己的 Official Track Catalog 判定是否可用。

语言偏好不进入 `chrome.storage.sync`，不改变当前“设置保留在本机”的隐私承诺。

## 8. 播放器内交互

主入口复用 `src/content/toggle-view.ts` 已有的长按/右键 popover：

- 显示“上方字幕”和“下方字幕”两个选择器；
- 选项只来自当前 Official Track Catalog；
- bottom 列表禁用与 top 完全相同的 canonical tag，反之亦然；
- 提供“交换上下”操作；
- 显示官方 track label 和规范化语言名，但不显示 ASR / MT 候选；
- 只有两侧均有效时才保存并开始取轨。

打开 popover 时允许执行 **catalog-only enumeration**。该过程可以短暂操作站点字幕菜单，但必须恢复菜单与原字幕选择，且不得隐藏原生字幕或启用 overlay。

Options page 的角色：

- 显示当前保存的全局上/下偏好；
- 提供恢复默认值；
- 说明实际可用语言要在播放当前节目时选择；
- 不维护静态全语言 picker，也不承诺某语言在任一节目可用。

## 9. 生命周期与并发

`PlaybackGeneration` 增加 `selectionGeneration`：

```ts
interface PlaybackGeneration {
  readonly contentGeneration: number;
  readonly clockGeneration: number;
  readonly selectionGeneration: number;
}
```

选择改变时必须按以下顺序执行：

1. `selectionGeneration += 1`；
2. `tracksReady = false`，清空 overlay；
3. 立即恢复原生字幕；
4. 取消或判旧当前 pair acquisition；
5. 用当前目录解析新 pair；
6. 两轨均取得且 generation 仍一致后，才进入 `tracks-ready` 并隐藏原生字幕。

目录只绑定 `contentGeneration`；选择改变不得丢失同一节目的目录。字幕请求和 pair acquisition 绑定 content + clock + selection 三个 generation。Prime / Netflix / YouTube 的菜单操作必须先恢复旧选择，再允许下一批 acquisition；Max 的旧 fetch 必须 abort。

旧 generation 的成功、失败和状态文案一律不得覆盖新选择。

## 10. Pair alignment

- top 是显示主轨，bottom 是显示副轨；这只是呈现角色，不代表语言价值高低。
- 默认策略是保留两条官方轨各自的原始 cue 区间，由 synchronizer 独立调度。
- 对齐重排只能通过内部 `(siteId, topLanguage, bottomLanguage, trackKind)` 白名单启用。
- 白名单必须来自同一 media time 的真人逐句证据；自动测试不能创建白名单。
- 允许的对齐只能基于 cue 区间重叠和已存在的硬换行，不得固定加减 offset、翻译、改写、语义重排或生成新文本。
- 唯一匹配覆盖率低于既定阈值时，整对 fail closed，不退回未经验证的对齐。
- 当前已验证的 English-primary / Traditional-Chinese 行为作为兼容 policy 保留；其他语言对先走原始时序，真人验证后再决定是否增加 policy。

## 11. Overlay 国际化

`OverlayLineModel` 改为 `top` / `bottom`：

- `lang` 接受动态 canonical BCP-47；
- 已知 RTL language 使用 `dir="rtl"`，其他使用 `ltr`；无法判定时使用 `auto`；
- 每行设置 `unicode-bidi: plaintext`，两行各自隔离方向；
- top 保持 `100%`，bottom 保持 `90%`，与具体语言无关；
- 用 `:lang(...)` 提供 CJK 字体后备：
  - `ja`：Hiragino Sans / Yu Gothic / Noto Sans JP；
  - `zh-Hans`：PingFang SC / Microsoft YaHei / Noto Sans SC；
  - `zh-Hant`：PingFang TC / Microsoft JhengHei / Noto Sans TC；
  - `ko`：Apple SD Gothic Neo / Malgun Gothic / Noto Sans KR；
  - 其余语言：system-ui。

“日语在上、简中在下”应渲染为 top `lang="ja"`、100%，bottom `lang="zh-Hans"`、90%，两行均保留各自官方文本与原始断行。

## 12. 四站可行性

| 站点 | 可复用能力 | 必要改动 | 真人 gate |
|---|---|---|---|
| Prime Video | radio id 可解析通用 BCP-47；现有 batch 可取得任意请求轨并恢复原选择 | 移除英中 pair filter；把变体结构化；label-only 且无机器语言码时 fail closed，不建静态名称字典 | 非默认官方语言对、切换中旧响应、原字幕/菜单恢复 |
| Netflix | manifest 已通用解析 BCP-47；菜单切轨与响应 ownership 已存在 | menu `data-uia` 解析接受通用 BCP-47；不从本地化 label 猜未知语言 | manifest 路径与 menu fallback 各验证一次 |
| Max | DOM id、playbackInfo、MPD、VTT 映射均以通用语言标签工作 | English-primary / Chinese-secondary 退出默认选择；变体 kind 结构化；对齐改白名单 policy | 非英中 pair 的完整映射、原时序和可选对齐 |
| YouTube | creator captions 可枚举与获取任意语言；已有 POT priming 与恢复 | 官方目录严格过滤 ASR 与 platform MT；状态文案通用化 | 同视频两条 creator official captions、POT 后原状态恢复 |

“理论上可解析”不等于站点已通过。每站在 logged-in human gate 完成前，只能把该站记为待验证，不能用自动测试宣称全部语言支持。

## 13. 状态与错误

建议用户可见状态：

- `正在读取当前节目的官方字幕…`
- `可选：日本語、简体中文、Deutsch…`
- `官方日本語 + 官方简体中文`
- `当前节目没有官方日本語字幕`
- `上下字幕不能选择相同语言`
- `无法可靠取得并恢复所选官方字幕`

任何 unavailable / stale / ambiguous / restore failure 都保持原生字幕可见。

## 14. 验证矩阵

### Automated

- BCP-47 canonical、region、script、裸 `zh` 歧义；
- `ja + zh-Hans`、`de + fr`、RTL + LTR；
- 相同 canonical tag 拒绝，`zh-Hans + zh-Hant` 允许；
- 普通字幕 / CC / forced-only 变体优先级；
- ASR、platform MT、OpenCC、MT 均不能进入官方路径；
- top / bottom 缺失与双缺失 fail closed；
- selection change 后旧响应、旧错误、旧状态全部丢弃；
- catalog-only enumeration 不隐藏原生字幕；
- overlay 动态 `lang` / `dir` / 字体与上下字号；
- 四站 adapter 的通用语言元数据解析与恢复合同。

### Logged-in human gates

每站至少选择一个该节目实际存在的非默认官方语言对；优先 `ja + zh-Hans`，若节目不提供则记录实际替代组合。

逐站验证：

1. 当前节目目录与原生菜单一致；
2. 两行文本均来自对应官方轨；
3. 同一 media time 截图/记录两行与原生轨逐句对应；
4. 语言切换时旧字幕不闪回；
5. seek、换集/video replacement 后仍为新选择；
6. 关闭 DuetSub 后 overlay 消失、原生字幕与菜单选择恢复；
7. 缺失语言、歧义和恢复失败均 fail closed。

广告仅在实际出现时验证；当前账号/地区没有广告可记为 environmental waived，不得记为 passed。

## 15. 最小切票顺序

1. Official pair selection module、`TrackInfo.kind` 与纯单测。
2. `selectionGeneration`、旧响应失效和原生字幕恢复。
3. controller / synchronizer / overlay 从 English-Chinese 改为 top-bottom。
4. 本地偏好存储、catalog-only enumeration 与播放器内选择 UI。
5. Prime Video 通用化与真人 gate。
6. Netflix 通用化与真人 gate。
7. Max 通用化、兼容 alignment policy 与真人 gate。
8. YouTube 官方轨过滤与真人 gate。
9. Options 展示、隐私/README/SPEC 差量更新与 release gate。

每张站点票只有 automated gates 和该站 logged-in human gate 均完成后才可 resolved。

## 16. 非目标

- 删除或重写现有 MT 子系统；
- 通过 OpenCC 把简中变繁中；
- ASR 或平台自动翻译；
- 静态全语言列表或跨节目可用性预测；
- 自动下载未向当前账号开放的字幕轨；
- 固定时移、语义猜测、字幕改写；
- 本轮顺带重做字幕视觉主题。
