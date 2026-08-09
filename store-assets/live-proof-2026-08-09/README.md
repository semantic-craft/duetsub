# Live playback proof — 2026-08-09

Public-facing sequence:

1. `settings-01-language-pair.png` — choose English above and Traditional Chinese below.
2. `workflow-02-activated.png` — activate the DuetSub player icon and start reading the official tracks.
3. `workflow-03-ready-100.png` — after the verified official pair reaches 100%, choose the two tracks.
4. `primevideo-03-dual-subtitles.jpg` — Prime Video live playback, one DuetSub renderer, no native-caption overlap.
5. `netflix-03-dual-subtitles.jpg` — Netflix live playback.
6. `max-03-dual-subtitles.jpg` — Max live playback.
7. `youtube-03-dual-subtitles.jpg` — YouTube creator-provided English and Traditional Chinese captions.

Disney+ could not reach a signed-in player from the current network: the site redirected to `/welcome/unavailable` and reported that Disney+ is unavailable in this region. No Disney+ success image is included.

Files ending in `-raw` and files containing `debug`, `before`, or `after-build-live` are diagnostic evidence rather than listing candidates.

Chrome Web Store upload set (all exactly 1280 × 800):

1. `store-ready/00-setup-and-ready-1280x800.png` — settings first, then
   player activation and the verified 100% chooser state.
2. `store-ready/03-prime-video-dual-subtitles-1280x800.png`
3. `store-ready/04-netflix-max-dual-subtitles-1280x800.png`
4. `store-ready/05-youtube-dual-subtitles-1280x800.png`
5. `store-assets/screenshot-player-1280x800.png` — retained from the existing
   public listing.

The setup and activation states share one image, and Netflix and Max share one
image, so the five-image Store limit can preserve the existing illustration
while leading with the real workflow and Prime Video-first result.
