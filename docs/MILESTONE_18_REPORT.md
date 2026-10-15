# Milestone 18 — Windows x64 portable application artifact and provenance

- **Date:** 2026-10-15 (Asia/Kolkata)
- **Branch:** `arena/18bfbe1a-tri-core-browser`
- **M18 workflow/test implementation commit:** `6c6d05113f6dcd2e8ba3cabb709377f05c888630`
- **Documented handoff build source commit:** `003ec096b275e0f726dec1c3541b85e2d89faed3`
- **Recommended Windows build run:** [38731179031](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38731179031)
- **Overall:** **DELIVERABLE PUBLISHED; independent local byte verification remains BLOCKED.** The Windows x64 portable EXE and a convenience ZIP were built, measured, hashed, and uploaded by a successful hosted Windows workflow after packaged smoke and Level A validation. The sandbox could not retrieve the artifact bytes, so these build-time hashes are not independently verified here. This is not a formal release and does not establish release eligibility.

## Executive result

1. **A real Windows x64 application artifact is available.** The recommended artifact is from the normal documentation push of `003ec09…` on `windows-latest`. The existing `npm run package:win` script builds the renderer, CMake native component, then runs `electron-builder --win portable --x64`. The artifact contains the raw `release/TriCoreBrowser.exe`, a convenience ZIP, a JSON build manifest, and a SHA-256/size sidecar.
2. **M18 upload is gated on packaged validation, not GPU availability.** The recommended Windows run reports success for automated tests, package build, EXE size validation, packaged-app smoke, Level A evidence validation, M18 manifest/ZIP creation, and M18 artifact upload. The artifact step follows the packaged smoke and Level A validator. Optional WebGPU availability and physical-GPU Level B are not conditions for this application artifact.
3. **GitHub Actions handoff:** open the [recommended official run page](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38731179031), then select the exact artifact name below. It is retained until **2026-11-14 12:02:28 UTC**. GitHub provides the files inside an artifact ZIP; this is not a direct `.exe` URL or a GitHub Release.
4. **No independent local download or launch is claimed.** GitHub run and artifact metadata APIs were reachable, but artifact bytes repeatedly returned EOF/zero bytes in M16–M17. Given that history and the sandbox's restricted outbound hosts, the content-download routes were not repeated. No local M18 artifact archive was verified or extracted, and no downloaded EXE was run on a physical desktop. The hosted Windows jobs launched their own built EXEs with `--smoke-test`; both runs passed and the Level A validators passed.
5. **Two hosted Windows builds passed, but reproducibility is not established.** Run `38729756733` used workflow implementation commit `6c6d051…`; run `38731179031` used documentation commit `003ec09…`. Their EXE hashes differ. These are not two controlled builds of the exact same commit/toolchain, so neither reproducibility nor the reason for the difference is established. The recommended handoff is the second run, matching the source commit recorded in its manifest.
6. **Graphics and release boundaries remain.** The exact packaged WebGPU compute and bundled-scene FSR1 reports are still **BLOCKED for independent review** because diagnostics bytes were not recovered. Physical-GPU Level B is **NOT RUN**; physical-GPU-only distribution assembly was skipped. A separate D3D12/WARP harness passed its software-only workflow checks; WARP is not physical-GPU evidence. DLSS and arbitrary ordinary-webpage upscaling remain **NOT IMPLEMENTED**.
7. **No release or owner approval is represented.** PR #1 remains **OPEN/DRAFT**. No release, tag, manual dispatch, merge/close, permission or secret change, runner provisioning, or paid action occurred. The existing release workflow's push-branch mismatch noted in M17 was not changed. `releaseEligible` remains false.

## Recommended downloadable artifact

**Official entry point:** [Windows build run 38731179031](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38731179031)

**Exact artifact name** (includes build-time EXE/ZIP SHA-256 and sizes, plus Node/npm versions):

```text
TriCoreBrowser-Windows-x64-M18-EXE-7b6a914c21d015b92a9a21434002370f19c841149fa47be0ceb8ef522f7e1ae8-BYTES-109778690-ZIP-BYTES-109710823-SHA256-4ed6c0c4c87a1f9fd8279ca0efe159348fa29f37dc229d2d9edc58f099b5804a-NODE-v22.22.3-NPM-10.9.8
```

