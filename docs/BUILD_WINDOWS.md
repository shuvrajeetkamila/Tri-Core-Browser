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
4. To run the same embedded smoke test manually and assemble the full ZIP/reports, use PowerShell:

   ```powershell
   $env:RUNNER_TEMP = $env:TEMP
   $smokeLog = Join-Path $env:RUNNER_TEMP 'tricore-smoke.stdout.txt'
   & .\release\TriCoreBrowser.exe --smoke-test *> $smokeLog
   if ($LASTEXITCODE -ne 0) { throw "Smoke test failed with exit code $LASTEXITCODE" }
   $env:TRICORE_SMOKE_TEST = 'PASS'
   .\scripts\package-windows.ps1
   ```

5. Optional installer: `npm run package:win:installer` creates an NSIS installer in `release/`.

`app/diagnostics/wasm-add.wat` is the test-module source. The packaged browser smoke test is wired to `--smoke-test`; it creates a local test page, checks the desktop UI and the five graphics controls, executes JavaScript and the same WASM add module inside a Chromium page, and exercises new-tab/close-tab behavior. It then probes `https://example.com/` using normal Chromium certificate validation. If the runner cannot reach the public network, the HTTPS probe is logged as **BLOCKED** instead of bypassing certificate checks.

## GitHub Actions build

`.github/workflows/build.yml` runs the Node tests and renderer build on Linux and builds the actual Windows x64 portable app on `windows-latest`. Actions are pinned to immutable commit IDs; Node is pinned to `22.22.3`; npm dependencies are locked. The Windows job:

1. Installs with `npm ci`, runs `npm test`, and audits runtime dependencies.
2. Builds with `electron-builder --win portable --x64`.
3. Verifies `release/TriCoreBrowser.exe` exists and is at least 30 MB (preventing an empty/placeholder upload).
4. Launches the packaged executable with `--smoke-test` and requires exit code 0.
5. Uses `scripts/package-windows.ps1` to assemble the portable ZIP, build/size reports, and SHA-256 checksums.
6. Uploads the executable, complete ZIP, and reports as the `TriCoreBrowser-Windows-x64` workflow artifact (30-day retention).

The full npm audit report is retained as a CI artifact. The current package has no production/runtime dependency vulnerabilities according to `npm audit --omit=dev`; npm reports moderate findings in the development/build dependency tree. The CI audit step records those results and fails on high or critical findings.

## Release workflow

`.github/workflows/release.yml` is manual. Select the exact branch/ref you intend to ship (for this change, `arena/66abfdc9-tri-core-browser`); it always rebuilds and reruns the packaged-app test for that ref. A release is only published when its explicit `publish` input is enabled; experimental builds must use a prerelease tag such as `v1.0.0-alpha.1`. Normal pushes and pull requests do not create public releases. The workflow uploads `TriCoreBrowser.exe`, `TriCoreBrowser-Windows-x64-portable.zip`, `BUILD_REPORT.txt`, `SIZE_AUDIT.txt`, and `SHA256SUMS.txt` to the GitHub Release.

## Build environment limits

The Arena working container for this change is Linux and does not include MSVC, Windows SDK, or a Windows desktop. It cannot produce or launch the Windows executable locally. A Windows deliverable is only considered built after the Windows Actions job has compiled the Electron/Chromium package and the packaged smoke test has completed. A previous successful run on a different, unmerged branch is not proof for this source revision.
