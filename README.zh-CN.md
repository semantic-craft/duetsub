# DuetSub · 双语同幕

[English](README.md) | [简体中文](README.zh-CN.md)

### 两种字幕，同一画面；理解内容，也保留原文。

DuetSub 是一款免费、开源的 Chrome 扩展，可在 Netflix、Prime Video、Max 和 YouTube 的播放画面中同步显示两种字幕。

有官方字幕时，DuetSub 永远优先使用官方字幕。你可以从当前节目真实提供的语言中任选两种，把原文和熟悉的语言放在一起，并直接在播放器内切换。AI 翻译完全可选，只在英文或繁体中文字幕缺失时作为补位，不会替代已经存在的官方字幕。

[下载最新版本](https://github.com/semantic-craft/duetsub/releases/latest) · [隐私说明](PRIVACY.md) · [验证记录](docs/VERIFICATION.md)

## 为什么选择 DuetSub

- **官方字幕优先。** 播放器选单只列出当前节目经过验证的官方字幕语言；手动选择官方语言对时绝不会调用机器翻译。
- **自由组合官方语言。** 英文在上、中文在下，日语在上、韩语在下，或当前节目实际提供的任意两种官方语言，都可以自由组合。
- **为真实播放场景设计。** DuetSub 跟随真实视频时钟，处理拖动进度和站内换集，并在关闭时恢复平台原生字幕。
- **翻译服务由你选择。** 可选补位支持 DeepSeek、阿里云百炼千问、火山方舟豆包、其他 OpenAI 兼容 HTTPS 端点，以及本机 Ollama / LM Studio。
- **隐私边界清楚。** 没有 DuetSub 云服务、订阅收费、行为分析、视频下载、DRM 绕过或远程代码执行。

## 支持的播放器

| 播放器 | 官方语言自由配对 |
| --- | --- |
| Netflix | 支持 |
| Prime Video | 支持 |
| Max（`play.hbomax.com`） | 支持；必要时使用经过验证的英文 CC 对齐策略 |
| YouTube | 支持创作者提供的官方字幕 |

DuetSub 只使用当前登录账号本来就能访问的字幕轨，不会解锁地区限制字幕，也不会伪造平台没有提供的官方字幕。

## 播放器内的语言选单

点击独立的 **“语言”** 按钮，可以：

- 选择上方和下方的官方字幕语言；
- 一键交换上下位置；
- 播放器异常时重新载入官方字幕；
- 单独重试可选机器翻译；
- 不离开视频即可打开设置。

选单内容来自当前节目，而不是预置的静态语言大全。如果 DuetSub 无法可靠确认字幕归属或时间轴，它会安全停止显示，并保留平台原生字幕。

## 可选 AI 补位

两条官方字幕都可用时，DuetSub 不会连接任何翻译服务。

只有标准的英文 / 繁体中文补位需要翻译时，DuetSub 才会把必要的字幕文本发送到你明确配置并授权的端点。千问使用 Responses API，Workspace ID 由用户自行填写；千问联网搜索默认关闭。API key、语言偏好和本地翻译缓存均保存在 `chrome.storage.local`。

设置界面支持简体中文、繁体中文和英文。

## 从 GitHub 安装

1. 从 [最新版本](https://github.com/semantic-craft/duetsub/releases/latest) 下载 `duetsub-0.1.6-chrome.zip`。
2. 解压到一个长期保留的文件夹。
3. 打开 `chrome://extensions`，启用 **开发者模式**，点击 **加载已解压的扩展程序**。
4. 选择刚才解压的文件夹。

GitHub 独立版本使用固定扩展 ID：

```text
nopbidmmkeonplhniidecfeibhnanmig
```

Chrome 应用商店版本单独构建且不包含 `manifest.key`，商店会分配并维护自己的项目身份。

## 验证情况

自动化测试覆盖字幕解析、轨道归属、播放生命周期、拖动进度、原生字幕恢复、翻译批处理与缓存，以及发布包边界。

官方语言自由配对的真人登录播放候选版本 `fa0989e`，已使用同一个字节完全一致的解压构建，在 Prime Video、Netflix、Max 和 YouTube 完成验证。合并后的 `main` 构建另行通过了完整自动化发布与商店打包检查。

详细证据见 [docs/VERIFICATION.md](docs/VERIFICATION.md)。

## 开发

需要当前版本的 Node.js 和 npm。

```bash
npm ci
npm test
npm run check
npm run build
```

构建并验证 GitHub 独立发布包：

```bash
npm run release:build
```

构建并验证 Chrome 应用商店发布包：

```bash
npm run store:build
```

两个压缩包都会写入 `.output/`。推送 `v*` 标签后，GitHub Actions 会重新执行独立版本的发布检查，并把通过验证的压缩包附加到 GitHub Release。

## 仓库边界

- `src/` 和 `entrypoints/`：扩展运行时代码。
- `tests/`：合成或最小化测试数据与行为测试。
- `research/upstream/`：保留原始许可证和来源记录的参考文件。
- `research/proprietary/`：除边界说明外均被忽略，专有研究材料不得公开发布。
- 带签名的字幕 URL、Cookie、Token、API key、完整专有载荷和私有签名密钥不得进入 Git。

DuetSub 使用 [MIT License](LICENSE) 开源；`research/upstream/` 中的文件保留各自原始许可证。
