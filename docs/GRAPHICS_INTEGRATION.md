# Graphics integration status

**Reviewed:** 2026-10-11
**Source branch:** `arena/66abfdc9-tri-core-browser`

## Current implementation and verification

A bounded, game-side FSR1 vertical slice is implemented in source: the bundled WebGPU scene owns a lower-resolution GPU color target, runs distinct AMD FidelityFX FSR1 EASU and RCAS WGSL compute pipelines, and submits processed output through a separate presentation pipeline to its visible canvas. The image-processing frame loop does not use `capturePage()` or CPU pixel readback. The packaged smoke can copy frozen textures and capture a screenshot only after processing, for numerical/presentation evidence that never feeds FSR. This is an opt-in integration example for the bundled scene (or a game that explicitly integrates its own render target), not an interceptor for ordinary browser pages. Source presence alone does not prove runtime initialization or correct displayed pixels.

The existing WebGL2 `capturePage()` → PNG → separate native D3D12 FSR1 helper remains a **diagnostic-only** path. Packaged runs 38227656945 and 38228901586 passed three changing screenshot inputs at three resolutions through that helper on WARP; WARP is software-only and does not verify the WebGPU path or physical GPU. Run 38228901586 built source `3123975` and passed packaging, fullscreen, browser/WASM checks, and the screenshot diagnostic, but the live WebGPU scene returned `null` for high-performance, low-power, default, and explicit fallback requests. Chromium reported Microsoft Basic Render Driver / ANGLE D3D11 WARP; D3D12 reported WARP available and no non-software adapters. No WebGPU shader, dispatch, numerical-output, or visible-canvas gate ran. We did not bypass Chromium's software-adapter blocklist or lower the acceptance gate. The next viable route is to run the same smoke on a Windows machine with a Chromium-supported WebGPU adapter; physical-GPU validation remains **NOT RUN** until a named physical device is actually tested.

## Compatibility and evidence matrix

| Category | Status | Evidence / limit |
| --- | --- | --- |
| Standard Chromium rendering | **Existing app path; regression checks required** | Regular pages continue to render in Chromium. A game-side integration page does not modify other pages. |
| Chromium GPU/WebGL/WebGPU detection | **Implemented; diagnostic only** | Electron/Chromium device, feature, API and renderer information does not prove an FSR/DLSS runtime is compatible or processing a frame. |
| Chromium WebAssembly | **Tested runtime diagnostic** | The renderer compiles a small module and verifies `19 + 23 = 42`; WASM is not an image upscaler. |
| Bundled WebGPU game target → FSR1 EASU + RCAS → visible canvas | **Adapter discovery failed on hosted Windows runner; downstream acceptance NOT RUN** | Run 38228901586 passed packaging/non-WebGPU checks on source `3123975`, but all four adapter requests returned `null` on the Microsoft Basic Render Driver/WARP runner. Shader compilation/pipeline creation, dispatch, texture comparison, motion, and visible screenshot gates were not reached. Unit/static checks and parser-only WGSL are not runtime evidence. The strict gate remains; next route is a Windows machine with a Chromium-supported WebGPU adapter. Queue-completion wall timing is not a GPU timestamp; this scene-only path is not enabled for ordinary pages or automatic selection. |
| Bundled WebGL2 scene → `capturePage()` PNG → D3D12 FSR1 → preview | **Diagnostic-only; run 38228901586 passed on source `3123975` using WARP** | Three changing captures at three resolutions went through Electron PNG capture/readback, the separate WARP helper, and PNG/report validation. This does not validate the WebGPU vertical slice or physical GPU. Never describe this path as live, zero-copy or real-time integration. |
| Native synthetic-pattern FSR1 regression | **WARP passed on source `3123975` in run 38228901578; software only** | Isolated D3D12 helper regression, separate from both the live WebGPU scene and the `capturePage()` PNG diagnostic. |
| Physical GPU, AMD vendor, or hardware quality/performance | **NOT RUN** | A non-software adapter label is not physical-device verification. Collect adapter/vendor/device/driver/API, dimensions, processed frames, captures and timings on a named physical machine before reporting any result. |
| Arbitrary HTTP(S) pages and third-party browser games | **Unsupported by this implementation** | No arbitrary `WebContentsView` color/depth/motion-vector texture bridge or compositor replacement exists. Only applications that own/integrate their WebGPU render target can use the demonstrated path. |
| Video, protected/DRM content, cloud streaming, external applications | **Unsupported / not tested** | No video, desktop-capture or other-process graphics path is implemented. |
| NVIDIA DLSS Super Resolution / Frame Generation | **Not implemented / not tested** | No authorized Streamline runtime, native renderer integration, NGX initialization, or NVIDIA hardware result is present. See the separate feature requirements below. |

