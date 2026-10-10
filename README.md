# Tri-Core Browser

A desktop browser workspace with three independent web pages side by side. Use one core to discover, another to compare, and a third to verify—without juggling tabs.

![Tri-Core Browser icon](assets/tricore.svg)

## Features

- **Three live browser cores** in one desktop window, each with its own address/search bar and Back, Forward, and Reload controls.
- **Independent sessions:** each core has its own persistent cookies and site storage, so sign-ins and site data are not shared between cores.
- **Sync navigation:** optionally send one submitted URL or search to all three cores.
- **Focus mode:** expand one core temporarily, then return to the three-pane view.
- **Keyboard shortcuts:** `Ctrl/Cmd + L` focuses the active address bar; `Ctrl/Cmd + 1`, `2`, or `3` switches cores; `Ctrl/Cmd + R` reloads the active core; `Ctrl/Cmd + Shift + R` reloads all cores.
- Search text is sent to DuckDuckGo; ordinary domains automatically use HTTPS.
- Browser content is isolated from the app UI. Web pages have no Node.js access, and camera, microphone, location, and other permission requests are denied by default.

> **Preview note:** `npm run dev` launches a browser-based UI preview. Live websites are rendered in the packaged desktop app, not inside the preview page.

## Run locally

Requirements: Node.js 22 or newer and npm.

```bash
npm ci
npm run desktop
```

`npm run desktop` builds the UI and launches the Electron desktop app. The three cores start on DuckDuckGo; enter a website or a search in any address bar.

To view the interface preview in a browser instead:

```bash
npm run dev
```

## Build the Windows executable

```bash
npm ci
npm run package:win
```

This creates the portable x64 application at `release/TriCoreBrowser.exe`. The executable is unsigned; Windows may show its standard publisher warning. For a guided installer, run `npm run package:win:installer`; that creates `release/TriCoreBrowser-1.0.0-win-x64-setup.exe`.

Windows builds are also produced by GitHub Actions and uploaded as a downloadable workflow artifact named **TriCoreBrowser-Windows-x64**.

## Development and tests

```bash
npm test       # address normalization and URL-safety tests
npm run build  # production renderer build
npm run dev    # Vite UI preview on port 5173
```

## Project layout

```text
assets/                 App and browser-tab icons
electron/               Electron main process and safe preload bridge
src/                    Browser workspace UI and URL handling
tests/                  Node test suite
.github/workflows/      Build and test automation
```

## Privacy and limitations

Tri-Core Browser does not include telemetry or an account system. The browser cores use separate persistent Electron storage partitions. Websites still receive their normal network requests and may use their own cookies and trackers. Site permission prompts are denied by default in this initial release.

This is a compact Chromium-based browser workspace, not a full replacement for a major browser: extension installation, bookmark syncing, built-in password management, and tab groups are not included yet. Always install updates from a trusted source.

## License

MIT. See [LICENSE](LICENSE).
