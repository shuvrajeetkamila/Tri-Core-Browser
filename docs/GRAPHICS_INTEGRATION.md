# Graphics integration status (reviewed 2026-10-11)

## Honest status matrix

| Feature | Status in this repository | What the control does |
| --- | --- | --- |
| Chromium GPU / WebGPU diagnostics | Implemented as a diagnostic probe | Reports only what Electron/Chromium says about the current GPU and whether a WebGPU adapter request succeeds. This is not proof of an upscaler path. |
| Standard rendering | Implemented | Leaves normal Chromium rendering active; Chromium/its driver selects hardware or software compositing. |
| Controlled WebAssembly test | Implemented and unit-tested | Compiles a small WASM module in V8, verifies `19 + 23 = 42`, and times repeated calls. No website rendering changes. |
| NVIDIA DLSS / Streamline | **Not implemented** | Always reports `NOT INTEGRATED` and safely keeps standard Chromium active. |
| AMD FidelityFX Super Resolution | **Not implemented** | Always reports `NOT INTEGRATED` and safely keeps standard Chromium active. |
| Hybrid controller | Implemented as a truthful policy/fallback controller | May run the independent WASM test; does not stack DLSS and FSR; reports standard Chromium fallback because neither upscaler is integrated. |

The status is encoded in `src/graphics-controller.js` and covered by tests. A detected NVIDIA/AMD adapter cannot make the controller claim that DLSS/FSR is running. No SDK DLL is loaded or bundled, and no graphics performance or image-quality results are claimed.

## NVIDIA DLSS / Streamline investigation

The official [NVIDIA-RTX/Streamline repository](https://github.com/NVIDIA-RTX/Streamline) was inspected on 2026-10-11. Its current README identifies Streamline 2.14.1. It describes Streamline as an integration framework rather than an on/off driver flag. The README says that, since Streamline 2.7.32, DLSS feature/runtime binary artifacts are not stored in the GitHub source repository and must be obtained through the official release distribution. Its build guide also distinguishes signed production DLLs from local development builds and recommends use of NVIDIA-signed DLLs or an application-owned signing/checking scheme.

The official [DLSS programming guide](https://github.com/NVIDIA-RTX/Streamline/blob/main/docs/ProgrammingGuideDLSS.md) documents work a real native integration must perform, including:

- Initialize Streamline at the correct time, register the actual D3D/Vulkan device, and shut it down before destroying graphics devices.
- Check feature support for the actual graphics adapter, handle OS/driver/adapter errors, and obtain the required NVIDIA application identifier for NGX/DLSS.
- Ask DLSS for render/output dimensions and resize the controlled rendering viewport.
- Provide compatible per-frame color input and output, depth, motion-vector data and (where used) exposure, plus the required camera/frame constants; coordinate resource lifetimes, frame ordering and presentation.
- Use authorized production components and observe NVIDIA's SDK, feature-plugin, signing and redistribution terms.

This application has none of those native render hooks. Electron's `WebContentsView` provides a web-content surface, not the page's depth buffer, motion vectors, low-resolution color target, DLSS output target, or a supported Streamline swap-chain integration. Electron also splits DOM rendering/compositing and GPU work across Chromium processes. The application's GPU diagnostics cannot cross that boundary. No Streamline SDK/API credentials, authorized feature binaries, NVIDIA test GPU/driver, or Windows GPU validation machine were available in the Linux implementation environment. **DLSS is therefore blocked/not implemented—not operational, not in a controlled native sample, and not tested on NVIDIA hardware.**

No leaked/unauthorized DLSS DLLs, model weights or proprietary binaries were used.

## AMD FSR investigation

The official [GPUOpen-LibrariesAndSDKs/FidelityFX-SDK repository](https://github.com/GPUOpen-LibrariesAndSDKs/FidelityFX-SDK) was inspected on 2026-10-11. Its current README identifies AMD FidelityFX SDK 2.3.0 and lists multiple distinct techniques (including temporal upscaling, FSR 3 upscaling/frame-generation and FSR 4 ML upscaling). The README describes graphics-API/runtime differences and its current known-issues table; FSR versions and entry points are not interchangeable. The SDK points to its own license and per-technique documentation.

A genuine FSR path still needs a supported graphics API/device, developer-owned source/output GPU textures, correct formats and render sizes, technique-specific temporal inputs, command-list/resource synchronization, frame/presentation lifetime management, and quality/performance validation. Web pages inside this project do not expose those resources through Electron's public `WebContentsView` API. This repo includes no FidelityFX SDK source/binary and no D3D12 sample that could be used as a separate supported rendering path.

**FSR is therefore blocked/not implemented—not operational in the browser or a controlled graphics demo, and not tested on AMD hardware.** No AMD code was copied or redistributed; the SDK's applicable license/redistribution terms would need a per-version review before any future inclusion.

## Hybrid and safe fallback

The hybrid controller knows that WASM is an independent diagnostic and neither upscaler is currently available. It can show a passing WASM result, but the effective page renderer remains Standard Chromium. It never reports an upscaler as active and never stacks DLSS and FSR. The fallback path is tested by `tests/graphics-controller.test.js`.

## What a future real graphics milestone needs

1. A controlled native D3D12 (or other explicitly supported API) test renderer with code-owned render targets, motion/depth inputs where required, measurable presentation timing, and automated resource/shutdown/error tests.
2. A legal, pinned NVIDIA Streamline/feature SDK package and NVIDIA's documented application/redistribution/signing approvals, plus compatible NVIDIA hardware and driver for runtime validation.
3. A pinned AMD FidelityFX SDK version/technique with its license notices, a compatible test adapter/API, and repeatable image/performance validation.
4. Only after a controlled render test passes, evaluate a separately maintained Chromium compositor integration for broader website coverage. Preserve renderer/GPU-process isolation, native-code containment, sandboxing, texture ownership/synchronization and driver fallback.

Until then, the app's DLSS/FSR controls stay explicitly blocked.
