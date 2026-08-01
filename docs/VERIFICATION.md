# Verification ledger

Last updated: August 1, 2026

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

## Disney+ integration candidate

- **PASS — native control placement:** on the logged-in Disney+ player, the
  DuetSub toggle and language button were rendered inside the active native
  controls shadow tree, as the leftmost items of the right-side function group
  immediately before mute. They were not left at the viewport corner fallback.
- **PASS — one subtitle renderer at a time:** with DuetSub enabled, the native
  `timed-text-override-region` renderer was hidden and only the Japanese /
  Traditional Chinese DuetSub board remained. Disabling DuetSub removed that
  board and restored Disney's native Traditional Chinese renderer.
- **PASS — whole-program timing across PTS resets:** the failure was reproduced
  before the fix: Disney was around 22 minutes into the program while newly
  requested subtitle segment PTS values had reset to only a few seconds. The
  adapter now derives a continuous VOD presentation timeline from ordered
  `EXTINF` durations and uses Disney's MAIN-world `playheadPositionMs` program
  clock instead of the period-local `<video>.currentTime`.
- **PASS — same-frame official subtitle comparison:** with playback explicitly
  paused at `16:31.004`, Disney's native Traditional Chinese line and DuetSub's
  active bottom cue were both `提醒我「複試」是什麼`; the active Japanese cue was
  `コールバックって何だっけ？`. A second paused comparison at `21:57.365`
  matched `祝你生日快樂`, paired with `お誕生日おめでとう`. These reads used a
  sanitized, read-only timing probe that was removed before the final build.
- **PASS — automated regression coverage:** tests cover program-clock message
  validation and ownership, MAIN-world clock reading, adapter exposure,
  controller clock preference, complete playlist acquisition, and a subtitle
  PTS reset after an HLS discontinuity.
- **PASS — live Disney+ machine translation and restoration:** the exact
  candidate's `用 AI 重译下方字幕` action produced an official Japanese top cue
  and an `MT`-marked Traditional Chinese bottom cue in the logged-in player
  (for example, `もちろん どうして？` / `當然，為什麼這麼問？`). Selecting
  `重新加载官方字幕` removed the MT marker and restored the official Japanese /
  Traditional Chinese pair while playback remained paused.
- **NOT RUN — Disney+ ads and episode replacement:** neither was counted as a
  PASS or WAIVED gate in this run.

## Official Language Pair integration candidate

Runtime candidate `fa0989e` was built into `.output/chrome-mv3`, synchronized to
the real unpacked-extension loading directory, and compared byte-for-byte after
the final release build. Prime Video, Netflix, Max, and YouTube were all
rechecked from that same build.

The integration merge into `main` preserved the independently added
multilingual UI and passed the automated release gates below. The logged-in
table remains evidence for exact runtime candidate `fa0989e`; no post-merge
playback was counted as an exact-candidate human gate.

### Automated

- **PASS — tests and types:** 48 test files / 224 tests and `tsc --noEmit`.
- **PASS — standalone archive:** `npm run release:build`; SHA-256
  `66fd5a46345b9debdc6a9100d94bbe4fac26bfccfa278ccd1dcc23efb4892467`.
- **PASS — store archive:** `npm run store:build`; SHA-256
  `de5ab76fbcbde27c09e7f302af891475c7605bbaa3423bc523b7c6d55453fbd8`.
- **PASS — permissions and contents:** exact required/optional host allowlists,
  no store `manifest.key`, no source maps/environment/private-key files, no
  embedded Workspace ID, credential-shaped secret, materialized signed subtitle
  URL, viewing identifier, logged-in subtitle sample, debug statement,
  proprietary research file, or static all-language catalog.
- **PASS — dependency and diff checks:** `npm audit --omit=dev` reported zero
  vulnerabilities; `git diff --check` passed.

### Same-build logged-in gates

