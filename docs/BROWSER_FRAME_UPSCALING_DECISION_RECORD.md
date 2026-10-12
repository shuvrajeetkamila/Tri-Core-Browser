# Browser/game FSR integration — technical decision record

**Date:** 2026-10-11
**Branch:** `arena/66abfdc9-tri-core-browser`
**Decision:** Implement a bounded FSR1 vertical slice in the app-owned WebGPU game-render path. Keep Electron `capturePage()` → PNG → native D3D12 FSR1 strictly diagnostic. Do not claim arbitrary-page or compositor upscaling.
**Verification status:** Source implements the game-owned path and post-processing numerical/screenshot evidence hooks. The current-source Windows packaged WebGPU smoke, target-runtime pipeline/dispatch, numerical GPU output, visible pixels, and physical-GPU behavior have not yet been verified. Existing WARP evidence covers only the separate native/screenshot regression.

## Architecture and integration boundary

TRI-CORE is an Electron 44.7.0 desktop app. Three sandboxed `WebContentsView` instances render ordinary website tabs inside Chromium. The app can query Electron/Chromium GPU feature/device information, but the public `WebContentsView` API does not expose arbitrary tabs' D3D12/Vulkan textures, game depth/motion vectors, native swap chain, or a compositor synchronization contract. The app does not inspect renderer/GPU-process memory, inject code into remote pages, or weaken the sandbox.

Electron's public `capturePage()` returns a `NativeImage`. That is a valid bounded screenshot boundary, not a live GPU handle, zero-copy transfer or means to return processed output to Chromium's compositor. The screenshot path remains useful for measuring/validating the separate native helper; it is not the selected live integration.

### Chosen vertical slice: app/game-owned WebGPU target

`app/diagnostics/fsr1-webgpu.html` loads a local, sandboxed controlled scene. Its JavaScript:

1. Requests a WebGPU adapter/device and captures adapter identity when Chromium exposes it.
2. Renders an animated game-like scene at half the visible canvas resolution into a WebGPU texture owned by this page.
3. Compiles distinct AMD FSR1 EASU and RCAS WGSL compute pipelines and dispatches them over GPU textures.
4. Uses a separate presentation render pipeline to submit the RCAS result to the visible WebGPU canvas. The image-processing path uses no CPU pixel readback; optional timestamp-query data and explicit post-run validation copies are separate diagnostic readback.
5. Reports adapter/device/shader/pipeline/resource lifecycle, per-stage dispatch counts, submitted/completed frames, source/output dimensions, and queue-completion wall timing (not a GPU timestamp). Runtime accuracy of these checks awaits the packaged Windows gate.

The source architecture is a genuine game-side integration design because the page owns its render target and inserts FSR into its own WebGPU render graph. It does **not** automatically upscale other web pages or third-party games. The app's global automatic mode deliberately excludes this scene-specific path so it cannot imply that the other cores are being upscaled. Manual FSR status is tied to this scene's reported pipeline state and completed frames; those runtime claims remain unverified until packaged smoke passes.

The packaged CI gate freezes completed output, copies original/EASU/RCAS textures only for post-processing numerical comparison, and compares actual `capturePage()` canvas samples with the frozen RCAS texture. Those pixels/captures never feed FSR. The numerical check is a sanity baseline, not bit-for-bit AMD shader conformance. A passing queue-completion promise alone is not visible-output verification.

### Retained screenshot diagnostic

The distinct WebGL2 test scene still exercises:

`WebContentsView.capturePage()` PNG → WIC decode/CPU readback → separate app-owned D3D12 FSR1 EASU + RCAS → output PNG/report/preview.

It requires explicit user action and the exact bundled test-scene URL. It measures capture, readback, helper, GPU timestamp (if available), and round-trip costs. It is always labeled **diagnostic-only**; it is not live browser integration. Existing CI evidence for three changing frames at three resolutions was on D3D12 WARP software only (prior source commit `eee56b7`).

## Electron shared-texture investigation

