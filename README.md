# DuetSub

DuetSub is a Chrome extension project for showing two **official** subtitle tracks at once on Netflix, Prime Video, and Max: Simplified/Traditional Chinese plus English.

The first project pass is intentionally limited to upstream research and extraction. No publishable extension runtime has been implemented yet.

## Product boundary

- Use subtitle tracks already made available to the signed-in viewer by the streaming service.
- Prefer official Chinese and English tracks; do not machine-translate when both exist.
- Do not download video, bypass DRM, unlock region-restricted tracks, or transmit viewing data.
- Treat each streaming site as a separate adapter over a shared cue model.

## Current contents

- `docs/EXTRACTION.md`: findings for Netflix, Prime Video, and Max.
- `research/upstream/`: selected open-source reference files with their original licenses and exact commit provenance.
- `research/proprietary/`: local-only Immersive Translate CRX extracts. This directory is ignored by git.

## Proposed runtime seam

```text
page-realm hook -> site adapter -> { start, end, text, language } cues
                                   -> Chinese/English synchronizer
                                   -> isolated dual-line overlay
```

The next implementation step should be a minimal Manifest V3 shell plus one Netflix vertical slice. Prime Video and Max should remain adapter stubs until Netflix is verified against a real title that exposes both official tracks.
