# Milestone 18 — Windows x64 portable application artifact and provenance

- **Date:** 2026-10-15 (Asia/Kolkata)
- **Branch:** `arena/18bfbe1a-tri-core-browser`
- **M18 implementation / Windows build source commit:** `6c6d05113f6dcd2e8ba3cabb709377f05c888630`
- **Windows build run:** [38729756733](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38729756733)
- **Overall:** **DELIVERABLE PUBLISHED; independent local byte verification remains BLOCKED.** The Windows x64 portable EXE and a convenience ZIP were built, measured, hashed, and uploaded by the successful Windows workflow after packaged smoke and Level A validation. The sandbox could not retrieve the artifact bytes, so these build-time hashes are not independently verified here. This is not a formal release and does not establish release eligibility.

## Executive result

1. **A real Windows x64 application artifact is available.** The normal push of commit `6c6d051…` ran the existing Windows packaging workflow on `windows-latest`. The Windows job built `release/TriCoreBrowser.exe` using the existing `npm run package:win` script (`electron-builder --win portable --x64` after the renderer and native CMake build). It uploaded the raw EXE and a separate portable-delivery ZIP, together with a JSON build manifest and a SHA-256/size sidecar.
2. **The M18 upload is gated on packaged validation, not on GPU availability.** The Windows job reports success for automated tests, Windows packaging, EXE size validation, packaged-app smoke, Level A packaged-evidence validation, M18 manifest/ZIP creation, and M18 upload. The manifest and M18 artifact steps occur after the smoke and validator. Optional WebGPU availability and physical-GPU Level B are not conditions for this application artifact.
3. **GitHub Actions handoff:** open the [official run page](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38729756733), then select the exact artifact name in the Artifacts section. The artifact name and exact EXE/ZIP hashes and sizes are below. The artifact is retained until **2026-11-14 11:52:13 UTC**. GitHub requires downloading its artifact archive and extracting it; this is not a direct `.exe` URL.
4. **No independent local download or launch is claimed.** GitHub's run and artifact metadata APIs were reachable, but artifact bytes are served through a download route that repeatedly returned EOF/zero bytes in M16–M17. Given that history and the sandbox's restricted outbound hosts, this milestone did not retry an exhausted content-download route. No local artifact archive was verified or extracted, and no downloaded EXE was run on a physical desktop. The CI Windows job did launch the packaged application with `--smoke-test` and reported process exit code **0**; the Level A validator reported exit code **0**.
5. **Graphics and release boundaries remain.** The exact packaged WebGPU compute and bundled-scene FSR1 reports are still **BLOCKED for independent review** because diagnostics bytes were not recovered. Physical-GPU Level B is **NOT RUN**; the hosted Windows job explicitly skipped physical-GPU-only distribution assembly. The separate D3D12/WARP harness passed its software-only workflow checks; WARP is not physical-GPU evidence. DLSS and arbitrary ordinary-webpage upscaling remain **NOT IMPLEMENTED**.
6. **No release or owner approval is represented.** PR #1 remains **OPEN/DRAFT**. No release, tag, manual dispatch, merge/close, permission or secret change, runner provisioning, or paid action occurred. The existing release workflow's push-branch mismatch noted in M17 was not changed. `releaseEligible` remains false.

## Downloadable artifact and provenance

**Official entry point:** [Windows build run 38729756733](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38729756733)

**Exact artifact name** (the EXE and ZIP hashes/sizes and Node/npm versions are embedded in the name):

```text
TriCoreBrowser-Windows-x64-M18-EXE-ba0280c89296c2c9ac8f75274f04554686c2759fe39e4418b06dbeddf2cc00af-BYTES-109797006-ZIP-BYTES-109729146-SHA256-044ae6f6fd17b386544e3d64718634143875b264c88d1172c67c03312e040cfc-NODE-v22.22.3-NPM-10.9.8
```

