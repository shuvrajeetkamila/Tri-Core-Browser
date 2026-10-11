# Graphics integration status

**Reviewed:** 2026-10-11
**Source branch:** `arena/66abfdc9-tri-core-browser`
**Current-revision Windows/MSVC/WARP validation:** pending; see `docs/TEST_RESULTS.md` and the Windows Actions artifact for evidence. Physical-GPU validation is not run.

## Compatibility and evidence matrix

| Category | Status | Evidence / limit |
| --- | --- | --- |
| Chromium GPU/WebGL/WebGPU detection | **Implemented; live packaged observations pending** | Electron/Chromium diagnostics report devices, feature status, WebGL2/WebGPU capability and renderer strings. They do not prove FSR/DLSS initialization or page-frame processing. |
| Chromium WebAssembly | **Tested / working as a runtime diagnostic** | The renderer compiles and executes a small module and verifies `19 + 23 = 42`; tests cover the module and benchmark. WASM is not an image upscaler. |
| Standard browser rendering | **Tested / working** | Regular pages remain in Chromium; manual unsupported/failed upscaler selection falls back to standard rendering. |
| Bundled animated WebGL2 test scene → `capturePage()` PNG → D3D12 FSR1 → preview | **Implemented in source; current Windows validation pending** | A user action captures only TRI-CORE's visible, active, app-owned diagnostic `WebContentsView`. The helper decodes the PNG, uploads it into its own D3D12 texture, runs official FSR 1.0.2 EASU + RCAS, writes a PNG/report, and returns a preview. The mandatory packaged smoke gate is intended to validate three unique changing frames at three captured resolutions on WARP. This is CPU screenshot/readback + separate upload/readback, not zero-copy or a page-render replacement. |
| Native synthetic-pattern FSR1 regression | **Implemented; Windows WARP gate pending for this revision** | Preserved separately to validate the D3D12 shader pipeline. Historical CI passed this synthetic path on an earlier commit; do not use that as evidence for the new browser-PNG path or current revision. |
| AMD physical GPU | **Not run** | A non-software DXGI adapter or vendor ID is not by itself proof of a physical AMD device. Run the hardware command and review model/vendor/driver/API/captures on an actual device. |
| Arbitrary HTTP(S) pages, browser games, WebGL/WebGPU content | **Architecture-blocked / unsupported by this implementation** | Electron `WebContentsView` exposes no supported handle/synchronization contract for arbitrary page color/depth/motion-vector textures or the Chromium compositor swap chain. The app deliberately does not instrument websites or inspect renderer/GPU-process memory. |
| Video, protected/DRM content, cloud streaming, external applications | **Unsupported / not tested** | No video/compositor or desktop-capture path is implemented. The test scene only is in scope. |
| NVIDIA DLSS / Streamline / Frame Generation | **Not implemented / not tested** | No authorized Streamline feature runtime, NGX/DLSS initialization, supported native renderer inputs, or NVIDIA hardware result is present. |

`COMPATIBLE`, `INITIALIZED`, `ACTIVE`, `PROCESSING FRAMES`, `FAILED`, and `UNSUPPORTED` are distinct controller states. Adapter identity never proves compatibility. The FSR capture helper is excluded from automatic selection and does not make regular browser pages `ACTIVE` or `PROCESSING FRAMES`; completed frame counts are historical test evidence. The automatic controller remains DLSS → FSR → WASM for integrations with verified initialized evidence, while the current browser renderer safely remains standard Chromium. WASM is a separate runtime-only selection, never upscaling.

## Bounded FSR1 path

AMD's official [GPUOpen-Effects/FidelityFX-FSR](https://github.com/GPUOpen-Effects/FidelityFX-FSR) source is pinned at `a21ffb8f6c13233ba336352bdff293894c706575` (FSR 1.0.2). The D3D12 harness retains the minimum EASU/RCAS shader inputs and required license/attribution material in `native/fsr1-poc/third_party/amd/`; see [`UPSTREAM.md`](../native/fsr1-poc/third_party/amd/UPSTREAM.md) for file paths and SHA-256 hashes. No proprietary AMD runtime or graphics-driver DLL is included.

The browser diagnostic is intentionally a **capture → process → preview** experiment:

