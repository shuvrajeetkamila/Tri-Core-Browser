# Windows x64 build and CI validation

## Reproducible source build

1. Use Windows 10/11 x64, Node.js **22.22.3**, npm, Visual Studio Build Tools/MSVC, CMake, and the Windows SDK. Dependencies and tool versions are pinned by the repository and lockfile.
2. From the repository root:

   ```powershell
   npm ci
   npm test
   npm run build
   npm run package:win
   ```

3. The portable executable is `release/TriCoreBrowser.exe`. It bundles Electron and Chromium/V8; it is not a stub that calls an installed Chrome or Edge. The app is unsigned, so Windows may show its standard publisher warning.

## Running the packaged smoke manually

Create a fresh output directory and set an explicit GPU policy. The optional mode is appropriate for ordinary or hosted Windows testing; the required mode is only for a configured Windows GPU runner. The smoke mode always runs the packaged-app and GPU-independent checks. When optional/required GPU testing is enabled, it also runs the screenshot/PNG diagnostic on software WARP and attempts the independent WebGPU compute probe and bundled WebGPU FSR1 scene.

```powershell
$smokeOut = Join-Path $env:TEMP 'tricore-fsr-integration-smoke'
$smokeLog = Join-Path $env:TEMP 'tricore-smoke-main.log.txt'
if (Test-Path $smokeOut) { Remove-Item $smokeOut -Recurse -Force }
New-Item -ItemType Directory -Path $smokeOut -Force | Out-Null
$env:TRICORE_GPU_TEST_MODE = 'optional' # use 'required' only on a physical-GPU runner
$env:TRICORE_FSR_SMOKE_OUT = $smokeOut
$env:TRICORE_SMOKE_LOG = $smokeLog
& .\release\TriCoreBrowser.exe --smoke-test
if ($LASTEXITCODE -ne 0) { throw "Packaged smoke failed with exit code $LASTEXITCODE" }
node .\scripts\validate-packaged-smoke.cjs --policy optional --directory $smokeOut --smoke-log $smokeLog
if ($LASTEXITCODE -ne 0) { throw 'Packaged smoke evidence validation failed.' }
```

The shared validator checks the packaged status JSON, sandbox/security assertions, smoke log, WARP PNG route, per-frame reports, PNG signatures/dimensions, and applicable WebGPU/FSR evidence. In `optional` mode, only safe no-compatible-adapter evidence may yield `SKIPPED`; a rejection after selecting an adapter, shader/device/pipeline/resource failure, dispatch/output failure, unsafe launch setting, or missing/malformed report fails the smoke. A skipped GPU result is not a GPU pass.

To assemble a distribution, run only after `TRICORE_GPU_TEST_MODE=required`, `TRICORE_SMOKE_TEST=PASS`, and `TRICORE_FSR_INTEGRATION_SMOKE=PASS` have been established by the strict validator. `scripts/package-windows.ps1` independently checks the required physical-GPU summary, adapter identity, active device/driver evidence, compute known answer, FSR output, PNG captures/hashes, and the WARP-only diagnostic. It deliberately rejects Level A, optional, skipped, or WARP-only validation.

## What the packaged smoke checks

The packaged runtime checks cover Electron startup, the browser shell and graphics controls, immersive fullscreen enter/exit and layout restoration, a local HTTP page with JavaScript and WebAssembly `add(19, 23) = 42`, tab create/select/close, and an HTTPS navigation attempt using normal Chromium certificate validation. If external connectivity is unavailable, HTTPS is recorded as `BLOCKED`; there is no certificate bypass.

The separate capture diagnostic exercises three changing frames from a bundled WebGL2 `WebContentsView`: Electron `capturePage()` PNG → native D3D12 FSR1 helper using **WARP software** → validated PNG output and bilinear reference. This is screenshot/readback diagnostic evidence only. It is not physical-GPU evidence, not the game-side WebGPU implementation, and not arbitrary webpage processing.

The bundled WebGPU test scene owns its lower-resolution color target, runs AMD FidelityFX FSR1 EASU and RCAS compute passes, and presents the result on its visible canvas without CPU readback in the processing path. Post-processing texture copies and the `capturePage()` screenshot are validation evidence only. Stage comparisons are sanity checks, not bit-exact AMD shader conformance or quality/performance claims. The path applies to the bundled scene or games that explicitly integrate the game-owned WebGPU interface; it does not intercept ordinary pages, browser games, external games, or cloud video.

## GitHub Actions levels

### Level A — hosted Windows, optional GPU

