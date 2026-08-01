# Chrome Web Store listing

## English

### Product name

DuetSub – Bilingual Subtitles

### Summary

Official-first bilingual subtitles for Netflix, Prime Video, Max, Disney+, and YouTube.

### Detailed description

Watch in two languages without losing the original.

DuetSub is a free and open-source Chrome extension that places two synchronized subtitle languages on one screen. It uses official subtitles whenever possible and lets you choose any two official languages verified for the current title.

Why DuetSub:

- Choose the top and bottom official subtitle languages inside the player.
- Swap the two lines or reload official subtitle tracks without leaving the video.
- Stay synchronized through seeking and in-player episode or video changes.
- Restore the platform's native subtitle layer when DuetSub is disabled.
- Use optional AI for a missing English or Traditional Chinese line, or explicitly retranslate the bottom subtitles into English, Simplified Chinese, or Traditional Chinese from the current top subtitles.
- Keep control of the translation endpoint and API key.

Optional AI translation supports DeepSeek, Qwen through Alibaba Cloud Model Studio, Doubao through Volcengine Ark, other OpenAI-compatible HTTPS services, and local Ollama or LM Studio endpoints. Two available official tracks do not contact a translation service by default; only the explicit **Use AI to retranslate bottom subtitles** action overrides the official bottom line. The saved bottom-language preference selects English, Simplified Chinese, or Traditional Chinese. **Reload official subtitles** restores the official subtitles.

Supported players:

- Netflix
- Prime Video
- Max at play.hbomax.com
- Disney+
- YouTube creator-provided captions

The interface is available in English, Simplified Chinese, and Traditional Chinese.

DuetSub uses only subtitle tracks available to the signed-in viewer. It does not download video, bypass DRM, unlock region-restricted tracks, execute remote code, or collect analytics.

## 简体中文

### 产品名称

DuetSub · 双语同幕

### 简短说明

官方字幕优先的双语字幕工具，支持 Netflix、Prime Video、Max、Disney+ 和 YouTube。

### 详细说明

两种字幕，同一画面；理解内容，也保留原文。

DuetSub 是一款免费、开源的 Chrome 扩展，可在同一画面同步显示两种字幕。有官方字幕时永远优先使用官方字幕，并允许你从当前节目真实提供的语言中任选两种。

DuetSub 可以：

- 直接在播放器内选择上方和下方的官方字幕语言；
- 一键交换上下位置或重新载入官方字幕；
- 在拖动进度和站内换集、换视频后继续保持同步；
- 关闭时恢复平台原生字幕；
- 在英文或繁体中文字幕缺失时使用可选 AI 补位，也可主动以上方字幕为源，把下方字幕重译为英文、简体中文或繁体中文；
- 由用户自己控制翻译端点和 API key。

可选 AI 翻译支持 DeepSeek、阿里云百炼千问、火山方舟豆包、其他 OpenAI 兼容 HTTPS 服务，以及本机 Ollama / LM Studio。两条官方字幕可用时默认不会连接翻译服务；只有主动点击“用 AI 重译下方字幕”才会替换官方下方字幕，并按已保存的下方语言偏好生成英文、简体中文或繁体中文。点击“重新加载官方字幕”即可恢复官方字幕。

支持：

- Netflix
- Prime Video
- Max（play.hbomax.com）
- Disney+
- YouTube 创作者提供的字幕

界面支持简体中文、繁体中文和英文。

DuetSub 只使用当前登录账号本来就能访问的字幕轨。它不会下载视频、绕过 DRM、解锁地区限制字幕、执行远程代码或收集行为分析数据。

## 繁體中文

### 產品名稱

DuetSub · 雙語同幕

### 簡短說明

官方字幕優先的雙語字幕工具，支援 Netflix、Prime Video、Max、Disney+ 和 YouTube。

### 詳細說明

兩種字幕，同一畫面；理解內容，也保留原文。

DuetSub 是一款免費、開源的 Chrome 擴充功能，可在同一畫面同步顯示兩種字幕。有官方字幕時永遠優先使用官方字幕，並允許你從目前節目實際提供的語言中任選兩種。

DuetSub 可以：

- 直接在播放器內選擇上方和下方的官方字幕語言；
- 一鍵交換上下位置或重新載入官方字幕；
- 在拖曳進度和站內換集、換影片後繼續保持同步；
- 關閉時恢復平台原生字幕；
- 在英文或繁體中文字幕缺少時使用可選 AI 補位，也可主動以上方字幕為來源，把下方字幕重譯為英文、簡體中文或繁體中文；
- 由使用者自行控制翻譯端點和 API key。

可選 AI 翻譯支援 DeepSeek、阿里雲百煉千問、火山方舟豆包、其他 OpenAI 相容 HTTPS 服務，以及本機 Ollama / LM Studio。兩條官方字幕可用時預設不會連接翻譯服務；只有主動點擊「用 AI 重譯下方字幕」才會替換官方下方字幕，並依已儲存的下方語言偏好產生英文、簡體中文或繁體中文。點擊「重新載入官方字幕」即可恢復官方字幕。

支援：

- Netflix
- Prime Video
- Max（play.hbomax.com）
- Disney+
- YouTube 創作者提供的字幕

介面支援簡體中文、繁體中文和英文。

