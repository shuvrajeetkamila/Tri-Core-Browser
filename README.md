# TRI-CORE BROWSER

A standalone Windows desktop browser built on Electron's bundled Chromium runtime. Three independent browser cores let you compare pages side by side; each core supports its own tabs, navigation history, bookmarks, downloads, and profile storage.

> **Honest graphics status:** Chromium WebAssembly is exercised by a real, repeatable diagnostic. The app reports GPU and WebGPU capabilities. **NVIDIA DLSS and AMD FSR are not integrated** in this release: their controls explicitly report that they are unavailable and retain standard Chromium rendering. No DLSS/FSR activity or frame-rate improvement is simulated or claimed.

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

**Release status:** download only a tested prerelease produced by Windows CI. If the Releases page has no matching assets, a verified Windows download is not yet available.

1. Open the [GitHub Releases page](https://github.com/shuvrajeetkamila/Tri-Core-Browser/releases) and download `TriCoreBrowser.exe` or the `TriCoreBrowser-Windows-x64-portable.zip` package from a tested release.
2. If you downloaded the ZIP, extract it first.
3. Run `TriCoreBrowser.exe`. The portable application includes its Electron/Chromium runtime; no separate browser installation is required.

The Windows executable is currently unsigned. Windows may display its normal SmartScreen/publisher warning. Download only from this repository's releases and verify the SHA-256 file included with each package. Browser profile data is kept in your Windows user profile, not beside the executable.

## Graphics and WASM modes

Open **Modes** in the top toolbar.

| Mode | What it actually does | Current status |
| --- | --- | --- |
| **WASM MODE** | Compiles and runs the project's small WebAssembly test inside Chromium/V8. | Implemented; test result and timing are shown. It does not upscale pages or promise higher frame rates. |
| **NVIDIA DLSS MODE** | Requests a native DLSS rendering path. | **Not integrated.** The controller reports why and falls back to standard Chromium. An NVIDIA GPU/driver alone is not enough. |
| **AMD FSR MODE** | Requests a native FidelityFX/FSR rendering path. | **Not integrated.** The controller reports why and falls back to standard Chromium. |
| **HYBRID MODE** | Runs the controlled WASM diagnostic and checks whether an upscaler can be used. | The WASM part works; no upscaler is currently available, so the browser safely stays on standard Chromium rendering. |
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

The GitHub Actions workflow builds on a Windows runner, tests the packaged application, and uploads both the executable and portable ZIP as downloadable workflow artifacts. A separate prerelease workflow publishes only after explicit opt-in (for this session branch, a commit titled `[publish-prerelease v1.0.0-alpha.1]`); ordinary pushes do not publish a public release.

## Browser profile and privacy

- The three cores have independent persistent cookies and local storage. Tabs within a core share that core's partition.
- Bookmarks, history, and the home-page preference are stored locally in `browser-data.json` under Electron's per-user application-data directory. History can be cleared from the History panel.
- Downloads are saved in the Windows Downloads folder and listed for the current application session. A downloaded file is never launched automatically.
- Site permissions, including camera, microphone, location, and notifications, are denied by default. Extensions, password sync, private/incognito windows, and cross-device sync are not included.
- The browser does not bypass TLS/certificate checks, disable Chromium's sandbox, or grant remote pages native code access.

## Feature maturity and limitations

This is an early, compact browser product built on Electron's bundled Chromium, not a custom Chromium fork. It loads real websites but is not a feature-complete replacement for a major browser. **DLSS and FSR are not implemented**, and Chromium `WebContentsView` does not provide this application with the per-frame color/depth/motion-vector inputs or native swap-chain required to run those upscalers on arbitrary websites. No compatible native graphics demonstration is bundled yet. See [Known limitations](docs/KNOWN_LIMITATIONS.md).

## Project documents

- [Initial repository audit](docs/INITIAL_REPOSITORY_AUDIT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Windows build](docs/BUILD_WINDOWS.md)
- [Graphics integration status](docs/GRAPHICS_INTEGRATION.md)
- [Test results](docs/TEST_RESULTS.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Licensing and redistribution audit](docs/LICENSE_COMPLIANCE.md)
- [Third-party notices](THIRD_PARTY_NOTICES.txt)
- [Build report](BUILD_REPORT.txt) and [size audit](SIZE_AUDIT.txt)

## License

The project source is provided under the MIT License. Third-party dependencies and runtime components retain their own licenses; see [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt), and [docs/LICENSE_COMPLIANCE.md](docs/LICENSE_COMPLIANCE.md).
