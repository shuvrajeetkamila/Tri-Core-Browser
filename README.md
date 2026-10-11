# TRI-CORE BROWSER

A standalone Windows desktop browser built on Electron's bundled Chromium runtime. Three independent browser cores let you compare pages side by side; each core supports its own tabs, navigation history, bookmarks, downloads, and profile storage.

> **Honest graphics status (CI for app/source commit `eee56b7`, 2026-10-11):** The packaged Windows smoke validated three changing frames of TRI-CORE’s bundled WebGL2 scene at three capture resolutions: Electron `capturePage()` PNG → AMD FSR 1.0.2 EASU + RCAS in a separate D3D12 helper on WARP software → PNG/report validation. The portable Windows artifact assembled and uploaded successfully ([Actions run 38149140832](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140832)). This is a bounded screenshot/readback preview, not zero-copy, real-time, arbitrary-page upscaling, or performance evidence. Physical-GPU validation is not run. DLSS remains unavailable, ordinary pages keep standard Chromium rendering, and no performance gain is claimed.

## What works today

- A native Windows desktop application with a Chromium rendering engine bundled in the application; Chrome or Edge does not need to be installed separately.
- Three live, side-by-side browser cores. Each has an address/search bar, Back, Forward, Reload, Stop, Home, and up to 20 tabs.
- HTTPS navigation with Chromium's normal certificate validation. Address/search text accepts HTTP(S) URLs, host names, and DuckDuckGo searches; non-web protocols are never navigated as pages.
- Persistent, separate cookie and website-storage partitions for each core (tabs inside the same core share that core's session).
- Local bookmarks and basic history, a session downloads panel, and a configurable home page.
- Sandboxed web contents, context isolation, no Node.js access in remote pages, and site permissions denied by default.
- A controlled WebAssembly module that is compiled and executed by Chromium/V8, checks `add(19, 23) = 42`, and measures repeatable WASM call throughput.
- GPU/Chromium diagnostics, including Electron's reported GPU information and a WebGPU adapter probe when exposed by the system.
- Honest WASM, DLSS, FSR, Hybrid, and Standard mode state with safe fallback behavior.

## Windows download and launch

**Release status:** the tested portable build for app/source commit `eee56b7` is available as the `TriCoreBrowser-Windows-x64` Actions artifact in [run 38149140832](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140832) (30-day artifact retention). No new public GitHub Release has been published; existing Releases predate this build.

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
| **AMD FSR MODE** | Selects the status for the limited FSR1 diagnostic; it does not replace normal page rendering. In the advanced panel, a user may opt in to capture the bundled WebGL2 test scene as a PNG, process it through the native AMD FSR1 EASU + RCAS D3D12 helper, and view a returned preview. | The packaged three-frame/three-resolution capture-to-FSR path passed on WARP software in CI. This validates only the controlled diagnostic scene, not a physical GPU or arbitrary webpage. It is not an in-compositor, zero-copy, or real-time upscaler. Standard Chromium remains active for regular pages. |
| **HYBRID MODE** | Applies the automatic native-backend priority only when a compatible, initialized renderer integration is proven. | DLSS is unavailable and the FSR capture helper is manual-only, so normal pages safely stay on standard Chromium; WASM remains a separate runtime diagnostic. |
| **STANDARD MODE** | Uses the normal Chromium renderer; Chromium/the driver chooses hardware or software compositing. | Implemented and active by default. |

The advanced panel distinguishes Chromium's GPU/WebGPU capability information from actual DLSS/FSR integration. Read [Graphics integration status](docs/GRAPHICS_INTEGRATION.md) before interpreting the controls.

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

This is an early, compact browser product built on Electron's bundled Chromium, not a custom Chromium fork. It loads real websites but is not a feature-complete replacement for a major browser. Chromium `WebContentsView` does not provide arbitrary websites' per-frame color/depth/motion-vector resources or a supported native swap-chain bridge. The FSR diagnostic is deliberately limited to the bundled scene and screenshot/readback preview; it does not upscale ordinary webpages, external apps, WebGPU games, video, DRM, or cloud streams. No NVIDIA Streamline/DLSS integration or physical-GPU validation is included. See [Known limitations](docs/KNOWN_LIMITATIONS.md).

## Project documents

- [Initial repository audit](docs/INITIAL_REPOSITORY_AUDIT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Windows build](docs/BUILD_WINDOWS.md)
- [Graphics integration status](docs/GRAPHICS_INTEGRATION.md)
- [Browser-frame FSR technical decision record](docs/BROWSER_FRAME_UPSCALING_DECISION_RECORD.md)
- [Native FSR1 harness and reproducing the PNG path](native/fsr1-poc/README.md)
- [Implementation plan and acceptance gates](docs/GAMING_UPSCALING_IMPLEMENTATION_PLAN.md)
- [Test results](docs/TEST_RESULTS.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Licensing and redistribution audit](docs/LICENSE_COMPLIANCE.md)
- [Third-party notices](THIRD_PARTY_NOTICES.txt)
- [Build report](BUILD_REPORT.txt) and [size audit](SIZE_AUDIT.txt)

## License

The project source is provided under the MIT License. Third-party dependencies and runtime components retain their own licenses; see [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt), and [docs/LICENSE_COMPLIANCE.md](docs/LICENSE_COMPLIANCE.md).
