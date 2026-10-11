# AMD FSR 1.0.2 D3D12 proof-of-concept

This is a **separate Windows native test harness**, not a browser feature. It compiles the pinned official AMD FSR 1.0.2 sample shader wrapper and EASU/RCAS headers, creates its own deterministic app-owned D3D12 texture, executes EASU upscaling followed by RCAS sharpening, reads the resulting texture back, and writes captures plus a machine-readable report.

It does **not** capture or upscale Chromium pages, games, video, another process's graphics memory, or a desktop/compositor surface. It does not install or change graphics drivers. Nothing in this POC turns on the browser's FSR control. Browser integration remains blocked on a supported, secure compositor/frame handoff.

AMD's source is pinned at [`a21ffb8f6c13233ba336352bdff293894c706575`](https://github.com/GPUOpen-Effects/FidelityFX-FSR/tree/a21ffb8f6c13233ba336352bdff293894c706575); source files, their notices, license, and hashes are documented alongside them in [`third_party/amd/UPSTREAM.md`](third_party/amd/UPSTREAM.md). No proprietary upscaler binaries are included.

## Requirements

- Windows 10/11 x64 with the Direct3D 12 runtime.
- Visual Studio 2022 C++ build tools and CMake 3.21+.
- To run `--hardware`, a non-software DXGI adapter that can create a D3D12 feature-level 11.0 device and a current, already-installed vendor driver. The harness never downloads or installs a driver.
- `--warp` uses Microsoft's D3D12 WARP software adapter. It is useful for CI shader/pipeline smoke coverage, but **does not count as physical-GPU validation**.

## Build from a PowerShell prompt with the VS C++ tools available

```powershell
cmake -S native/fsr1-poc -B build/fsr1-poc -A x64
cmake --build build/fsr1-poc --config Release --parallel
```

The executable is `build/fsr1-poc/Release/TriCoreFsr1Poc.exe`. CMake copies the pinned AMD shader and required headers into the adjacent `amd/` directory; keep that directory next to the executable.

## Run

Require actual hardware (the program will report `NOT RUN` and exit 2 if no non-software adapter is usable; it will **not** fall back):

```powershell
.\build\fsr1-poc\Release\TriCoreFsr1Poc.exe --hardware --out-dir .\fsr1-poc-results
```

Run the explicitly software-only CI smoke test:

```powershell
.\build\fsr1-poc\Release\TriCoreFsr1Poc.exe --warp --out-dir .\fsr1-poc-results
```

Exactly one of `--hardware` or `--warp` is required. A successful run produces:

- `input-scene.bmp` — 320 × 192 synthetic source image.
- `bilinear-reference.bmp` — 640 × 384 CPU bilinear reference; this is not represented as an upscaler.
- `fsr1-easu-rcas.bmp` — 640 × 384 D3D12 output from the official EASU and RCAS passes.
- `fsr1-native-report.json` and `FSR1_NATIVE_REPORT.txt` — selected adapter/vendor, API, driver interface version when DXGI exposes it, input/output sizes, completed synthetic frame count, GPU timestamps when supported, CPU submission/fence time, and explicit physical-GPU/AMD-vendor gate statuses.

The checksums/metrics in the report are sanity checks, not image-quality claims or benchmark results. Hardware timings are specific to the adapter, driver, power state, and host. WARP timings describe software rendering only. The synthetic scene is not a web page or game, and a native POC pass is not evidence of Chromium or DLSS integration.

## CI evidence

`.github/workflows/fsr1-native-poc.yml` builds this project on a Windows runner and explicitly runs WARP. Its artifact validates that the pinned shader compiles, the EASU/RCAS command pipeline executes, an output texture can be read back, and the report/captures are generated. The artifact labels physical-GPU and AMD-vendor validation `NOT RUN`; CI WARP is never counted as hardware evidence.