| File or artifact | Size | SHA-256 | Meaning / verification state |
|---|---:|---|---|
| `TriCoreBrowser.exe` | 109,797,006 bytes | `ba0280c89296c2c9ac8f75274f04554686c2759fe39e4418b06dbeddf2cc00af` | Hash and size calculated by the Windows runner after the packaged smoke and Level A validation. Not independently compared to downloaded bytes in this sandbox. |
| `TriCoreBrowser-Windows-x64-M18.zip` | 109,729,146 bytes | `044ae6f6fd17b386544e3d64718634143875b264c88d1172c67c03312e040cfc` | Convenience ZIP containing the EXE, manifest, README, license, third-party notices, and known-limitations file. The runner opened the ZIP and checked its expected entry list and embedded EXE size; no local download/CRC or extraction check was possible. |
| GitHub Actions artifact `11969134344` | 219,482,256 bytes | GitHub-reported outer-artifact digest: `sha256:8638ac90a48f0317d57e9fe13af83c42b5c307bb60965c32752cd7e377ef3752` | This is GitHub metadata for the complete uploaded Actions artifact archive, **not** the EXE's hash and not a locally verified digest. Created `2026-10-15T11:52:19Z`; expires `2026-11-14T11:52:13Z`. |

The outer Actions artifact contains `TriCoreBrowser.exe`, `TriCoreBrowser-Windows-x64-M18.zip`, `M18_BUILD_MANIFEST.json`, and `M18_ARTIFACT_HASHES.txt`. The convenience ZIP contains the EXE plus `M18_BUILD_MANIFEST.json`, `README.md`, `LICENSE`, `THIRD_PARTY_NOTICES.txt`, and `KNOWN_LIMITATIONS.md`. It is an additional download convenience, not an installer or the separate strict physical-GPU-gated distribution package; that existing assembly/upload remained skipped.

The Windows-created `M18_BUILD_MANIFEST.json` records the exact `GITHUB_SHA`, run ID/URL/attempt, `package-lock.json` SHA-256, output filename/hash/size, Authenticode status, Windows runner/OS details, Node/npm, CMake, Visual Studio installation and Windows SDK details available on the runner, build target, smoke/validator exit codes, and reported WebGPU/physical-GPU states. `M18_ARTIFACT_HASHES.txt` contains build-time hashes and sizes for the EXE, convenience ZIP, and JSON manifest. These files are in the Actions artifact; their contents were not read locally because the artifact bytes could not be retrieved. Node `v22.22.3` and npm `10.9.8` are also visible in the exact artifact name. The workflow uses mutable `windows-latest`; this single build does not establish bit-for-bit reproducibility.

### Separate evidence artifacts

- `TriCoreBrowser-Packaged-Smoke-Diagnostics` — ID `11969049342`, 735,138 bytes, GitHub-reported digest `sha256:2585c512dae43e10b3cfda5aaf5835b2f83200f13ce48d09880cfdb23e106a4b`, expires `2026-11-14T11:52:07Z`. Its reports and PNGs were not independently inspected.
- Pre-smoke candidate `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` — ID `11969319274`. **Do not use this instead of the M18 artifact**; it is explicitly the earlier candidate upload, before smoke validation.
- Separate native WARP run [38729756717](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38729756717) succeeded on the same source commit. Its `TriCore-FSR1-D3D12-WARP-POC` artifact (ID `11969433614`) is separate software-only evidence, not a physical-GPU or packaged-WebGPU pass.

## Build, test, and acceptance evidence

The successful push run `38729756733` is for exact source commit `6c6d05113f6dcd2e8ba3cabb709377f05c888630`, event `push`, on `arena/18bfbe1a-tri-core-browser`. Windows job `116404337527` completed successfully; Linux checks also completed successfully. The package pipeline ran locked install, `npm test`, the configured high/critical audit threshold, dependency-audit recording, `npm run package:win`, executable validation, packaged smoke, Level A evidence validation, M18 manifest/ZIP creation, and M18 artifact upload. The physical-GPU job was skipped. The diagnostics upload succeeded separately.

