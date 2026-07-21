# 01 YouTube 字幕体系研究

Type: research
Status: resolved
Blocked by: —

## Question

YouTube 的字幕体系如何支撑「官方中英双轨并行」？需要查清：

1. 轨道枚举：当前网页播放器如何获得可用字幕轨列表（player response 中的 `captions.playerCaptionsTracklistRenderer.captionTracks` 等），每条轨的语言码、`kind`（`asr` = 自动生成）、名称字段长什么样。
2. 字幕获取：`/api/timedtext` 请求的参数与可用格式（json3 / srv3 / vtt），拿到的 cue 结构如何映射到 `{ start, end, text, language }`。
3. 「官方轨」辨别：创作者上传轨 vs ASR 自动生成轨 vs 平台自动翻译轨（`tlang`）三者在数据上如何区分；本项目对 YouTube 的「官方中文/英文轨」应取哪个边界。
4. 注入与时钟：需要 MAIN world 注入吗，还是内容脚本读 DOM/网络即可；播放时钟用哪个元素；SPA 导航（`yt-navigate-finish`）与换视频时如何重初始化。
5. 本仓库 `research/upstream/read-frog/`（subtitles-scheduler.ts、display-rules.ts、subtitle-lines.tsx、types.ts）里对 YouTube 双字幕的实现要点提炼。

产出：`research/findings/youtube-subtitles.md`（含来源链接与本地文件引用）。

## Comments

## Answer

- 轨道枚举靠 player response 的 `captions.playerCaptionsTracklistRenderer.captionTracks`（`languageCode`/`kind`/`vssId`/`name`）；SPA 换视频后来自 `/youtubei/v1/player` XHR，DOM 里没有。
- 字幕用 `/api/timedtext` + `fmt=json3`：`start=tStartMs`，`end=tStartMs+dDurationMs`，`text=segs[].utf8` 拼接；language 取自所选轨元数据。
- 2025 年起部分视频 timedtext 必须带 `pot`（Proof-of-Origin）参数，裸 fetch baseUrl 会拿到空响应 → 必须 MAIN world 注入拦截播放器自己的 timedtext 请求，第二轨改写同一 URL 的 `lang`/`tlang` 参数。
- 官方轨边界建议：官方 = 创作者上传轨（无 `kind` 字段）；ASR（`kind="asr"`）不算官方但可作英文侧降级源；`tlang` 自动翻译轨等同机翻兜底。
- 时钟用 `video.html5-main-video` 的 `currentTime`（timeupdate+seeking）；换视频以 `yt-navigate-finish` 为主信号 + MutationObserver 兜底，重置 cue 缓存。
- 完整调研（含来源与 Read Frog 要点提炼）：[research/findings/youtube-subtitles.md](../../../research/findings/youtube-subtitles.md)
