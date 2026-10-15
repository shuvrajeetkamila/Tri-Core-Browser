# TRI-CORE BROWSER

A standalone Windows desktop browser built on Electron's bundled Chromium runtime. Three independent browser cores let you compare pages side by side; each core supports its own tabs, navigation history, bookmarks, downloads, and profile storage.

> **Honest graphics status (2026-10-12; tested commit `ef83a60`):** The app contains an opt-in, game-owned WebGPU FSR1 EASU + RCAS scene; it does not change ordinary pages. Hosted Windows run [38287627583](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38287627583) passed executable build/validation, packaged smoke, Level A evidence validation, and summary writing. It uploaded an explicitly **unverified** executable candidate (about 105 MB) and diagnostics (about 720 KB). The report body was not inspected, so the optional WebGPU result remains **UNKNOWN** (the successful validator permits either a real `PASS` or safe `SKIPPED`); EASU/RCAS dispatch and visible output are not claimed. Separate Windows D3D12/WARP harness run [38287627651](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38287627651) passed its one-frame synthetic EASU + RCAS check on software WARP, not a physical GPU. Portable release assembly and Level B were skipped; physical-GPU validation is **NOT RUN**. DLSS is not integrated, WASM is only a CPU/runtime diagnostic, and ordinary pages stay on Chromium. See the [FSR1 WebGPU acceptance ledger](docs/FSR1_WEBGPU_ACCEPTANCE_LEDGER.md) and [architecture decision record](docs/BROWSER_FRAME_UPSCALING_DECISION_RECORD.md).

## What works today