`.github/workflows/build.yml` uses `windows-latest` with `TRICORE_GPU_TEST_MODE=optional`. It builds and size-checks the actual Windows executable, runs the packaged tests above, validates reports, uploads an explicitly **unverified executable candidate** before the runtime gate, and always uploads smoke logs/reports/PNG diagnostics. A no-adapter result is represented as GPU `SKIPPED` and physical-GPU `NOT RUN`. If optional WebGPU compute/FSR happens to run, its runtime result is retained but physical validation remains `NOT RUN`.

Level A does **not** assemble or upload the portable distribution. This prevents a hosted WARP/software-only run from becoming a gaming-upscaling release. A smoke report can say the GPU-independent packaged smoke passed while the WebGPU state is `SKIPPED`; those are distinct statuses.

### Level B — opt-in required physical GPU

The same workflow has the manual input `run_physical_gpu_validation` (default `false`). Set it to `true` only when the repository has a secured self-hosted Windows x64 GitHub Actions runner with all of these labels:

```yaml
runs-on: [self-hosted, windows, x64, gpu]
```

The job is separate from ordinary push/pull-request CI and never falls back to a hosted runner. If no matching runner is online, an opted-in job cannot run; a queued job is not a pass. Runner registration, labels, GPU model, Windows driver, and host security are repository-owner responsibilities.

Level B uses `TRICORE_GPU_TEST_MODE=required` and fails unless it verifies:

- safe WebGPU adapter/device creation in the packaged renderer;
- a completed known-answer compute dispatch and readback of `19 + 23 = 42`;
- a classified non-software WebGPU adapter plus an active Chromium GPU device and non-empty useful driver version for both compute and FSR runs;
- at least three bundled FSR1 frames with EASU/RCAS shader/pipeline/resource, dispatch, output-dimension, motion, numerical-stage, and visible-canvas evidence;
- valid PNG captures and reported SHA-256 hashes; and
- no disabled-GPU/WebGPU/sandbox setting, unsafe WebGPU flag, blocklist bypass, or driver-workaround override.

Missing/unsupported hardware, WARP/software identity, absent driver evidence, or any real execution/output failure is not skipped in Level B. It fails the job. Diagnostic logs/reports are retained as a 30-day artifact; portable distribution assembly is gated behind strict physical-GPU acceptance.

### Release

`.github/workflows/release.yml` also uses the required `[self-hosted, windows, x64, gpu]` runner. The release job rebuilds, reruns Level B, validates the result, and invokes the strict distribution gate. Prerelease publication depends on successful strict build/package validation and checks the packaged status report. Stable release tags remain disabled. A missing GPU runner or failed GPU check prevents distribution and publication.

## Evidence status and limitations

The pre-hardening packaged run [38249515260](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38249515260) at commit `8f5bcd4ea899c437820e2f9efa0918b72ccac2a9` failed at “Run packaged-app smoke test.” Check annotation `114789255916` confirms Chromium was on Microsoft Basic Render Driver / ANGLE D3D11 WARP, D3D12 had WARP available and zero non-software adapters, and all four bundled WebGPU FSR1 adapter requests (high-performance, low-power, default, explicit fallback) returned unavailable. The failure was at adapter discovery before FSR shaders, pipelines, dispatch, or output; the browser and separate WARP PNG diagnostic had passed. The prior strict gate treated this capability absence as fatal.

The current implementation and requested evidence/limits are documented in [WEBGPU_CI_VALIDATION_REPORT.md](WEBGPU_CI_VALIDATION_REPORT.md). Commit `499e44e8fefc8650ca6b438299d16d4092c52e76` passed hosted Windows Level A build/packaging/smoke in run [38265255323](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38265255323); the validated diagnostic candidate was uploaded but the portable distribution was skipped. The smoke validator accepted the optional policy and checked its retained WARP PNG evidence; the exact WebGPU `PASS` versus `SKIPPED` result was not retrievable from the Actions log/artifact in this sandbox. The separate D3D12 WARP-only harness passed in run [38265255364](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38265255364). The opt-in Level B physical-GPU job did not run; no physical-GPU or driver validation, and no live FSR PASS, is claimed. No release was published. The repository's GPU runner inventory remains unconfirmed (the Actions runner API returned HTTP 403).

DLSS is not implemented. WASM is a runtime diagnostic, not an upscaler or game accelerator. Auto mode remains DLSS → FSR only when a genuinely compatible and initialized implementation exists; otherwise ordinary pages retain standard Chromium rendering. A selected mode is not proof of initialization or frame processing. WARP and other software adapters never count as physical-GPU validation.
