# Release process

DuetSub publishes a reproducible Chrome MV3 zip through GitHub Releases. A release is not complete until automated checks pass, the required logged-in human gates pass on the exact build, and the public-boundary checks are clean.

## Version contract

The same semantic version must appear in:

- `package.json`
- `package-lock.json`
- `wxt.config.ts`
- the tag, as `v<version>`
- the generated `manifest.json`

`scripts/verify-release.mjs` enforces the built-manifest, permission, stable-ID, archive-content, and optional tag invariants.

## Local candidate

From a clean worktree:

```bash
npm ci
npm run release:build
```

This runs the full test suite and typecheck, creates the Chrome zip, and verifies the archive. Test the exact `.output/chrome-mv3` directory in Chrome. Record automated, human, waived, and not-run gates separately in `docs/VERIFICATION.md`.

## Public-boundary gate

Before the first public push and before each release:

1. Review `git status` and the commits that will be published.
2. Scan the complete reachable history and current tracked tree for secrets.
3. Confirm no private email address appears in commit author or committer metadata.
4. Confirm no API key, private signing key, cookie, token, signed subtitle query, full proprietary payload, or private research extract is tracked.
5. Verify the release from a fresh clone of the public repository.

The RSA private key used to derive the standalone public manifest key must remain outside the repository. Only the public manifest key is committed.

## Publish

After all gates pass:

```bash
git tag -a v0.1.1 -m "DuetSub v0.1.1"
git push origin main
git push origin v0.1.1
```

The tag starts `.github/workflows/release.yml`. The workflow repeats the release build, then creates the GitHub Release and attaches `duetsub-<version>-chrome.zip`.

## Chrome Web Store

The store is a separate human-controlled release surface:

1. Upload a draft package in the Chrome Web Store dashboard.
2. Complete the privacy, single-purpose, permission-justification, listing, and distribution forms.
3. If the first store draft provides a public key different from the standalone key, update the manifest key once and treat the resulting store ID as immutable.
4. Upload the assets and text from `store-assets/`.
5. Run the same human gates on the exact store candidate.

Do not describe a dashboard, reviewer, clean-profile, ad, or store gate as passed unless it was actually run.
