# Windows x64 build and test

## Reproducible source build

1. Install Windows 10/11 x64, Node.js **22.22.3**, and npm. The build uses versions pinned in `package-lock.json`.
2. From the repository root run:

   ```powershell
   npm ci
   npm test
   npm run build
   npm run package:win
   ```

3. The portable executable should be `release/TriCoreBrowser.exe`. It contains Electron and its Chromium/V8 runtime; it is not a stub that calls an installed Chrome or Edge. The app is unsigned, so Windows may show a publisher warning.
4. To run the required packaged smoke test and assemble the ZIP/reports/evidence, use PowerShell. The packaged gate first enters OS fullscreen for the active core using the prominent **Full screen** button, verifies that the selected browser view fills the window and the other browser controls are hidden, then exits and confirms the original three-core layout returns. F11 and the visible **Exit full screen** button are available to leave the mode. It then exercises two distinct graphics paths: (a) three changing bundled WebGL2 screenshots at three resolutions through Electron `capturePage()` PNG → native D3D12 FSR1 helper on software WARP (**diagnostic only**); and (b) repeated EASU/RCAS compute dispatches for the bundled WebGPU scene's own lower-resolution target, followed by presentation to its visible canvas (**live path for this test scene only**). For (b), after two completed frames are frozen, it retains original/EASU/RCAS diagnostic copies and a `capturePage()` PNG, checks stage differences/detail and frame motion, and compares screenshot samples with frozen RCAS pixels. Those copies and screenshots are post-processing evidence only, never FSR inputs. The comparisons are sanity checks, not AMD shader conformance. Physical-GPU validation remains **NOT RUN**.

   ```powershell
   $env:RUNNER_TEMP = $env:TEMP
   $fsrSmokeOut = Join-Path $env:TEMP 'tricore-fsr-integration-smoke'
   if (Test-Path $fsrSmokeOut) { Remove-Item $fsrSmokeOut -Recurse -Force }
   New-Item -ItemType Directory -Path $fsrSmokeOut -Force | Out-Null
   $env:TRICORE_REQUIRE_FSR_INTEGRATION_SMOKE = 'PASS'
   $env:TRICORE_FSR_SMOKE_OUT = $fsrSmokeOut
   $env:TRICORE_SMOKE_LOG = Join-Path $env:RUNNER_TEMP 'tricore-smoke-main.log.txt'
   $smokeStdout = Join-Path $env:RUNNER_TEMP 'tricore-smoke.stdout.txt'
   & .\release\TriCoreBrowser.exe --smoke-test *> $smokeStdout
   if ($LASTEXITCODE -ne 0) { throw "Smoke test failed with exit code $LASTEXITCODE" }
   $captureSummary = Get-Content (Join-Path $fsrSmokeOut 'browser-frame-smoke-summary.json') -Raw | ConvertFrom-Json
   if ($captureSummary.status -ne 'PASS' -or $captureSummary.softwareAdapter -ne $true -or $captureSummary.frameCount -ne 3 -or $captureSummary.distinctInputFrames -ne 3 -or $captureSummary.distinctInputResolutions -ne 3) { throw 'PNG diagnostic/WARP smoke evidence did not pass.' }
   $webGpuSummary = Get-Content (Join-Path $fsrSmokeOut 'fsr1-webgpu-summary.json') -Raw | ConvertFrom-Json
   $imageValidation = $webGpuSummary.imageValidation
   if ($webGpuSummary.status -ne 'PASS' -or $webGpuSummary.api -ne 'WebGPU' -or $webGpuSummary.readbackForProcessing -ne $false -or $webGpuSummary.processedFrames -lt 3 -or $webGpuSummary.dispatch.easuDispatches -lt 3 -or $webGpuSummary.dispatch.rcasDispatches -lt 3 -or $webGpuSummary.input.width -ge $webGpuSummary.output.width -or $webGpuSummary.input.height -ge $webGpuSummary.output.height -or $webGpuSummary.physicalGpuValidation -ne 'NOT RUN' -or $imageValidation.status -ne 'PASS' -or $imageValidation.stageComparison.status -ne 'PASS' -or $imageValidation.visibleCanvas.status -ne 'PASS' -or $imageValidation.motion.changed -ne $true -or $webGpuSummary.lifecycle.visibleOutputVerified -ne $true) { throw 'Live WebGPU FSR1 processing, numerical comparisons, motion, or visible screenshot evidence did not pass.' }
   $env:TRICORE_SMOKE_TEST = 'PASS'
   $env:TRICORE_FSR_INTEGRATION_SMOKE = 'PASS'
   .\scripts\package-windows.ps1
   ```

   The portable ZIP includes both the PNG diagnostic captures/reports and the WebGPU live-scene summary/post-processing output capture under `diagnostics/fsr1-integration-smoke/`. The WebGPU timing is queue-completion wall time, not a GPU timestamp; the package report keeps physical-GPU validation as NOT RUN. Optional installer: `npm run package:win:installer` builds the same native helper into an NSIS package, but installer launch/upgrade behavior is not covered by the portable-package smoke gate.

   Hosted Windows runs [38228901586](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38228901586) and [38242786245](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38242786245) built and launched the app, then returned `null` for high-performance, low-power, default, and explicit fallback adapter requests. Chromium exposed Microsoft Basic Render Driver / ANGLE D3D11 WARP; D3D12 diagnostics found WARP but no non-software adapters. No shaders or live FSR frames ran. Run this unchanged smoke on Windows with a Chromium-supported WebGPU adapter and its normal vendor driver to continue. Do not add `--enable-unsafe-webgpu`, `--disable-dawn-features=adapter_blocklist`, `--disable-gpu-sandbox`, or GPU-blocklist overrides to force software WebGPU; Chromium tracks this software-adapter limitation in [issue 40277080](https://issues.chromium.org/issues/40277080), and this project keeps its strict failure gate.

`app/diagnostics/wasm-add.wat` is the test-module source. The packaged browser smoke test is wired to `--smoke-test`; it creates a local test page, checks the desktop UI and the five graphics controls, executes JavaScript and the same WASM add module inside a Chromium page, and exercises new-tab/close-tab behavior. It then probes `https://example.com/` using normal Chromium certificate validation. If the runner cannot reach the public network, the HTTPS probe is logged as **BLOCKED** instead of bypassing certificate checks.

## GitHub Actions build

`.github/workflows/build.yml` runs the Node tests and renderer build on Linux and builds the actual Windows x64 portable app on `windows-latest`. Actions are pinned to immutable commit IDs; Node is pinned to `22.22.3`; npm dependencies are locked. The Windows job:

1. Installs with `npm ci`, runs `npm test`, and audits the full locked dependency tree, including the Electron build/runtime package.
2. Builds the AMD FSR1 helper with CMake/MSVC, then packages it and the pinned licensed shader inputs with the Electron portable app.
3. Verifies `release/TriCoreBrowser.exe` exists and is at least 30 MB (preventing an empty/placeholder upload). Immediately after that size check, it uploads `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` containing the actual EXE. This diagnostic artifact is not acceptance-certified and is not used by the release workflow; it is retained even when a later smoke gate fails. This path was verified in [run 38242786245](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38242786245) (artifact ID `11743262998`, 109,708,463-byte ZIP containing the EXE).
4. Launches the packaged executable with `--smoke-test` and requires exit code 0. It validates three changing `capturePage()` PNG screenshots through the native D3D12 FSR1 helper on WARP (diagnostic-only), then opens the bundled WebGPU FSR1 scene and requires at least three completed frames through the visible canvas from a smaller game render target. It validates adapter/API/timings/resolutions and a post-processing PNG evidence capture; that PNG is not processed by FSR. WARP is software-only, WebGPU CI adapter classification is reported without a physical-device claim, and physical-GPU validation remains `NOT RUN`.
5. Uses `scripts/package-windows.ps1` to require both summaries and assemble the portable ZIP, diagnostic captures/reports, WebGPU integration summary/output capture, build/size reports, and SHA-256 checksums.
6. Uploads the executable, complete ZIP, both test-path evidence sets, and dependency reports as the `TriCoreBrowser-Windows-x64` workflow artifact (30-day retention).

**Earlier verified example:** app/source commit `eee56b7` passed the then-current Windows and Linux workflow in [run 38149140832](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140832). That run validates the older screenshot/PNG diagnostic on WARP only; it predates the game-side WebGPU FSR1 vertical slice and does not prove it. **Latest current-source result:** run [38242786245](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38242786245) built and size-validated the executable, uploaded an explicitly unverified EXE candidate, and passed non-WebGPU checks, but the strict live-WebGPU smoke failed at adapter discovery. The acceptance-certified portable ZIP and public release were correctly withheld. See the [acceptance ledger](FSR1_WEBGPU_ACCEPTANCE_LEDGER.md) for details. The prior portable artifact is not a public GitHub Release.

The full npm audit report is retained as a CI artifact. The app has no declared npm production dependencies; Electron itself is a dev dependency used to build the bundled runtime, so `npm audit --omit=dev` would exclude it and is not used as the security gate. CI audits the complete lockfile, including Electron and electron-builder. The 2026-10-11 audit reported 8 moderate findings and 0 high/critical findings; the full report/tree are uploaded and the gate fails on high or critical findings.

## Release workflow

`.github/workflows/release.yml` rebuilds and reruns the packaged-app test before publication. On this session branch, the release path is explicitly opted into by a commit subject of the exact form `[publish-prerelease v1.0.0-alpha.2]`; it only listens to `arena/66abfdc9-tri-core-browser`, and stable tags are rejected. The file also defines a manual `workflow_dispatch` path with an explicit publish input for repositories/refs where GitHub exposes it. Ordinary commits and pull requests do not publish a public release. The workflow uploads `TriCoreBrowser.exe`, `TriCoreBrowser-Windows-x64-portable.zip`, `BUILD_REPORT.txt`, `SIZE_AUDIT.txt`, and `SHA256SUMS.txt` to the GitHub Release.

## Build environment limits

The Arena working container for this change is Linux and does not include MSVC, Windows SDK, or a Windows desktop. It cannot produce or launch the Windows executable locally. A Windows deliverable is only considered built after the Windows Actions job has compiled the Electron/Chromium package and the packaged smoke test has completed. A previous successful run on a different, unmerged branch is not proof for this source revision.
