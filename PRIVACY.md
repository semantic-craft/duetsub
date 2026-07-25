# DuetSub Privacy Policy

Effective date: July 25, 2026

DuetSub is a browser extension for displaying bilingual subtitles. The project does not operate a DuetSub server and does not sell, share, or use personal data for advertising, analytics, profiling, or creditworthiness.

## Data processed locally

DuetSub processes the following data inside the browser:

- subtitle text and timing already made available by the supported video site;
- the current content identity needed to reject stale subtitles after navigation or episode changes;
- the per-site DuetSub on/off preference;
- an optional translation provider, endpoint, model, and API key;
- translated subtitle text cached in the extension's IndexedDB storage.

Settings and API keys use `chrome.storage.local`, not Chrome Sync. API keys are masked in the settings interface and are not written to extension logs.

## Optional machine translation

DuetSub does not translate when suitable official English and Chinese tracks are both available.

When one language is missing, machine translation occurs only if the user has:

1. configured a translation endpoint;
2. explicitly granted access to that endpoint through Chrome's permission prompt; and
3. enabled DuetSub for the current player.

The extension then sends the source subtitle text, requested target language, model name, and authentication required by the configured service directly from the browser to that service. For cloud services, the endpoint must use HTTPS. Plain HTTP is accepted only for `localhost`, `127.0.0.1`, or `[::1]`.

The configured provider processes those requests under its own terms and privacy policy. DuetSub does not proxy, receive, or retain those requests on a project-operated server.

## Data not collected

DuetSub does not collect or transmit:

- video or audio content;
- browsing history outside the four supported player sites;
- cookies, account passwords, payment information, or DRM data;
- advertising identifiers or analytics events;
- signed subtitle query parameters, session tokens, or complete proprietary playback payloads.

## Permissions

- `storage` stores extension settings, per-site toggle state, and the local translation cache.
- Access to Netflix, Prime Video, Max, and YouTube is required to insert the player control, read subtitle responses already available to the signed-in viewer, and render the overlay.
- Access to arbitrary HTTPS origins is optional and is requested only for the exact translation host selected by the user.
- Access to loopback HTTP origins is optional and is requested only for a user-selected local translation service.

Declining or revoking an optional endpoint permission disables translation through that endpoint. Official subtitle display continues to work.

## Retention and deletion

DuetSub has no remote account or server-side retention. Extension settings and cached translations remain in the browser profile until overwritten or the extension's local data is removed. Removing the extension through Chrome removes its extension-local data under normal browser operation.

## Changes and contact

Material policy changes will be published in this repository with an updated effective date. Privacy questions and reports can be opened in the public [DuetSub issue tracker](https://github.com/semantic-craft/duetsub/issues); do not include API keys, cookies, signed URLs, or other secrets.
