# Milestone 17 — Windows package recovery, real-device acceptance, and graphics architecture

- **Date:** 2026-10-15 (Asia/Kolkata)
- **Branch:** `arena/18bfbe1a-tri-core-browser`
- **Code-under-test head:** `cdb0de33e42d7d889170479c376ec89b1197b342`
- **Scope:** evidence review and M17 documentation. No runtime source, test, workflow, package manifest, lockfile, release, or Images feature change.
- **Overall:** **BLOCKED — release readiness is not established.** The hosted Windows package build and bounded Level A smoke report success, and the separate D3D12/WARP job reports success. The current package/diagnostic bytes remain unavailable, so the exact packaged WebGPU compute and FSR1 scene outcomes cannot be independently reviewed. Physical-GPU Level B did not run; no physical runner inventory is visible to this integration. The full dependency audit has eight moderate findings.

## Executive result

1. **Preservation and branch alignment:** an external baseline was saved before repository edits. The original shallow checkout at `e27cb207…` appeared as 2 tracked and 91 nonignored untracked paths; all 93 nonignored paths matched the remote `cdb0de33…` tree byte-for-byte by Git blob and mode. There were no local-only paths. The existing branch and index were aligned without checking out files or deleting/replacing content. At the code-under-test snapshot the branch, index, and worktree were clean.
2. **Windows package and Level A:** push run [38615197486](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38615197486) for exactly `cdb0de33…` completed successfully. The hosted `windows-latest` job reports success for `npm ci`, tests, the high/critical audit threshold, CMake/Electron portable packaging, executable size validation, packaged smoke, and the Level A validator. Distribution assembly and upload were skipped; the physical-GPU job was skipped. This is CI-reported packaged-runtime evidence, not a local Windows execution or an independent inspection of the executable bytes.
3. **Artifact recovery:** candidate artifact `11920245773` and packaged-smoke diagnostic artifact `11919901023` from run `38615197486` were already subjected in M16 to the two authorized, materially distinct recovery routes each; both routes ended in `EOF`. M17 did not repeat those exhausted attempts. GitHub still reports metadata and digests, but there is no local archive to hash, inspect, or execute. A newly inspected D3D12/WARP artifact (`11920425376`) also returned `EOF` on both attempted routes; no bytes were extracted. The precise cause is unknown and is not inferred as expiry or corruption.
4. **D3D12/WARP:** native workflow run [38615197489](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38615197489) reports successful native configure/build and the isolated D3D12 WARP smoke. The workflow requires a `PASS` report, `softwareAdapter=true`, one synthetic frame, image files, and physical-GPU status kept `NOT RUN`. The archive could not be recovered, so the report/images are not independently inspected. WARP is software, not physical-GPU evidence and not the packaged WebGPU scene.
5. **Real device:** Level B remains **BLOCKED**. Its job is restricted to an opt-in `workflow_dispatch` on `[self-hosted, windows, x64, gpu]`; the push and PR runs skipped it. A read-only runner-list query returned HTTP 403 (`Resource not accessible by integration`), which does not establish that no runner exists. No workflow was dispatched, runner provisioned, permission changed, or purchase made.
6. **Local validation:** in an external archive of the exact tested commit, `npm ci --ignore-scripts` and `npm test` passed; `npm test` was **100/100**. The Vite renderer build passed and produced 11 files (279,665 bytes). This Linux environment has no PowerShell, CMake, Wine, Electron runtime, browser, display, or `/dev/dri`; no local Windows executable, packaged GUI, WebGPU adapter, or D3D12 run was possible.
7. **Security/dependencies:** the lockfile is unchanged. Full `npm audit --json --package-lock-only` exits 1 with **8 moderate, 0 high, 0 critical**; `npm audit --audit-level=high --json --package-lock-only` exits 0 on the same findings. The eight records map to one `sprintf-js <=1.1.3` advisory through build tooling. Registry metadata showed no later `sprintf-js` version. No blind `npm audit fix`, override, downgrade, or dependency change was made.
8. **Scope decisions:** WebGPU FSR1 is app/game-owned and bounded to the bundled scene; it does not process ordinary pages. DLSS Super Resolution and Frame Generation are **not implemented**. The M15 Images decision remains: default defer; original M8/M9 source is not recovered, and no guessed Images feature was added. The release workflow push filter still names an older Arena branch; no release/tag or manual dispatch was created. PR #1 remains **OPEN/DRAFT**.

