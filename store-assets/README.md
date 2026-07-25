# Chrome Web Store assets

Prepared listing assets:

- `promo-small-440x280.png` — small promotional tile.
- `screenshot-player-1280x800.png` — player experience screenshot composition.
- `source/*.svg` — deterministic editable sources for both PNG files.
- `listing.md` — listing copy, single-purpose statement, privacy URL, and permission justifications.

The existing extension icon is `public/icons/icon-128.png`. Before a store submission, compare the PNGs against the final store candidate and regenerate them from the SVG sources if the interface changed.

Build the upload package with:

```bash
npm run store:build
```

Upload `.output/duetsub-<version>-chrome-web-store.zip`. This package intentionally omits `manifest.key`; do not upload the standalone GitHub archive when creating a Store item.

Regenerate PNGs with Playwright so the browser uses the same SVG and font rendering as Chrome:

```bash
playwright screenshot --browser chromium --viewport-size '440,280' \
  "file://$PWD/store-assets/source/promo-small.svg" \
  store-assets/promo-small-440x280.png
playwright screenshot --browser chromium --viewport-size '1280,800' \
  "file://$PWD/store-assets/source/screenshot-player.svg" \
  store-assets/screenshot-player-1280x800.png
```
