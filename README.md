# DuetSub

DuetSub is an open-source Chrome extension that displays English and Traditional Chinese subtitles together on:

- Netflix
- Prime Video
- Max (`play.hbomax.com`)
- YouTube

It prefers two official subtitle tracks. If only one suitable official track exists, the user can optionally translate the missing line with DeepSeek, another OpenAI-compatible HTTPS endpoint, or a loopback service such as Ollama or LM Studio.

## What it does

- Places a DuetSub button inside each supported player's native control row.
- Renders English above Traditional Chinese using the real video clock.
- Hides the native subtitle layer only after both DuetSub tracks are ready.
- Restores the native subtitle selection and layer when DuetSub is disabled or reset.
- Handles seeking and in-player episode/video changes without reusing stale cues.
- Converts official Simplified Chinese to Traditional Chinese locally with OpenCC.

DuetSub only uses subtitle tracks already available to the signed-in viewer. It does not download video, bypass DRM, expose region-locked tracks, inject remote code, or collect analytics.

## Install

1. Download `duetsub-0.1.1-chrome.zip` from the [latest release](https://github.com/semantic-craft/duetsub/releases/latest).
2. Unzip it to a permanent folder.
3. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
4. Select the unzipped folder.

The standalone build carries the stable extension ID:

```text
nopbidmmkeonplhniidecfeibhnanmig
```

Chrome Web Store publication remains a separate dashboard review. If its first draft assigns a different public key, that store key must be adopted once before the store build is declared stable.

## Translation is optional

The four streaming-site permissions are required because the content scripts run on those players. Translation endpoints are not pre-authorized:

- DeepSeek and custom HTTPS access are requested only when the user saves or tests that endpoint.
- `localhost`, `127.0.0.1`, and `[::1]` access is requested only when the user saves or tests a loopback endpoint.
- Declining a request leaves official subtitles working and does not grant background access.

API keys and settings stay in `chrome.storage.local`. Source subtitle text is sent only when an official language is missing, DuetSub is enabled, and the configured endpoint has been authorized. See [PRIVACY.md](PRIVACY.md) for the complete data boundary.

## Verification status

Automated tests cover parsing, track ownership, lifecycle generations, seek handling, subtitle restoration, translation batching/cache, and release-package invariants. Logged-in human gates have passed for Prime Video, Netflix, and Max on the final `v0.1.1` candidate. Max was verified with real in-player episode changes, backward and forward progress-bar seeks, full-track subtitle reuse, and native Traditional Chinese restoration.

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

The archive is written under `.output/`. A `v*` tag triggers the GitHub Actions release workflow, which reruns all release checks before attaching the archive.

## Repository boundaries

- `src/` and `entrypoints/` contain the extension runtime.
- `tests/` contains synthetic or minimized fixtures and behavior tests.
- `research/upstream/` contains selected reference files under their original licenses and recorded provenance.
- `research/proprietary/` is ignored except for its boundary notice; proprietary research extracts are never published.
- Signed subtitle URLs, cookies, tokens, API keys, complete proprietary payloads, and private signing keys must never enter git.

The DuetSub code is available under the [MIT License](LICENSE). Files under `research/upstream/` retain their own licenses.
