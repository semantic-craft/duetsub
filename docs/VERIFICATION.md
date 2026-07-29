# Verification ledger

Last updated: July 29, 2026

Gate labels are strict:

- **PASS**: observed on the stated candidate.
- **WAIVED**: deliberately accepted by the user, with scope and reason recorded.
- **NOT RUN**: no evidence; never equivalent to PASS.
- **FAIL CLOSED**: the extension safely withheld its overlay because ownership or timing could not be verified.

## Automated release gate

Run `npm run release:build`. It must pass:

- all Vitest behavior tests;
- TypeScript checking;
- Chrome MV3 packaging;
- exact required/optional permission allowlists;
- stable extension ID derivation;
- archive checks excluding source maps, environment files, and private keys.

The command output for the release commit is the authoritative count; this document does not freeze a stale test total.

## `v0.1.4` release candidate

- **PASS — automated release archive:** `npm run release:build` passed 37 test files / 135 tests, TypeScript checking, Chrome MV3 packaging, stable-ID verification, archive-content checks, and the least-privilege host boundary.
- **PASS — automated store archive:** `npm run store:build` passed the same behavior and type gates; the 18-file store package omits `manifest.key` and retains the least-privilege host boundary.
- **PASS — source-equivalent Netflix playback:** the unpacked build already loaded in the logged-in Netflix tab uses the same Netflix source and test objects as this candidate. Live playback showed one DuetSub English/Traditional Chinese board and no second native subtitle layer; the tab was returned to paused state afterward.
- **PASS — exact-candidate Netflix reload:** after the unpacked extension was manually reloaded from Chrome's extensions page, the Netflix watch page was reloaded and played. It showed one DuetSub English/Traditional Chinese board with no second native subtitle layer; the tab was returned to paused state afterward.
- **NOT RUN — exact-candidate Prime/Max/YouTube replay:** the existing logged-in ledger remains historical evidence; those sites were not replayed on the final `0.1.4` package.
- **NOT RUN — Chrome Web Store dashboard:** the verified upload archive was prepared locally, but dashboard upload, review, and publication remain human-controlled gates.

## Logged-in player gates

| Site | Official dual track | Seek | Episode/video replacement | Native subtitle restoration | Ads |
| --- | --- | --- | --- | --- | --- |
| Prime Video | PASS | PASS | PASS | PASS | WAIVED — account/region exposed no ad; user approved |
| Netflix | PASS | PASS | PASS | PASS | WAIVED — user approved |
| Max | PASS — final `v0.1.1` candidate | PASS — final `v0.1.1` candidate | PASS — final `v0.1.1` candidate | PASS — final `v0.1.1` candidate | WAIVED — user approved |
| YouTube | FAIL CLOSED on tested titles without verifiable dual-track acquisition | NOT RUN | PARTIAL — no stale old-video cue observed | NOT RUN | NOT RUN |

## Max `v0.1.1` release gate

The exact final unpacked candidate passed on July 25, 2026:

1. **PASS — video:** the single visible video remained `readyState 4`, error-free, and fully visible with DuetSub enabled.
2. **PASS — control anchor:** the DuetSub control was inside the native row, after `player-ux-track-selector-button` and immediately before `player-ux-fullscreen-button`, with no fallback anchor.
3. **PASS — dual track:** real English and Traditional Chinese cues appeared together with status `官方英文主軌 + 官方繁中對齊 · 100%`; the native renderer was hidden only in this ready state.
4. **PASS — seek and reuse:** the real progress slider moved playback from about 24:50 to 12:00 and then to 17:25. Each destination produced a new cue rather than stale pre-seek text. DuetSub issued no new VTT `Fetch`; Max's native player issued one normal VTT `XHR`, while the overlay reused the initially acquired complete track.
5. **PASS — episode replacement:** Max's Episodes UI changed from *Yes, And* to *Bulletproof* and back without a page refresh. URL, title, duration, manifest, video clock, and displayed cues changed to the selected episode.
6. **PASS — native restoration:** disabling DuetSub hid its overlay, made the native renderer visible with live Traditional Chinese text, and the Max subtitle menu still showed `Chinese (Traditional)` checked. Re-enabling DuetSub restored the ready overlay and hid the native renderer again.

The real-ad gate remains **WAIVED** by explicit user instruction; no ordinary program segment was counted as an ad test.
