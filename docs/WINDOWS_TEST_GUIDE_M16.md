# Windows x64 build, smoke, and reproducibility guide (M16)

This guide separates a clean Windows package build, the optional packaged-app Level A smoke, the WARP-only graphics diagnostic, and physical-GPU Level B acceptance. A green Level A run is **not** a physical-GPU pass and does not make a package release-eligible. See [`MILESTONE_16_REPORT.md`](MILESTONE_16_REPORT.md) and [`WINDOWS_ACCEPTANCE_M16.json`](WINDOWS_ACCEPTANCE_M16.json) for the current evidence and gate statuses.

## M16 evidence snapshot

On 2026-10-14, Windows Actions run [38599630672](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38599630672) built and size-validated the Windows x64 portable executable, passed the packaged smoke process and Level A evidence validator, and uploaded an explicitly unverified candidate plus smoke diagnostics. The run's optional WebGPU result is still **UNKNOWN**: GitHub reported the artifacts, but both the bounded API download and the distinct `gh run download` route ended in `EOF`, and the job-log route also ended in `EOF`. Do not infer a WebGPU pass or skip from the green workflow alone.

The exact Level A procedure and required reports are also documented in [`BUILD_WINDOWS.md`](BUILD_WINDOWS.md). M16 adds the reproducibility/evidence handling below; it does not replace the existing smoke validator or authorize a Level B dispatch.

## 1. Isolate the build and preserve prior outputs

Use a clean, disposable Windows x64 checkout or VM at the exact commit to test. Capture `git rev-parse HEAD`, `git status --porcelain`, and the SHA-256 of `package-lock.json` before building. Do not clean or overwrite an existing checkout, `node_modules`, `build`, `dist`, or `release` directory.

`npm run package:win` writes to `build/` and `release/`. The separate `scripts/package-windows.ps1` currently removes `release/TriCoreBrowser-Windows-x64` and `release/TriCoreBrowser-Windows-x64-portable.zip` when those paths already exist. Run that script only in a disposable checkout with fresh output paths; never use it to replace evidence you need to preserve. The package script is guarded by required physical-GPU acceptance and is **not** a Level A helper.

Create unique external evidence directories rather than deleting old logs or smoke output:

```powershell
$ErrorActionPreference = 'Stop'
$evidenceRoot = Join-Path $env:TEMP ("tricore-m16-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $evidenceRoot | Out-Null
$smokeOut = Join-Path $evidenceRoot 'packaged-smoke'
New-Item -ItemType Directory -Path $smokeOut | Out-Null

$env:TRICORE_M16_EVIDENCE = $evidenceRoot
(git rev-parse HEAD) | Set-Content (Join-Path $evidenceRoot 'source-commit.txt')
(git status --porcelain) | Set-Content (Join-Path $evidenceRoot 'source-status.txt')
(Get-FileHash .\package-lock.json -Algorithm SHA256).Hash.ToLowerInvariant() |
  Set-Content (Join-Path $evidenceRoot 'package-lock.sha256')
Get-CimInstance Win32_OperatingSystem |
  Select-Object Caption, Version, BuildNumber, OSArchitecture |
  ConvertTo-Json | Set-Content (Join-Path $evidenceRoot 'windows-version.json')
node --version | Set-Content (Join-Path $evidenceRoot 'node-version.txt')
npm --version | Set-Content (Join-Path $evidenceRoot 'npm-version.txt')
cmake --version | Set-Content (Join-Path $evidenceRoot 'cmake-version.txt')
```