| File or artifact | Size | SHA-256 | Meaning / verification state |
|---|---:|---|---|
| `TriCoreBrowser.exe` | 109,778,690 bytes | `7b6a914c21d015b92a9a21434002370f19c841149fa47be0ceb8ef522f7e1ae8` | Hash and size calculated by the Windows runner after the packaged smoke and Level A validation. Not independently compared to downloaded bytes in this sandbox. |
| `TriCoreBrowser-Windows-x64-M18.zip` | 109,710,823 bytes | `4ed6c0c4c87a1f9fd8279ca0efe159348fa29f37dc229d2d9edc58f099b5804a` | Convenience ZIP containing the EXE and documentation. The runner opened the ZIP, checked its expected entry list, and checked the embedded EXE size; no local download/CRC or extraction check was possible. |
| GitHub Actions artifact `11971305924` | 219,445,598 bytes | GitHub-reported outer-artifact digest: `sha256:6b5e5d38d85b6cef0a807b4fb7fa6ad96e2929d8e7c0aeb2f19ce3472cf36a1e` | Metadata for the complete uploaded Actions artifact archive, **not** the EXE's hash and not locally verified. Created `2026-10-15T12:02:36Z`; expires `2026-11-14T12:02:28Z`. |

The outer artifact contains `TriCoreBrowser.exe`, `TriCoreBrowser-Windows-x64-M18.zip`, `M18_BUILD_MANIFEST.json`, and `M18_ARTIFACT_HASHES.txt`. The convenience ZIP contains the EXE, manifest, `README.md`, `LICENSE`, `THIRD_PARTY_NOTICES.txt`, and `KNOWN_LIMITATIONS.md`. It is an additional delivery convenience, not an installer or the separate strict physical-GPU-gated distribution package; that existing assembly/upload remained skipped.

The Windows-created `M18_BUILD_MANIFEST.json` records the exact `GITHUB_SHA`, run ID/URL/attempt, `package-lock.json` SHA-256, output filename/hash/size, Authenticode status, Windows runner/OS details, Node/npm, CMake, Visual Studio installation and Windows SDK details available on the runner, build target, smoke/validator exit codes, and reported WebGPU/physical-GPU states. `M18_ARTIFACT_HASHES.txt` contains build-time hashes and sizes for the EXE, convenience ZIP, and JSON manifest. These files are in the Actions artifact; their contents were not read locally because the artifact bytes could not be retrieved. The recommended run uses Node `v22.22.3` and npm `10.9.8`. The workflow uses mutable `windows-latest`; this does not establish bit-for-bit reproducibility.

### Earlier successful M18 implementation build

The first implementation push run [38729756733](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38729756733) used source commit `6c6d05113f6dcd2e8ba3cabb709377f05c888630`, Windows job `116404337527`, and also passed the packaged smoke, Level A validator, M18 ZIP/manifest creation, and artifact upload. Its artifact ID `11969134344` has outer digest `sha256:8638ac90a48f0317d57e9fe13af83c42b5c307bb60965c32752cd7e377ef3752`; its EXE was 109,797,006 bytes with build-time SHA-256 `ba0280c89296c2c9ac8f75274f04554686c2759fe39e4418b06dbeddf2cc00af`; its convenience ZIP was 109,729,146 bytes with SHA-256 `044ae6f6fd17b386544e3d64718634143875b264c88d1172c67c03312e040cfc`. These are separate build outputs, not substitutes for the recommended run's hashes.

### Separate evidence artifacts for the recommended run

- `TriCoreBrowser-Packaged-Smoke-Diagnostics` — ID `11970461149`, 726,693 bytes, GitHub-reported digest `sha256:456c8c34f6aec26f454d48af7daddc08a08ddda5f4354806241b05e1296d028d`, expires `2026-11-14T12:02:21Z`. Its reports and PNGs were not independently inspected.
- The earlier implementation run also uploaded `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` before smoke validation. Do **not** use that pre-smoke candidate instead of either M18 post-validation artifact.
- Separate native WARP run [38729756717](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38729756717) succeeded on the implementation commit. Its `TriCore-FSR1-D3D12-WARP-POC` artifact (ID `11969433614`) is separate software-only evidence, not a physical-GPU or packaged-WebGPU pass.

