# Real gaming upscaling: audit and staged implementation plan

**Audit date:** 2026-10-11
**Audited baseline:** `9acb44d231dcd31adf0a614b779eb569e0ba2869` (`v1.0.0-alpha.2`)
**Working branch:** `arena/66abfdc9-tri-core-browser`

## Repository architecture and audit

- The product is a Windows x64 Electron 44.7.0 desktop shell around bundled Chromium/V8. Its three browser cores are isolated `WebContentsView` instances in Chromium renderer/GPU processes; this repository does not build or patch Chromium.
- The local interface is a Vite/JavaScript renderer. Electron/Chromium can report GPU devices, driver strings, feature status, and WebGPU/WebGL capabilities. These observations do **not** prove that DLSS/FSR initialized or processed any page frame.
- Electron's public `WebContentsView` surface does not provide this app an arbitrary website's native color/depth/motion-vector resources or a supported page-frame/swap-chain handoff. Therefore a standalone native renderer or test texture is not browser integration.
- Chromium WebAssembly is available and now has a startup probe that really compiles and instantiates a module and checks `add(19, 23) === 42`. WASM remains a separate CPU/runtime capability, not an image upscaler.
- The existing browser functionality and security boundary remain in place: sandboxed web contents, context isolation, no renderer Node access, no TLS bypass, and no access to another process's memory or graphics resources.
- A Windows-only native C++/D3D12 FSR 1 harness is now authored as an isolated synthetic-texture POC. It uses pinned AMD source and has a WARP-only CI test path. The Windows compiler, D3D12 runtime, and GPU are not available in this Linux workspace; Windows-runner build/WARP results are recorded separately below. Physical-GPU validation remains unrun.

## Staged implementation

### Stage 0 — Preserve and audit existing browser (**complete**)

Keep the three Chromium cores, navigation, tabs, profile, downloads, security model, tests, and Windows packaging. No browser replacement or graphics mockup was introduced.

### Stage 1 — Truthful capability policy and persistent performance panel (**implemented; automated verification passes**)

- Query the GPU/API/driver observations Electron and Chromium actually expose; probe WebAssembly independently.
- Model hardware detection separately from compatibility, initialization, activation, processed-frame count, failure, and unsupported states. Vendor/device identity is never treated as proof of upscaler compatibility.
- Automatic selection honors DLSS → FSR → WASM (or the selectable FSR-first order), but chooses a native upscaler only when a compatible, initialized native implementation is evidenced. In this build it falls back to the verified WASM runtime as a *status/default choice*, while clearly reporting that page rendering remains Chromium and no scaling occurs.
- A manual unsupported/failed DLSS or FSR request reports the reason and safely retains standard Chromium rendering. No driver installation is attempted.
- Add the keyboard-operable, semantic, persisted collapsible performance panel. Collapsing only hides its UI controls and schedules layout; it does not disable or stop browser processing.
- Automated evidence: `npm test` passes 27/27 tests, including persisted preference/disclosure checks and a source-level keyboard/accessibility check; `npm run build` passes. The Windows packaged-app build and existing launch smoke test also pass for this revision ([run 38136631787](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38136631787)). That smoke test does not manually exercise the panel with a keyboard or assistive technology.

### Stage 2 — Official AMD FSR 1.0.2 native proof-of-concept (**Windows build/WARP smoke passes; physical-GPU validation pending**)

- Pin the official `GPUOpen-Effects/FidelityFX-FSR` source at `a21ffb8f6c13233ba336352bdff293894c706575`. Vendor only the FSR1 portability header, EASU/RCAS header, AMD sample shader wrapper, and required MIT notices. Exact upstream links and SHA-256 hashes are in `native/fsr1-poc/third_party/amd/UPSTREAM.md`.
- `native/fsr1-poc/` contains a separate Windows D3D12 executable. It creates a deterministic **app-owned** 320×192 test image, executes EASU then RCAS into a 640×384 output texture, reads back and sanity-checks the output, and writes input/bilinear/FSR captures plus adapter/API/driver-interface/timing/frame-count evidence.
- `--hardware` requires a non-software D3D12 adapter and does not fall back. `--warp` explicitly selects Microsoft's software WARP adapter; any WARP report marks the physical-GPU gate `NOT RUN`. Timings are reported as unavailable rather than zero when the queue does not expose timestamps.
- `.github/workflows/fsr1-native-poc.yml` built successfully on Windows and ran the WARP pipeline for one synthetic frame on this revision ([workflow run 38136631764](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38136631764), commit `b41eea81fa5b54cbaee7359cfe67487f395228fb`). Its validation checked `PASS`, `softwareAdapter: true`, `physicalGpuGate: NOT RUN`, one processed frame, and three non-empty captures; the uploaded artifact is `TriCore-FSR1-D3D12-WARP-POC` (artifact `11700999200`). WARP confirms shader/pipeline execution and readback only. No physical GPU or AMD-vendor hardware evidence exists.
- This POC does not capture a website, game, or browser surface and does not enable the browser FSR controls. Native POC success is not arbitrary-page compatibility.

