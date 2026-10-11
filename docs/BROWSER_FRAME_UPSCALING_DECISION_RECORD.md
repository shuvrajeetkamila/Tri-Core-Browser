# Browser-frame FSR integration — technical decision record

**Date:** 2026-10-11
**Branch:** `arena/66abfdc9-tri-core-browser`
**Decision:** Implement the largest safe, publicly supported vertical slice: a user-approved screenshot/readback pipeline for a bundled animated WebGL2 diagnostic scene.
**Current evidence status:** Windows CI on app-source commit `b7e844fca45cd64c494d9862b3e19e153c283ed7` compiled the native helper and passed the synthetic D3D12/WARP regression. The packaged executable presence/size check passed, but the separate packaged smoke step failed with exit code 1. No current browser-frame FSR proof is accepted; the internal smoke error remains unknown because logs/artifacts could not be retrieved here. Physical-GPU validation is `NOT RUN`.

## Observed architecture and graphics boundary

- TRI-CORE BROWSER is an Electron 44.7.0 desktop app. Each core is a sandboxed `WebContentsView`; `electron/main.cjs` manages active tabs and view bounds. Remote renderer code has no Node access, context isolation remains enabled, and browser cores use separate persistent session partitions.
- Chromium renders/composites web contents within its renderer/GPU-process architecture. Electron's `app.getGPUInfo('complete')` and `app.getGPUFeatureStatus()` are diagnostic APIs; they do not yield a supported D3D12/Vulkan device, arbitrary page `ID3D12Resource`, compositor surface/swap-chain, depth/motion vectors, or interop synchronization contract to this app.
- Electron 44.7.0's public `WebContents.capturePage(rect?, opts?)` returns a `NativeImage`; `NativeImage.toPNG()` provides a supported screenshot/readback boundary. This is not a zero-copy or real-time handoff and offers no path to return FSR output into Chromium's compositor.
- The Windows C++ helper owns its D3D12 device, queue, textures, command lists, fence, WIC decode/encode, and AMD FSR1 EASU + RCAS pipeline. It now accepts an explicit app-owned PNG as well as the existing deterministic synthetic regression input.
- No Chromium fork or compositor patch is present. Current Windows WARP CI provides software coverage only; physical-GPU behavior remains a separate gate.

## Adopted implementation: capture → process → preview

1. Load a bundled animated WebGL2 Orbital Runner scene in a real, sandboxed `WebContentsView`.
2. Only on explicit user action, validate that the requested tab is active, visible, not loading, marked as the app-owned diagnostic scene, and still at the exact bundled file URL.
3. Capture the visible WebContentsView using Electron's public `capturePage()` API. Validate dimensions and input size, write the actual PNG, record a SHA-256, and pass only fixed command-line arguments to the packaged native helper. Revalidate the scene/active-tab context before native processing so navigation/tab changes fail closed.
4. The helper decodes that PNG using Windows Imaging Component, creates its own D3D12 textures, uploads the browser screenshot, runs pinned AMD FSR 1.0.2 EASU + RCAS, reads back and writes a 2× PNG plus JSON/text reports.
5. The main process validates the report, input/output dimensions, software-vs-hardware class, per-frame bilinear-reference path, checksum, and reopened output/reference images, counts the processed frame, and returns a PNG preview to the local browser UI. Each source frame has its own bilinear-reference PNG so later captures cannot overwrite earlier evidence. The original Chromium view remains active and unchanged; any failure leaves normal rendering intact.
6. Record per-frame source/paths/hash, scene metadata, adapter name/vendor/device, API/feature support, input/output dimensions, EASU/RCAS GPU timestamp when available, native process/fence wall time, `capturePage()` wall time, and overall capture-to-preview wall time. These numbers are not game FPS and do not establish a performance gain.
7. The Windows packaged smoke gate requires three unique changing frames at three view/capture resolutions with `capturePage()` PNG inputs processed by D3D12 WARP, validates each report and its input/output/bilinear-reference PNGs plus unique reference paths, and retains captures. On app-source commit `b7e844f` the executable presence/size check passed but the separate smoke step failed; keep browser-frame acceptance **unverified** until a later current-source run passes and its evidence is reviewed.

This is real content rendered by the browser's controlled WebGL2 scene entering FSR through a screenshot file and returning to the local UI as a diagnostic preview. It is **not** an original GPU texture handoff, zero-copy interop, a compositor replacement, a live page upscaler, a performance switch, or support for ordinary pages, third-party browser games, video, DRM, cloud gaming, or external applications.