| Site | Final selected pair | Seek / navigation | Native restoration | Ads |
| --- | --- | --- | --- | --- |
| Prime Video | PASS — `en-US` top, `zh-Hant` bottom, 100%; manual official-track reload recovered an initial fail-closed restore timeout | PASS — real 10-second seek; earlier same-branch non-default pair and episode replacement also passed | PASS — native selection/renderer and closed-menu state restored, then pair re-enabled | NOT RUN |
| Netflix | PASS — `en` top, `zh-Hant` bottom, 100% through the verified menu fallback | PASS — real seek; same-branch episode/video replacement passed | PASS — `.player-timedtext` visible when off and hidden only after both tracks were ready | NOT RUN |
| Max | PASS — `en-US` top, `zh-Hant-TW` bottom, 100% | PASS — real seek; same-branch episode replacement and non-English/Chinese original timing passed | PASS — caption renderer restored; video stayed ready and visible | NOT RUN |
| YouTube | PASS — creator-official `en` top, `zh-Hant` bottom, 100% on two TED videos | PASS — real seek and cross-video ownership; previous same-branch SPA lifecycle passed | PASS — native caption container restored when off, pair resumed when on | NOT RUN |

Netflix's live manifest fast path and a naturally occurring YouTube one-time
re-prime were **NOT RUN** on the final candidate and are not reported as PASS or
WAIVED. **Environmental WAIVED: none.**

## `v0.1.8` release candidate

- **PASS — automated release archive:** `npm run release:build` passed 50 test
  files / 240 tests with one opt-in live suite skipped, TypeScript checking,
  Chrome MV3 packaging, stable-ID verification, archive-content checks, and the
  least-privilege host boundary. SHA-256:
  `c0fd9a39cd936fcb87fced065f600535abd4a72bcab4446732a79ccf9fabde9f`.
- **PASS — automated store archive:** `npm run store:build` passed the same
  behavior and type gates. The 25-file store package omits `manifest.key` and
  retains the least-privilege host boundary. SHA-256:
  `5fc02842dc7389439cbd3f223b4d4eade56e1af968e1f9ae5b5a6e16d043a759`.
- **PASS — dependency and diff checks:** `npm audit --omit=dev` reported zero
  vulnerabilities and `git diff --check` passed.
- **PASS — live YouTube Simplified Chinese round trip:** the unpacked
  `.output/chrome-mv3-store` build was reloaded in Chrome and the logged-in
  video `https://www.youtube.com/watch?v=iQyg-KypKAA` was reloaded. The title
  exposed a creator-provided English track but no official Simplified Chinese
  track. DuetSub retained the official English top track and reported
  `上方官方字幕已就绪 · 可用 AI 重译下方字幕`.
- **PASS — live Qwen Workspace Responses API through the product UI:** the
  explicit `用 AI 重译下方字幕` action used the locally configured Qwen China
  Workspace Responses endpoint and `qwen3.7-flash`. At approximately `21:48`,
  the overlay showed the official English top cue, an MT-marked Simplified
  Chinese bottom cue containing Simplified forms such as `电脑`, and status
  `官方字幕 + MT · 翻译中…`. No key or endpoint-permission error appeared.
  Runtime source did not change after this run; the final archives above were
  regenerated after documentation-only edits.
- **PASS — official-subtitle restoration:** selecting
  `重新加载官方字幕` removed the AI bottom line, cancelled the pending manual
  translation work, preserved the official English top cue, and returned to
  `上方官方字幕已就绪 · 可用 AI 重译下方字幕`. Because this video has no
  official Simplified Chinese track, restoration correctly produced one
  official top line rather than claiming an official pair.
- **NOT RUN — full-video and cross-player feature replay:** the first
  playback-local Qwen result was inspected, but the `45:45` video was not
  translated to completion and the new manual action was not replayed on
  Netflix, Prime Video, or Max. This run therefore establishes live
  availability, Simplified-script output, MT marking, and restoration—not a
  full-film semantic-quality or all-player gate.
- **NOT RUN — Chrome Web Store dashboard and GitHub Release:** both verified
  archives were built locally; no dashboard upload, tag, or public release was
  created in this run.

## `v0.1.7` release candidate

- **PASS — real Qwen Workspace Responses API:** the opt-in live suite made
  eight requests with `qwen3.7-flash`, covering the film/TV and YouTube prompt
  profiles in both translation directions twice. All cases preserved cue IDs,
  ordering, source timestamps, line constraints, and the frozen semantic
  anchors. The API key was read only from the process environment; neither it
  nor the Workspace ID is tracked.
- **PASS — automated release archive:** `npm run release:build` passed 49 test
  files / 233 tests with the live suite skipped by default, TypeScript checking,
  Chrome MV3 packaging, stable-ID verification, archive-content checks, and the
  least-privilege host boundary. SHA-256:
  `7f5ec80a1663b6ff80df11aa5cd67c92411d79f0b3eb7dc1f02f91b11e029e05`.