## 1. The 18 requested questions

### 1. Was a baseline saved before changing project files?
**PASS.** The pre-edit inventory, Git status, initial branch state, and remote tree comparison are outside Git under `/home/user/m17-audit/2026-10-15_093129_UTC_M17/`. The baseline manifest has 93 path entries and SHA-256 `1a1e21728d2c5af2144166213a8094b046d1def1fe31edc41a5026d9d572d6ad`; the remote-tree comparison has SHA-256 `b1a11812a7f1e4900ed3c0c0ae558808775328b4409f341f8ed660f13a035590`.

### 2. Was the local checkout reconciled without overwriting user content?
**PASS.** Initial state was shallow at `e27cb207…`, with no remote-tracking ref, 2 tracked paths, and 91 nonignored paths reported untracked. Each of the 93 paths matched the GitHub recursive tree at `cdb0de33…` by blob and mode. The existing branch/index were advanced to the verified remote tree without `git checkout`, `git reset`, or `git clean`; the worktree contents were not replaced. The code-under-test snapshot was clean.

### 3. What is the latest remote, PR, and Actions state?
The fixed branch tip was `cdb0de33…`, matching local HEAD at the prepublication snapshot. PR #1 is **OPEN/DRAFT**, base `main`, head `arena/18bfbe1a-tri-core-browser` at `cdb0de33…`. Push runs `38615197486` (Windows browser) and `38615197489` (native WARP) completed successfully. Matching PR runs `38615204524` and `38615204576` completed successfully; the PR Windows package and Level B jobs were skipped, while the WARP job ran. No merge or close action was taken.

### 4. Were the current Windows candidate and diagnostics recovered?
**BLOCKED.** Candidate `11920245773` and diagnostics `11919901023` each exhausted two distinct routes in M16: the authenticated Actions artifact ZIP API and `gh run download`. Both routes returned `EOF` with no bytes/files. M17 checked current metadata but did not repeat either exhausted route.

### 5. Were artifact provenance and integrity independently verified?
**BLOCKED.** GitHub's run/commit and artifact metadata are available, but no local ZIP bytes were recovered for the candidate or diagnostics. The reported size/digest is not a locally computed digest. No archive listing/integrity check, EXE hash/signature inspection, malware scan, diagnostics JSON/PNG review, extraction, or candidate execution is claimed.

### 6. Was a clean Windows build available through authorized infrastructure?
**PASS — hosted build workflow scope.** The latest push run for the exact code-under-test commit used a fresh `windows-latest` runner, `npm ci`, CMake/native build, Electron Builder portable packaging, and the packaged smoke flow. Every required Windows package/smoke step reported success. M17 did not manually dispatch another workflow; the existing successful run is the clean hosted build evidence used here. It does not establish bit-for-bit reproducibility.

### 7. Did the actual packaged browser start and pass its bounded smoke?
**PASS — CI-reported Level A scope.** Run `38615197486`, Windows job `116028379007`, reports success for the packaged smoke process and Level A validator. The raw EXE is explicitly named an **unverified smoke candidate** and was uploaded before smoke validation. Because its bytes are unavailable, this milestone did not independently launch that downloaded candidate or inspect the per-run smoke log.

### 8. Did the independent packaged WebGPU known-answer compute probe pass?
**BLOCKED.** The Level A validator permits an optional GPU-dependent probe to be either a validated `PASS` or a safe `SKIPPED` when no compatible adapter is available. The packaged diagnostics are inaccessible, so neither state is asserted for this run. This probe is distinct from the bundled FSR1 scene.

