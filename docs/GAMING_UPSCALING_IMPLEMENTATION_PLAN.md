# Browser/game upscaling audit, decision, and implementation plan

**Audit date:** 2026-10-11
**Repository:** `shuvrajeetkamila/Tri-Core-Browser`
**Working branch:** `arena/66abfdc9-tri-core-browser` (session branch; do not switch)
**Audited starting commit:** `e27cb207d6be86a346420901a979b831cf849c00` (`Create Initial Release`)
**Current work:** the retained Electron browser source, graphics diagnostic and supporting tests/docs are implemented on the session branch. App/source commit `eee56b78a5259429b4e5d7be3b73adf21ec99365` passed Linux tests/build/audit, the native D3D12/WARP regression, and the packaged Windows workflow, including the bounded browser-capture-to-FSR smoke, portable assembly and artifact upload. This confirms only the bundled WebGL2 test scene on WARP software; no physical-GPU, arbitrary-page, performance, DLSS, or public-release claim is made. See [`docs/TEST_RESULTS.md`](TEST_RESULTS.md), [package run 38149140832](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140832), and [native WARP run 38149140851](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140851).

## Technical audit and decision

### Existing browser and graphics path

- TRI-CORE is an Electron 44.7.0 Windows x64 desktop app that packages Chromium/V8. `electron/main.cjs` manages three sandboxed `WebContentsView` browser cores and their tabs; each page is rendered/composited inside Chromium renderer/GPU processes. The repository does not contain or build a Chromium fork.
- The app can ask Electron/Chromium for GPU devices, feature status, WebGL/WebGPU capability and renderer strings. These are diagnostic observations. They do not expose an arbitrary web page's D3D12/Vulkan device, native color/depth/motion-vector resources, swap-chain or compositor texture handle, resource lifetime, or synchronization primitive.
- Electron's supported `WebContents.capturePage()` returns a `NativeImage`; `toPNG()` gives a safe screenshot/readback boundary. It is not zero-copy and does not provide a path back into Chromium's compositor.
- The pre-existing FSR1 harness owns its D3D12 device, queue and textures. AMD FSR 1.0.2 EASU/RCAS shaders can process textures owned by that D3D12 harness. The source now adds a PNG decode/upload path, so actual browser-rendered pixels can enter FSR through `capturePage()` without reaching into Chromium process memory.
- **Decision:** implement a deliberately bounded app-owned diagnostic vertical slice: animated browser WebGL2 scene → active/visible `WebContentsView` `capturePage()` PNG → WIC decode → separate app-owned D3D12 FSR1 EASU + RCAS → returned PNG preview in the local browser UI. The ordinary page continues rendering in Chromium. The path is screenshot/readback processing, not a game performance switch or general browser integration.
- **Rejected alternatives:** speculative cross-process texture handles/memory access; injecting hooks into arbitrary pages; desktop/DRM capture; treating a standalone synthetic texture as browser integration. A true compositor route needs a supported, maintained Chromium/Electron fork or equivalent integration.

### NVIDIA DLSS / Streamline

The official NVIDIA Streamline repository and DLSS programming guide were reviewed. A real native integration requires authorized feature/runtime distribution, the required app identifier and production/signing approvals, a controlled D3D12/Vulkan renderer, feature support checks, compatible per-frame color/depth/motion-vector inputs and constants, resource synchronization, and NVIDIA hardware/driver validation. No authorized SDK/runtime or controlled native renderer is included. DLSS and Frame Generation remain **not implemented / not tested**; vendor detection cannot activate them.

### AMD FSR source and adapter behavior