The WebGPU scene reports separate adapter/device initialization, shader compilation, pipeline creation, target/resource initialization, frame processing, output submission, screenshot-verified visible output, unsupported/unavailable, stage-specific failure, and device-loss states. Queue completion is not pixel-level display proof. Selecting a mode does not initialize a pipeline; no active-processing claim is made until frames complete. Automatic selection deliberately excludes this scene-only integration so it is not implied for other browser tabs. Manual mode can report the scene's real state; regular pages remain standard Chromium. WASM remains separately visible/selectable and never upscales.

## Chosen FSR1 vertical slice: game-owned WebGPU target

`app/diagnostics/fsr1-webgpu.html` loads `fsr1-webgpu.js` in a sandboxed `WebContentsView` with a restrictive local-only CSP. The page creates an animated game-like scene at half the visible canvas size in a browser-owned WebGPU texture, checks shader compilation, creates separate EASU/RCAS compute pipelines and a presentation render pipeline, and submits the processed texture to the WebGPU canvas. The implementation records adapter/device, shader/pipeline/resource lifecycle, dispatch counters, submitted/completed frames, adapter details when exposed, input/output resolutions, and `performance.now()` frame-encoding-to-queue-completion wall time. Until packaged Windows execution passes, these are implemented checks, not verified runtime results.

The live image-processing path does not use screenshot capture, `capturePage()`, CPU pixel readback, an external native DLL, or browser compositor capture. The packaged smoke explicitly freezes frames, copies the low-resolution target/EASU/RCAS textures after processing, checks numerical differences against a simple bilinear baseline, verifies motion, then compares screenshot samples with frozen RCAS pixels. Texture readback and `capturePage()` PNGs are diagnostic evidence only and never FSR input. The comparison is not a bit-for-bit AMD shader conformance or image-quality test. The scene is opt-in, and the regular browser renderer remains unchanged.

This boundary is deliberate: WebGPU exposes the render target to the page that created it. Browser games that own their renderer can integrate an upscaler as a render pass. That is a genuine but bounded example; it does not give the shell a supported route into another page's private render targets.

## Electron/Chromium rendering and resource-access investigation

The app pins Electron 44.7.0. `WebContentsView` exposes browser navigation, lifecycle and `capturePage()` screenshot APIs; Electron GPU diagnostics expose adapter/feature observations. The inspected public `WebContentsView` surface does not expose a native handle/synchronization contract for an arbitrary page's D3D12/Vulkan resources, depth, motion vectors or Chromium compositor swap chain. The app does not inspect renderer/GPU-process memory or inject hooks into remote pages.

The official Electron 44.7.0 source/docs also describe an **experimental offscreen shared-texture** route:

- `webPreferences.offscreen.useSharedTexture` selects offscreen shared-texture capture; the source constructs an `OffScreenWebContentsView` for this option.
- Main-process `sharedTexture.importSharedTexture()` / `sendSharedTexture()` and the renderer receiver API can wrap the shared resource as a `VideoFrame`; Electron's upstream fixture imports it as a WebGPU external texture.
- The Windows source has an NT-handle branch and OSR shared-resource/keyed-mutex handling. This is implementation evidence, not a passing app-level Windows round trip.
- Electron v44.7.0's upstream shared-texture end-to-end spec is gated to macOS arm64. The API and Windows source path therefore do **not** establish Windows runtime delivery, synchronization, resize/occlusion behavior, output presentation, adapter affinity, or performance for this product.

**Decision:** do not route ordinary visible tabs through experimental offscreen capture. The test path would require a second offscreen page, shared-resource lifetime/ref-release handling, WebGPU import, a new visible presentation surface, input/navigation/layout synchronization, security/packaging coverage, and Windows-specific regression/performance tests. The bounded game-owned WebGPU source path demonstrates a standard browser API design without pixel readback in its processing loop; packaged runtime acceptance remains pending. The experimental shared-texture API is a possible future shell-level route, not a verified integration and not part of the current FSR claim.