### 9. Did the packaged bundled-scene FSR1 EASU/RCAS path pass?
**BLOCKED for independent M17 runtime acceptance.** Source review confirms a lower-resolution, app-owned WebGPU color target, separate EASU and RCAS compute passes, and visible-canvas presentation without CPU readback in the processing loop. The hosted Level A job passed its optional validator, but the actual `fsr1-webgpu-summary.json` and visible-output PNG could not be reviewed. Do not infer an FSR1 `PASS` from the green job alone.

### 10. What does the D3D12/WARP result establish?
**PASS — isolated software-harness job; artifact review BLOCKED.** The native workflow job reports successful configure/build and WARP processing of one synthetic frame through the AMD FSR1 EASU+RCAS harness. Its own gate asserts software identity and keeps physical-GPU status `NOT RUN`. This is not the WebGPU game scene, an ordinary webpage, or a physical GPU. The report and PNG archive could not be recovered for independent inspection.

### 11. Was the packaged `capturePage()` → D3D12 WARP diagnostic independently verified?
**BLOCKED for independent artifact review.** The Windows Level A step/validator passed, and source/workflow code distinguishes its screenshot/readback path from WebGPU. The per-run `browser-frame-smoke-summary.json` and PNG were inside the unavailable diagnostics archive. No runtime-specific dimensions, frames, or image content are claimed here.

### 12. Was a physical GPU runner available and used?
**BLOCKED / NOT RUN.** The workflow declares an opt-in self-hosted Windows x64 GPU job; normal push and PR runs skipped it. The authenticated runner-list API returned 403, so availability is unknown. No physical adapter model, driver version, hardware output, or physical-GPU pass is claimed. No manual dispatch, provisioning, permission/secret change, or paid action occurred.

### 13. Is the Windows build bit-for-bit reproducible?
**BLOCKED — not established.** One successful hosted build is evidence of a repeatable procedure, not binary reproducibility. `windows-latest` is mutable; npm, Visual Studio/MSVC, CMake, and Windows SDK versions were not captured in a recoverable run report; no local EXE bytes or second independent EXE hash are available.

### 14. Can the current app upscale arbitrary ordinary web pages?
**NOT IMPLEMENTED.** The app uses Electron `WebContentsView` instances for normal Chromium tabs. Those views do not expose the arbitrary page's private render targets, depth/motion resources, or a supported compositor/swap-chain synchronization hook. The bundled WebGPU scene owns its own target; it cannot substantiate all-page processing. No injection, memory inspection, overlay, or security bypass is used.

### 15. What architecture options are feasible, and what is recommended?
The current game-owned WebGPU path is the bounded option to retain. Electron's experimental offscreen shared-texture API is a proof-of-concept candidate, not a shipped route: it creates a separate offscreen contents path, and this product's Windows capture/import/lifetime/input/presentation route has not been validated. Chromium/Viz post-processing is the only plausible transparent all-page architecture, but would require a maintained Chromium/Electron integration with substantial security, performance, platform, and update costs. A dedicated user-selected image/local-video viewer is the most practical narrower product experiment; it is not general-page processing and Images remains subject to the M15 owner decision. Windows Graphics Capture would be a consent-based companion output, not replacement of the source app's window. **Recommendation:** retain the bounded scene, keep ordinary pages standard Chromium, and do not claim all-page enhancement. If transparent all-page support is a hard requirement, define and time-box a separate Windows interop proof before any product implementation.

### 16. Is NVIDIA DLSS implemented or validated?
**NOT IMPLEMENTED.** No Streamline/DLSS Super Resolution or Frame Generation runtime, native renderer integration, app identifier, production signed binary, or genuine DLSS output is present. Vendor detection/labels are not an implementation. No NVIDIA SDK/runtime was downloaded or bundled; no DLSS claim is made.