- Use the official [GPUOpen-Effects/FidelityFX-FSR](https://github.com/GPUOpen-Effects/FidelityFX-FSR) source pinned at `a21ffb8f6c13233ba336352bdff293894c706575` (FSR 1.0.2). The minimal shader inputs and AMD MIT/third-party notices are retained in `native/fsr1-poc/third_party/amd/UPSTREAM.md` with SHA-256 hashes.
- The native helper accepts either its deterministic synthetic regression input or an explicit PNG path. PNG mode uses Windows Imaging Component, own D3D12 resources, EASU + RCAS, readback/PNG encoding, output validation, adapter/API/feature/dimension/frame/timing/capture-path reports.
- `--list-adapters` reports non-software D3D12 adapters and WARP availability. Hardware mode can select an adapter and never silently falls back to WARP; WARP is explicitly software-only and leaves physical-GPU acceptance `NOT RUN`.
- Adapter/model/vendor/driver identifiers and D3D12 feature reports are evidence, not proof of a physical AMD GPU. Physical hardware and AMD-vendor gates remain separate.

## Implementation stages and status

### Stage 0 — Preserve browser, security, and existing features (**preserved**)

Retain all three cores, navigation, tabs, profile, bookmarks/history, downloads, default-deny site permissions, HTTPS validation, tests, WASM diagnostic, and collapsible performance panel. Remote pages remain sandboxed with context isolation, no Node integration, and no unrestricted native-code API. No driver install, TLS bypass, sandbox weakening, or external-process graphics-memory access is permitted.

### Stage 1 — Honest capability controller and accessible persistent panel (**implemented; local verification passed 2026-10-11**)

- Preserve visible/selectable DLSS, FSR, WASM, hybrid-policy, and standard modes in auto/manual settings.
- Keep detection, D3D12 feature compatibility, helper initialization, active processing, processed frame counts, failure and unsupported states distinct. Vendor identity does not imply support.
- Auto priority is DLSS → FSR → WASM when an integration is actually compatible and initialized. The FSR screenshot helper is manual-only and not eligible to replace ordinary page rendering; WASM stays runtime-only, not image upscaling.
- Unsupported/failed native requests keep standard Chromium active. The semantic keyboard-operable performance disclosure persists collapsed state; collapse only affects UI/layout, not browser processing.
- Current local tests pass **37/37**, the renderer builds, and syntax/workflow checks pass. Windows CI on app/source commit `eee56b7` passed the native helper/WARP regression, executable validation, bundled-scene browser-frame smoke, portable assembly and Actions artifact upload. The FSR helper remains manual/test-scene-only, not part of normal-page rendering.

### Stage 2 — Native FSR1 D3D12 harness (**source implemented; current Windows CMake/MSVC + WARP component regression passed**)

- Keep synthetic regression support and add explicit app-owned PNG input/output/report flags.
- Enumerate adapters and report model/vendor/device IDs, non-software/WARP classification, D3D12 API and format/shader capabilities, FSR initialization/processing, input/output dimensions, processed frames, GPU timestamp when available, CPU fence/native timings, visual sanity metrics and capture/report paths.
- Link WIC/OLE support and statically link the MSVC runtime for the standalone helper. Package pinned AMD shader sources/notices beside the executable.
- The code is not compiled on the Linux Arena host. Windows CI on app/source commit `eee56b7` compiled the helper and processed the isolated synthetic regression on WARP ([run 38149140851](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140851)). This is software-only component evidence; it is separate from the packaged browser-frame test and does not validate physical-GPU support.

### Stage 3 — Browser-frame diagnostic (**implemented; bundled-scene WARP smoke passed**)

- Bundle a reproducible animated WebGL2 scene with changing visual frames, frame counter, no network assets, and responsive resolution.
- Capture only the exact bundled scene while its `WebContentsView` is active, visible and not loading. Revalidate context around capture/native processing, bound dimensions/bytes, invoke the helper with fixed `execFile` arguments (no shell), and retain standard rendering as fallback.
- Return input/output PNG previews; record hashes, capture/helper/native/GPU timings when available, dimensions/resolutions and real frame count. This is not continuous/zero-copy processing.
- The mandatory packaged Windows smoke passed on app/source commit `eee56b7`. CI validated three changing Electron `capturePage()` PNG frames from the app-owned bundled WebGL2 scene at three resolutions, processed on D3D12 WARP, with per-frame native reports and input/output/reference PNGs. Portable assembly and artifact upload also passed; the `TriCoreBrowser-Windows-x64` artifact is attached to [run 38149140832](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140832). This is WARP software evidence only, not physical-GPU or arbitrary-page validation.

### Stage 4 — DLSS / Streamline (**blocked**)

Proceed only with official authorized SDK/runtime access, feature-specific licensing/redistribution/signing review, required app ID, a controlled native renderer with valid inputs, and compatible NVIDIA hardware. Do not claim DLSS or Frame Generation before verified initialization and actual processing.

### Stage 5 — General browser/game integration (**architecture-blocked**)

Do not extend to arbitrary websites, third-party browser games, WebGPU, video/DRM/cloud streams or external apps until a supported Chromium compositor/GPU resource bridge, ownership/synchronization contract, security review and regression strategy exist. A Chromium/Electron fork may be required and must be kept current/security patched.

### Stage 6 — Physical GPU and performance acceptance (**NOT RUN**)

On a real Windows device, run `--list-adapters`, then `--hardware --adapter-index N` for a selected compatible adapter. Verify physical identity, model/vendor/driver/API/features, review PNG captures and reports, and record timing data. AMD-vendor validation is a separate gate. Capture/readback/helper overhead must be included in any future performance comparison; 2× output dimensions alone are not an improvement.

## Compatibility/evidence categories

| Category | Status | Evidence / next step |
| --- | --- | --- |
| Chromium WebAssembly | Tested / working runtime diagnostic | Real compile/instantiate and `19 + 23 = 42` test; never upscaling. |
| Standard Chromium browsing and safe fallback | Tested / working | Browser remains the effective renderer for ordinary pages and unsupported/failed requests. |
| Bundled WebGL2 scene → `capturePage()` PNG → FSR1 preview | Packaged smoke passed on WARP for the bundled scene | App/source commit `eee56b7` passed three changing frames at three capture resolutions with native reports and PNG/reference validation; portable artifact uploaded in [run 38149140832](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140832). Software-only; not arbitrary-page or physical-GPU evidence. |
| Native synthetic-pattern FSR1 | Component regression passed on WARP | App/source commit `eee56b7` built the helper and passed the isolated WARP test ([run 38149140851](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140851)); software-only, separate from the browser-frame smoke. |
| Physical AMD or other GPU | Not run | Requires real hardware, selected adapter and report/capture review. |
| Arbitrary webpages/games, WebGL/WebGPU, video/DRM/cloud/external apps | Unsupported / architecture-blocked | No supported page-resource/compositor bridge. |
| NVIDIA DLSS / Frame Generation | Not implemented / not tested | No authorized runtime, controlled native renderer or NVIDIA hardware validation. |

## Current local verification snapshot

| Check | Current status |
| --- | --- |
| `npm test` | **PASS — 37/37**. |
| `npm run build` | **PASS**; Vite production renderer build. |
| JavaScript syntax checks | **PASS** for Electron main/bridge, renderer, tests and scripts. |
| GitHub workflow / package JSON syntax | **PASS** — `js-yaml` parsed all three workflow files; package JSON parsed. Windows CI executed the PowerShell package workflow successfully. |
| `git diff --check` | **PASS**. |
| `npm audit --audit-level=high` | **PASS (threshold)** — 8 moderate, 0 high, 0 critical findings; no forced breaking fix. |
| CMake/MSVC/native helper build | **PASS on app/source commit `eee56b7`** in Windows Actions. |
| Isolated synthetic-input FSR1 on WARP | **PASS on app/source commit `eee56b7`**; software component regression only. |
| Packaged executable presence/size check | **PASS on app/source commit `eee56b7`**; executable exceeded the 30,000,000-byte minimum. Exact value is in the artifact report. |
| Packaged Windows `capturePage()` → FSR1 WARP frames | **PASS on app/source commit `eee56b7` for the bundled WebGL2 test scene only.** Three changing frames, three resolutions, WARP reports, PNGs and reference paths passed validation in [run 38149140832](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140832). |
| Portable distribution and Actions artifact | **PASS**; `TriCoreBrowser-Windows-x64` uploaded in run 38149140832. No public GitHub Release was published. |
| Physical GPU/AMD vendor, DLSS, arbitrary-page upscaling | **NOT RUN / NOT IMPLEMENTED / UNSUPPORTED** as scoped above. |

Update this plan only with results tied to the exact current source commit. Do not promote earlier-commit WARP/packaging evidence to current-source acceptance.