Electron 44.7.0 source/docs expose an experimental offscreen route:

- `webPreferences.offscreen.useSharedTexture` creates offscreen contents and shared-texture capture.
- Main-process import/send and renderer receiver APIs can present the shared texture as a `VideoFrame`; Electron's upstream fixture consumes it with WebGPU.
- Electron source includes Windows NT-handle handling and OSR shared-resource/keyed-mutex code.
- The upstream shared-texture end-to-end spec is gated to macOS arm64. This is not evidence that TRI-CORE can import/process/present frames on Windows.

Official references: [shared-texture API](https://github.com/electron/electron/blob/v44.7.0/docs/api/shared-texture.md), [imported frame lifetime](https://github.com/electron/electron/blob/v44.7.0/docs/api/structures/shared-texture-imported.md), [import texture info](https://github.com/electron/electron/blob/v44.7.0/docs/api/structures/shared-texture-import-texture-info.md), [handle notes](https://github.com/electron/electron/blob/v44.7.0/docs/api/structures/shared-texture-handle.md), [upstream spec](https://github.com/electron/electron/blob/v44.7.0/spec/api-shared-texture.spec.ts), [WebGPU receiver fixture](https://github.com/electron/electron/blob/v44.7.0/spec/fixtures/api/shared-texture/managed/renderer.js), [Windows keyed-mutex patch](https://github.com/electron/electron/blob/v44.7.0/patches/chromium/osr_shared_texture_remove_keyed_mutex_on_win_dxgi.patch).

**Decision:** do not switch existing normal `WebContentsView` tabs to offscreen capture. A production route would need to create separate offscreen contents, forward input/navigation/permissions, import and release every shared resource correctly, synchronize a WebGPU receiver, present output in the visible browser layout, handle resize/occlusion/device loss/adapter mismatch, and maintain an experimental API through Electron/Chromium upgrades. Windows frame delivery, capture overhead, and visible-output correctness remain untested. A future time-boxed Windows shared-texture prototype may test those exact gates; it must not be reported as live integration until the whole path passes.

## Alternatives evaluated

| Option | Maintenance | Performance | Security / resource boundary | Packaging / decision |
| --- | --- | --- | --- | --- |
| **Page/game-owned WebGPU render target** | Uses WebGPU and the FSR1 shader port; no Electron compositor patch | Source runs GPU passes without CPU pixel readback in image processing; adapter, dispatches, numerical comparisons, visible pixels, and timing still require packaged Windows validation | The game owns its texture/queue; sandbox and process isolation remain intact | **Chosen bounded source implementation.** Only the controlled scene or games that explicitly integrate this design. |
| **Electron experimental offscreen shared texture** | Depends on experimental Electron APIs and Windows-specific lifetime/sync behavior; upstream E2E spec does not validate Windows | May avoid CPU screenshot readback, but capture/import/presentation overhead is unknown | Official handle/VideoFrame path is safer than memory inspection, but frame lifecycle and input forwarding need implementation | **Candidate future prototype, not currently shipped as live integration.** Requires Windows end-to-end and performance gates. |
| **`capturePage()` PNG + D3D12 helper** | Public, simple app-owned boundary; native helper is separately maintained | CPU readback, PNG encode/decode and upload; unsuitable for continuous real-time processing | Uses Electron screenshot API and app-owned native resources, with exact scene/context validation | **Retained diagnostic only.** Never describe as live, zero-copy or real-time. |
| **Maintain Chromium/Electron compositor fork** | High ongoing merge/security cost across Electron/Chromium releases | Could place processing in a more appropriate compositor path | Requires deep GPU-process, site-isolation, synchronization and resource-lifetime review | **Not implemented.** Only plausible path to transparent all-page compositor processing without game opt-in. |
| **Hook arbitrary WebGL/WebGPU pages** | Fragile across workers, OffscreenCanvas, engines, contexts and browser versions | Extra interception/copies; no generic motion/depth access | CSP, isolation, remote-site behavior and native bridge risks | **Rejected.** Not complete or safe general support. |
| **Desktop capture / graphics-memory access** | OS/hardware-specific | Copies and capture latency | Can expose unrelated or protected content; unsupported cross-process resource access | **Rejected.** No external-process/DRM capture or memory access. |
| **NVIDIA Streamline/DLSS** | Requires official feature binaries and versioned native integration | Must be measured on the target renderer/hardware | Requires authorized plugin/runtime/signature handling and complete native frame inputs | **Not implemented.** No DLSS substitute or simulated backend. |

## NVIDIA Streamline: DLSS SR and Frame Generation are separate

Official Streamline documentation was inspected on 2026-10-11. Its current README identifies version 2.14.1, states that DLSS/Streamline binary artifacts are obtained from official release ZIPs rather than the repository, says the DLSS-G plugin is prebuilt-only, and recommends production builds with NVIDIA-signed plugin binaries or signature verification. The guide for NGX components says an NVIDIA-provided `applicationId` is required. This inspection does not determine the legal terms for a specific download; those must be checked against the exact release/license before any redistribution.

- **DLSS Super Resolution (SR):** native integration in a game renderer. NVIDIA's guide requires the real D3D12/Vulkan device, adapter support checks, render/output size selection, tagged color input/output/depth/motion-vector/exposure resources, per-frame camera/motion constants, and feature evaluation on a matching frame token/viewport/command list. Chromium does not expose these game inputs for arbitrary tabs.
- **DLSS Frame Generation (FG/DLSS-G):** a different feature/plugin with its own guide and feature ID. The documented design includes a proxy swap chain/present interception, depth/motion vectors/HUD-less color, per-frame constants and valid resource lifetimes, Reflex/frame-pacing integration, OS/HWS/driver requirements, and signed production plugin checks. The DLSS-G plugin is prebuilt-only. It is not implied by a DLSS-SR mode or GPU vendor detection.

No authorized Streamline/DLSS plugin/runtime, application-ID approval, native game renderer, or NVIDIA hardware test is present. DLSS SR and FG remain **not implemented / not tested**; no proprietary NVIDIA component is bundled.

## AMD FSR1 code and licensing

The official [GPUOpen-Effects/FidelityFX-FSR](https://github.com/GPUOpen-Effects/FidelityFX-FSR) source is pinned at `a21ffb8f6c13233ba336352bdff293894c706575` (FSR 1.0.2). The D3D12 helper retains the upstream shader files, attribution and SHA-256 hashes in `native/fsr1-poc/third_party/amd/UPSTREAM.md`. The WebGPU scene contains a WGSL adaptation of EASU/RCAS with an AMD MIT license notice in the source header. No proprietary AMD runtime/driver binary is bundled.

## Required validation gates

- **Local tests/build:** controller/policy tests, source/CSP tests, `npm test`, `npm run build`, syntax checks, and workflow YAML checks. Passing these does not prove a GPU runtime path.
- **Windows packaged WebGPU smoke:** require actual WGSL compilation, EASU/RCAS compute-pipeline creation, at least three successful dispatches of each pass, completed output frames, changing scene input, original/EASU/RCAS texture comparisons, screenshot-sample comparison to frozen output, input/output dimensions, adapter/API identity or explicit unknown status, queue-completion wall timing, and saved diagnostic evidence. CPU copies/screenshots occur only after processing and never feed FSR. Physical-GPU field must remain **NOT RUN** in CI. The separate PNG/WARP smoke remains distinctly labeled diagnostic.
- **Physical GPU:** run on a named real Windows adapter; report adapter model/vendor/driver, API, input/output resolutions, processed frames, captures, and measured timings. No physical GPU has been tested for this source change.
- **General-page support:** remain blocked until a supported Chromium rendering/interop boundary passes Windows synchronization, resource-lifetime, visible output, security, resize/occlusion, upgrade and performance tests.
- **DLSS:** require the exact official release/license review, NVIDIA-provided app ID, production signed runtime authorization, separate SR/FG design and compatible physical hardware before packaging or claims.
