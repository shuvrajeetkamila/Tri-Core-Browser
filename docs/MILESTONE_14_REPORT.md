# Milestone 14 — Evidence recovery and release-gate audit

- **Date:** 2026-10-14 (Asia/Kolkata)
- **Branch:** `arena/18bfbe1a-tri-core-browser`
- **Local `HEAD`:** `e27cb207d6be86a346420901a979b831cf849c00` (shallow/grafted checkout)
- **Verified remote source:** fixed branch `61cf63a689642bbe6906062c4b18977872d840aa`
- **Overall:** **BLOCKED — release readiness is not established.** Original M8/M9 source is not recovered; Images is not implemented; the candidate bytes are unavailable; current packaged WebGPU outcome is unknown; physical-GPU validation was not run. No application runtime code or dependency version was changed.

## Executive result

1. **Recovery:** all 84 blobs in the fixed remote tree match the present local files by Git blob ID and mode. That verifies the available M11-era source snapshot, not the missing M8/M9 Images implementation. No original archive, patch, bundle, image-feature source, or recoverable local Git object was found. No replacement was written.
2. **Artifacts:** GitHub still reports the current Windows candidate, diagnostics, and WARP artifacts as uploaded and unexpired. M13 recorded one failed, zero-byte download attempt per artifact. M14 added one bounded `bytes=0-0` diagnostic for the candidate; it ended in `EOF`, with no HTTP status, redirect host, response body, or archive bytes exposed. The failure layer remains **UNKNOWN**; no ZIP or executable integrity checks were possible.
3. **FSR:** the source contains two distinct, bounded diagnostics: a game-owned WebGPU EASU/RCAS scene, and an explicit `capturePage()` PNG path into a separate native D3D12 helper. Neither is a general-page upscaler. Windows x64 job `115806084996` reports success for packaged smoke and the Level A evidence validator; the configured screenshot-to-WARP assertions therefore passed at the smoke-gate level. The separate D3D12/WARP job `115806085078` also reports success for its synthetic test. Their exact image/report bytes remain unavailable. The optional WebGPU FSR result is **UNKNOWN** (the Level A policy allows either a real pass or a safe unsupported skip).
4. **Other findings:** Images remains absent; DLSS/Streamline remains explicitly unintegrated; no NVIDIA SDK or license was acquired. Local regression checks passed (100/100 tests and renderer build), but the full dependency audit reports eight moderate package findings. Its high/critical-only threshold passes; this is not a clean audit.
5. **Release state:** no workflow was dispatched, no runner was provisioned, and no tag, release, package, permission, or remote ref was changed. Do not treat any of these results as release readiness.

## 1. Baseline and preservation

The evidence baseline was recorded before investigation in `/home/user/m14-audit/2026-10-14_152450_UTC_pre-M14_file_manifest.tsv` (86 pre-existing file entries: two tracked paths and 84 untracked paths). A separate copy of the existing README diff is `/home/user/m14-audit/2026-10-14_152450_UTC_pre-M14_README.diff`.

- The pre-existing `README.md` modification was not edited. Its diff SHA-256 remains `4c1646921083630a13a4031d9f6fb6241b1f3abdaec00edc8a3c1ed9745c36ff`; its working-tree Git blob is `dd4fbc85161ccac874739350a6764630ef56c873`. It still describes a tested 2026-10-12 run, so it is older than this M14 audit; it was preserved rather than refreshed.
- The 84 pre-existing untracked files and earlier reports were preserved. `docs/MILESTONE_14_REPORT.md` is the only new project document. No application source, README, package manifest, or lockfile was changed.
- The local branch and `HEAD` were not moved; remote refs were queried through GitHub metadata and not fetched. No staging, commit, push, tag, PR operation, merge, release, or workflow dispatch occurred.
- M13 reported `/home/user/m13-audit/` and `node_modules/` as supplemental/generated state. Both were absent at the M14 baseline; neither was reconstructed. The missing M13 supplements cannot be re-inspected. M14 later created a new locked `node_modules/` tree for tests; details are in §10.

### Fixed-branch comparison

A read-only GitHub tree comparison for `61cf63a689642bbe6906062c4b18977872d840aa` produced root tree `af643c04f4405e95afcf5e23a0123dcd4f9f0eed` (`truncated=false`). **All 84 remote blobs match local contents and modes; none are missing or mismatched.** The only current local-only files relative to that remote tree are `docs/MILESTONE_12_REPORT.md` and `docs/MILESTONE_13_REPORT.md`.