### 17. What is the M15 Images decision and dependency/security status?
**Images:** M15's `docs/IMAGES_FEATURE_DECISION_M15.md` was read. Default remains defer; original M8/M9 source is not recovered; no Images import/resize/export UI or code was added. An owner must supply the original source for comparison or explicitly approve a new, clearly scoped feature.

**Dependencies/security:** `npm ci --ignore-scripts --no-audit --no-fund` passed in an external copy; `npm test` passed 100/100; the renderer build passed; `npm ls --all --json` and `node scripts/dependency-audit.cjs` completed. Full audit exits 1 with eight moderate package records from one `sprintf-js <=1.1.3` advisory; high/critical threshold exits 0. The app-source review found sandboxed/context-isolated web contents, Node integration disabled, web security enabled, denied web permissions, HTTP(S)-bounded navigation, narrow preload IPC, and sanitized download paths. This is a source review, not a security certification or malware scan. No candidate was available to scan.

### 18. Is release readiness established, and what is next?
**BLOCKED.** The exact packaged WebGPU reports and candidate bytes are unavailable; physical-GPU Level B did not run; the full audit has an unresolved moderate advisory; reproducibility is unproven; and release-trigger alignment needs owner review. `.github/workflows/release.yml` still lists the older push branch `arena/66abfdc9-tri-core-browser`, not this fixed branch. No release or tag was created and no workflow was dispatched.

**Recommended M18 — Windows Acceptance Closure:** use an authorized byte-recovery path for a current Windows candidate and diagnostics, verify remote artifact size/digest before inspection, and review the optional WebGPU result and visible pixels; run the existing packaged acceptance on an already-authorized physical-GPU runner only when the owner authorizes that gate; capture adapter/driver and toolchain evidence; and obtain an owner-approved dependency risk disposition or compatible tested fix. Keep Images explicitly deferred unless source is recovered or new scope is approved. If the product requirement is specifically transparent all-page processing, schedule a separate M19 architecture proof only after M18, without claiming it until the entire Windows path passes.

## 2. Baseline and exact branch comparison

The M17 pre-edit evidence is external to Git:

- `worktree-baseline.tsv` — 93 local nonignored paths, SHA-256 `1a1e21728d2c5af2144166213a8094b046d1def1fe31edc41a5026d9d572d6ad`.
- `git-status.txt` — original shallow/misaligned status, SHA-256 `8b16cd9586b2b13e70496bef7785774d1897356a176f4739d167c541a61062eb`.
- `remote-cdb0-tree-comparison.tsv` — 93/93 GitHub tree blobs and modes matched, SHA-256 `b1a11812a7f1e4900ed3c0c0ae558808775328b4409f341f8ed660f13a035590`.
- `prechange-preservation-hashes.tsv` — 16 protected files (README, M12–M16 reports, M16 guide/acceptance, M15 decision/proposal, workflows and lockfiles), SHA-256 `2df6cfbb237c82815a3961a29a84d6f2a30354bffea845cb9d3f80251a2eca59`.

All are under `/home/user/m17-audit/2026-10-15_093129_UTC_M17/`. M12–M16 documents, README, workflows, `package.json`, and `package-lock.json` are preserved; only the three new M17 deliverables are in scope for publication.

## 3. Actions runs and artifact metadata

### Hosted Windows package run

Push run `38615197486` (head `cdb0de33…`) completed `success`. Windows job `116028379007` on `windows-latest` reported success for locked install, automated tests, high/critical audit threshold, dependency-audit recording, Windows x64 portable build, EXE size validation, upload of the unverified candidate, packaged smoke, Level A evidence validation, diagnostics upload, and summary. The optional WebGPU result was not recoverable from the archived reports. Physical-GPU Level B and physical-GPU-only distribution assembly/upload were skipped.

