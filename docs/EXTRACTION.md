# Extraction report

Date: 2026-07-21

## What was extracted

### Netflix

- `NflxMultiSubs` provides a current Manifest V3 reference for page-realm injection at `document_start`, capturing Netflix player metadata, selecting a second official subtitle track, and rendering it beside the native track.
- Immersive Translate 1.30.3 identifies Netflix subtitle metadata by wrapping `JSON.parse` and observing objects containing `result.timedtexttracks` and `result.movieId`.
- Its site rule matches Netflix timed-text requests, hides `.player-timedtext`, attaches an isolated caption overlay under `.watch-video--player-view`, and uses `video` as the playback clock.

### Prime Video

- Immersive Translate matches Prime Video subtitle requests ending in `.ttml2`, hooks both XHR and fetch, and uses `#dv-web-player video` as the playback clock.
- Its rule labels the format `ebutt`, which is the EBU-TT/TTML family.
- DualSubs' open-source `AttrList` reference shows Prime's `subtitleUrls` records using `languageCode`, `trackGroupId`, `timedTextTrackId`, and `url`. Matching `trackGroupId` values are used to pair official tracks.
- Upstream notes warn that advertisements can disturb the playback timeline, so cue timing needs a real ad-transition test before implementation is considered stable.

### Max / HBO Max

- Immersive Translate matches `play.max.com` and legacy `play.hbomax.com`, intercepts `.vtt` subtitle requests, and treats them as WebVTT.
- The current control insertion point is under `[data-testid="playback_controls"]`; the native cue container is `[data-testid="CueBoxContainer"]`.
- DualSubs detects Max media hosts and has explicit Max handling for official subtitle track attributes.
- Upstream notes warn that self-hosting the subtitle layer can cause timeline drift, so the first implementation should measure cues against the page's actual `<video>.currentTime`.

## Shared design extracted from the references

1. Inject a very small page-realm hook before the streaming player parses its subtitle manifest.
2. Observe only subtitle metadata and subtitle responses; do not interfere with video or DRM requests.
3. Normalize TTML, WebVTT, and Netflix timed text into one cue shape: `{ start, end, text, language }`.
4. Select an English track and a Chinese track from the official tracks available to the current viewer.
5. Synchronize by time interval, not array index alone; preserve unmatched cues on either side.
6. Render both lines in an extension-owned overlay driven by the real video clock.
7. Reinitialize on SPA navigation, episode changes, track changes, seeks, and ad transitions.

## Licensing boundary

- `nflx-multisubs`: MIT; reusable with attribution.
- `dualsubs-universal`: Apache-2.0 for the copied files. Its WebVTT and EXTM3U submodules are GPL-3.0 and were deliberately not copied.
- `read-frog`: GPL-3.0 / commercial dual license. Copied files are research references only unless DuetSub adopts GPL-3.0 or obtains a commercial license.
- `immersive-translate-1.30.3`: packaged extension, not open source. The selected local extracts are ignored by git and must not be redistributed or copied into publishable runtime code.

## Stop rule for this phase

This extraction phase is complete when the selected files, provenance, licenses, and three site findings are present. It does not claim that any adapter works against a live signed-in video; that requires a separate implementation and human playback verification pass.