- **PASS — automated store archive:** `npm run store:build` passed the same
  behavior and type gates. The 25-file store package omits `manifest.key` and
  retains the least-privilege host boundary. SHA-256:
  `9f766924df558ef45a27a714bd186d5007de7f796d04a9d318d425df36b5d393`.
- **PASS — dependency and diff checks:** `npm audit --omit=dev` reported zero
  vulnerabilities and `git diff --check` passed.
- **NOT RUN — exact-candidate logged-in playback:** the earlier Official
  Language Pair candidate evidence remains recorded above, but Netflix, Prime
  Video, Max, and YouTube were not replayed from the packaged `0.1.7` build.
- **NOT RUN — Chrome Web Store dashboard and GitHub Release:** both verified
  archives were built locally; no dashboard upload, tag, or public release was
  created in this run.

## `v0.1.6` release candidate

- **PASS — automated release archive:** `npm run release:build` passed 37 test files / 135 tests, TypeScript checking, Chrome MV3 packaging, stable-ID verification, archive-content checks, and the least-privilege host boundary.
- **PASS — automated store archive:** `npm run store:build` passed the same behavior and type gates; the store package omits `manifest.key` and retains the least-privilege host boundary.
- **PASS — local typography preview:** the runtime-equivalent 1280×720 preview showed English at `100%` above Traditional Chinese at `90%`, with neither line crossing the overlay boundary.
- **NOT RUN — exact-candidate logged-in playback:** the logged-in Netflix tab still exposed the previously loaded `82%` English / `100%` Chinese runtime after the candidate was built. The protected extension-reload surface was not bypassed, and the old runtime was not counted as evidence for `0.1.6`.
- **PENDING — Chrome Web Store dashboard:** upload and submission use the exact verified `0.1.6` store archive.

## `v0.1.5` release candidate

- **PASS — automated release archive:** `npm run release:build` passed 37 test files / 135 tests, TypeScript checking, Chrome MV3 packaging, stable-ID verification, archive-content checks, and the least-privilege host boundary.
- **PASS — automated store archive:** `npm run store:build` passed the same behavior and type gates; the store package omits `manifest.key` and retains the least-privilege host boundary.
- **PASS — exact-candidate Prime Video timeline:** after reloading the unpacked extension, the same five Prime Video cues appeared in the native renderer and DuetSub within 43–194 ms. Before the fix, matching cue boundaries were 5.96–6.38 seconds early. Prime native subtitles were returned to off, DuetSub remained enabled, and playback was paused afterward.
- **NOT RUN — exact-candidate Netflix/Max/YouTube replay:** the existing logged-in ledger remains historical evidence; those sites were not replayed on the final `0.1.5` package.
- **PENDING — Chrome Web Store dashboard:** upload and submission use the exact verified `0.1.5` store archive.

## `v0.1.4` release candidate

- **PASS — automated release archive:** `npm run release:build` passed 37 test files / 135 tests, TypeScript checking, Chrome MV3 packaging, stable-ID verification, archive-content checks, and the least-privilege host boundary.
- **PASS — automated store archive:** `npm run store:build` passed the same behavior and type gates; the 18-file store package omits `manifest.key` and retains the least-privilege host boundary.
- **PASS — source-equivalent Netflix playback:** the unpacked build already loaded in the logged-in Netflix tab uses the same Netflix source and test objects as this candidate. Live playback showed one DuetSub English/Traditional Chinese board and no second native subtitle layer; the tab was returned to paused state afterward.
- **PASS — exact-candidate Netflix reload:** after the unpacked extension was manually reloaded from Chrome's extensions page, the Netflix watch page was reloaded and played. It showed one DuetSub English/Traditional Chinese board with no second native subtitle layer; the tab was returned to paused state afterward.
- **NOT RUN — exact-candidate Prime/Max/YouTube replay:** the existing logged-in ledger remains historical evidence; those sites were not replayed on the final `0.1.4` package.
- **NOT RUN — Chrome Web Store dashboard:** the verified upload archive was prepared locally, but dashboard upload, review, and publication remain human-controlled gates.

## Historical pre-integration player gates

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