| Artifact | ID | Remote size | GitHub-reported SHA-256 | Expires (UTC) | M17 local result |
|---|---:|---:|---|---|---|
| `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` | `11920245773` | 109,717,102 bytes | `cb714b55971079ccd56a6b55aa67b555da5d0275c3f0370ec1b8af0746262f8c` | 2026-11-13 18:29:54 | Prior M16 routes exhausted; no local bytes. |
| `TriCoreBrowser-Linux-checks` | `11919945533` | 10,274 bytes | `f2dc612a6addc1d3bc98db5929a3748c3e98a296b6da9753348b42d80064ff00` | 2026-11-13 18:27:01 | Not needed for local source checks; no recovery attempted. |
| `TriCoreBrowser-Packaged-Smoke-Diagnostics` | `11919901023` | 737,251 bytes | `251f7d73c56326e8e4a415514ceaa8bfaef935848b662d16d90ff4fbef754eba` | 2026-11-13 18:30:19 | Prior M16 routes exhausted; contents unavailable. |

Remote digest/size fields are metadata only; they are not local verification. The exact archive recovery attempts for the candidate/diagnostics are documented in `docs/MILESTONE_16_REPORT.md`; M17 did not retry exhausted IDs/routes.

### Separate native WARP run

Run `38615197489`, job `116028378657`, completed successfully on `windows-latest`. The workflow's D3D12 WARP step passed its own checks for status, software-adapter identity, exactly one synthetic frame, and output images, while requiring the physical-GPU gate to remain `NOT RUN`.

| Artifact | ID | Remote size | GitHub-reported SHA-256 | Expires (UTC) | M17 local result |
|---|---:|---:|---|---|---|
| `TriCore-FSR1-D3D12-WARP-POC` | `11920425376` | 59,487 bytes | `d599dea6528bc55d3d8f3816de32e57103cfdab5ba62a5b4c6bce72c213e2dda` | 2026-11-13 18:27:27 | Two distinct routes returned EOF; zero bytes/files; not extracted. |

The two attempts were `gh api repos/shuvrajeetkamila/Tri-Core-Browser/actions/artifacts/11920425376/zip` (exit 1, zero bytes) and `gh run download 38615197489 --name TriCore-FSR1-D3D12-WARP-POC` (exit 1, zero files). The sanitized records are under the external M17 evidence directory. **One CLI error emitted a temporary signed redirect URL; the saved log was immediately redacted and the URL is not reproduced here or retained for reuse.** No local artifact digest or output inspection is available.

## 4. Test results and build limits

All local checks were performed against an external `git archive` copy of `cdb0de33…`; no `node_modules`, build output, or dependency-audit output was created in the repository.

| Exact check | Result | Evidence |
|---|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | **PASS**, exit 0; 298 locked packages. Install scripts were intentionally disabled, so this did not install/run the Electron Windows payload. | `/home/user/m17-audit/2026-10-15_093129_UTC_M17/logs/npm-ci-ignore-scripts.log`, SHA-256 `5af3582ebde5b289478c9a7dab68697fd4ebd7de7e7ee804557308ce1a9dd637`. |
| `npm test` | **PASS**, exit 0; 100 passed, 0 failed, 0 skipped. | `/home/user/m17-audit/2026-10-15_093129_UTC_M17/logs/npm-test-clean-sandbox.log`, SHA-256 `dd525b17898285e9568c7ac876d6a4d3023107e9328b3b3e745f98cf4802bd83`. The earlier prechange log also records 100/100. |
| `npm run build -- --outDir /home/user/m17-audit/2026-10-15_093129_UTC_M17/renderer-build-cdb0` | **PASS**, exit 0; Vite 8.3.4, 11 modules, 11 files, 279,665 bytes. | `logs/renderer-build.log`, SHA-256 `99b62732ae6d5023bae68ee564d8b6240150dcd3fbef3de3ed769519ea5271d9`; output is outside Git. |
| `npm ls --all --json` | **PASS**, exit 0; no dependency tree problems. | `logs/npm-ls.json`, SHA-256 `8c595de8e67de42ebfb0b4a2c0bd99aba6831fdc430e92becfae29675e12d8d4`. |
| `node scripts/dependency-audit.cjs` | **PASS**, exit 0; records 0 informational, 0 low, 8 moderate, 0 high, 0 critical. | `logs/dependency-audit.log`, SHA-256 `530ee878fdbf51bb8c987f2d643f949890fdbbfc6458a24357ef0db1cc760f46`. |
| `npm audit --json --package-lock-only` | **FAIL**, exit 1; 8 moderate, 0 high, 0 critical. | `logs/audit-full.json`, SHA-256 `52842e9e8e5d77cb5f43624ed95bfda36ba00b0fd349ccfa228ad5867989666d`. |
| `npm audit --audit-level=high --json --package-lock-only` | **PASS**, exit 0 on the same eight moderate findings; this is not a clean full audit. | `logs/audit-high.json`, same JSON SHA-256 `52842e9e8e5d77cb5f43624ed95bfda36ba00b0fd349ccfa228ad5867989666d`. |
| Local `npm run package:win` / packaged GUI / D3D12 execution | **BLOCKED**; Linux host has no PowerShell, CMake, Wine, Electron runtime payload, browser, display, GPU device, or `/dev/dri`. | Environment check recorded in the M17 tool transcript; no package was attempted locally. Hosted Windows result is reported separately above. |