## Adapter selection and safe fallback

The helper enumerates non-software D3D12 adapters, reports model/vendor/device IDs, dedicated-memory amount, feature level, shader model, required RGBA8/SRV/UAV features, and WARP availability. Hardware processing uses an explicit compatible adapter selection (or the first compatible adapter when no index is requested) and does not fall back to WARP. WARP is selected only by the test harness/smoke path and is always reported as software; the physical-GPU gate stays `NOT RUN`. Vendor/device identification or reported features alone are not proof of physical hardware or FSR quality.

The graphics controller keeps DLSS, FSR, WASM, hybrid policy, and standard Chromium visible/selectable. Auto priority remains DLSS → FSR → WASM for compatible, initialized implementations, but the one-shot FSR capture helper is not eligible for automatic page rendering. WASM remains runtime-only. Manual selection of an unavailable or failed upscaler safely retains Chromium rendering. No driver is installed or changed.

## Alternatives considered

- **Direct D3D12/Vulkan interop from `WebContentsView`:** no supported public native-texture handle or synchronization contract; do not guess handles or inspect another process's memory.
- **Maintained Chromium/Electron compositor fork:** likely long-term route to true low-latency browser scaling. Requires compositor/GPU-process source changes, security and synchronization review, and rebases against Electron/Chromium; outside a safe local renderer patch.
- **Inject WebGL/WebGPU hooks into arbitrary pages:** rejected as incomplete and unsafe across workers, OffscreenCanvas, CSP, isolation, video, and game engines; does not create a general native resource bridge.
- **Desktop capture/window capture or graphics-memory interception:** rejected; unrelated/DRM content exposure and no supported page texture ownership/synchronization.
- **Independent native synthetic texture:** retained only as a D3D12 component regression; it is not browser integration.
- **NVIDIA Streamline/DLSS:** use only official, authorized runtime/feature binaries and approvals. A real integration needs a controlled D3D12/Vulkan renderer with actual color/depth/motion vectors, frame constants, synchronization, application-ID approval, and compatible NVIDIA hardware. None is present; no DLSS/Frame Generation claim is made.

## Scope / compatibility categories

| Content path | Category | Status |
| --- | --- | --- |
| Controlled WebAssembly module | Tested/working runtime diagnostic | Compiles, executes, and checks `19 + 23 = 42`; not image upscaling. |
| Existing standard Chromium pages | Tested/working rendering | No FSR/DLSS modification; standard fallback remains. |
| Bundled animated WebGL2 scene → capturePage PNG → FSR1 preview | Implemented; current packaged smoke failed, so processing remains unverified | Explicit single-process screenshot/readback experiment. App-source commit `b7e844f` passed executable validation but did not produce an accepted three-frame WARP result; the internal smoke error is unknown. Physical GPU is not inferred. |
| Synthetic native input → FSR1 | Component regression passed on WARP | The current app-source commit compiled the helper and passed the isolated software regression ([run 38146013763](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38146013763)); this cannot prove browser-frame processing. |
| Arbitrary HTTP(S) pages and browser games, including arbitrary WebGL/WebGPU | Architecture-blocked / unsupported | No supported Chromium page-texture/compositor interop. |
| Video, protected/DRM streams, cloud gaming, other processes | Unsupported / not tested | No capture/hook path is implemented. |
| DLSS / Frame Generation | Not implemented / not tested | No authorized runtime, native renderer, initialization, or hardware evidence. |

## Required gates before stronger claims

- **Current-source CI:** On app-source commit `b7e844f`, Linux tests/build, native Windows CMake, synthetic-input WARP regression, and executable presence/size validation passed, but the separate packaged browser smoke failed. Inspect the uploaded diagnostics and fix/rerun the package gate; no browser-frame acceptance or release until it passes. WARP proves software pipeline execution only, not physical-GPU capability.
- **Physical hardware:** run the helper with `--hardware --adapter-index N` on a real Windows GPU; review model/vendor/driver/API/capability report, input/output captures, dimensions/frame counts/timings, and verify the adapter is physical. AMD-vendor-specific validation is separate.
- **Performance:** compare honest baselines on supported hardware, including capture/readback, helper startup, upload, GPU, readback, and preview costs. Do not equate 2× output dimensions with faster rendering.
- **Arbitrary web content:** require a supported Chromium compositor/GPU integration and security/resource/synchronization review before expanding scope.
- **DLSS:** require NVIDIA authorization, current official feature/runtime terms, a controlled native renderer and compatible device before implementation or claims.