The bounded M14 tree-name search found no `image`, `images`, `resize`, `upscale`, picker, or file-dialog paths. GitHub’s compare endpoint reports the fixed branch 46 commits ahead of `main` at the local baseline; the returned commit titles are browser, graphics/FSR diagnostics, CI evidence, and milestone reports, not a recovered M8/M9 Images implementation. The local clone has no M8/M9 archive/patch/bundle, no local tags or stashes, and no unreachable object. The prior bounded workspace name scan found no source backup. The separate M13 report records inspections of the two candidate recovery branches; its supplemental raw evidence directory is absent here.

**Finding:** the current fixed-branch source is traceable, but **original M8/M9 source/provenance: NOT RECOVERED**. PR #1 remains open and draft; M14 found no issue comments, reviews, or inline comments that add recovery evidence. Historical alpha release binaries are not source recovery.

## 2. Images decision and actual content coverage

**Decision: Images is absent; do not call diagnostic PNG handling an Images feature and do not implement a guessed replacement in M14.** No app-owned image picker, import/export workflow, Images panel/module, user-image resize flow, or image/file IPC was found. The image-related source hits are bounded FSR/compute screenshots and diagnostic PNGs. A new Images feature would require explicit approval as new scope; it is not restoration of M8/M9.

| Page or input | What the available code does | M14 evidence/status |
|---|---|---|
| Ordinary websites and their HTML, images, CSS, canvas, or video | Rendered by ordinary Chromium `WebContentsView`s. No app-owned frame interception or automatic FSR/DLSS path. | Standard browser rendering is present; **no page-upscaling support is established**. Website file-input behavior was not tested as an app-owned Images workflow. |
| Arbitrary WebGL/WebGPU page or third-party game | No generic texture/compositor bridge into either FSR path. | **Not implemented / not tested** for upscaling. Do not infer support from the bundled scene. |
| Bundled app-owned WebGPU game-like scene | Owns its WebGPU game target and presents its own EASU/RCAS output to its own visible canvas. | Source path present; current optional packaged result **UNKNOWN**. |
| Exact bundled WebGL2 diagnostic scene | An explicit bounded test captures the active, visible scene with Electron `capturePage()` as PNG, then invokes the separate D3D12 helper. | Windows Level A smoke-gate assertions pass with WARP/software classification; image/report bytes were not independently inspected. This is screenshot/readback diagnostic evidence, not live browser-frame processing. |
| Native synthetic regression frame | The standalone helper creates a deterministic synthetic input and runs its D3D12 path on WARP. | Current WARP job reports success for one synthetic frame; software-only. |
| Fullscreen browser view, protected/DRM media, cloud streams, other apps, or desktop compositor | No such content source is connected to either FSR path. | **Unsupported / not tested**; no support claim. |
| WebAssembly diagnostic | Compiles and runs a small arithmetic test in Chromium/V8. | Not an image resizer, AI/neural method, GPU scaler, FSR, or DLSS. |

## 3. Two separate FSR paths

### A. App-owned WebGPU EASU/RCAS scene

