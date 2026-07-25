# Verification ledger

Last updated: July 25, 2026

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

## Logged-in player gates

| Site | Official dual track | Seek | Episode/video replacement | Native subtitle restoration | Ads |
| --- | --- | --- | --- | --- | --- |
| Prime Video | PASS | PASS | PASS | PASS | WAIVED — account/region exposed no ad; user approved |
| Netflix | PASS | PASS | PASS | PASS | WAIVED — user approved |
| Max | PASS on prior build | Final `v0.1.1` rerun required | Final `v0.1.1` rerun required | PASS on prior build | WAIVED — user approved |
| YouTube | FAIL CLOSED on tested titles without verifiable dual-track acquisition | NOT RUN | PARTIAL — no stale old-video cue observed | NOT RUN | NOT RUN |

## Max `v0.1.1` release gate

On the exact final unpacked build:

1. Confirm the video remains visible with DuetSub enabled.
2. Confirm the DuetSub control is inside the native row immediately before fullscreen.
3. Confirm real English and Traditional Chinese cues appear together.
4. Seek far enough to cross cue ranges, then observe a new post-seek cue; no pre-seek cue may remain.
5. Change episode through Max without refreshing; confirm content/video identity changes and new-episode cues appear without old-episode text.
6. Disable DuetSub and confirm the original native subtitle selection and renderer return.

The release must not be published while steps 1–6 remain incomplete.