The single advisory is GHSA-hp3w-g68c-fv3c, `sprintf-js` denial of service through unbounded precision specifiers (CVSS 5.3, CWE-1284), range `<=1.1.3`. The lock path includes `electron-builder@26.17.0 → app-builder-lib@26.17.0 → @electron/get@3.1.0 → global-agent@3.0.0 → roarr@2.15.4 → sprintf-js@1.1.3`. npm reports eight affected package records because of the dependency graph; they map to this advisory. Registry metadata returned no `sprintf-js` version later than `1.1.3`. The suggested builder fix hint points to `electron-builder@26.5.0` and is marked semver-major relative to the current pin; no compatibility or remediation claim is made. No dependency or lockfile change was justified in M17.

## 5. Capability, status, evidence, and action table

| Capability / gate | Status | Evidence and limit | Action required |
|---|---|---|---|
| Preservation / remote tree | **PASS** | 93/93 baseline paths match `cdb0de33…`; no overwrite/delete. | Keep the external baseline; stage only M17 docs. |
| Node source/unit suite | **PASS** | `npm test`: 100/100. | Retain as source-only evidence. |
| Vite renderer build | **PASS** | External build, 11 files / 279,665 bytes. | Does not substitute for a Windows app. |
| Windows portable package build | **PASS** | Hosted run `38615197486` package step success; exact EXE bytes unavailable. | Recover/verify artifact before inspection or execution. |
| Packaged browser Level A smoke | **PASS** | CI step and validator success; report bytes unavailable. | Review exact per-run smoke diagnostics. |
| Independent WebGPU known-answer compute | **BLOCKED** | Optional smoke may have passed or safely skipped; artifact unavailable. | Inspect `webgpu-compute-smoke-summary.json`. |
| Bundled-scene WebGPU FSR1 EASU/RCAS | **BLOCKED** | Source implements a bounded path; exact packaged adapter/dispatch/visible-pixel report unavailable. | Inspect `fsr1-webgpu-summary.json` and saved visible output. |
| Packaged `capturePage()` → D3D12 WARP diagnostic | **BLOCKED** | Level A gate passed, but per-run summary/PNGs unavailable. | Inspect `browser-frame-smoke-summary.json` and captures. |
| Separate native D3D12 WARP synthetic harness | **PASS** | WARP workflow step passed its one-frame checks; artifact contents unavailable. | Review report/image if an authorized retrieval route becomes available. |
| Physical-GPU Level B | **BLOCKED** | Job skipped; runner inventory request denied; not dispatched. | Use only an already authorized, configured physical-GPU runner under owner approval. |
| Ordinary webpage upscaling | **NOT IMPLEMENTED** | No public arbitrary-tab render target/compositor hook; ordinary tabs remain Chromium. | Keep claims bounded; time-box an architecture proof only if required. |
| DLSS SR / Frame Generation | **NOT IMPLEMENTED** | No Streamline/native renderer/runtime integration. | No DLSS label or release claim. |
| Images utility | **NOT IMPLEMENTED** | M15 default defer; no original M8/M9 source or new scope approval. | Preserve defer or get an explicit owner decision before implementation. |
| Full dependency audit | **FAIL** | 8 moderate / 0 high / 0 critical; full audit exits 1. | Owner-approved tested remediation or documented risk disposition. |
| Release trigger alignment | **BLOCKED** | Push filter lists `arena/66abfdc9-tri-core-browser`, not this branch. | Owner review; no workflow change in M17. |
| Release eligibility | **BLOCKED** | Exact WebGPU evidence, artifact integrity, Level B, and moderate-risk disposition remain open. | Close the prerequisites before any release action. |