Also record the Visual Studio/MSVC toolset and Windows SDK used by the build (for example, `vswhere.exe`'s Visual Studio installation version and `cl.exe /Bv` output from a Visual Studio developer shell). Do not publish environment dumps that could include credentials. The current workflow pins Node.js `22.22.3` but uses the mutable `windows-latest` image; npm, Visual Studio/MSVC, CMake, and Windows SDK versions are not all pinned and recorded by the package workflow.

## 2. Clean install, source checks, and portable build

The Windows build workflow uses lifecycle scripts because Electron must install its Windows runtime payload. In a trusted disposable checkout, run the locked install and checks, recording stdout/stderr and each exit code in an external transcript. `node scripts/dependency-audit.cjs` writes ignored `dependency-audit.json` and `dependency-tree.json` in the checkout, so run it only where those paths do not contain evidence you need to preserve.

```powershell
$buildTranscript = Join-Path $evidenceRoot 'build-transcript.txt'
Start-Transcript -Path $buildTranscript
try {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed: $LASTEXITCODE" }

  npm test
  if ($LASTEXITCODE -ne 0) { throw "npm test failed: $LASTEXITCODE" }

  npm audit --audit-level=high
  if ($LASTEXITCODE -ne 0) { throw "High/critical audit threshold failed: $LASTEXITCODE" }

  node .\scripts\dependency-audit.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Dependency-tree audit script failed.' }

  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Renderer build failed: $LASTEXITCODE" }

  npm run package:win
  if ($LASTEXITCODE -ne 0) { throw "Windows portable build failed: $LASTEXITCODE" }
} finally {
  Stop-Transcript | Out-Null
}
```

The high-only audit threshold does not clear the current moderate advisory; retain the full audit record and do not describe that threshold pass as a clean audit.

`package:win` rebuilds the renderer, configures/builds `native/fsr1-poc` with CMake for x64 Release, and asks electron-builder for the portable Windows x64 executable. Confirm `release/TriCoreBrowser.exe` exists and is not a placeholder, then record its byte count and SHA-256:

```powershell
$exe = Join-Path $PWD 'release/TriCoreBrowser.exe'
if (-not (Test-Path $exe -PathType Leaf)) { throw 'Portable executable was not produced.' }
$item = Get-Item $exe
if ($item.Length -lt 30000000) { throw "Unexpectedly small executable: $($item.Length) bytes" }
"bytes=$($item.Length)" | Set-Content (Join-Path $evidenceRoot 'executable-size.txt')
(Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant() |
  Set-Content (Join-Path $evidenceRoot 'executable.sha256')
Get-AuthenticodeSignature $exe |
  Select-Object Status, StatusMessage, SignerCertificate |
  ConvertTo-Json -Depth 4 | Set-Content (Join-Path $evidenceRoot 'authenticode.json')
```

The executable is currently unsigned; an unsigned result is not a malware scan or a malware-free claim. Keep the lockfile unchanged and do not run `npm audit fix` or a forced version downgrade as part of a reproducibility run.

## 3. Packaged-app Level A smoke (optional GPU policy)

Use a unique output path created above. This route runs the packaged app; it is different from `npm test` and from a renderer-only Vite build. It keeps Chromium certificate validation and the normal GPU/WebGPU security policy enabled.

```powershell
$stdout = Join-Path $evidenceRoot 'smoke.stdout.txt'
$stderr = Join-Path $evidenceRoot 'smoke.stderr.txt'
$smokeLog = Join-Path $evidenceRoot 'smoke-main.log.txt'
$env:TRICORE_GPU_TEST_MODE = 'optional'
$env:TRICORE_FSR_SMOKE_OUT = $smokeOut
$env:TRICORE_SMOKE_LOG = $smokeLog
Remove-Item Env:TRICORE_REQUIRE_FSR_INTEGRATION_SMOKE -ErrorAction SilentlyContinue

$process = Start-Process -FilePath $exe -ArgumentList @('--smoke-test') `
  -NoNewWindow -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
if (-not $process.WaitForExit(300000)) {
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  $process.WaitForExit()
  throw 'Packaged smoke timed out after 300 seconds.'
}
$process.Refresh()
"processExitCode=$($process.ExitCode)" |
  Set-Content (Join-Path $evidenceRoot 'smoke-process-exit.txt')
if ($process.ExitCode -ne 0) { throw "Packaged smoke failed: $($process.ExitCode)" }

node .\scripts\validate-packaged-smoke.cjs --policy optional `
  --directory $smokeOut --smoke-log $smokeLog
if ($LASTEXITCODE -ne 0) { throw 'Packaged smoke evidence validation failed.' }
```

Record the validator output and keep all emitted JSON/PNG/log evidence together. Interpret the reports separately:

- A `PASS` from the Level A smoke and shared validator establishes the bounded packaged-app checks that the validator actually exercised. It does **not** imply a WebGPU FSR pass.
- `webgpu-compute-smoke-summary.json` is an independent compute/readback probe; it is not the bundled FSR scene.
- `fsr1-webgpu-summary.json` is the bundled game-owned WebGPU EASU/RCAS scene; inspect adapter requests, device/shader/pipeline/resource status, dispatch counts, output dimensions, stage/visible-canvas evidence, and hashes. A safe optional no-adapter result is `SKIPPED`, not a GPU pass.
- `browser-frame-smoke-summary.json` exercises `capturePage()` PNG → the native D3D12 helper on **WARP software**. It is screenshot/readback diagnostic evidence only; it is not physical-GPU evidence, the bundled WebGPU scene, or arbitrary webpage processing.
- A packaged WebGPU `PASS` on a hosted/software adapter still leaves physical-GPU validation `NOT RUN`. Never add unsafe WebGPU flags, disable the GPU/sandbox, bypass the adapter blocklist, or disable driver workarounds to force a result.

## 4. Reproducibility acceptance

A successful `npm ci` and one successful Windows package build demonstrate a repeatable procedure, not bit-for-bit reproducibility. To establish binary reproducibility, repeat the clean build in two independent clean Windows environments with the same source commit, Node/npm versions, Windows build, Visual Studio/MSVC/SDK, CMake, and build configuration. Compare the independently captured SHA-256 values for `TriCoreBrowser.exe` (and, only when legitimately assembled, the portable ZIP). Record any differences rather than normalizing or replacing files.

Current M16 evidence does **not** meet that bar: the hosted run used `windows-latest`, the toolchain versions were not captured in an accessible report, artifact bytes could not be recovered, and no second independent Windows binary hash is available. Therefore M16 does not claim byte-for-byte reproducibility.

## 5. Artifact recovery without executing the candidate

The current candidate and diagnostics are attached to the official Actions run page:

<https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38599630672>

GitHub metadata reports:

| Artifact | ID | Reported size | Reported SHA-256 |
|---|---:|---:|---|
| `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` | `11910954706` | 109,720,667 bytes | `ca0b2b8b0996eecde499a556532cc9a287b6163a75ca23ffbce7978a031e5aaf` |
| `TriCoreBrowser-Packaged-Smoke-Diagnostics` | `11911314745` | 734,795 bytes | `eec0c9cc3c633356bfef417ceb0d6baeb95d25cdc3b50f4072b91ef184f2ef8a` |

For this exact run, the bounded GitHub CLI API ZIP GET and the distinct `gh run download` route each failed with `EOF` for both artifacts; no local bytes were received. Do not repeat those failed routes indefinitely. If the bytes are needed, download the artifacts from the official run page using the GitHub UI and attach the untouched ZIPs to the workspace—never copy/share a signed URL.

Before inspection, compare each downloaded archive's byte count and SHA-256 to the GitHub metadata above. The candidate is explicitly **unverified**: do not execute it. After hash verification, inspect/list it in an isolated temporary location; diagnostics may be extracted to a new empty temporary directory and checked offline with the repository's validator. Archive-integrity success proves only correspondence to GitHub's reported digest, not signing, malware-free status, physical-GPU support, or release readiness.

## 6. Physical GPU and release boundary

M16 did not manually dispatch a workflow, provision a runner, change permissions/secrets, or run the Level B required physical-GPU job. Level B remains **NOT RUN**; the current push run skipped it. Use the owner-controlled procedure and requirements in [`BUILD_WINDOWS.md`](BUILD_WINDOWS.md) only when the project owner has separately approved and verified the self-hosted Windows GPU runner. A queued/skipped job, WARP result, artifact upload, or Level A pass is never a physical-GPU pass.

A release remains blocked until the required physical-GPU evidence, exact packaged WebGPU reports, independently verified artifact bytes/provenance, dependency risk disposition, and the remaining source/Images decision are resolved. DLSS is not implemented; ordinary remote pages continue to use standard Chromium rendering.