- A native Windows desktop application with a Chromium rendering engine bundled in the application; Chrome or Edge does not need to be installed separately.
- Three live, side-by-side browser cores. Each has an address/search bar, Back, Forward, Reload, Stop, Home, and up to 20 tabs.
- A prominent **Full screen** button expands the active core into an immersive OS-fullscreen window and hides the browser controls; **Exit full screen** or **F11** restores the previous three-core/focused layout.
- HTTPS navigation with Chromium's normal certificate validation. Address/search text accepts HTTP(S) URLs, host names, and DuckDuckGo searches; non-web protocols are never navigated as pages.
- Persistent, separate cookie and website-storage partitions for each core (tabs inside the same core share that core's session).
- Local bookmarks and basic history, a session downloads panel, and a configurable home page.
- Sandboxed web contents, context isolation, no Node.js access in remote pages, and site permissions denied by default.
- A controlled WebAssembly module that is compiled and executed by Chromium/V8, checks `add(19, 23) = 42`, and measures repeatable WASM call throughput.
- GPU/Chromium diagnostics, including Electron's reported GPU information and a WebGPU adapter probe when exposed by the system.
- A source-implemented, controlled opt-in WebGPU game scene with its own render target and AMD FSR1 EASU + RCAS compute path; run 38287627583 passed Windows smoke and Level A evidence validation, but per-stage report contents were not inspected, so the exact WebGPU processing and visible-pixel result remain **UNKNOWN**. Ordinary pages are not intercepted.
- Honest WASM, DLSS, FSR, Hybrid, and Standard mode state with safe fallback behavior.

## Windows download and launch

**Available diagnostic artifact:** [run 38287627583](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38287627583) contains `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` and `TriCoreBrowser-Packaged-Smoke-Diagnostics`. The packaged EXE built, passed package validation and smoke, and the evidence validator passed. Its optional WebGPU result remains unknown because this report does not include the diagnostic contents; no EASU/RCAS runtime PASS or physical-GPU claim is made. The portable distribution ZIP and public release were not produced because strict release assembly requires the separate physical-GPU gate. See [Windows build and test](docs/BUILD_WINDOWS.md) for the normal-driver validation procedure; never use unsafe adapter/blocklist overrides.

1. Open [run 38287627583](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38287627583) and download `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` from its **Artifacts** section.
2. Extract the artifact ZIP to obtain `TriCoreBrowser.exe`. The executable includes Electron/Chromium, is unsigned, and is not a release-certified package.
3. On a supported Windows system, follow `docs/BUILD_WINDOWS.md` to run the strict WebGPU check with the system's normal GPU driver. Browser profile data is stored under the Windows user profile.

The Windows executable is unsigned; Windows may display its normal SmartScreen/publisher warning. The candidate is for diagnostics only. Do not use it as evidence of successful live FSR processing or physical-GPU support; physical-GPU validation remains **NOT RUN**.

## Graphics and WASM modes

Open **Modes** in the top toolbar.

| Mode | What it actually does | Current status |
| --- | --- | --- |
| **WASM MODE** | Compiles and runs the project's small WebAssembly test inside Chromium/V8. | Implemented; test result and timing are shown. It does not upscale pages or promise higher frame rates. |
| **NVIDIA DLSS MODE** | Requests a native DLSS rendering path. | **Not integrated.** The controller reports why and falls back to standard Chromium. An NVIDIA GPU/driver alone is not enough. |
| **AMD FSR MODE** | The advanced panel exposes two clearly separated paths: (1) an opt-in bundled WebGPU game scene with its own lower-resolution target, EASU/RCAS compute passes, and visible-canvas presentation; and (2) a screenshot/readback diagnostic using Electron `capturePage()` PNG → a separate native D3D12 helper. | Windows run [38287627583](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38287627583) passed build, packaged smoke, and evidence validation, but per-stage diagnostics were not inspected; the optional WebGPU `PASS` versus safe `SKIPPED` result is **UNKNOWN**. No live EASU/RCAS result is claimed. The validator passed the separate WARP PNG diagnostic gate. Native harness run [38287627651](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38287627651) passed a synthetic EASU+RCAS frame on software WARP. Physical GPU remains **NOT RUN**; portable distribution assembly was skipped. Ordinary pages remain standard Chromium. |
| **HYBRID MODE** | Applies automatic priority only to a compatible, initialized integration that is eligible for the current rendering scope. | DLSS is unavailable; the controlled FSR game scene is intentionally excluded from automatic selection for ordinary tabs. Normal pages stay on Chromium; WASM remains a separate runtime diagnostic. |
| **STANDARD MODE** | Uses the normal Chromium renderer; Chromium/the driver chooses hardware or software compositing. | Implemented and active by default. |

The advanced panel distinguishes Chromium's GPU/WebGPU capability information from actual DLSS/FSR integration. Read [Graphics integration status](docs/GRAPHICS_INTEGRATION.md) before interpreting the controls.

### Immersive full-screen gaming view

Select or focus the browser core you want to use, then press the large **Full screen** button in the top toolbar. The app enters OS fullscreen, expands that core's live browser view, and hides the settings, mode panel, tabs, address bar, and other app chrome. A small **Exit full screen** control remains at the top so the mode stays reversible; **F11** also toggles it. Exiting restores the prior three-core or single-core layout. This changes window/layout presentation only—it does not change a page's graphics API, add an upscaler, or promise better performance.

## Build from source

Requirements: Windows x64, Node.js **22.22.3**, npm, and an internet connection to restore the lockfile dependencies.

```powershell
npm ci
npm test
npm run build
npm run package:win
```

The portable executable is written to `release/TriCoreBrowser.exe`. To build an optional guided installer instead, run `npm run package:win:installer`. Detailed instructions and the Windows CI smoke test are in [docs/BUILD_WINDOWS.md](docs/BUILD_WINDOWS.md).

The GitHub Actions workflow builds on a Windows runner, tests the packaged application, and uploads both the executable and portable ZIP as downloadable workflow artifacts. A separate prerelease workflow publishes only after explicit opt-in (for this session branch, a commit titled `[publish-prerelease v1.0.0-alpha.2]`); ordinary pushes do not publish a public release.

## Browser profile and privacy

- The three cores have independent persistent cookies and local storage. Tabs within a core share that core's partition.
- Bookmarks, history, and the home-page preference are stored locally in `browser-data.json` under Electron's per-user application-data directory. History can be cleared from the History panel.
- Downloads are saved in the Windows Downloads folder and listed for the current application session. A downloaded file is never launched automatically.
- Site permissions, including camera, microphone, location, and notifications, are denied by default. Extensions, password sync, private/incognito windows, and cross-device sync are not included.
- The browser does not bypass TLS/certificate checks, disable Chromium's sandbox, or grant remote pages native code access.

## Feature maturity and limitations

This is an early, compact browser product built on Electron's bundled Chromium, not a custom Chromium fork. The WebGPU FSR1 path is app/game-owned and does not intercept ordinary pages. Electron's experimental offscreen shared-texture route, WebGPU video/image import, and Windows Graphics Capture are documented APIs or candidates—not validated TRI-CORE browser features. The separate `capturePage()` PNG path remains a readback diagnostic. Transparent arbitrary-page processing, protected/DRM video, cloud-stream and external-app enhancement are unsupported/not tested. DLSS is not integrated; WASM is not an upscaler; physical-GPU validation is **NOT RUN**. See [Known limitations](docs/KNOWN_LIMITATIONS.md) and the [architecture decision record](docs/BROWSER_FRAME_UPSCALING_DECISION_RECORD.md).

## Project documents

- [Initial repository audit](docs/INITIAL_REPOSITORY_AUDIT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Windows build](docs/BUILD_WINDOWS.md)
- [Graphics integration status](docs/GRAPHICS_INTEGRATION.md)
- [Browser-frame FSR technical decision record](docs/BROWSER_FRAME_UPSCALING_DECISION_RECORD.md)
- [Native FSR1 harness and reproducing the PNG path](native/fsr1-poc/README.md)
- [Implementation plan and acceptance gates](docs/GAMING_UPSCALING_IMPLEMENTATION_PLAN.md)
- [Test results](docs/TEST_RESULTS.md)
- [FSR1 WebGPU acceptance ledger](docs/FSR1_WEBGPU_ACCEPTANCE_LEDGER.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Licensing and redistribution audit](docs/LICENSE_COMPLIANCE.md)
- [Third-party notices](THIRD_PARTY_NOTICES.txt)
- [Build report](BUILD_REPORT.txt) and [size audit](SIZE_AUDIT.txt)

## License

The project source is provided under the MIT License. Third-party dependencies and runtime components retain their own licenses; see [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt), and [docs/LICENSE_COMPLIANCE.md](docs/LICENSE_COMPLIANCE.md).
