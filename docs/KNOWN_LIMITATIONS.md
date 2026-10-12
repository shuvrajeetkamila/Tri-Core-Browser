# Known limitations and blockers

**Status date:** 2026-10-12. Use the current build report/test report for newer Windows CI outcomes.

## Graphics (major feature gap)

- **NVIDIA DLSS Super Resolution and Frame Generation: NOT IMPLEMENTED / BLOCKED.** No authorized Streamline/DLSS runtime/plugin, application-ID approval, native renderer integration, or compatible NVIDIA hardware result is included. DLSS-SR and DLSS-G are separate native rendering integrations; a detected NVIDIA device never activates either control.
- **AMD FSR1: scoped WebGPU game-side vertical slice in source; current Windows packaged runtime validation pending.** The bundled WebGPU scene is implemented with its own lower-resolution target, EASU/RCAS compute pipelines, and visible-canvas presentation; the processing path has no CPU pixel readback. Diagnostic texture copies and a screenshot are captured only after processing and never feed FSR. Current-source Windows WGSL/pipeline/dispatch, numerical-stage, motion, and screenshot-visible-output validation must pass before claiming runtime support. Physical-GPU/AMD-vendor validation remains **NOT RUN**; see the [FSR1 WebGPU acceptance ledger](FSR1_WEBGPU_ACCEPTANCE_LEDGER.md).
- **`capturePage()` PNG → native D3D12 FSR1: diagnostic-only.** The separately labeled WebGL2 screenshot test captures PNGs, processes them in an app-owned D3D12 helper, and previews output. The prior packaged CI pass on source commit `eee56b7` used WARP software and proved only three controlled screenshots; it is not live integration, zero-copy, arbitrary-page support, or physical-GPU evidence.
- **Hybrid/Auto: no general-page FSR activation.** The scene-specific FSR path is excluded from automatic selection for ordinary tabs. DLSS is unavailable; standard pages stay on Chromium; WASM is a runtime diagnostic and never upscales.
- **No arbitrary website upscaling.** `WebContentsView` does not expose arbitrary page depth, motion vectors, native color render targets or a supported swap-chain bridge to this app. Electron 44.7.0 documents experimental offscreen shared textures, but the upstream end-to-end spec is gated to macOS arm64 and Windows app-level capture/import/visible-output behavior remains unverified. Arbitrary WebGL/WebGPU pages/games, video, DRM, cloud streaming and external apps are unsupported/not tested.
- **No performance/image-quality claims.** WebGPU `performance.now()` timing is queue-completion wall time, not GPU timestamp. The screenshot helper's capture/readback/helper timings are diagnostic, not game FPS. Output dimensions alone do not establish better quality or faster rendering.

## Browser feature gaps

- Three simultaneous browser cores with per-core tabs are provided; this is not a full single-window tab strip. Each core is capped at 20 tabs.
- No extensions, password manager, account, bookmark/history sync, private/incognito mode, tab groups, browser profiles UI, or cross-device sync.
- Bookmarks/history/home-page preference are stored in one local JSON file in Electron's user-data folder. There is no export/import or automatic cloud backup.
- The downloads list is for the current application session. Downloads go to the Windows Downloads folder; they are not automatically executed.
- Site permissions are denied by default. There is no per-site permission UI or certificate exception UI.
- The browser is not a custom Chromium build. It inherits Electron's Chromium update cadence and security lifecycle; rebuild and publish promptly when Electron/Chromium updates are required.

## Platform, build and release

- Windows x64 is the target. The Linux Arena container cannot compile or launch the app. Windows CI compiled the native helper, completed `npm run package:win`, passed the packaged smoke and portable assembly gates, and uploaded `TriCoreBrowser-Windows-x64` for app/source commit `eee56b7` ([run 38149140832](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140832)). The successful output is a time-limited Actions artifact; no public GitHub Release has been published for this source.
- The app is unsigned. Windows SmartScreen may warn and Windows has no verified publisher identity for this binary.
- Windows CI on prior app/source commit `eee56b7` passed the packaged checks for app shell, local HTTP/JavaScript/WASM, tab lifecycle, and the screenshot-only three-frame/three-resolution FSR1 PNG diagnostic on software WARP. That prior run did not test the new WebGPU vertical slice. The current source needs a fresh Windows packaged smoke; physical GPU remains **NOT RUN**. The optional `https://example.com/` runtime probe may be **BLOCKED** if the hosted runner/network cannot reach it; certificate checks are never bypassed.
- Full npm audit reports 8 moderate findings and 0 high/critical findings in the locked Electron/build toolchain. The unresolved path ends at `sprintf-js@1.1.3` through the builder's `roarr`/`global-agent`/`@electron/get` chain. No compatible published patch was found; npm's suggested forced builder change is breaking, so no force, downgrade, or unverified override was applied. Electron is a dev dependency used to assemble the bundled runtime, so an `--omit=dev` audit would exclude it; CI audits the full lockfile, retains the report/tree and fails on high or critical findings. See `docs/TEST_RESULTS.md` for the review and safe-remediation decision.

See `docs/GRAPHICS_INTEGRATION.md`, `docs/BUILD_WINDOWS.md`, `docs/TEST_RESULTS.md`, and `docs/FSR1_WEBGPU_ACCEPTANCE_LEDGER.md` for the current evidence and next steps.