## 6. Security, release triggers, and changes

Source review repeated the main Electron safety boundaries: sandboxed `BrowserWindow` and `WebContentsView`; `contextIsolation: true`, `nodeIntegration: false`, and `webSecurity: true`; web permission requests denied; navigation constrained to HTTP(S) for website tabs; narrow `contextBridge` IPC with main-frame sender validation; and download filenames/path resolution sanitized. The review supports only a source-level description, not a penetration test, security certification, antivirus scan, or malware-free statement.

Workflow review:

- `.github/workflows/build.yml` runs on pushes to `main` and `arena/**`; the `windows-latest` package/Level A job is not the physical-GPU gate. The Level B job requires a workflow dispatch input and the self-hosted Windows/GPU labels.
- `.github/workflows/fsr1-native-poc.yml` runs the D3D12 helper on `windows-latest` with explicit `--warp`; it is software-only.
- `.github/workflows/release.yml` push trigger lists only `arena/66abfdc9-tri-core-browser`; a separate workflow-dispatch route exists, but it was not used. The release job also requires physical-GPU evidence and a publish opt-in.
- PR #1 remains open/draft. No tag/release, PR merge/close, workflow dispatch, permission/secret change, runner provisioning, or paid purchase occurred.

The only intended repository additions are:

- `docs/MILESTONE_17_REPORT.md`
- `docs/WINDOWS_TEST_GUIDE_M17.md`
- `docs/WINDOWS_ACCEPTANCE_M17.json`

M12–M16 reports, the M15 decision note, README, source/tests, workflows, `package.json`, and `package-lock.json` are not to be overwritten. No binary, cache, temporary download, or artifact is approved for Git.

## 7. Release gate and next milestone

**Release eligibility remains BLOCKED.** Exact candidate/diagnostic bytes and packaged WebGPU reports must be available and independently checked; the required physical-GPU run must record a named real adapter and active driver (never WARP); the eight-moderate full-audit result requires an owner-approved disposition or compatible tested remediation; and the release-trigger mismatch needs owner review. One successful Windows build is not reproducibility and no security/malware-free claim is available. Images remains out of scope by default, not an invented feature.

**Recommended next milestone: M18 — Windows Acceptance Closure.** Keep scope evidence-first: recover current diagnostics/candidate via an authorized path and verify the artifact digest before inspection; review optional WebGPU `PASS` versus `SKIPPED`, EASU/RCAS dispatch counts, dimensions, and visible output; run the existing required policy only on an already authorized physical-GPU Windows runner after owner approval; record OS/toolchain/adapter/driver and independent executable hash; and resolve the moderate dependency risk with an owner-reviewed, tested decision. Do not create a release until these gates close. If transparent all-page processing is an explicit product requirement, defer it to a separate, time-boxed Windows interop proof with security, lifetime, input forwarding, visible-output, resize/device-loss, performance, and upgrade gates.