1. Load the bundled animated WebGL2 Orbital Runner scene in an actual sandboxed `WebContentsView`.
2. Only on explicit user action, and only while that app-owned test scene is the visible active tab, call Electron's supported `WebContents.capturePage()` API.
3. Write the resulting PNG to the app's user-data diagnostics directory (or the Windows smoke-output directory). A separate native helper uses Windows Imaging Component to decode the PNG, then uploads it into its own D3D12 texture.
4. Run pinned AMD FSR 1.0.2 EASU + RCAS, read back the 2× output, validate dimensions/non-empty image/report, and show a diagnostic preview without replacing Chromium's original scene.
5. Record source, adapter/model/vendor, API/features, per-frame dimensions/count, PNG hashes/paths, native GPU timestamps when available, CPU/native wall time, and capture-to-preview wall time. No timing is described as game FPS or a performance gain.

The helper can enumerate D3D12 adapters and select a compatible non-software adapter by index; it never silently falls back to WARP for a hardware request. WARP is explicitly software-only regression coverage, and every WARP report keeps the physical-GPU gate `NOT RUN`. Adapter/API feature compatibility is not physical-device or AMD-vendor validation.

See [`native/fsr1-poc/README.md`](../native/fsr1-poc/README.md) for build commands, adapter selection, outputs, and reproducibility details. See the [technical decision record](BROWSER_FRAME_UPSCALING_DECISION_RECORD.md) for the alternatives and resource-boundary analysis.

## NVIDIA DLSS / Streamline investigation

The official [NVIDIA-RTX/Streamline repository](https://github.com/NVIDIA-RTX/Streamline) and [DLSS programming guide](https://github.com/NVIDIA-RTX/Streamline/blob/main/docs/ProgrammingGuideDLSS.md) were reviewed on 2026-10-11. Streamline is an integration framework, not a driver toggle. A genuine native implementation must initialize/register the actual D3D/Vulkan device, verify feature/adapter support, obtain the required NVIDIA application identifier, query render/output dimensions, provide compatible color/depth/motion-vector and camera/frame inputs, manage synchronization/resource lifetimes, and use officially obtained feature binaries under the applicable SDK, signing, and redistribution terms. Streamline's README distinguishes source from feature-runtime artifacts and recommends signed production DLLs or an application-owned signing/checking policy.

This repository has no authorized Streamline/DLSS feature runtime, application-ID approval, controlled native renderer, compatible NVIDIA hardware test, or browser texture bridge. **No DLSS or Frame Generation processing is claimed.** No proprietary NVIDIA code, binary, model, or weight is bundled.

## Alternatives and security boundary

- **Direct D3D12/Vulkan interop from arbitrary `WebContentsView`:** rejected; Electron does not expose a stable public native texture/swap-chain handle and synchronization contract for this use.
- **Maintained Chromium/Electron fork or compositor/GPU-process patch:** the plausible route to true in-compositor browser scaling, but it requires a separately maintained and security-reviewed Chromium integration, synchronization/resource lifetime work, and ongoing Electron/Chromium rebases. Not a small renderer-side change.
- **Injecting WebGL/WebGPU hooks into arbitrary pages:** rejected as incomplete and unsafe across workers, OffscreenCanvas, CSP, multi-process isolation, video, and game engines; it would not provide general support.
- **Desktop/window capture or graphics-memory interception:** rejected; not needed for this owned test scene, may capture unrelated/DRM content, and does not provide a supported browser texture bridge.
- **Standalone synthetic native image:** retained as a component regression only; it is not browser-rendered input and is not evidence of the screenshot path.

No sandbox weakening, TLS bypass, remote-page native-code access, driver installation, or other-process memory/texture access is used.

## Verification and next gates

1. Run `npm test`, syntax checks, and `npm run build` on the current source.
2. Require Windows Actions to compile/package the native helper and process three distinct `capturePage()` PNG inputs through FSR on WARP, then upload the individual input/output PNGs and native reports.
3. Keep physical-GPU/AMD-vendor validation marked `NOT RUN` until someone runs `--hardware --adapter-index N` on an identified real adapter and reviews the captured evidence.
4. Keep arbitrary-page/real-time integration blocked until a safe, supported Chromium compositor/device bridge exists; do not market the controlled experiment as general website/game upscaling.
5. Revisit DLSS only with documented NVIDIA authorization, official runtime/redistribution terms, a controlled native renderer, and compatible hardware.
