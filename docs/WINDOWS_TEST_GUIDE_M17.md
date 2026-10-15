# Windows x64 build, packaged smoke, and GPU acceptance guide — M17

This guide keeps the following evidence scopes separate: source/unit tests, a Windows package build, the packaged browser smoke, bundled-scene WebGPU FSR1, the packaged `capturePage()` → D3D12 WARP diagnostic, the isolated native WARP harness, and physical-GPU acceptance. A green Level A run is not a physical-GPU pass and is not release eligibility. See [`MILESTONE_17_REPORT.md`](MILESTONE_17_REPORT.md) and [`WINDOWS_ACCEPTANCE_M17.json`](WINDOWS_ACCEPTANCE_M17.json) for the current snapshot.

## M17 snapshot

The source-under-test is `cdb0de33e42d7d889170479c376ec89b1197b342`. After publication, normal push run [38715925369](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38715925369) on documentation commit `811ff18f749e4f013edefea87175f0b1898623fe` reports a successful hosted Windows x64 portable build, packaged smoke process, and Level A validator. The resulting candidate (`11962019057`) and diagnostics (`11963022874`) metadata is available, but one bounded direct ZIP API attempt for each returned EOF and zero bytes. The prior cdb0 IDs (`11920245773`, `11919901023`) were not retried because M16 had already exhausted two routes for each. Exact packaged independent WebGPU and bundled FSR1 statuses therefore remain **BLOCKED** for independent review.

The separate M17 native D3D12/WARP run [38715925421](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38715925421) reports a successful one-frame software harness. New artifact ID `11962568184` returned EOF/zero bytes on one direct ZIP API attempt; the earlier ID `11920425376` had two routes exhausted. WARP is software and never satisfies the physical-GPU gate.

No local Windows build was possible in the Linux sandbox: PowerShell, CMake, Wine, an Electron runtime payload, a desktop/browser, and `/dev/dri` were absent. The local `npm ci --ignore-scripts` and Vite build are source checks only, not Windows packaging. No unsafe GPU flag or security bypass was used. The physical-GPU workflow was not dispatched; its runner-list endpoint returned HTTP 403, which leaves runner availability unknown.

## 1. Preserve outputs and record the environment

Use a clean disposable Windows x64 checkout or VM at the exact commit. Never clean/reset an existing checkout or overwrite an existing `node_modules`, `build`, `dist`, `release`, output directory, artifact, or prior evidence. The `npm run package:win` script writes into `build/` and `release/`; `scripts/package-windows.ps1` can remove pre-existing staging/ZIP outputs and is guarded for required physical-GPU evidence. Run any destructive packaging/staging action only in a fresh disposable checkout with empty output paths.

Create a unique evidence folder outside the checkout and record the source, lockfile, OS, toolchain, and command exit codes. For example:

```powershell
$ErrorActionPreference = 'Stop'
$evidenceRoot = Join-Path $env:TEMP ("tricore-m17-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $evidenceRoot | Out-Null
$smokeOut = Join-Path $evidenceRoot 'packaged-smoke'
New-Item -ItemType Directory -Path $smokeOut | Out-Null

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

Also capture Visual Studio/MSVC and Windows SDK versions from the developer shell. The current workflow selects Node.js `22.22.3`, but uses mutable `windows-latest` and does not pin/assert npm, Visual Studio/MSVC, CMake, or Windows SDK. Do not publish broad environment dumps that might contain credentials.

## 2. Locked install, tests, and Windows package build

On a trusted, disposable Windows checkout, the install scripts must run because Electron needs its platform runtime payload. Keep the full-audit result as well as the configured high/critical threshold; a high-only pass is not a clean audit.

```powershell
$transcript = Join-Path $evidenceRoot 'build-transcript.txt'
Start-Transcript -Path $transcript
try {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed: $LASTEXITCODE" }

  npm test
  if ($LASTEXITCODE -ne 0) { throw "npm test failed: $LASTEXITCODE" }

  npm audit --json --package-lock-only | Set-Content (Join-Path $evidenceRoot 'npm-audit-full.json')
  $fullAuditExit = $LASTEXITCODE
  "npm audit exit=$fullAuditExit" | Add-Content (Join-Path $evidenceRoot 'exit-codes.txt')

  npm audit --audit-level=high
  if ($LASTEXITCODE -ne 0) { throw "High/critical audit threshold failed: $LASTEXITCODE" }

  node .\scripts\dependency-audit.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Dependency audit script failed.' }

  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Renderer build failed: $LASTEXITCODE" }

  npm run package:win
  if ($LASTEXITCODE -ne 0) { throw "Windows portable package build failed: $LASTEXITCODE" }
} finally {
  Stop-Transcript | Out-Null
}
```

Confirm the portable executable exists and record its size, SHA-256, and signature result without executing an unrecovered candidate:

```powershell
$exe = Join-Path $PWD 'release/TriCoreBrowser.exe'
if (-not (Test-Path $exe -PathType Leaf)) { throw 'Portable executable was not produced.' }
$item = Get-Item $exe
if ($item.Length -lt 30000000) { throw "Executable is unexpectedly small: $($item.Length) bytes" }
"bytes=$($item.Length)" | Set-Content (Join-Path $evidenceRoot 'exe-size.txt')
(Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant() |
  Set-Content (Join-Path $evidenceRoot 'exe.sha256')
Get-AuthenticodeSignature $exe |
  Select-Object Status, StatusMessage |
  ConvertTo-Json | Set-Content (Join-Path $evidenceRoot 'authenticode.json')
```

A signature result, if available, is not a malware scan or a malware-free guarantee. Do not use `npm audit fix`, a forced downgrade, or a lockfile override without a separate compatibility/security review.

## 3. Run the packaged browser's Level A smoke

The smoke must run the built Electron package, not `npm test`, a renderer-only Vite preview, or an unpackaged development window. Use a new output directory and retain stdout/stderr, the smoke log, JSON summaries, and PNGs together. Keep normal Chromium/WebGPU security settings enabled.

```powershell
$exe = Join-Path $PWD 'release/TriCoreBrowser.exe'
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
if ($LASTEXITCODE -ne 0) { throw 'Level A packaged-smoke evidence validation failed.' }
```

Interpret each report independently:

- `packaged-smoke-summary.json`: overall package/smoke policy and release eligibility fields.
- `webgpu-compute-smoke-summary.json`: independent known-answer WebGPU compute/readback; **not** the bundled FSR1 scene.
- `fsr1-webgpu-summary.json`: the bounded bundled-scene WebGPU path; review adapter identity/unknown status, shader compilation, pipeline/resource state, EASU and RCAS dispatch counts, completed frames, dimensions, output comparison, visible canvas evidence, and software-adapter classification.
- `browser-frame-smoke-summary.json`: the distinct Electron `capturePage()` PNG → native D3D12 helper test; its packaged smoke route uses WARP software and remains a screenshot/readback diagnostic.
- `fsr1-webgpu-visible-output.png` and any stage PNGs: evidence only, not FSR inputs.

A Level A validator `PASS` may permit a safe optional WebGPU `SKIPPED`; it does not prove that WebGPU compute or bundled FSR1 passed. A screenshot or queue-completion promise alone does not prove visible output. Do not enable unsafe WebGPU, disable the GPU/sandbox, bypass the adapter blocklist, or disable driver workarounds to force a result.

## 4. Keep the D3D12 WARP helper separate

The native POC workflow is `.github/workflows/fsr1-native-poc.yml`. On its hosted Windows runner it configures/builds `native/fsr1-poc`, runs `TriCoreFsr1Poc.exe --warp --out-dir <new-folder>`, and validates a single deterministic synthetic frame plus output images. Its checks must keep `softwareAdapter=true` and physical-GPU status `NOT RUN`. This is useful software-pipeline evidence only; it does not validate the packaged browser, bundled WebGPU scene, physical GPU, arbitrary webpages, or performance.

Never combine the WARP result with physical-GPU acceptance. For a local copy of this regression, build and run only from a clean Windows checkout, store results in a unique directory, and do not use WARP as a fallback when a hardware adapter is required.

## 5. Physical-GPU Level B

The existing Level B job is separate from normal pushes and requires an opt-in workflow input plus an already configured runner labelled `[self-hosted, windows, x64, gpu]`. M17 did not dispatch it; the read-only runner inventory query was denied with HTTP 403, so runner availability is **unknown**. Do not provision a runner, change organization/repository permissions or secrets, make a paid purchase, or dispatch a workflow as part of this M17 record.

Physical acceptance requires a named non-software adapter and active driver, required-policy packaged smoke, independent WebGPU compute, at least three successful EASU and RCAS scene dispatches, completed frames, correct input/output dimensions, post-processing and visible-pixel evidence, and preserved logs/PNGs. WARP, `windows-latest`, vendor labels, a green Level A job, or an adapter name by itself is not a physical-GPU pass. Run a required-policy gate only when an owner has separately authorized the existing hardware and execution route.

## 6. Recover artifacts safely

GitHub metadata for the earlier cdb0 package run `38615197486`:

| Artifact | ID | Remote size | Reported SHA-256 | Local state |
|---|---:|---:|---|---|
| `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` | `11920245773` | 109,717,102 | `cb714b55971079ccd56a6b55aa67b555da5d0275c3f0370ec1b8af0746262f8c` | M16 exhausted two routes; M17 did not repeat. |
| `TriCoreBrowser-Packaged-Smoke-Diagnostics` | `11919901023` | 737,251 | `251f7d73c56326e8e4a415514ceaa8bfaef935848b662d16d90ff4fbef754eba` | M16 exhausted two routes; M17 did not repeat. |

Current M17 normal-push run `38715925369` artifact metadata:

| Artifact | ID | Remote size | Reported SHA-256 | Local state |
|---|---:|---:|---|---|
| `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` | `11962019057` | 109,713,620 | `52c77f2fab4738355eaa56d6fe4518db6965b19050f83a96882d02ff33e64e1d` | One direct ZIP API attempt returned EOF/zero bytes; not extracted or executed. |
| `TriCoreBrowser-Packaged-Smoke-Diagnostics` | `11963022874` | 730,363 | `47c4449db01f124bb5bbdd31c8ec8ca501ca7d86adda39328d80efcb6c78ebc2` | One direct ZIP API attempt returned EOF/zero bytes; contents unavailable. |

The earlier WARP artifact `11920425376` reports 59,487 bytes and SHA-256 `d599dea6528bc55d3d8f3816de32e57103cfdab5ba62a5b4c6bce72c213e2dda`; its two distinct routes returned EOF. The M17 push WARP artifact `11962568184` reports 59,486 bytes and SHA-256 `e0e90e953c017bf8a2ebc87b01cfe0fc96c6e4c63cbc6f192aa6be3131e69f76`; one direct ZIP API attempt returned EOF/zero bytes. These remote values are not local verification. No second route was used for the new IDs because the ZIP API failed and the alternative CLI route auto-extracts before a local digest check. A later run creates new artifact IDs; treat each as new and do not retry exhausted IDs/routes.

Before inspecting any recovered ZIP:

1. Confirm repository, run ID, source commit, artifact name/ID, creation time, and remote metadata through GitHub's authenticated Actions API or official run page.
2. Download the untouched ZIP to a **new external** path. Compare local byte count and SHA-256 to the exact GitHub-reported digest; stop on any mismatch or empty file.
3. Only after the digest matches, run `7z t`/`unzip -t` and list entries without extracting. Reject path traversal, absolute paths, links, unexpected executables, or unexpected file sizes.
4. Extract diagnostics only to a new isolated directory, then validate the JSON schemas and image dimensions/hashes offline. Never run a candidate executable merely because the archive hash matches.
5. Keep remote digest distinct from a local digest. Hash/provenance success does not certify code safety, signatures, or malware-free status.

The candidate is explicitly **unverified** and was uploaded before the smoke step. Do not execute it until provenance, archive integrity, content, and any required static/signature review are complete. A failed artifact route may print a temporary signed redirect in CLI diagnostics; do not copy, store, or share it. A prior WARP CLI error did emit such a temporary redirect; the saved external log was immediately redacted and the URL is not reproduced or reused.

## 7. Build reproducibility and release boundary

A successful `npm ci` and one Windows build establish a repeatable procedure, not bit-for-bit reproducibility. To claim binary reproducibility, perform two independent clean Windows builds with the same source commit, Node/npm, Windows image/build, Visual Studio/MSVC, Windows SDK, CMake, architecture, and build configuration; record and compare independent executable hashes. Current M17 evidence lacks recovered EXE bytes and pinned/captured Windows native tool versions, so reproducibility is not established.

The full audit is not clean: eight moderate records map to the `sprintf-js <=1.1.3` advisory; the high-only threshold pass is not an all-clear. DLSS and arbitrary-page upscaling are not implemented. M15 Images remains deferred by default pending original M8/M9 source or explicit new-scope approval. `.github/workflows/release.yml` currently lists a different Arena push branch; no release, tag, dispatch, or trigger edit occurred. Keep release eligibility blocked until the exact packaged WebGPU evidence, artifact integrity, physical-GPU gate, dependency disposition, and owner release-trigger decision are resolved.

## 8. M17 local evidence references

External Linux source-check evidence is under `/home/user/m17-audit/2026-10-15_093129_UTC_M17/`:

- `logs/npm-ci-ignore-scripts.log` — locked install; scripts disabled; external sandbox only.
- `logs/npm-test-clean-sandbox.log` — 100/100 tests, exit 0.
- `logs/renderer-build.log` and `renderer-build-cdb0/` — Vite output outside Git.
- `logs/audit-full.json`, `logs/audit-high.json`, `logs/npm-ls.json`, `logs/dependency-audit.log` — repeat audit/tree evidence.
- `M17_postpublication_evidence.log` — safe, filtered post-push workflow/PR/artifact metadata and exit results.
- `logs/windows-candidate-run38715925369-id11962019057-retrieval.json`, `logs/packaged-diagnostics-run38715925369-id11963022874-retrieval.json`, and `logs/native-warp-run38715925421-id11962568184-retrieval.json` — direct API recovery attempts; redacted stderr references.
- `logs/warp-artifact-retrieval-1.txt` and redacted `logs/warp-artifact-gh-run-download.log` — earlier WARP artifact retrieval attempts; the signed redirect is not retained.
- `prechange-preservation-hashes.tsv`, `worktree-baseline.tsv`, and `remote-cdb0-tree-comparison.tsv` — pre-edit preservation/reconciliation evidence.