## Build, test, and acceptance evidence

Recommended push run `38731179031` is for exact source commit `003ec096b275e0f726dec1c3541b85e2d89faed3`, event `push`, on `arena/18bfbe1a-tri-core-browser`. Windows job `116409060024` and the Linux checks completed successfully. The Windows pipeline ran locked install, `npm test`, the configured high/critical audit threshold, dependency-audit recording, `npm run package:win`, executable validation, packaged smoke, Level A evidence validation, M18 manifest/ZIP creation, and artifact upload. The physical-GPU job was skipped; diagnostics uploaded separately.

| Check | Result | Scope / limitation |
|---|---|---|
| Local `npm ci --ignore-scripts` | **PASS**, 298 packages | Linux source-check install; install scripts disabled, so not a Windows Electron package build. |
| Local `npm test` | **PASS**, 102/102 | Automated source/workflow tests; no Windows GUI exercised locally. |
| Local `npm run build` | **PASS**, Vite 8.3.4 | Renderer build only; not the portable app. |
| Local `npm audit --audit-level=high` | **PASS** | High/critical threshold only; not a clean full audit. |
| Local full `npm audit --json` | **FAIL**, exit 1 | Eight moderate findings, zero high, zero critical. No `npm audit fix` or dependency change was made. |
| Hosted Windows x64 package build | **PASS** | Two successful hosted runs, on the exact commits listed above. |
| Packaged application startup/smoke | **PASS — CI-reported** | The built EXE was started with `--smoke-test`; each workflow required successful process exit and recorded exit code 0. This is hosted CI evidence, not a manual desktop run of downloaded bytes. |
| Level A packaged evidence validator | **PASS — CI-reported** | Exit code 0. Optional policy may safely skip unsupported GPU-dependent checks; this is not a WebGPU/FSR1 or physical-GPU pass. |
| Independent WebGPU known-answer compute | **BLOCKED for independent review** | Exact per-run report unavailable. Do not infer PASS or SKIPPED from the job result. |
| Bundled-scene WebGPU FSR1 EASU/RCAS | **BLOCKED for independent review** | Exact adapter, dispatch, dimensions, and visible-output report unavailable. It is not ordinary webpage upscaling. |
| Packaged `capturePage()` → D3D12/WARP diagnostic | **BLOCKED for independent artifact review** | Packaged Level A validation passed, but the per-run summary/PNG was not recovered. This path remains distinct from WebGPU. |
| Separate native D3D12/WARP harness | **PASS — workflow only** | The isolated software harness run reports success; WARP is software and never a physical-GPU pass. |
| Physical-GPU Level B | **NOT RUN** | No opt-in dispatch or runner provisioning. The app artifact is not gated on optional physical-GPU evidence. |
| Authenticode / malware safety | **Not independently assessed** | The manifest records the runner's Authenticode status. A hash is an integrity/provenance comparison, not a safety or malware-free guarantee. |
| Reproducibility | **NOT ESTABLISHED** | Two successful runs had different commits and EXE hashes. No controlled same-commit/toolchain rebuild or independent local EXE comparison was performed. |

The full dependency audit remains unresolved: eight moderate records map to the existing `sprintf-js <=1.1.3` advisory; there are zero high and zero critical findings. No dependency or lockfile change was made in M18. Preserve the existing M12–M17 reports and statuses.

## Changes and remaining work

M18 changes are limited to `.github/workflows/build.yml`, `scripts/write-smoke-job-summary.cjs`, and two workflow/summary tests, plus the M18 report, download guide, and separate acceptance snapshot. The workflow creates M18 files only after packaged smoke and Level A validation, preserves the separate diagnostics artifact, and uploads the EXE/ZIP/manifest with 30-day retention. It does not modify runtime browser code, Electron security flags, package dependencies, release triggers, or physical-GPU requirements. Generated executables and ZIPs are not committed to Git.

**Next:** download the recommended artifact from its official run page in a browser, compare the downloaded EXE and convenience ZIP against `M18_ARTIFACT_HASHES.txt` and this report, then launch only after the hashes match and the user has reviewed the unsigned-build/security caveat. Inspect the downloaded diagnostics separately if WebGPU/FSR1 acceptance is required. Keep physical-GPU Level B and any formal release decision under the existing owner-approval boundary.