| Check | Result | Scope / limitation |
|---|---|---|
| Local `npm ci --ignore-scripts` | **PASS**, 298 packages | Linux source-check install; install scripts disabled, so not a Windows Electron package build. |
| Local `npm test` | **PASS**, 102/102 | Automated source/workflow tests; no Windows GUI exercised locally. |
| Local `npm run build` | **PASS**, Vite 8.3.4 | Renderer build only; not the portable app. |
| Local `npm audit --audit-level=high` | **PASS** | High/critical threshold only; not a clean full audit. |
| Local `node scripts/dependency-audit.cjs` | **PASS** at configured threshold | Reports 8 moderate, 0 high, 0 critical. The full npm audit still exits nonzero on the moderate findings. No `npm audit fix` or dependency change was made. |
| Hosted Windows x64 package build | **PASS** | `windows-latest`; source commit and run recorded above. |
| Packaged application startup/smoke | **PASS — CI-reported** | The built EXE was started with `--smoke-test`; workflow requires its successful exit and records exit code 0. This is hosted CI evidence, not a manual desktop run of downloaded bytes. |
| Level A packaged evidence validator | **PASS — CI-reported** | Exit code 0. The optional policy safely permits GPU-dependent states to be skipped when unsupported; the green Level A result is not a WebGPU/FSR1 or physical-GPU pass. |
| Independent WebGPU known-answer compute | **BLOCKED for independent review** | Exact per-run report unavailable. Do not infer PASS or SKIPPED from the job result. |
| Bundled-scene WebGPU FSR1 EASU/RCAS | **BLOCKED for independent review** | Exact adapter, dispatch, dimensions, and visible-output report unavailable. It is not ordinary webpage upscaling. |
| Packaged `capturePage()` → D3D12/WARP diagnostic | **BLOCKED for independent artifact review** | Packaged Level A validation passed, but the per-run summary/PNG was not recovered. This path remains distinct from WebGPU. |
| Separate native D3D12/WARP harness | **PASS — workflow only** | The isolated software harness run reports success; WARP is software and never a physical-GPU pass. |
| Physical-GPU Level B | **NOT RUN** | No opt-in dispatch or runner provisioning. The app artifact is not gated on optional physical-GPU evidence. |
| Authenticode / malware safety | **Not independently assessed** | The manifest records the runner's Authenticode status. A hash is an integrity/provenance comparison, not a safety or malware-free guarantee. |
| Reproducibility | **NOT ESTABLISHED** | One `windows-latest` build; no two independent Windows builds and no local EXE comparison. |

The full dependency audit remains unresolved: eight moderate records map to the existing `sprintf-js <=1.1.3` advisory; there are zero high and zero critical findings. No dependency or lockfile change was made in M18. Preserve the existing M12–M17 reports and statuses.

## Changes and remaining work

M18 changes are limited to `.github/workflows/build.yml`, `scripts/write-smoke-job-summary.cjs`, and two workflow/summary tests, plus the M18 report, download guide, and separate acceptance snapshot. The workflow creates the M18 files only after packaged smoke and Level A validation, preserves the separate diagnostics artifact, and uploads the EXE/ZIP/manifest with 30-day retention. It does not modify runtime browser code, Electron security flags, package dependencies, release triggers, or physical-GPU requirements. Generated executables and ZIPs are not committed to Git.

**Next:** download the named artifact from the official run page in a browser, compare the downloaded EXE and convenience ZIP against `M18_ARTIFACT_HASHES.txt` and this report, then launch only after the hashes match and the user has reviewed the unsigned-build/security caveat. Inspect the downloaded diagnostics separately if WebGPU/FSR1 acceptance is required. Keep physical-GPU Level B and any formal release decision under the existing owner-approval boundary.
