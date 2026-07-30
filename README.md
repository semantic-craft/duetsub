# DuetSub

[English](README.md) | [简体中文](README.zh-CN.md)

### Two subtitles. One screen. Keep the original in view.

DuetSub is a free and open-source Chrome extension that places two synchronized subtitle languages together on Netflix, Prime Video, Max, and YouTube.

It uses official subtitles whenever they are available. Choose any two official languages verified for the current title, keep the original beside the language you understand, and switch without leaving the player. AI translation is optional and is used only as a fallback for a missing English or Traditional Chinese line—not as a replacement for an available official track.

[Download the latest release](https://github.com/semantic-craft/duetsub/releases/latest) · [Privacy](PRIVACY.md) · [Verification](docs/VERIFICATION.md)

## Why DuetSub

- **Official subtitles first.** The player menu lists only official languages verified for the current title. Manual Official Pairs never invoke machine translation.
- **Any available official pair.** Put English above Chinese, Japanese above Korean, or any other two official languages the title actually provides.
- **Built for real playback.** DuetSub follows the video clock, handles seeking and in-player title changes, and restores the native subtitle layer when disabled.
- **Your endpoint, your choice.** Optional fallback supports DeepSeek, Qwen through Alibaba Cloud Model Studio, Doubao through Volcengine Ark, another OpenAI-compatible HTTPS endpoint, or a local Ollama/LM Studio service.
- **Private by design.** There is no DuetSub cloud service, subscription, analytics tracking, video download, DRM bypass, or remote code execution.

## Supported players

| Player | Official Language Pair |
| --- | --- |
| Netflix | Supported |
| Prime Video | Supported |
| Max (`play.hbomax.com`) | Supported, including verified English-CC alignment when required |
| YouTube | Supported for creator-provided official captions |

DuetSub only works with subtitle tracks available to the signed-in viewer. It does not expose region-locked tracks or manufacture subtitles that the platform has not provided.

## A language menu inside the player

The dedicated **Language** button opens a menu where you can:

- choose the top and bottom official subtitle languages;
- swap the two lines;
- reload official subtitle tracks if a player gets stuck;
- retry optional translation separately;
- open settings without leaving the video.

The menu is generated from the current title instead of a static all-language catalog. If DuetSub cannot verify ownership or timing, it fails closed and leaves the native subtitles intact.

## Optional AI fallback

Two verified official tracks never contact a translation service.

When the standard English / Traditional Chinese fallback needs translation, DuetSub sends only the required subtitle text to the endpoint you explicitly configure and authorize. Qwen uses the Responses API with a Workspace ID supplied by the user; optional Qwen web search is off by default. API keys, preferences, and the local translation cache stay in `chrome.storage.local`.

The settings interface is available in English, Simplified Chinese, and Traditional Chinese.

## Install from GitHub

1. Download `duetsub-0.1.6-chrome.zip` from the [latest release](https://github.com/semantic-craft/duetsub/releases/latest).
2. Unzip it to a permanent folder.
3. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
4. Select the unzipped folder.

The standalone GitHub build carries the stable extension ID:

```text
nopbidmmkeonplhniidecfeibhnanmig
```

The Chrome Web Store package is built separately without `manifest.key`, because the Store assigns and preserves its own item identity.

## Verification

Automated tests cover parsing, track ownership, lifecycle generations, seeking, native-subtitle restoration, translation batching and caching, and release-package invariants.

The Official Language Pair runtime candidate `fa0989e` passed logged-in playback gates on Prime Video, Netflix, Max, and YouTube from one byte-identical unpacked build. The integrated `main` build separately passed the full automated release and Store-package gates.

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for the evidence ledger.

## Development

Requires a current Node.js and npm installation.

```bash
npm ci
npm test
npm run check
npm run build
```

Create and verify the standalone archive:

```bash
npm run release:build
```

Create and verify the Chrome Web Store archive:

```bash
npm run store:build
```

Both archives are written under `.output/`. A `v*` tag triggers the GitHub Actions release workflow and attaches the verified standalone archive to the GitHub Release.

## Repository boundaries

- `src/` and `entrypoints/` contain the extension runtime.
- `tests/` contains synthetic or minimized fixtures and behavior tests.
- `research/upstream/` contains selected reference files under their original licenses and recorded provenance.
- `research/proprietary/` is ignored except for its boundary notice; proprietary research extracts are never published.
- Signed subtitle URLs, cookies, tokens, API keys, complete proprietary payloads, and private signing keys must never enter git.

DuetSub is available under the [MIT License](LICENSE). Files under `research/upstream/` retain their original licenses.
