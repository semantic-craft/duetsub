# Chrome Web Store listing

## English

### Product name

DuetSub – Bilingual Subtitles

### Summary

Official-first bilingual subtitles for Netflix, Prime Video, Max, and YouTube.

### Detailed description

Watch in two languages without losing the original.

DuetSub is a free and open-source Chrome extension that places two synchronized subtitle languages on one screen. It uses official subtitles whenever possible and lets you choose any two official languages verified for the current title.

Why DuetSub:

- Choose the top and bottom official subtitle languages inside the player.
- Swap the two lines or reload official subtitle tracks without leaving the video.
- Stay synchronized through seeking and in-player episode or video changes.
- Restore the platform's native subtitle layer when DuetSub is disabled.
- Use optional AI fallback only for a missing English or Traditional Chinese line.
- Keep control of the translation endpoint and API key.

Optional fallback supports DeepSeek, Qwen through Alibaba Cloud Model Studio, Doubao through Volcengine Ark, other OpenAI-compatible HTTPS services, and local Ollama or LM Studio endpoints. Two available official tracks never contact a translation service.

Supported players:

- Netflix
- Prime Video
- Max at play.hbomax.com
- YouTube creator-provided captions

The interface is available in English, Simplified Chinese, and Traditional Chinese.

DuetSub uses only subtitle tracks available to the signed-in viewer. It does not download video, bypass DRM, unlock region-restricted tracks, execute remote code, or collect analytics.

## 简体中文

### 产品名称

DuetSub · 双语同幕

### 简短说明

官方字幕优先的双语字幕工具，支持 Netflix、Prime Video、Max 和 YouTube。

### 详细说明

两种字幕，同一画面；理解内容，也保留原文。

DuetSub 是一款免费、开源的 Chrome 扩展，可在同一画面同步显示两种字幕。有官方字幕时永远优先使用官方字幕，并允许你从当前节目真实提供的语言中任选两种。

DuetSub 可以：

- 直接在播放器内选择上方和下方的官方字幕语言；
- 一键交换上下位置或重新载入官方字幕；
- 在拖动进度和站内换集、换视频后继续保持同步；
- 关闭时恢复平台原生字幕；
- 仅在英文或繁体中文字幕缺失时使用可选 AI 补位；
- 由用户自己控制翻译端点和 API key。

可选补位支持 DeepSeek、阿里云百炼千问、火山方舟豆包、其他 OpenAI 兼容 HTTPS 服务，以及本机 Ollama / LM Studio。两条官方字幕可用时不会连接翻译服务。

支持：

- Netflix
- Prime Video
- Max（play.hbomax.com）
- YouTube 创作者提供的字幕

界面支持简体中文、繁体中文和英文。

DuetSub 只使用当前登录账号本来就能访问的字幕轨。它不会下载视频、绕过 DRM、解锁地区限制字幕、执行远程代码或收集行为分析数据。

## 繁體中文

### 產品名稱

DuetSub · 雙語同幕

### 簡短說明

官方字幕優先的雙語字幕工具，支援 Netflix、Prime Video、Max 和 YouTube。

### 詳細說明

兩種字幕，同一畫面；理解內容，也保留原文。

DuetSub 是一款免費、開源的 Chrome 擴充功能，可在同一畫面同步顯示兩種字幕。有官方字幕時永遠優先使用官方字幕，並允許你從目前節目實際提供的語言中任選兩種。

DuetSub 可以：

- 直接在播放器內選擇上方和下方的官方字幕語言；
- 一鍵交換上下位置或重新載入官方字幕；
- 在拖曳進度和站內換集、換影片後繼續保持同步；
- 關閉時恢復平台原生字幕；
- 僅在英文或繁體中文字幕缺少時使用可選 AI 補位；
- 由使用者自行控制翻譯端點和 API key。

可選補位支援 DeepSeek、阿里雲百煉千問、火山方舟豆包、其他 OpenAI 相容 HTTPS 服務，以及本機 Ollama / LM Studio。兩條官方字幕可用時不會連接翻譯服務。

支援：

- Netflix
- Prime Video
- Max（play.hbomax.com）
- YouTube 創作者提供的字幕

介面支援簡體中文、繁體中文和英文。

DuetSub 只使用目前登入帳號原本就能存取的字幕軌。它不會下載影片、繞過 DRM、解鎖地區限制字幕、執行遠端程式碼或收集行為分析資料。

## Version 0.1.6 update notes / 版本 0.1.6 更新说明

### English

- Choose any two verified official subtitle languages available for the current title.
- Adds a dedicated Language menu with top/bottom selection, swap, and official-subtitle reload.
- Improves seeking, episode/video changes, track ownership, and native-subtitle restoration across all four supported players.
- Adds English, Simplified Chinese, and Traditional Chinese interface localization.
- Adds Responses API support for Qwen in China or Singapore and Doubao through Volcengine Ark. Qwen Workspace ID is user-provided, and optional web search is off by default.
- Enlarges the player language menu, with an additional size increase on Netflix.

### 中文

- 可从当前节目真实提供的字幕中任选两种经过验证的官方语言。
- 新增独立“语言”选单，可选择上下字幕、交换位置并重新载入官方字幕。
- 改进四个播放器上的拖动进度、站内换集/换视频、轨道归属与原生字幕恢复。
- 新增英文、简体中文和繁体中文界面。
- 新增阿里云百炼千问（中国区/新加坡区）与火山方舟豆包的 Responses API 支持；千问 Workspace ID 由用户填写，联网搜索默认关闭。
- 放大播放器语言选单，并针对 Netflix 进一步增大尺寸。

## Single purpose

Display two synchronized subtitle languages together on supported video players, using any two verified official tracks available for the current title and an optional user-configured translation endpoint only for a missing English or Traditional Chinese fallback line.

## Permission justifications

### storage

Stores the per-site on/off preference, interface language, official top/bottom language preference, optional translation settings, API key, and local translation cache inside the browser profile.

### Netflix, Prime Video, Max, and YouTube host access

Required to insert the DuetSub player control, observe subtitle responses already available to the signed-in user, synchronize cues to the current video, and render or restore subtitle layers.

### Optional HTTPS host access

Allows a user to authorize the exact HTTPS translation host configured in settings. No HTTPS translation host is granted at install time; Chrome prompts only after the user clicks Save or Test.

### Optional loopback host access

Allows a user to authorize a local OpenAI-compatible service on `localhost`, `127.0.0.1`, or `[::1]`. No loopback origin is granted at install time.

## Remote code

DuetSub does not execute remotely hosted code. Translation services return subtitle text data only.

## Privacy policy

https://github.com/semantic-craft/duetsub/blob/main/PRIVACY.md

## Category

Productivity

## Languages

English, Simplified Chinese, and Traditional Chinese.