### Stage 3 — NVIDIA DLSS / Streamline (**blocked**)

Use only NVIDIA's authorized Streamline/DLSS distribution and required app/runtime approvals. A controlled native renderer must own a supported D3D12/Vulkan device and valid inputs such as color, depth, motion vectors, and feature-specific metadata. Do not load arbitrary binaries or claim Frame Generation without its own verified integration. No such code or runtime is included here.

### Stage 4 — Browser/game-render integration (**blocked on a supported frame bridge**)

Evaluate a maintained Chromium compositor/GPU integration or a clearly bounded native rendering surface only after a safe, stable frame handoff exists. A native demo does not mean arbitrary websites are upscaled. Preserve site isolation, sandboxing, synchronization, WebGL/WebGPU/video behavior, and standard Chromium fallback; never intercept another process's graphics memory.

### Stage 5 — Hardware and release validation (**pending**)

Run the native harness on real compatible hardware and record adapter, vendor, driver, API, feature, dimensions, frames, captures, and CPU/GPU measurements. Test browser-rendered content only once the integration has an actual supported frame handoff. Report inaccessible or unrun validations as `NOT RUN`; CI software WARP must not be substituted for physical-GPU evidence.

## Verification run in this workspace

| Check | Result | Evidence / limits |
| --- | --- | --- |
| `npm ci` | **PASS** | Installed 298 locked packages. npm printed eight moderate advisories. |
| `npm test` | **PASS** | 27 tests passed; includes graphics policy/fallback, preference persistence, disclosure markup, and real WASM compile/instantiate/execute tests. |
| `npm run build` | **PASS** | Vite production renderer build completed. This is not the Electron Windows package. |
| `npm audit --audit-level=high` | **PASS (threshold)** | Exit 0; audit still reports 8 moderate, 0 high/critical. No `npm audit fix --force` was run. |
| Native MSVC/CMake compile | **PASS (Windows runner)** | [Workflow `38136631764`](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38136631764) configured and built `TriCoreFsr1Poc` with the Windows toolchain. |
| Native D3D12 WARP EASU/RCAS frame | **PASS (software-only)** | Same workflow executed one synthetic frame and uploaded three captures plus reports in artifact `TriCore-FSR1-D3D12-WARP-POC` (artifact `11700999200`). Physical-GPU gate remains `NOT RUN`. |
| Windows portable Electron build and launch smoke test | **PASS** | Current-revision [workflow `38136631787`](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38136631787) built the x64 portable app and passed its packaged `--smoke-test`; artifact `TriCoreBrowser-Windows-x64` (artifact `11701785530`). Local Linux Electron launch remains unavailable. |

## Acceptance-gate ledger (A–G)

| Gate | Status | Evidence / remaining exit condition |
| --- | --- | --- |
| A — Native FSR processing on a physical GPU | **NOT RUN** | Windows WARP pipeline/build passed ([`38136631764`](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38136631764)), but WARP is software. No physical GPU is attached; run `--hardware` and review adapter identity/report/captures on a real device. AMD-vendor-specific coverage is separately reported by the harness. |
| B — Browser-rendered page through integrated FSR | **BLOCKED** | No supported Chromium page texture/compositor bridge; the native harness only processes its own synthetic texture. |
| C — DLSS initialization and real frame processing | **NOT RUN** | No authorized Streamline/DLSS runtime or controlled renderer/hardware evidence. |
| D — WASM capability and real execution | **PASS** | Startup probe compiles, instantiates, and checks a real module; tests also execute the bounded benchmark and verify its checksum. This is not upscaling. |
| E — Detection, priority/manual selection, lifecycle, safe fallback | **PASS (automated policy/build)** | Tests cover distinct lifecycle states, vendor detection without inferred compatibility, priority, failures, and safe fallback. Live packaged-Electron capability observations remain unrun on this revision. |
| F — Accessible persistent collapsible panel | **PARTIAL** | Semantic button/`aria-expanded`, live status, persisted preference, and renderer build are present. Manual keyboard/screen-reader audit and runtime regression validation remain unrun. |
| G — Windows app build and browser regression | **PASS (build + smoke scope)** | On current commit `b41eea8`, the Windows x64 portable app built and passed its packaged smoke test ([`38136631787`](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38136631787)); Linux tests/build also pass. Native D3D12 WARP source/build/frame smoke passes separately ([`38136631764`](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38136631764)). Physical-GPU, actual browser-page upscaling, and DLSS validation remain outside this gate and are not passed. |

## Explicit scope and claims

- GPU detection is not feature compatibility. `COMPATIBLE`, `INITIALIZED`, `ACTIVE`, and `PROCESSING FRAMES` must only appear with the corresponding backend evidence.
- WASM execution does not upscale images. DLSS/FSR browser processing remains unavailable, and no performance improvement is claimed.
- No drivers are silently installed. No fake native runtime, unauthorized binaries, sandbox weakening, TLS bypass, or external-process graphics-memory access is permitted.