`app/diagnostics/fsr1-webgpu.js` identifies itself as a bounded WebGPU scene and AMD FSR 1.0.2 WGSL adaptation, derived from the pinned AMD source commit. It says it does not intercept other pages and that `capturePage()` output is evidence only ([scope and attribution](../app/diagnostics/fsr1-webgpu.js#L1-L24)). The page renders its own animated scene to an input texture at `GAME_RENDER_SCALE = 0.5`; the EASU intermediate and RCAS output use the canvas output dimensions ([scale and textures](../app/diagnostics/fsr1-webgpu.js#L100-L102), [targets](../app/diagnostics/fsr1-webgpu.js#L688-L736)). It compiles separate EASU, RCAS, and presentation pipelines ([pipeline creation](../app/diagnostics/fsr1-webgpu.js#L508-L542)), dispatches EASU then RCAS, and presents the processed texture to its visible canvas ([frame loop](../app/diagnostics/fsr1-webgpu.js#L911-L1018)).

The live processing loop uses WebGPU resources; post-run texture readback and `capturePage()` are diagnostic validation, not FSR inputs ([diagnostic readback boundary](../app/diagnostics/fsr1-webgpu.js#L1070-L1165), [reported scope/timing](../app/diagnostics/fsr1-webgpu.js#L1261-L1327)). The `performance.now()` interval ends at `queue.onSubmittedWorkDone()` and is explicitly wall time, not a GPU timestamp or FPS claim. GPU timestamp queries are optional.

**Runtime distinction:** the current Windows Level A workflow sets the GPU policy to `optional`. A successful packaged smoke can mean either a validated WebGPU FSR pass or a safe no-compatible-adapter skip. The current diagnostics ZIP was not inspected, so shader/dispatch/visible-canvas result for run `38550224302` is **UNKNOWN**. The Level B physical-GPU job was skipped. Passing source/contract tests does not change these runtime classifications.

### B. `capturePage()` PNG → native D3D12/WARP

This path is explicitly opt-in and restricted to the active, visible, exact bundled WebGL2 test-scene URL. The bridge bounds requests to 1–5 frames, 4096 pixels per side, and 2,097,152 input pixels ([guards and exact-scene check](../electron/fsr1-bridge.cjs#L6-L79)). Electron captures a PNG, writes it, and launches a separate helper with a fixed argument vector; the result and bilinear-reference PNG are reopened and validated ([capture and native result checks](../electron/main.cjs#L976-L1099)).

The helper uses Windows Imaging Component for PNG decode/encode, uploads to app-owned D3D12 textures, dispatches EASU and RCAS, waits for the D3D12 fence, reads back the output, and compares it to a CPU bilinear reference ([PNG I/O](../native/fsr1-poc/Fsr1Poc.cpp#L501-L555), [dispatch and output](../native/fsr1-poc/Fsr1Poc.cpp#L810-L849), [GPU work/readback](../native/fsr1-poc/Fsr1Poc.cpp#L915-L1041)). This includes CPU screenshot readback and a separate helper; it is not zero-copy, continuous, real-time, or general-page processing. CPU bilinear is only a reference baseline, not an AI/GPU/FSR/DLSS scaler.

The current Level A packaged smoke is configured with `TRICORE_GPU_TEST_MODE=optional`; its source runs the screenshot path through WARP and asserts three distinct captured frames and resolutions ([smoke assertions](../electron/main.cjs#L1812-L1832)). The Windows packaged-smoke and Level A evidence-validation jobs report success. This supports **PASS at that bounded packaged smoke-gate level**, not physical-GPU support. The ZIP’s exact PNGs/reports remain unavailable for independent inspection. Separately, run `38550224344` reports a successful one-frame synthetic D3D12/WARP test; its artifact is also unavailable. WARP is software rendering. The helper’s explicit `--hardware` path rejects software adapters and does not silently fall back to WARP ([adapter selection](../native/fsr1-poc/Fsr1Poc.cpp#L143-L154), [hardware/WARP separation](../native/fsr1-poc/Fsr1Poc.cpp#L309-L335)); M14 did not execute it on physical hardware.

## 4. Windows artifact retrieval and integrity

The current push run is [38550224302](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38550224302), at source `61cf63a…`. The separate WARP run is [38550224344](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38550224344).

| Artifact | ID | GitHub-reported size | GitHub-reported SHA-256¹ | Expiration metadata | M14 retrieval |
|---|---:|---:|---|---|---|
| `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` | `11886880645` | 109,724,572 bytes | `7436b6850164ce7742aece8adbd3b7b2e7b257de39f9afd67dad5df9c627dd24` | Unexpired; through 2026-11-13 UTC | One `Range: bytes=0-0` diagnostic; `gh` returned exit 1 / `EOF`; no body or status/redirect host exposed. |
| `TriCoreBrowser-Packaged-Smoke-Diagnostics` | `11886696126` | 732,049 bytes | `3a53342fc6608044f08fcb5f3d5faa54068938126ed0a0d0d006a385b8efbb79` | Unexpired; through 2026-11-13 UTC | No M14 retrieval attempt. |
| `TriCore-FSR1-D3D12-WARP-POC` | `11886655622` | 59,482 bytes | `990c1ab9801cac8781d5f05d10e4c90b1900f6262c5a68837c9c7218f5b73f90` | Unexpired; through 2026-11-13 UTC | No M14 retrieval attempt. |

¹ These are **GitHub artifact-metadata digests**, not locally recomputed ZIP or executable hashes. No local ZIP, EXE, inner-file hash, signature, ZIP CRC/path listing, malware scan, or execution result exists. M13’s report records one failed zero-byte attempt per current artifact; those raw external M13 logs are absent in M14. M14’s candidate probe did not obtain artifact bytes. No second M14 attempt was made; no auto-extracting download route was used.

GitHub metadata and the successful upload steps make expiry or missing upload an unlikely explanation. The observed transfer failure is still only `EOF`: `gh` exposed neither the HTTP response status nor the redirect `Location` host. Therefore the precise cause—redirect-storage reachability, a transfer interruption, or another post-redirect failure—is **UNKNOWN**. M14 has not proved an authentication denial, artifact corruption, or a specific network block. The older M10 candidate metadata is also still listed as unexpired, but it was not retrieved.

**Safe next step for these bytes:** manually download the official candidate and diagnostics ZIPs from the run’s GitHub Actions UI and attach the original ZIPs through an authorized workspace path. Do not extract or execute the candidate first. With the ZIPs available, verify archive integrity, paths/traversal, per-file hashes, executable signature metadata, and diagnostic contents without launching the binary. Do not share signed download URLs.

## 5. Physical-GPU validation prepared, not dispatched

**Physical-GPU validation: NOT RUN.** The current push run’s Level B job `115806086735` was skipped. The existing workflow gates Level B behind `workflow_dispatch` with `run_physical_gpu_validation=true` on `[self-hosted, windows, x64, gpu]` ([workflow gate](../.github/workflows/build.yml#L273-L282)); the default input is false. A read-only GitHub runner-list request returned `403 Resource not accessible by integration`, so runner registration/availability is **UNKNOWN**, not zero. The local environment has no `pwsh` or `cmake`, and no Electron executable payload or physical-GPU environment.

Prepared acceptance checklist for a separately authorized run:

1. Use only an already-authorized Windows x64 GPU runner; confirm the adapter is a real non-software device and its driver/API identity is captured. Do not provision, dispatch, or change permissions as part of this audit.
2. When explicitly authorized, run the existing Level B workflow with its required policy. Keep WARP/software runs separate; they cannot satisfy this gate.
3. Inspect the packaged summary and per-stage reports: require WebGPU FSR `PASS`, confirmed EASU/RCAS dispatch and visible-canvas comparison, active driver and non-software adapter evidence, `physicalGpuValidation=PASS`, and `releaseEligible=true`. Validate screenshots/reports against their dimensions and hashes before any packaging decision.
4. If a physical **native D3D12 helper** claim is required, run and review that `--hardware` path separately; the existing standalone CI WARP job does not cover it.

No workflow was dispatched and no physical hardware result is claimed.

## 6. DLSS and general browser upscaling

**DLSS: NOT IMPLEMENTED / NOT TESTED.** `src/graphics-controller.js` and the UI display a DLSS mode label/priority, but the controller marks an unimplemented integration unsupported and falls back to standard Chromium. The main-process report explicitly sets `dlss.implemented=false` and says no Streamline/DLSS renderer or webpage texture bridge is present (`electron/main.cjs`, lines 1361–1365; renderer fallback in `src/main.js`, lines 1163–1173). M14 found no Streamline/NGX runtime, NVIDIA package, binary, or corresponding source filename. A reported NVIDIA GPU would not prove DLSS support.

No proprietary NVIDIA SDK was downloaded; no licensing terms were accepted; no NVIDIA binary was bundled. DLSS Super Resolution/Frame Generation and arbitrary-page processing remain unverified and unimplemented. No browser-wide, video, DRM/protected-content, external-game, or compositor upscaling claim is made.

## 7. Dependency and security audit

The current root `package.json` has five `devDependencies` and no production dependency edges. All eight npm audit package findings have `dev=true` in the lockfile. The affected chain is:

`electron-builder@26.17.0` → `app-builder-lib@26.17.0` → optional `@electron/get@3.1.0` → optional `global-agent@3.0.0` → `roarr@2.15.4` → `sprintf-js@1.1.3`.

The audit also reports the sibling builder packages `dmg-builder` and `electron-builder-squirrel-windows`. All eight package records trace to the single moderate GHSA `GHSA-hp3w-g68c-fv3c`: `sprintf-js` denial of service through unbounded precision specifiers (CVSS 5.3, CWE-1284). This is evidence of a **build/development-tooling** dependency finding, not evidence that the affected chain is shipped as an application runtime dependency. The repository has no root production dependencies, and the explicit packaged-file list does not include the build tool’s `node_modules`. Build-host risk still requires owner disposition.

| Check | Result |
|---|---|
| `npm audit --json --package-lock-only` | **FAIL at the default full-audit threshold:** 8 moderate, 0 high, 0 critical; exit 1. |
| `npm audit --audit-level=high --json --package-lock-only` | **PASS at that configured threshold only:** same 8 moderate findings, 0 high/critical; exit 0. |
| `node scripts/dependency-audit.cjs` | **PASS at its high/critical-only threshold**, while retaining all 8 moderate findings in its output. |
| Registry/fix review | `sprintf-js@1.1.4` is not published in the queried registry; latest is `1.1.3`. Updated major versions exist for `roarr`, `global-agent`, and `@electron/get`, but the locked `app-builder-lib` requests `@electron/get ^3.0.0`, so a direct major override is not established as compatible. npm reports `electron-builder@26.5.0` as a fix candidate; this is an out-of-pin downgrade and npm marks it as a major change. `27.0.0-alpha.3` is available but prerelease. |
| Remediation | **Not applied.** Do not run `npm audit fix` blindly. The smallest audit-proposed stable candidate is a coordinated builder-family downgrade to `26.5.0`, followed by Windows package/smoke regression review. Otherwise wait for a stable compatible upstream fix or propose a separately reviewed replacement/override. No manifest/lockfile change is approved or made in M14. |

The package-lock SHA-256 was `24708fc5609edbc5eaf4d6ad7f4042dad9f25d3e961de24e44d2ce7c12f522c6` before and after the audit/install/build checks.

Static source review found the browser views retain `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`; site permissions are denied by default; navigation/new-window handling is constrained. No `appendSwitch`/`appendArgument`/`setSwitchValue` mutation or certificate-bypass marker was found in the reviewed runtime source. This is a bounded source check, **not** a security certification or executable scan.

## 8. Regression and build checks

| Check | M14 result and limit |
|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | **PASS:** 298 lockfile packages installed; lifecycle scripts disabled; lockfile unchanged. Deprecation notices were observed for `rimraf@2.6.3`, `inflight@1.0.6`, `glob@7.2.3`, and `boolean@3.2.0`; no dependency was changed. |
| `npm test` | **PASS — 100/100**, 0 failed/skipped. These are local Node source/contract/policy tests, not packaged Electron or physical-GPU execution. |
| Vite renderer build | **PASS:** Vite 8.3.4, 11 modules, output directed outside the repository. |
| `node --check` | **PASS — 32** JavaScript/CommonJS files. |
| YAML/JSON parse | **PASS:** `build.yml`, `release.yml`, `fsr1-native-poc.yml`, `package.json`, and `package-lock.json`. |
| `git diff --check` | **PASS** for the pre-existing README diff. |
| Local Windows/package/native execution | **NOT RUN:** no `pwsh`, `cmake`, or Electron executable payload is installed. `npm ci` used `--ignore-scripts`. A diagnostic invocation of the Electron package shim attempted its automatic binary download and failed with `TypeError: fetch failed`; no Electron binary was found or executed. It was not retried. |

The successful local checks do not substitute for current packaged WebGPU diagnostics, an executable hash/signature review, Windows native build evidence, or Level B physical-GPU validation.

## 9. Current GitHub/release metadata

- Current branch source is `61cf63a…`; PR #1 is open and draft against `main`. No PR comments/reviews were found in the read-only check.
- Current GitHub release-list metadata shows published prereleases `v1.0.0-alpha.1` and `v1.0.0-alpha.2` (five assets each) plus a `v1.0` draft with no assets. The M14 `GET` by draft tag returned 404; the release-list endpoint confirms the draft. No existing release assets were downloaded or inspected, and no M14 release/tag/publication action occurred.
- GitHub’s self-hosted-runner listing returned 403; physical-runner availability remains unknown.

## 10. Release-gate table

| Gate | Status | Evidence / consequence |
|---|---|---|
| Existing worktree and README preservation | **PASS** | Pre-M14 manifest, README diff hash, and file contents preserved; no source or lockfile changes. |
| Original M8/M9 source/provenance | **FAIL — NOT RECOVERED** | Bounded local/remote evidence review found no original source or Images implementation. Current fixed-branch tree match does not prove M8/M9 provenance. |
| App-owned Images import/resize/export | **FAIL — NOT IMPLEMENTED** | No feature source or user-image workflow; do not implement without explicit new-scope authorization. |
| GitHub artifact upload metadata | **PASS** | Current candidate, diagnostics, and WARP artifacts report uploaded and unexpired. |
| Candidate/diagnostic ZIP bytes and integrity | **BLOCKED** | Current downloads yielded no bytes; no archive/EXE hashes, paths, CRC, signature, or scan. |
| Windows packaged build/smoke and Level A validator | **PASS — LIMITED** | Current Windows job reports success. This does not establish general browsing features or physical-GPU readiness. |
| Exact bundled WebGL2 `capturePage()` → D3D12/WARP smoke | **PASS — BOUNDED ASSERTION** | Level A smoke is configured to run the three-frame WARP diagnostic and assertions; report/PNG bytes unavailable for independent review. Software-only. |
| Standalone synthetic D3D12/WARP run | **PASS — SOFTWARE ONLY** | Current WARP job reports build and one-frame synthetic test success; not physical hardware. |
| App-owned WebGPU FSR source path | **PASS — SOURCE ONLY** | EASU/RCAS pipelines, dispatch, and visible-canvas presentation are present in the controlled scene. |
| Current optional packaged WebGPU FSR result | **UNKNOWN** | Level A permits a real pass or safe unsupported skip; the diagnostic report was not obtained. |
| Physical-GPU/WebGPU acceptance | **NOT RUN** | Level B skipped; runner status unknown after API 403. |
| DLSS/Streamline | **FAIL — NOT IMPLEMENTED / NOT TESTED** | Mode label only; no runtime, feature binary, or license acquisition. |
| Local regression/build | **PASS** | 100/100 tests, renderer build, syntax and config parsing passed. |
| Full dependency audit | **FAIL — 8 MODERATE** | High/critical threshold passes, but full audit exits 1; requires owner disposition and a validated remediation. |
| Release readiness | **BLOCKED** | Artifact integrity, optional WebGPU status, dependency disposition, and physical acceptance remain unresolved. No release claim is justified. |

## 11. Change and evidence inventory

### Project worktree

- **New:** `docs/MILESTONE_14_REPORT.md` (this local report; not staged or published).
- **Unchanged pre-existing:** modified `README.md`, all 84 pre-existing untracked files, and prior reports. No application source or package/lockfile edits.
- **New ignored test outputs:** `node_modules/` (298 lockfile packages; about 161 MB), `dependency-audit.json` (about 8 KB), and `dependency-tree.json` (about 96 KB). They were absent at the M14 baseline and are preserved. No `dist/`, `build/`, or `release/` output was created in the repository.

### External M14 evidence and generated outputs

- Evidence log: `/home/user/m14-audit/2026-10-14_152450_UTC_M14_evidence.log`.
- Pre-M14 manifest and README diff copy: `/home/user/m14-audit/2026-10-14_152450_UTC_pre-M14_file_manifest.tsv` and `/home/user/m14-audit/2026-10-14_152450_UTC_pre-M14_README.diff`.
- Fixed-branch per-file comparison: `/home/user/m14-audit/2026-10-14_152450_UTC_remote-61cf-tree-comparison.tsv`.
- Full/high-threshold npm audit JSON: `/home/user/m14-audit/2026-10-14_152450_UTC_npm-audit.json` and `/home/user/m14-audit/2026-10-14_152450_UTC_npm-audit-high-threshold.json`.
- Install/test/build/syntax/audit-script logs: files prefixed `2026-10-14_152450_UTC_` in `/home/user/m14-audit/`; renderer output is `/home/user/m14-audit/2026-10-14_152450_UTC_renderer-build/` (11 files). The M14 npm cache contains 623 files; the full external M14 audit directory is approximately 62 MB.
- No Windows candidate, diagnostics ZIP, or WARP ZIP bytes were saved. No signed URL or credential was recorded.

## 12. Single most useful next action

**Manually download the current Windows candidate ZIP and packaged-smoke diagnostics ZIP from run `38550224302` in GitHub’s Actions UI and attach the original files to this workspace.** That is safer and more useful than another CLI retry: it enables integrity inspection and resolves the current per-run WebGPU/screenshot evidence gap. Do not extract or execute the candidate. The missing original M8/M9 source remains a separate owner-provided recovery item.
