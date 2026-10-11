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
4. To run the required packaged smoke test and assemble the ZIP/reports/evidence, use PowerShell. The smoke test exercises the normal browser checks plus three changing frames at three capture resolutions from the bundled WebGL2 scene, captured by Electron `capturePage()` and processed by FSR1 on software WARP. This proves the screenshot/readback route only; it is not physical-GPU or general-page integration.

   ```powershell
   $env:RUNNER_TEMP = $env:TEMP
   $fsrSmokeOut = Join-Path $env:TEMP 'tricore-fsr-browser-frame-smoke'
   if (Test-Path $fsrSmokeOut) { Remove-Item $fsrSmokeOut -Recurse -Force }
   New-Item -ItemType Directory -Path $fsrSmokeOut -Force | Out-Null
   $env:TRICORE_REQUIRE_FSR_BROWSER_SMOKE = 'PASS'
   $env:TRICORE_FSR_SMOKE_OUT = $fsrSmokeOut
   $smokeLog = Join-Path $env:RUNNER_TEMP 'tricore-smoke.stdout.txt'
   & .\release\TriCoreBrowser.exe --smoke-test *> $smokeLog
   if ($LASTEXITCODE -ne 0) { throw "Smoke test failed with exit code $LASTEXITCODE" }
   $summary = Get-Content (Join-Path $fsrSmokeOut 'browser-frame-smoke-summary.json') -Raw | ConvertFrom-Json
   if ($summary.status -ne 'PASS' -or $summary.softwareAdapter -ne $true -or $summary.frameCount -ne 3 -or $summary.distinctInputFrames -ne 3 -or $summary.distinctInputResolutions -ne 3) { throw 'Browser-frame FSR1 WARP smoke evidence did not pass.' }
   $env:TRICORE_SMOKE_TEST = 'PASS'
   $env:TRICORE_FSR_BROWSER_SMOKE = 'PASS'
   .\scripts\package-windows.ps1
   ```

   The portable ZIP includes the controlled input/output PNG captures and per-frame reports under `diagnostics/fsr1-browser-frame-smoke/`. Optional installer: `npm run package:win:installer` builds the same native helper into an NSIS package, but installer launch/upgrade behavior is not covered by the portable-package smoke gate.

`app/diagnostics/wasm-add.wat` is the test-module source. The packaged browser smoke test is wired to `--smoke-test`; it creates a local test page, checks the desktop UI and the five graphics controls, executes JavaScript and the same WASM add module inside a Chromium page, and exercises new-tab/close-tab behavior. It then probes `https://example.com/` using normal Chromium certificate validation. If the runner cannot reach the public network, the HTTPS probe is logged as **BLOCKED** instead of bypassing certificate checks.

## GitHub Actions build

`.github/workflows/build.yml` runs the Node tests and renderer build on Linux and builds the actual Windows x64 portable app on `windows-latest`. Actions are pinned to immutable commit IDs; Node is pinned to `22.22.3`; npm dependencies are locked. The Windows job:

1. Installs with `npm ci`, runs `npm test`, and audits the full locked dependency tree, including the Electron build/runtime package.
2. Builds the AMD FSR1 helper with CMake/MSVC, then packages it and the pinned licensed shader inputs with the Electron portable app.
3. Verifies `release/TriCoreBrowser.exe` exists and is at least 30 MB (preventing an empty/placeholder upload).
4. Launches the packaged executable with `--smoke-test` and requires exit code 0. The required gate opens the real bundled WebGL2 scene in a sandboxed `WebContentsView`, captures three changing frames at three view resolutions through `capturePage()` PNG, processes each with the native FSR1 helper on WARP, validates reports/PNG signatures/dimensions, and preserves captures. WARP is software-only; physical-GPU validation remains `NOT RUN`.
5. Uses `scripts/package-windows.ps1` to assemble the portable ZIP, controlled-scene evidence captures/reports, build/size reports, and SHA-256 checksums.
6. Uploads the executable, complete ZIP, smoke captures/reports, and dependency reports as the `TriCoreBrowser-Windows-x64` workflow artifact (30-day retention).

The full npm audit report is retained as a CI artifact. The app has no declared npm production dependencies; Electron itself is a dev dependency used to build the bundled runtime, so `npm audit --omit=dev` would exclude it and is not used as the security gate. CI audits the complete lockfile, including Electron and electron-builder. The 2026-10-11 audit reported 8 moderate findings and 0 high/critical findings; the full report/tree are uploaded and the gate fails on high or critical findings.

## Release workflow

`.github/workflows/release.yml` rebuilds and reruns the packaged-app test before publication. On this session branch, the release path is explicitly opted into by a commit subject of the exact form `[publish-prerelease v1.0.0-alpha.2]`; it only listens to `arena/66abfdc9-tri-core-browser`, and stable tags are rejected. The file also defines a manual `workflow_dispatch` path with an explicit publish input for repositories/refs where GitHub exposes it. Ordinary commits and pull requests do not publish a public release. The workflow uploads `TriCoreBrowser.exe`, `TriCoreBrowser-Windows-x64-portable.zip`, `BUILD_REPORT.txt`, `SIZE_AUDIT.txt`, and `SHA256SUMS.txt` to the GitHub Release.

## Build environment limits

The Arena working container for this change is Linux and does not include MSVC, Windows SDK, or a Windows desktop. It cannot produce or launch the Windows executable locally. A Windows deliverable is only considered built after the Windows Actions job has compiled the Electron/Chromium package and the packaged smoke test has completed. A previous successful run on a different, unmerged branch is not proof for this source revision.
