# Contributing

Thanks for helping out. This page covers how to set up, how to name branches and commits, and what a pull request should look like.

## Setup

```bash
npm install
```

```bash
npm run build
```

`npm run build` copies the source into `dist/`; there is no bundler. Load `dist/` as an unpacked extension in Chrome or Edge (`chrome://extensions` → Developer mode → Load unpacked), or `dist/manifest.json` in Firefox (`about:debugging#/runtime/this-firefox` → Load Temporary Add-on). Rebuild and reload the extension after every change.

[CLAUDE.md](CLAUDE.md) explains how the extension is put together: the content script vs. page-context scripts, the `postMessage` types, and where Strava's selectors live.

## Branches

Branch off `main` with a prefix that matches the change:

| Prefix | For |
| --- | --- |
| `feature/` | New behaviour users can see |
| `fix/` | Bug fixes |
| `refactor/` | Code changes with no change in behaviour |
| `docs/` | README, store descriptions, this file |
| `chore/` | Build, assets, store images, tooling |

Keep one topic per branch. Two unrelated changes go in two PRs, even when they're small.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `style:`. Write the subject in the imperative and say what changes for the user, not which function moved:

```
fix: skip tile brightness/saturation where the sliders aren't shown
```

Don't bump the version in `src/manifest.json` or `package.json`; that happens in the release branch.

## Pull requests

**Title:** the same format as a commit subject (`feat: …`, `fix: …`). For a single-commit PR, reuse the commit subject.

**Description:** the template fills in these sections. Drop the ones that don't apply.

- **Summary.** What changes, from the user's side, in a sentence or two.
- **Problem / Root cause** (fixes). What went wrong and why. Include the error message if there is one.
- **Changes.** A short list of what the code now does. Name files or functions where it helps a reviewer find their way.
- **Testing.** How you checked it: browser and version, which page (heatmap, route builder, activity page), the steps, and what you saw. Then a **Not tested** line that says what you didn't check, such as Firefox or activity pages. Saying "not tested with the extension loaded" is fine; leaving it out isn't.
- **Screenshots.** Before/after for anything visible on the map or in a menu.
- **Also in this PR.** Anything unrelated that tagged along, each with its commit hash and a line on why.

Before you open the PR, check that:

- `npm run build` succeeds and the extension loads without console errors.
- New user-visible text is in `strings.js`, not hard-coded.
- New `localStorage` keys are in `MoreMapsConfig.STORAGE_KEYS` and start with `moremaps_`.
- New Strava class-name selectors match on a stable prefix (`[class*="CoreMap_coreMap"]`), not the full hashed name.
- New `postMessage` types are added to the table in [CLAUDE.md](CLAUDE.md).
- The README is updated if a feature or a setup step changed.

Merges into `main` are fast-forward where possible. Releases are cut from `main` as described in [CLAUDE.md](CLAUDE.md#releases).
