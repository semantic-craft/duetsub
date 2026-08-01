# DuetSub Privacy Policy

Effective date: July 31, 2026

DuetSub is a browser extension for displaying bilingual subtitles. The project does not operate a DuetSub server and does not sell, share, or use personal data for advertising, analytics, profiling, or creditworthiness.

## Data processed locally

DuetSub processes the following data inside the browser:

- subtitle text and timing already made available by the supported video site;
- the current content identity needed to reject stale subtitles after navigation or episode changes;
- the per-site DuetSub on/off preference;
- the global top and bottom official-language preference;
- an optional translation provider, endpoint, model, and API key;
- translated subtitle text cached in the extension's IndexedDB storage.

Settings and API keys use `chrome.storage.local`, not Chrome Sync. API keys are masked in the settings interface and are not written to extension logs.

## Official language pairs

The manual Official Pair menu contains only machine-verifiable official subtitle
languages already available to the signed-in viewer for the current title. When
both selected official tracks resolve, their subtitle text and timing remain in
the browser by default. Selecting or reloading an official pair does not contact
a translation endpoint. The saved top/bottom preference is local; each title is
checked against its own current official-track catalog and fails closed when
either selection is unavailable.

## Optional machine translation

Machine translation occurs only when a fallback language is missing or the user
explicitly selects **Use AI to retranslate bottom subtitles**. It also requires
that the user has:

1. configured a translation endpoint;
2. explicitly granted access to that endpoint through Chrome's permission prompt; and
3. enabled DuetSub for the current player.

The explicit retranslation action sends the current top subtitle text and uses
the result only for the bottom subtitle line. **Reload official subtitles**
restores the official pair. In either translation mode, the extension sends the
source subtitle text, requested target language, model name, and authentication
required by the configured service directly from the browser to that service.
For cloud services, the endpoint must use HTTPS. Plain HTTP is accepted only for
`localhost`, `127.0.0.1`, or `[::1]`.

The configured provider processes those requests under its own terms and privacy policy. DuetSub does not proxy, receive, or retain those requests on a project-operated server.

## Data not collected

DuetSub does not collect or transmit:

- video or audio content;
- browsing history outside the five supported player sites;
- cookies, account passwords, payment information, or DRM data;
- advertising identifiers or analytics events;
- signed subtitle query parameters, session tokens, or complete proprietary playback payloads.

## Permissions

- `storage` stores extension settings, per-site toggle state, and the local translation cache.
- Access to Netflix, Prime Video, Max, Disney+, and YouTube is required to insert the player control, read subtitle responses already available to the signed-in viewer, and render the overlay.
- Access to arbitrary HTTPS origins is optional and is requested only for the exact translation host selected by the user.
- Access to loopback HTTP origins is optional and is requested only for a user-selected local translation service.

Declining or revoking an optional endpoint permission disables translation through that endpoint. Official subtitle display continues to work.

## Retention and deletion

DuetSub has no remote account or server-side retention. Extension settings and cached translations remain in the browser profile until overwritten or the extension's local data is removed. Removing the extension through Chrome removes its extension-local data under normal browser operation.

## Changes and contact

Material policy changes will be published in this repository with an updated effective date. Privacy questions and reports can be opened in the public [DuetSub issue tracker](https://github.com/semantic-craft/duetsub/issues); do not include API keys, cookies, signed URLs, or other secrets.
