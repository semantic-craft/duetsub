# 04 架构与技术栈决策

Type: grilling
Status: resolved
Blocked by: —

## Question

锁定扩展骨架，供 spec 直接引用：

1. MV3 结构：service worker / content script / MAIN-world 注入脚本各自职责；`docs/EXTRACTION.md` 提议的 seam（page-realm hook → site adapter → cue 模型 → synchronizer → overlay）是否原样采纳。
2. 注入方式：`content_scripts` 声明 `world: "MAIN"` vs 动态 `chrome.scripting`；`document_start` 时机能否保证在播放器解析字幕清单之前。
3. adapter 接口契约：每站 adapter 对外暴露什么（轨道枚举、cue 流、生命周期事件），统一 cue 模型 `{ start, end, text, language }` 是否够用（样式/位置字段要不要）。
4. 技术栈：TypeScript？构建工具（WXT / CRXJS / 裸 Vite）？（.gitignore 已有 `.wxt/`，倾向 WXT，待确认。）
5. 站与站之间的代码组织：单扩展多 match pattern，还是按站拆 content script。

## Answer

2026-07-21 grilling 会话逐题拍板，六条决策：

### 1. 分层结构：采纳五层 seam + 薄 MAIN world

采纳 `docs/EXTRACTION.md` 的五层 seam（page-realm hook → site adapter → cue 模型 → synchronizer → overlay），映射到 MV3 三执行环境：

- **MAIN world**：只做拦截与转发（patch fetch/XHR/JSON.parse、读播放器全局变量），抓到原始数据即 postMessage 给 ISOLATED 侧；不解析、不做业务判断。
- **ISOLATED content script**：承载核心——site adapter（解析清单/响应、轨道枚举）、cue 归一化、synchronizer（video 时钟调度）、overlay 渲染。
- **Service worker**：只做 DeepSeek API 调用（避开页面 CSP）与翻译缓存持久化；不参与字幕实时路径。

### 2. 注入方式：manifest 静态声明

`content_scripts` 声明 `world: "MAIN"` + `run_at: "document_start"`（Chrome 111+，无兼容问题），按四站 match patterns。声明式注入是唯一保证「先于页面任何脚本执行」的方式，Netflix 的 JSON.parse 包裹与 YouTube 的 fetch/XHR patch 都依赖此时序。不用动态 `chrome.scripting` 注册（存在首次注册窗口期，且自用场景用不上运行时增删站点）。

### 3. cue 模型：四字段 + 可选定位

```ts
interface Cue {
  start: number;        // ms
  end: number;          // ms
  text: string;         // 换行保留 \n
  language: string;     // 归一化 BCP-47
  position?: 'top' | 'bottom';  // 缺省 bottom；保留原生轨的垂直定位意图
}
```

样式字段全部丢弃，由 overlay 统一硬编码。`position: 'top'` 的具体渲染行为是 ticket 05 的输入。轨道级元数据不塞进 cue，另立 `TrackInfo`。

### 4. adapter 契约：枚举+取数在 adapter，选轨策略在核心层

```ts
interface SiteAdapter {
  id: 'netflix' | 'primevideo' | 'max' | 'youtube';
  start(): void;                                        // 装监听，接收 MAIN world 转发
  onTracks(cb: (tracks: TrackInfo[]) => void): void;    // 轨道清单到达（被动）
  onCues(cb: (trackId: string, cues: Cue[]) => void): void; // 截获 cue（被动）
  fetchTrack(track: TrackInfo): Promise<Cue[]>;         // 主动拉取指定轨
  onReset(cb: (reason: 'navigation' | 'episode' | 'seek-flush') => void): void;
}

interface TrackInfo {
  id: string;
  language: string;                              // adapter 负责归一化为 BCP-47
  source: 'official' | 'asr' | 'platform-mt';    // 官方轨 / ASR / 平台自动翻译（如 YouTube tlang）
  label: string;
}
```

`zh-Hant > zh-Hans > 机翻` 与英文侧选择逻辑写在核心层一处，四站共用；adapter 不做选轨。

### 5. 技术栈：TypeScript (strict) + WXT + vanilla DOM

- WXT 管 manifest 生成/构建/HMR；content script entrypoint 直接声明 `world: 'main'` / `runAt: 'document_start'`。（.gitignore 已预留 `.wxt/`、`.output/`。）
- overlay 用 vanilla DOM（两行文本 + `textContent` 直写，约 4Hz 更新），不引 React/Vue/Solid。CRXJS 处于半停滞维护状态，不选；裸 Vite 是重复造轮子，不选。

### 6. 代码组织：单扩展、每站独立 entrypoint、共享 lib/core

```
entrypoints/
  netflix.content.ts / netflix-main.content.ts       # ISOLATED adapter + MAIN hook
  youtube.content.ts / youtube-main.content.ts
  primevideo.content.ts / primevideo-main.content.ts
  max.content.ts / max-main.content.ts
  background.ts                                      # DeepSeek 调用 + 翻译缓存
lib/
  core/   # cue 模型、TrackInfo、选轨策略、synchronizer、overlay、MAIN↔ISOLATED 消息协议
  mt/     # DeepSeek client（经 background）
```

每站 MAIN hook 单独写（Netflix=JSON.parse 包裹、YouTube=fetch/XHR patch，形态本不同），不做「通用拦截器 + 配置」抽象。不采用单 content script 运行时按 hostname 分发。

## Comments
