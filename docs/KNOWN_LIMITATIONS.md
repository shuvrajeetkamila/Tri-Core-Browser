# Known limitations and blockers

**Status date:** 2026-10-11. Use the current build report/test report for newer Windows CI outcomes.

## Graphics (major feature gap)

- **NVIDIA DLSS: NOT IMPLEMENTED / BLOCKED.** No authorized Streamline/DLSS runtime or feature plugin, native renderer integration, or compatible NVIDIA hardware evidence is included. A detected NVIDIA device does not activate the control; no DLSS/Frame Generation processing is claimed.
- **AMD FSR: bounded diagnostic only; browser-frame path unverified.** The source includes pinned, MIT-licensed FSR1 EASU/RCAS shader inputs and a separate D3D12 helper. Only the bundled animated WebGL2 scene may be explicitly captured from its active `WebContentsView` with Electron `capturePage()` PNG and processed into a preview. This is CPU screenshot/readback plus a separate D3D12 upload/readback, not zero-copy or compositor integration. On app-source commit `b7e844f`, native CMake/MSVC and synthetic WARP regression passed, the executable presence/size check passed, but the separate packaged smoke step failed and no browser-frame evidence was accepted. Physical-GPU and AMD-vendor testing remain `NOT RUN`.
- **Hybrid: policy/controller only for normal pages.** It does not auto-enable the one-shot FSR screenshot helper or stack DLSS/FSR. Ordinary pages keep standard Chromium rendering; WASM remains a runtime diagnostic, not upscaling.
- **No general website upscaling.** `WebContentsView` does not expose arbitrary page depth, motion vectors, native color render targets or a supported swap-chain bridge to this app. Arbitrary WebGL/WebGPU pages/games, video, DRM, cloud streaming and external apps are unsupported/not tested. A broader solution needs explicit Chromium compositor/native graphics integration, not GPU detection.
- **No performance or image-quality claims.** The helper reports capture, native wall/fence, and GPU timings when available, plus image sanity metrics. These are not game FPS, and doubling output dimensions does not establish faster rendering or image-quality superiority.

## Browser feature gaps

- Three simultaneous browser cores with per-core tabs are provided; this is not a full single-window tab strip. Each core is capped at 20 tabs.
- No extensions, password manager, account, bookmark/history sync, private/incognito mode, tab groups, browser profiles UI, or cross-device sync.
- Bookmarks/history/home-page preference are stored in one local JSON file in Electron's user-data folder. There is no export/import or automatic cloud backup.
- The downloads list is for the current application session. Downloads go to the Windows Downloads folder; they are not automatically executed.
- Site permissions are denied by default. There is no per-site permission UI or certificate exception UI.
- The browser is not a custom Chromium build. It inherits Electron's Chromium update cadence and security lifecycle; rebuild and publish promptly when Electron/Chromium updates are required.

## Platform, build and release

- Windows x64 is the target. The Linux Arena container cannot compile or launch the app. Windows CI compiled the native helper and completed `npm run package:win` on app-source commit `b7e844f`; the executable presence/size check passed, but the packaged smoke step failed, so no downloadable current-source package is available.
- The app is unsigned. Windows SmartScreen may warn and Windows has no verified publisher identity for this binary.
- The current Windows workflow is designed to cover app-shell controls, local HTTP/JavaScript/WASM, tab lifecycle, and three changing, three-resolution browser-captured FSR1 frames on software WARP. On app-source commit `b7e844f`, the executable presence/size check passed and the separate packaged smoke step failed; the exact internal app/smoke error is unknown. A diagnostics artifact was uploaded, but its signed download was not accessible in this environment. The optional `https://example.com/` runtime probe can be **BLOCKED** if the hosted runner/network cannot reach it, and certificate checks are never bypassed.
- Full npm audit currently reports 8 moderate findings and 0 high/critical findings in the locked Electron/build toolchain. Electron is a dev dependency used to assemble the bundled runtime, so an `--omit=dev` audit would exclude it; CI audits the full lockfile, retains the report/tree and fails on high or critical findings.

See `docs/GRAPHICS_INTEGRATION.md`, `docs/BUILD_WINDOWS.md`, and `docs/TEST_RESULTS.md` for the current evidence and next steps.
