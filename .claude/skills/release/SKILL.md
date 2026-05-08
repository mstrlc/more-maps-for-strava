# Release Skill

Follow these steps exactly when the user asks to create a new release.

## 1. Determine version

Check current version in `manifest.json`. Ask the user whether the bump should be major, minor, or patch — suggest based on changes (new features → minor, fixes → patch).

## 2. Create release branch

```bash
git checkout -b release/vX.Y.Z
```

## 3. Bump version

Update `version` in both `manifest.json` and `package.json` to the new version.

## 4. Commit, merge, tag, push

```bash
git add manifest.json package.json
git commit -m "release: vX.Y.Z"
git checkout main
git merge --ff-only release/vX.Y.Z
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

## 5. Write release notes

Run `git log vPREV..vNEW --oneline` to see all commits since the previous tag.

Write 3–5 short bullet points covering user-facing changes only. End each bullet with `(@mstrlc)`. Post via:

```bash
gh release edit vX.Y.Z --notes "..."
```

## Notes

- Chrome Web Store submissions enter a review queue — if a new tag is pushed while a previous version is still in review, the Chrome upload step will fail with `ITEM_NOT_UPDATABLE`. Re-run the workflow from the Actions tab once the review clears.
- The GitHub Actions workflow verifies the tag matches the manifest version before publishing.
