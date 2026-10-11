# Known limitations and blockers

**Status date:** 2026-10-11. Use the current build report/test report for newer Windows CI outcomes.

## Graphics (major feature gap)

- **NVIDIA DLSS: NOT IMPLEMENTED / BLOCKED.** No authorized Streamline/DLSS runtime or feature plugin, native renderer integration, or compatible NVIDIA hardware evidence is included. A detected NVIDIA device does not activate the control; no DLSS/Frame Generation processing is claimed.
- **AMD FSR: bounded diagnostic only; packaged test-scene path verified on WARP.** The source includes pinned, MIT-licensed FSR1 EASU/RCAS shader inputs and a separate D3D12 helper. Only the bundled animated WebGL2 scene may be explicitly captured from its active `WebContentsView` with Electron `capturePage()` PNG and processed into a preview. Windows CI on app/source commit `eee56b7` verified three changing frames at three capture resolutions, reports, PNGs and references through the packaged workflow. This is CPU screenshot/readback plus a separate D3D12 upload/readback, not zero-copy or compositor integration. WARP is software; physical-GPU and AMD-vendor testing remain `NOT RUN`.
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

- Windows x64 is the target. The Linux Arena container cannot compile or launch the app. Windows CI compiled the native helper, completed `npm run package:win`, passed the packaged smoke and portable assembly gates, and uploaded `TriCoreBrowser-Windows-x64` for app/source commit `eee56b7` ([run 38149140832](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140832)). The successful output is a time-limited Actions artifact; no public GitHub Release has been published for this source.
- The app is unsigned. Windows SmartScreen may warn and Windows has no verified publisher identity for this binary.
- Windows CI on app/source commit `eee56b7` passed the packaged checks for app shell, local HTTP/JavaScript/WASM, tab lifecycle, and three changing, three-resolution browser-captured FSR1 frames on software WARP. Smoke captures/reports are retained in the Actions artifact. The optional `https://example.com/` runtime probe may be **BLOCKED** if the hosted runner/network cannot reach it; certificate checks are never bypassed.
- Full npm audit currently reports 8 moderate findings and 0 high/critical findings in the locked Electron/build toolchain. Electron is a dev dependency used to assemble the bundled runtime, so an `--omit=dev` audit would exclude it; CI audits the full lockfile, retains the report/tree and fails on high or critical findings.

See `docs/GRAPHICS_INTEGRATION.md`, `docs/BUILD_WINDOWS.md`, and `docs/TEST_RESULTS.md` for the current evidence and next steps.