DuetSub 只使用目前登入帳號原本就能存取的字幕軌。它不會下載影片、繞過 DRM、解鎖地區限制字幕、執行遠端程式碼或收集行為分析資料。

## Version 0.1.8 update notes / 版本 0.1.8 更新说明

### English

- Replaces the generic Retranslate action with **Use AI to retranslate bottom subtitles**.
- Uses the current top subtitle track as the source and applies the film/TV or YouTube translation prompt automatically.
- Supports English, Simplified Chinese, and Traditional Chinese as explicit bottom-subtitle AI targets.
- Defaults new Qwen configurations to `qwen3.7-plus` and keeps reasoning fully disabled.
- Reconstructs continuous dialogue across up to eight adjacent subtitle segments, then returns the same number of `%%`-separated translations to the original cue timeline.
- Prioritizes complete meaning and character voice without sending length or reading-speed budgets to the model.
- Keeps the official bottom subtitles visible until the first AI result arrives.
- Skips the translation cache so prompt and model changes can be evaluated immediately.
- Restores the official subtitle pair with **Reload official subtitles**.
- Official subtitles remain the default; AI retranslation runs only after an explicit user action.

### 简体中文

- 将原来的“重新翻译”改为更明确的 **“用 AI 重译下方字幕”**。
- 以上方当前字幕为原文，并根据播放站点自动使用影视剧或 YouTube 翻译提示词。
- AI 下方字幕支持英文、简体中文和繁体中文。
- 新建千问配置默认使用 `qwen3.7-plus`，并完全关闭推理。
- 最多结合 8 条相邻字幕还原连续台词，再以相同数量的 `%%` 分隔译文回填原时间轴。
- 语义完整和人物语气优先，不向模型发送长度或阅读速度预算。
- 第一批 AI 结果返回前继续显示官方下方字幕。
- 跳过翻译缓存，便于立即检验提示词和模型调整。
- 点击 **“重新加载官方字幕”** 即可恢复官方语言对。
- 默认仍优先显示官方字幕；只有用户主动操作才会调用 AI 重译。

### 繁體中文

- 將原本的「重新翻譯」改為更明確的 **「用 AI 重譯下方字幕」**。
- 以上方目前字幕為原文，並依播放站點自動使用影視劇或 YouTube 翻譯提示詞。
- AI 下方字幕支援英文、簡體中文和繁體中文。
- 新建千問設定預設使用 `qwen3.7-plus`，並完全關閉推理。
- 最多結合 8 條相鄰字幕還原連續台詞，再以相同數量的 `%%` 分隔譯文回填原時間軸。
- 語義完整與人物語氣優先，不向模型傳送長度或閱讀速度預算。
- 第一批 AI 結果返回前繼續顯示官方下方字幕。
- 跳過翻譯快取，方便立即檢驗提示詞與模型調整。
- 點擊 **「重新載入官方字幕」** 即可恢復官方語言對。
- 預設仍優先顯示官方字幕；只有使用者主動操作才會呼叫 AI 重譯。

## Version 0.1.7 update notes / 版本 0.1.7 更新说明

### English

- Choose any two verified official subtitle languages available for the current title.
- Adds a dedicated Language menu with top/bottom selection, swap, and official-subtitle reload.
- Improves seeking, episode/video changes, track ownership, and native-subtitle restoration across all four supported players.
- Adds English, Simplified Chinese, and Traditional Chinese interface localization.
- Adds Responses API support for Qwen in China or Singapore and Doubao through Volcengine Ark. Qwen Workspace ID is user-provided, and optional web search is off by default.
- Uses `qwen3.7-plus` as the first Qwen model candidate without replacing an existing saved model choice.
- Adds separate film/TV and YouTube translation prompts that preserve cue timing, dialogue voice, technical details, numbers, units, corrections, and operational directions.
- Fits translations to each cue's duration and reading budget, then applies deterministic subtitle line breaking without moving text between cues.

### 中文

- 可从当前节目真实提供的字幕中任选两种经过验证的官方语言。
- 新增独立“语言”选单，可选择上下字幕、交换位置并重新载入官方字幕。
- 改进四个播放器上的拖动进度、站内换集/换视频、轨道归属与原生字幕恢复。
- 新增英文、简体中文和繁体中文界面。
- 新增阿里云百炼千问（中国区/新加坡区）与火山方舟豆包的 Responses API 支持；千问 Workspace ID 由用户填写，联网搜索默认关闭。
- 选择千问时默认优先 `qwen3.7-plus`，不会覆盖用户已经保存的模型选择。
- 分别使用影视剧和 YouTube 翻译提示词，保留时间轴、人物语气、技术细节、数字、单位、纠错和操作方向。
- 根据每条字幕的显示时长与阅读预算控制译文，并以确定性排版断行，不把文字移动到其他字幕时间段。

## Single purpose

Display two synchronized subtitle languages together on supported video players, using any two verified official tracks available for the current title and an optional user-configured translation endpoint for a missing English or Traditional Chinese line or an explicit user-requested bottom-subtitle retranslation into English, Simplified Chinese, or Traditional Chinese.

## Permission justifications

### storage

Stores the per-site on/off preference, interface language, official top/bottom language preference, optional translation settings, API key, and local translation cache inside the browser profile.

### Netflix, Prime Video, Max, Disney+, and YouTube host access

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
