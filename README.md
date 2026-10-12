# TRI-CORE BROWSER

A standalone Windows desktop browser built on Electron's bundled Chromium runtime. Three independent browser cores let you compare pages side by side; each core supports its own tabs, navigation history, bookmarks, downloads, and profile storage.

> **Honest graphics status (2026-10-12):** Source implements a bounded, game-owned WebGPU FSR1 EASU + RCAS path for the bundled test scene, with GPU-resident processing and visible-canvas presentation. The latest packaged Windows run [38228901586](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38228901586), source `3123975`, passed packaging, browser/WASM, fullscreen, and separate screenshot→D3D12 WARP checks, but WebGPU returned no adapter for high-performance, low-power, default, or explicit fallback requests. Chromium exposed Microsoft Basic Render Driver / ANGLE D3D11 WARP; the native diagnostic confirmed WARP availability and no non-software D3D12 adapter. No WebGPU shaders or dispatches ran. We did not bypass Chromium's adapter blocklist or enable unsafe WebGPU. The separate `capturePage()` PNG → native D3D12 helper remains diagnostic only. WARP is software, not physical-GPU evidence; physical-GPU validation is **NOT RUN**. Ordinary pages remain standard Chromium; no general support or performance gain is claimed. DLSS remains unavailable. See the [FSR1 WebGPU acceptance ledger](docs/FSR1_WEBGPU_ACCEPTANCE_LEDGER.md) for the verified gate results and next route.

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
- A source-implemented, controlled opt-in WebGPU game scene with its own render target and AMD FSR1 EASU + RCAS compute path; packaged Windows shader/pipeline/dispatch and visible-pixel validation is pending, and ordinary pages are not intercepted.
- Honest WASM, DLSS, FSR, Hybrid, and Standard mode state with safe fallback behavior.

## Windows download and launch

**Available artifact:** a portable build for app/source commit `eee56b7` is available as the `TriCoreBrowser-Windows-x64` Actions artifact in [run 38149140832](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140832) (30-day artifact retention). That build predates the new WebGPU FSR1 scene and does not validate it. The latest packaged test [run 38228901586](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38228901586), source `3123975`, built the current executable but failed the live WebGPU adapter gate; no accepted current-source app artifact or new public GitHub Release was produced. The strict smoke can be reproduced on a Windows machine with a Chromium-supported WebGPU adapter using the steps in [Windows build and test](docs/BUILD_WINDOWS.md); unsafe adapter/blocklist overrides are not used.

1. Open the linked Actions run and download the `TriCoreBrowser-Windows-x64` artifact.
2. Extract the Actions artifact, then optionally extract `TriCoreBrowser-Windows-x64-portable.zip`.
3. Run `TriCoreBrowser.exe`. The portable application includes its Electron/Chromium runtime; no separate browser installation is required.

The Windows executable is currently unsigned. Windows may display its normal SmartScreen/publisher warning. Download only from this repository's Releases or the successful Actions artifact linked above, and verify the SHA-256 file included with the package. Browser profile data is kept in your Windows user profile, not beside the executable.

## Graphics and WASM modes

Open **Modes** in the top toolbar.

| Mode | What it actually does | Current status |
| --- | --- | --- |
| **WASM MODE** | Compiles and runs the project's small WebAssembly test inside Chromium/V8. | Implemented; test result and timing are shown. It does not upscale pages or promise higher frame rates. |
| **NVIDIA DLSS MODE** | Requests a native DLSS rendering path. | **Not integrated.** The controller reports why and falls back to standard Chromium. An NVIDIA GPU/driver alone is not enough. |
| **AMD FSR MODE** | The advanced panel exposes two clearly separated paths: (1) an opt-in bundled WebGPU game scene with its own lower-resolution target, EASU/RCAS compute passes, and visible-canvas presentation; and (2) a screenshot/readback diagnostic using Electron `capturePage()` PNG → a separate native D3D12 helper. | Packaged Windows run [38228901586](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38228901586), source `3123975`, tried high-performance, low-power, default, and explicit fallback adapter requests; all returned `null` on the hosted runner. Shader/pipeline creation, dispatch, numerical GPU output, and screenshot-visible output were therefore **not run**. Chromium reported Microsoft Basic Render Driver / D3D11 WARP; native D3D12 reports WARP available and no non-software adapters. We did not bypass Chromium's adapter blocklist or relax the smoke gate. The next route is to run the packaged gate on Windows with a Chromium-supported WebGPU adapter. The PNG path is diagnostic only; WARP results are software evidence, not live WebGPU integration or physical-GPU validation. Ordinary pages remain standard Chromium. |
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

This is an early, compact browser product built on Electron's bundled Chromium, not a custom Chromium fork. It loads real websites but is not a feature-complete replacement for a major browser. The WebGPU FSR1 vertical slice is game-owned and only processes the bundled scene (or a game that explicitly integrates its own WebGPU target); it does not intercept normal DOM pages or third-party games. Electron's experimental offscreen shared-texture API was investigated but has not been proven end-to-end on Windows or integrated into visible tabs. The separate `capturePage()` PNG path remains a screenshot/readback diagnostic only. Arbitrary page/compositor, video/DRM, cloud-stream and external-app upscaling are unsupported. DLSS is not integrated and physical-GPU validation is **NOT RUN**. See [Known limitations](docs/KNOWN_LIMITATIONS.md).

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
