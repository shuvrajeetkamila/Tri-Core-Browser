# Known limitations and blockers

**Status date:** 2026-10-11. Use the current build report/test report for newer Windows CI outcomes.

## Graphics (major feature gap)

- **NVIDIA DLSS: NOT IMPLEMENTED / BLOCKED.** No Streamline/DLSS native integration, authorized runtime feature binary, or per-frame browser render bridge is included. It has not been tested on an NVIDIA GPU. A detected NVIDIA device does not activate the control.
- **AMD FSR: NOT IMPLEMENTED / BLOCKED.** No FidelityFX SDK integration or native render demonstration is included. It has not been tested on AMD hardware.
- **Hybrid: partial controller only.** The controller can execute the independent WASM diagnostic and safely use standard Chromium rendering. It does not upscale a webpage and does not stack DLSS/FSR.
- **No general website upscaling.** `WebContentsView` does not expose page depth, motion vectors, native color render targets or a supported swap-chain bridge to this app. A broader solution needs an explicit Chromium compositor/native graphics integration, not just GPU detection.
- **No graphics performance or image-quality claims.** No frame-time, latency, image-quality or FPS measurements are published because no compatible upscaler path exists in this build.

## Browser feature gaps

- Three simultaneous browser cores with per-core tabs are provided; this is not a full single-window tab strip. Each core is capped at 20 tabs.
- No extensions, password manager, account, bookmark/history sync, private/incognito mode, tab groups, browser profiles UI, or cross-device sync.
- Bookmarks/history/home-page preference are stored in one local JSON file in Electron's user-data folder. There is no export/import or automatic cloud backup.
- The downloads list is for the current application session. Downloads go to the Windows Downloads folder; they are not automatically executed.
- Site permissions are denied by default. There is no per-site permission UI or certificate exception UI.
- The browser is not a custom Chromium build. It inherits Electron's Chromium update cadence and security lifecycle; rebuild and publish promptly when Electron/Chromium updates are required.

## Platform, build and release

- Windows x64 is the target. The application has not been compiled or launched directly in the Linux Arena container; the mandatory Windows GitHub Actions build/smoke test must pass before claiming a downloadable executable.
- The app is unsigned. Windows SmartScreen may warn and Windows has no verified publisher identity for this binary.
- The first Windows smoke test covers app-shell controls, a local HTTP site, JavaScript, the controlled WASM module, and tab creation/selection/closure. The optional `https://example.com/` runtime probe can be **BLOCKED** if the hosted runner/network cannot reach it; certificate checks are never bypassed.
- Full npm audit currently reports moderate findings in development/build dependencies. The runtime dependency audit (`npm audit --omit=dev`) reports no production dependencies; CI retains the full audit JSON and fails on high or critical findings.

See `docs/GRAPHICS_INTEGRATION.md`, `docs/BUILD_WINDOWS.md`, and `docs/TEST_RESULTS.md` for the current evidence and next steps.