Official source references (Electron v44.7.0): [shared-texture API](https://github.com/electron/electron/blob/v44.7.0/docs/api/shared-texture.md), [imported texture lifecycle](https://github.com/electron/electron/blob/v44.7.0/docs/api/structures/shared-texture-imported.md), [texture import metadata](https://github.com/electron/electron/blob/v44.7.0/docs/api/structures/shared-texture-import-texture-info.md), [handle semantics](https://github.com/electron/electron/blob/v44.7.0/docs/api/structures/shared-texture-handle.md), [upstream API spec](https://github.com/electron/electron/blob/v44.7.0/spec/api-shared-texture.spec.ts), [WebGPU fixture](https://github.com/electron/electron/blob/v44.7.0/spec/fixtures/api/shared-texture/managed/renderer.js), [Windows OSR patch](https://github.com/electron/electron/blob/v44.7.0/patches/chromium/osr_shared_texture_remove_keyed_mutex_on_win_dxgi.patch), and [OSR shared-texture source notes](https://github.com/electron/electron/blob/v44.7.0/shell/browser/osr/README.md).

## Separate screenshot/readback diagnostic

The older path remains useful for a bounded test of browser-visible pixels crossing Electron's public `capturePage()` boundary and entering the app-owned D3D12 helper. It is intentionally named and labeled **diagnostic-only**:

1. Load the bundled animated WebGL2 scene in a real, sandboxed `WebContentsView`.
2. On explicit user action, validate the exact bundled `file:` path, active tab, visibility and loading state; capture one PNG using Electron `capturePage()`.
3. Decode PNG using Windows Imaging Component, upload it into the helper's own D3D12 texture, run AMD FSR1 EASU + RCAS, read back an output PNG, and display a diagnostic preview.
4. Record each capture's dimensions, hashes, adapter/API information, `capturePage()` and helper timings, GPU timestamp if available, and output/report paths. WARP is only a software regression adapter; physical GPU and FPS are not inferred.

This is CPU screenshot/readback plus a separate D3D12 upload/readback. It is not the final/live game integration, browser compositor integration, continuous processing, or evidence of performance gains.

## AMD FSR1 source and licensing

The official [GPUOpen-Effects/FidelityFX-FSR](https://github.com/GPUOpen-Effects/FidelityFX-FSR) source is pinned at commit `a21ffb8f6c13233ba336352bdff293894c706575` (FSR 1.0.2). The native helper retains the source shader files/notices in `native/fsr1-poc/third_party/amd/`; the WebGPU scene contains an AMD MIT-licensed WGSL adaptation of EASU/RCAS with its notice in the file header. No proprietary AMD runtime or driver binary is bundled. The code has not established arbitrary-page support, physical-GPU operation, image-quality superiority, or performance gain.

## NVIDIA DLSS investigation (SR vs Frame Generation)

Official NVIDIA Streamline material reviewed on 2026-10-11 identifies v2.14.1. Its README says DLSS/Streamline binary artifacts are distributed through official release ZIPs rather than the repository; the DLSS-G plugin is prebuilt-only. NVIDIA directs developers to use production builds and original NVIDIA-signed DLLs, or a signing policy that checks plugin authenticity. The exact applicable license and redistribution terms still require direct release/EULA review; no binary was downloaded or bundled.

- **DLSS Super Resolution (DLSS-SR):** the separate `ProgrammingGuideDLSS.md` describes native D3D12/Vulkan renderer integration. The host must initialize Streamline, set the real device, obtain an NVIDIA-provided application ID for NGX components such as DLSS 2/3, check feature support per adapter, query input/output render dimensions, tag color/depth/motion-vector/exposure resources, provide per-frame camera/motion constants, and evaluate the feature on the matching frame token/viewport/command list. Chromium's normal DOM compositor does not provide this app the required game-render inputs.
- **DLSS Frame Generation (DLSS-G):** this is a different feature and guide (`ProgrammingGuideDLSS_G.md`), not an SR toggle. NVIDIA's guide describes a Streamline proxy swap chain/present integration, per-frame depth, motion vectors and HUD-less color resources, common/feature constants, Reflex/pacing coordination, a supported OS/HWS/driver configuration, production-only libraries, and signature verification for the interposer. The plugin itself is prebuilt-only. No such swap chain, renderer inputs, authorized runtime, or tested hardware is present here.

Accordingly, DLSS-SR and DLSS-G remain **not implemented / not tested**. No NVIDIA SDK/runtime/plugin, signed DLL, model or weight is bundled. A detected NVIDIA device never activates a fake path.

## Verification and next gates

1. Run `npm ci`, `npm test`, `npm run build` and syntax checks on this source change. These establish JavaScript/controller/renderer correctness only; not a Windows graphics runtime.
2. Run the current packaged Windows smoke. It must separately pass the WARP PNG diagnostic and the new WebGPU visible-frame test, retain adapter/API/resolution/frame/timing/capture reports, and say physical-GPU validation is **NOT RUN**. A build pass alone is not feature evidence.
3. On a named physical Windows device, capture WebGPU adapter identity/API, source and output dimensions, processed-frame count, visible output PNG, timing definition and values, and classify whether the device is physical/software. No such physical test has been run in this session.
4. Keep arbitrary webpages/third-party games blocked until a supported Chromium compositor/resource bridge is demonstrated and maintained. For game-owned opt-in integration, require the game to expose its own render target and lifecycle rather than reaching into another process.
5. Revisit DLSS only after reviewing the exact official release license/redistribution terms, securing the required application-ID approval and signed production runtime, adding a native renderer with correct SR/FG inputs, and testing on compatible physical hardware.
