# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow

### Feature branches
1. Branch off `main`: `git checkout -b feature/my-feature`
2. Commit changes with conventional commits (`feat:`, `fix:`, `refactor:`, etc.)
3. Merge to `main` (fast-forward preferred)

### Releases
1. Branch off `main`: `git checkout -b release/v1.2.3`
2. Bump version in both `manifest.json` and `package.json`
3. Commit: `git commit -m "release: v1.2.3"`
4. Merge to `main` (fast-forward)
5. Tag and push — this triggers the GitHub Actions release workflow:
   ```bash
   git tag v1.2.3 && git push origin main && git push origin v1.2.3
   ```

The workflow verifies the tag matches the manifest version, builds `moremaps.zip`, publishes to Chrome Web Store and Firefox AMO, and creates a GitHub Release with auto-generated notes.

> **Note**: Chrome Web Store submissions enter a review queue. If a new tag is pushed while a previous version is still in review, the Chrome upload step will fail with `ITEM_NOT_UPDATABLE`. Re-run the workflow from the Actions tab once the review clears.

## Build Commands

```bash
npm install          # Install dependencies (only webextension-polyfill)
npm run build        # Copy source files to dist/ (no bundler — plain file copy)
npm run zip          # Build then package dist/ into moremaps.zip for distribution
```

There are no tests. Load the extension manually to test:
- **Firefox**: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `dist/manifest.json`
- **Chrome/Edge**: `chrome://extensions` → Developer mode → Load unpacked → select `dist/`

## Architecture

This is a **Manifest V3 browser extension** that injects custom map layers and a panorama mode into Strava's route builder and heatmap pages (`*://*.strava.com/*`).

### Script execution model

Manifest V3 content scripts run in an isolated context and cannot access the page's JavaScript (Mapbox GL, React). The extension works around this using **two-layer injection**:

1. **`map-modifier.js`** (content script, runs at `document_start`) — manages the Strava UI: injects buttons into Strava's layer picker via `MutationObserver`, adds the panorama toggle control, and handles the settings modal. Communicates with the page context via `window.postMessage`.

2. **`inject.js`** (injected into page context by `map-modifier.js`) — runs in Strava's JavaScript context. Contains `MoreMapsManager` which polls for Mapbox GL map instances by traversing React Fiber trees, then directly calls Mapbox GL APIs (`map.addLayer`, `map.addSource`, etc.) to swap tile sources.

3. **`panorama.js`** (also injected into page context) — handles panorama mode. Intercepts map clicks, renders a draggable/resizable floating window with an `<iframe>` pointing to `panorama.html`.

4. **`panorama.html` + `panorama-sandbox.js`** — sandboxed page that loads the actual Mapy.cz or Google Street View SDK. Runs in a CSP sandbox; communicates back to the page via `postMessage`.

### Message types (window.postMessage)

All cross-context communication uses `window.postMessage` with a `type` field:

| Type | Direction | Purpose |
|------|-----------|---------|
| `MOREMAPS_MAP_SWITCH` | content→page | Switch active map layer |
| `MOREMAPS_MAP_MOD_OPACITY` | content→page | Update layer opacity |
| `MOREMAPS_MAP_MOD_SATURATION` | content→page | Update layer saturation |
| `MOREMAPS_PANORAMA_TOGGLE` | bidirectional | Enable/disable panorama mode |
| `MOREMAPS_OPEN_SETTINGS` | page→content | Open API key settings modal |
| `MOREMAPS_API_KEY_UPDATED` | bidirectional | API key or provider changed |
| `INIT_PANO` | page→sandbox | Initialize panorama at coordinates |
| `PANO_YAW` | sandbox→page | Camera yaw changed |
| `PANO_POS` | sandbox→page | User navigated to new position |

### Key design decisions

- **React Fiber traversal** (`inject.js:370–453`): Strava uses React but doesn't expose map instances. `MoreMapsManager.findMaps()` scans React Fiber nodes (props, stateNode, hooks, context) heuristically to find Mapbox GL `Map` instances.

- **Strava layer detection** (`inject.js:243–333`): When switching to a custom tile source, Strava's base vector layers are hidden while overlay layers (heatmap, routes, markers) are kept. Detection is keyword-based on layer IDs.

- **Activity detail map exclusion**: The `#map-canvas` element on activity detail pages uses a different layer structure; the extension skips it entirely to avoid breaking it.

- **Strava CSS selectors** (`constants.js`): Strava uses obfuscated CSS class names (e.g., `MapDisplayControl_options__6iIQA`). These are defined in `MoreMapsConfig.SELECTORS` and will need updating if Strava changes their build.

### Storage

All persistent state lives in `localStorage` under keys prefixed `moremaps_`. The full key list is in `MoreMapsConfig.STORAGE_KEYS` (`constants.js`). API keys never leave the browser.

### Globals shared across injected scripts

`constants.js` defines `window.MoreMapsConfig` (map options, selectors, storage keys). `strings.js` adds `MoreMapsConfig.STRINGS` (UI text). These are loaded before `inject.js` and `panorama.js` so those scripts can reference `MoreMapsConfig` directly. `panorama.js` exposes `window.MoreMapsPanorama` for `inject.js` to call.
