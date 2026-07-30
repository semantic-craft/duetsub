# DuetSub

> Two languages. One screen. No subtitle juggling.

DuetSub is an open-source Chrome extension for people who learn, listen, and watch across languages. It places two synchronized subtitle languages together on:

- Netflix
- Prime Video
- Max (`play.hbomax.com`)
- YouTube

The default preference is English on top and Traditional Chinese below. The player menu can instead select any two machine-verifiable official languages actually offered for the current title. If one selected official language is missing, the user can optionally translate the missing line with DeepSeek, Qwen through Alibaba Cloud Model Studio in China or Singapore, Doubao through Volcengine Ark in China, another OpenAI-compatible HTTPS endpoint, or a loopback service such as Ollama or LM Studio.

## What it does

- Places a DuetSub button inside each supported player's native control row.
- Renders the selected top and bottom official languages using the real video clock.
- Lists only official languages actually verified for the current title; ASR and platform machine-translation tracks do not enter the manual Official Pair menu.
- Hides the native subtitle layer only after both DuetSub tracks are ready.
- Restores the native subtitle selection and layer when DuetSub is disabled or reset.
- Handles seeking and in-player episode/video changes without reusing stale cues.
- Converts official Simplified Chinese to Traditional Chinese locally with OpenCC.

DuetSub only uses subtitle tracks already available to the signed-in viewer. It does not download video, bypass DRM, expose region-locked tracks, inject remote code, or collect analytics.

## Install

1. Download `duetsub-0.1.6-chrome.zip` from the [latest release](https://github.com/semantic-craft/duetsub/releases/latest).
2. Unzip it to a permanent folder.
3. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
4. Select the unzipped folder.

The standalone GitHub build carries the stable extension ID:

```text
nopbidmmkeonplhniidecfeibhnanmig
```

The Chrome Web Store build intentionally omits `manifest.key`, because the dashboard assigns and preserves the Store Item ID. The two release channels are packaged separately so the standalone key is never accidentally submitted to the store.

## Translation is optional

The four streaming-site permissions are required because the content scripts run on those players. Translation endpoints are not pre-authorized:

- DeepSeek, Qwen, Doubao, and custom HTTPS access are requested only when the user saves or tests that endpoint.
- `localhost`, `127.0.0.1`, and `[::1]` access is requested only when the user saves or tests a loopback endpoint.
- Declining a request leaves official subtitles working and does not grant background access.

API keys, settings, and the global top/bottom language preference stay in `chrome.storage.local`. A resolved two-official-track pair never contacts a translation endpoint. Source subtitle text is sent only when a selected official language is missing, DuetSub is enabled, and the configured endpoint has been authorized. See [PRIVACY.md](PRIVACY.md) for the complete data boundary.

## Verification status

Automated tests cover parsing, track ownership, lifecycle generations, seek handling, subtitle restoration, translation batching/cache, and release-package invariants. The Official Language Pair runtime candidate `fa0989e` passed logged-in playback gates on Prime Video, Netflix, Max, and YouTube from one byte-identical unpacked build, including real seeks and native-subtitle restoration.

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for the current evidence and [docs/RELEASE.md](docs/RELEASE.md) for the release process.

## Development

Requires a current Node.js and npm installation.

```bash
npm ci
npm test
npm run check
npm run build
```

Create and verify the distributable archive:

```bash
npm run release:build
```

Create and verify the Chrome Web Store archive:

```bash
npm run store:build
```

Both archives are written under `.output/`. A `v*` tag triggers the GitHub Actions release workflow, which reruns all standalone release checks before attaching the GitHub archive.

## Repository boundaries

- `src/` and `entrypoints/` contain the extension runtime.
- `tests/` contains synthetic or minimized fixtures and behavior tests.
- `research/upstream/` contains selected reference files under their original licenses and recorded provenance.
- `research/proprietary/` is ignored except for its boundary notice; proprietary research extracts are never published.
- Signed subtitle URLs, cookies, tokens, API keys, complete proprietary payloads, and private signing keys must never enter git.

The DuetSub code is available under the [MIT License](LICENSE). Files under `research/upstream/` retain their own licenses.
