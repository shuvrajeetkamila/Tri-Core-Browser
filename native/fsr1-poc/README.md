# AMD FSR 1.0.2 D3D12 proof-of-concept

This Windows helper has two explicit input modes:

1. **Synthetic regression** (`--warp` or `--hardware --out-dir`): creates the existing deterministic native test pattern. This validates the FSR D3D12 component, but is not browser integration.
2. **Browser-captured PNG** (`--input-png … --output-png … --report-json …`): accepts an app-owned PNG screenshot obtained from Electron's public `WebContents.capturePage()` API, decodes it with Windows Imaging Component, uploads it into this helper's own D3D12 texture, runs the pinned AMD FSR 1.0.2 EASU + RCAS shaders, reads back the output PNG, and writes a validation report.

TRI-CORE BROWSER uses the second mode only for its **bundled, animated WebGL2 diagnostic scene**, only after a user action. It presents the returned output in the graphics panel as a comparison preview; it does not replace the page's normal Chromium presentation. Screenshot readback, helper startup, D3D12 upload/readback, and preview are a non-real-time path. This is **not** zero-copy texture sharing, an in-compositor filter, a game performance switch, or support for arbitrary pages, WebGPU games, video, DRM, cloud gaming, or external processes. See [`docs/BROWSER_FRAME_UPSCALING_DECISION_RECORD.md`](../../docs/BROWSER_FRAME_UPSCALING_DECISION_RECORD.md).

Electron's checked-in declarations expose `capturePage()` as a `NativeImage` screenshot/readback API, not a Chromium compositor texture handle or D3D12 synchronization contract. The C++ helper therefore creates and owns its own D3D12 device, queue, textures, and fence. It does not access browser/renderer memory or install/change graphics drivers.

AMD's source is pinned at [`a21ffb8f6c13233ba336352bdff293894c706575`](https://github.com/GPUOpen-Effects/FidelityFX-FSR/tree/a21ffb8f6c13233ba336352bdff293894c706575); source files, notices, license, and hashes are documented in [`third_party/amd/UPSTREAM.md`](third_party/amd/UPSTREAM.md). No proprietary upscaler binaries are included.

## Requirements

- Windows 10/11 x64 with the Direct3D 12 runtime and Windows Imaging Component.
- Visual Studio 2022 C++ build tools and CMake 3.21+.
- For `--hardware`, a non-software DXGI adapter that can create a D3D12 feature-level 11.0 device and reports the required RGBA8 texture/sample/load/UAV features. A currently installed vendor driver is required; the harness never downloads or installs drivers.
- `--warp` explicitly selects Microsoft's D3D12 WARP software adapter. It is CI/software regression coverage and **does not count as physical-GPU validation**.

## Build from a PowerShell prompt with the VS C++ tools available

```powershell
cmake -S native/fsr1-poc -B build/fsr1-poc -A x64
cmake --build build/fsr1-poc --config Release --parallel
```

The executable is `build/fsr1-poc/Release/TriCoreFsr1Poc.exe`. CMake copies the pinned AMD shader and required headers into the adjacent `amd/` directory; keep that directory beside the executable.

## Enumerate and select adapters

List non-software D3D12 adapters that can create a feature-level 11.0 device; the JSON also reports shader model, RGBA8 format features, FSR1 feature-set compatibility, and WARP availability:

```powershell
.\build\fsr1-poc\Release\TriCoreFsr1Poc.exe --list-adapters
```

Select a listed hardware adapter by its zero-based `index`. If the selected adapter cannot run, the program reports `NOT RUN`; it does **not** fall back to another adapter or WARP:

```powershell
.\build\fsr1-poc\Release\TriCoreFsr1Poc.exe --hardware --adapter-index 0 --out-dir .\fsr1-poc-results
```

For explicit software regression only:

```powershell
.\build\fsr1-poc\Release\TriCoreFsr1Poc.exe --warp --out-dir .\fsr1-poc-results
```

## Process a browser-captured PNG

The browser application—not this helper—captures its own visible test-scene `WebContentsView` to PNG. The helper accepts that PNG only after explicit selection of `--hardware` or `--warp`; output dimensions are exactly 2× each input dimension. Input is capped at 4096 pixels per side and 2,097,152 total pixels; oversize frames are rejected before GPU allocation.

```powershell
$exe = '.\build\fsr1-poc\Release\TriCoreFsr1Poc.exe'
& $exe --hardware --adapter-index 0 `
  --input-png '.\capture\webcontents.png' `
  --output-png '.\capture\fsr1-easu-rcas.png' `
  --report-json '.\capture\report.json'
```

The app's regression smoke test calls this path with `--warp` only inside the packaged-test process. That test runs the actual bundled WebGL2 scene in a real sandboxed `WebContentsView`, captures three changing frames while resizing the controlled `WebContentsView` across three resolutions, validates PNG input/output and native reports, and uploads the captures/reports from Windows Actions. Its WARP classification is explicit and is never treated as a hardware result.

## Outputs and evidence

Synthetic mode writes the unchanged regression set:

- `input-scene.bmp` — 320 × 192 generated native test pattern.
- `bilinear-reference.bmp` — 640 × 384 CPU bilinear reference (not FSR).
- `fsr1-easu-rcas.bmp` — 640 × 384 D3D12 output from the official EASU and RCAS passes.
- `fsr1-native-report.json` and `FSR1_NATIVE_REPORT.txt` — adapter/vendor/device IDs, API/features, selected adapter, FSR initialization and processing, frame count, timestamps when available, CPU fence-wait/native wall time, visual validation metrics, capture paths, and physical-GPU/AMD-vendor gates.

Browser-PNG mode retains the original `capturePage()` PNG, a CPU bilinear reference PNG, the processed FSR PNG, `FSR1_NATIVE_REPORT.txt`, and the JSON report at the paths supplied on the command line. Reports identify the source as `Electron WebContents.capturePage() PNG` and explain the CPU readback + separate D3D12 upload path. The application additionally records frame hashes, capture/helper timings, WebGL scene metadata, Chromium/Electron graphics diagnostics, and a returned-preview check.

Image differences/checksums are output sanity checks, not image-quality claims. Upscaling increases image dimensions; it does **not** establish performance improvement. GPU timestamps may be unavailable; they are reported as unavailable rather than zero. A non-software DXGI adapter still requires physical-device identity review. `--warp` is software-only; AMD vendor testing and physical-GPU validation remain separate gates.
