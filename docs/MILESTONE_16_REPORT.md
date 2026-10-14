# Milestone 16 — Windows artifact recovery, packaging, and acceptance review

- **Date:** 2026-10-14 (Asia/Kolkata)
- **Branch:** `arena/18bfbe1a-tri-core-browser`
- **Code-under-test head:** `e09408d582a5328727f32bac53736626473b0d5e`
- **Scope:** evidence review and documentation only; no runtime, workflow, package manifest, lockfile, or product-feature implementation change.
- **Overall:** **BLOCKED — M16 does not establish release readiness.** A hosted Windows x64 package and Level A smoke passed, but candidate/diagnostic bytes and job logs could not be recovered; the exact packaged WebGPU result is unknown; physical-GPU Level B did not run; the full npm audit remains non-clean; original M8/M9 source and the Images decision remain unresolved.

## Executive result

1. **Preservation and branch safety:** the pre-edit inventory contains 90 files. All 90 still matched the fetched feature-branch tree byte-for-byte at Git-blob level and by executable mode; no path was missing, mismatched, or local-only. The old local head `e27cb207…` was a verified ancestor of remote head `e09408d…` (0 local-only / 48 remote-only commits). The shallow boundary was safely removed by fetch; the local branch/index were advanced without checking out or overwriting working files. No reset, clean, force-push, merge, or main-branch update occurred.
2. **Current Windows CI:** push run [38599630672](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38599630672) on `e09408d…` completed successfully. The Windows job built and size-validated the portable executable, passed the packaged-app smoke process and Level A evidence validator, and uploaded the explicitly unverified executable candidate and packaged-smoke diagnostics. Linux tests/build/audit-threshold checks also passed. Distribution assembly/upload and Level B were skipped; they are not implied passes.
3. **Fresh artifact recovery:** current-run metadata is available, but the candidate and diagnostics bytes are not. For each artifact, one bounded authenticated GitHub Actions ZIP API attempt and one materially distinct `gh run download` attempt ended in `EOF`, with zero bytes/files. A bounded Windows-job-log retrieval also ended in `EOF`. No signed URL was retained or displayed, no archive was extracted, and the Windows executable was not run. The exact EOF cause is **unknown**.
4. **Windows packaging/reproducibility:** the locked dependency install, renderer build, and packaged Windows build all have successful evidence at their respective scopes. The current hosted Windows runner is `windows-latest`; npm is not explicitly pinned by the workflow, and the Visual Studio/MSVC, CMake, and Windows SDK versions were not captured in recoverable evidence. Artifact bytes could not be independently hashed and no second clean Windows build was compared. **Repeatable build procedure exists; bit-for-bit reproducibility is not established.**
5. **Local tests and audit:** Node source tests passed 100/100; locked install with lifecycle scripts disabled, renderer build, dependency-tree listing, 31 JavaScript syntax checks, and YAML/JSON parsing passed. Full `npm audit` exited 1 with eight moderate findings and zero high/critical. The high-only threshold exited 0 on the same findings; that threshold pass is not a clean audit.
6. **Graphics:** the Level A packaged smoke/validator passed its bounded gate. The validator permits the aggregate WebGPU state to be either a verified optional `PASS` or a safe no-adapter `SKIPPED`; inaccessible diagnostics/logs mean the exact state and compute/FSR stage evidence remain **UNKNOWN**. The separate packaged `capturePage()` PNG → D3D12 WARP diagnostic passed its validator scope, and the native D3D12 WARP harness passed on run `38599630609`; both are software-only. Physical-GPU Level B was **NOT RUN**.
7. **Images:** original M8/M9 source remains unrecovered, and Images remains unimplemented. The M15 decision note's default is to defer until the owner supplies source for comparison or explicitly approves new product scope. M16 did not invent or implement Images.
8. **Release:** no release/tag was created or altered; PR #1 remains open/draft. `.github/workflows/release.yml` only lists `arena/66abfdc9-tri-core-browser` for push, not this fixed branch; it also offers `workflow_dispatch`, which M16 did not use. The workflow was not changed. **Keep release readiness blocked.** No DLSS, physical-GPU, arbitrary-webpage upscaling, malware-free, or release-ready claim is made.

## 1. Baseline, remote comparison, and safe branch alignment

Before editing any repository file, M16 preserved the pre-edit inventory and metadata:

- `/home/user/m16-audit/2026-10-14_180252_UTC_baseline.tsv` — 90 paths, path/status/size/SHA-256/mode only; SHA-256 `8fc77f27e6d6550e0c09b8b6cbbb11cf98915838be057df1931a548a783f6068`.
- `/home/user/m16-audit/2026-10-14_180252_UTC_baseline.log` — branch/remote/PR/Actions/release baseline; SHA-256 `c8516e9b745c1751a39d98082962aea58356525e084e106807502d1613717349`.
- `/home/user/m16-audit/2026-10-14_180252_UTC_remote-e094-tree-comparison.tsv` — remote tree comparison; SHA-256 `645bd3570bde75e577c296bd4b15b494ad32e9f1e3c4e5fb577253ebc7c432e2`.

The GitHub recursive tree at `e09408d582a5328727f32bac53736626473b0d5e` contained 90 blobs. All 90 local nonignored files matched by Git blob ID and executable mode; missing `0`, mismatched `0`, local-only `0`. An independent comparison against the pre-edit SHA-256/size/mode manifest also found all 90 entries unchanged. The modified local `README.md` was already byte-identical to the remote version; it was not rewritten.

The checkout initially had one shallow boundary at `e27cb207d6be86a346420901a979b831cf849c00`. After the exact remote tree was verified, the following fetch completed with exit 0 without changing the worktree or index:

```text
git fetch --unshallow origin +refs/heads/arena/18bfbe1a-tri-core-browser:refs/remotes/origin/arena/18bfbe1a-tri-core-browser
```

After fetch, the local head was an ancestor of `e09408d…`, merge base was `e27cb207…`, ahead/behind was `0 48`, and `git rev-parse --is-shallow-repository` returned `false`. The pre-edit files were verified again, then the existing local branch ref was advanced by compare-and-swap from `e27cb20…` to `e09408d…` and the index was aligned using `git read-tree --reset e09408d…` **without `-u`**. The index tree equalled the fetched tree (`6c5ff224e125f9791906c128ab52628040817a3e`); no working-tree path was moved, replaced, or deleted, and status was clean immediately after alignment. The fetch auto-followed two already-existing prerelease tags into local refs; no tag was created or pushed, and no release was changed.

PR #1 was still **OPEN/DRAFT**, base `main`, head `arena/18bfbe1a-tri-core-browser` at `e09408d…`. GitHub compare was 48 ahead / 0 behind. The M16 documentation commit identity and final remote-head check are kept in the external post-publication evidence log rather than self-referenced here.

## 2. Windows Actions results and artifact metadata

### Hosted Level A run

Push run **38599630672** (head `e09408d…`) completed `success`. The Windows job’s step API reported success for locked install, automated tests, high/critical audit threshold, Windows x64 portable executable build, executable size validation, unverified-candidate upload, packaged smoke process, Level A evidence validation, diagnostics upload, and the summary writer. The portable distribution assembly and upload were **skipped**. The Level B physical-GPU job was **skipped** for this push event. The separate Linux renderer/WASM/dependency job completed `success`.

This is real hosted Windows package/runtime evidence, but it is not an independent artifact-byte verification. The Level A validator passing establishes only its defined GPU-independent checks and an allowed optional WebGPU state; it does not identify whether the bundled scene/compute result was `PASS` or safe `SKIPPED`.

The matching PR run [38599644501](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38599644501) completed `success` for the Linux job; the Windows portable job is gated off on pull requests and Level B was skipped. Native WARP PR run [38599644207](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38599644207) completed `success`.

### Current artifact metadata

GitHub Actions run **38599630672** listed these unexpired artifacts (metadata fetched 2026-10-14):

| Artifact | ID | GitHub-reported bytes | GitHub-reported SHA-256 | Expires (UTC) | Local result |
|---|---:|---:|---|---|---|
| `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` | `11910954706` | 109,720,667 | `ca0b2b8b0996eecde499a556532cc9a287b6163a75ca23ffbce7978a031e5aaf` | `2026-11-13T16:41:02Z` | No bytes recovered; not executed. |
| `TriCoreBrowser-Packaged-Smoke-Diagnostics` | `11911314745` | 734,795 | `eec0c9cc3c633356bfef417ceb0d6baeb95d25cdc3b50f4072b91ef184f2ef8a` | `2026-11-13T16:41:28Z` | No bytes recovered; contents uninspected. |
| `TriCore-FSR1-D3D12-WARP-POC` (run `38599630609`) | `11910799583` | 59,489 | `289e303857558cb2912a0b36453d50393a0afe851c55cfa06add968f47a29839` | `2026-11-13T16:37:52Z` | Metadata only; not downloaded. |

GitHub-reported size/digest is remote metadata, not a locally verified hash. For the current candidate and diagnostics, M16 used two bounded, materially distinct routes per artifact:

| Route | Candidate result | Diagnostics result |
|---|---|---|
| `gh api repos/shuvrajeetkamila/Tri-Core-Browser/actions/artifacts/<ID>/zip` redirected to a new external file | Exit **1**, zero bytes, empty-file SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; sanitized error `EOF`. | Exit **1**, zero bytes, same empty-file SHA-256; sanitized error `EOF`. |
| `gh run download 38599630672 --name <artifact-name> --dir <new external directory>` | Exit **1**, no files recovered; sanitized error `EOF`. | Exit **1**, no files recovered; sanitized error `EOF`. |

The separate bounded Windows-job-log request `gh run view 38599630672 --job 115975208599 --log` also exited **1** with sanitized `EOF` and zero captured log bytes. Redacted route records are `/home/user/m16-audit/2026-10-14_180744_UTC_M16/artifacts/candidate-artifact-11910954706-direct-api.log`, `/home/user/m16-audit/2026-10-14_180744_UTC_M16/artifacts/candidate-artifact-11910954706-gh-run-download.log`, `/home/user/m16-audit/2026-10-14_180744_UTC_M16/artifacts/diagnostics-artifact-11911314745-direct-api.log`, `/home/user/m16-audit/2026-10-14_180744_UTC_M16/artifacts/diagnostics-artifact-11911314745-gh-run-download.log`, and `/home/user/m16-audit/2026-10-14_180744_UTC_M16/logs/run-38599630672-windows-job-log-retrieval.json`. No raw/signed URL was saved or printed. Prior M15 artifact IDs were not retried. No candidate was extracted or executed; no local archive hash, inner EXE hash/signature, malware scan, or diagnostics JSON/PNG check is available. The precise EOF cause is unknown; do not infer expiry, corruption, or authorization failure.

If the current artifact contents are required, use the official run page and attach the untouched ZIP files to the workspace. Do not share the signed download URL. The exact download and integrity checklist is in [`WINDOWS_TEST_GUIDE_M16.md`](WINDOWS_TEST_GUIDE_M16.md).

## 3. Windows packaging and reproducibility assessment

### What is pinned and what is not

- `package-lock.json` is lockfile version 3, with 322 package entries, registry integrity fields, and SHA-256 `24708fc5609edbc5eaf4d6ad7f4042dad9f25d3e961de24e44d2ce7c12f522c6`.
- Direct build dependencies are exact versions: Electron `44.7.0`, electron-builder `26.17.0`, Vite `8.3.4`, and the two font packages `5.3.0`.
- The workflow/docs select Node.js `22.22.3`; local Node was `v22.22.3` and local npm was `10.9.8`.
- The workflow uses `windows-latest`, which is mutable. It does not explicitly pin/assert npm, Visual Studio/MSVC, CMake, or Windows SDK versions. Those native build inputs were not captured in a retrievable current-run report.
- The Windows package command is `npm run package:win`: Vite build, CMake x64 configure/build for `native/fsr1-poc`, then electron-builder portable x64 packaging. The Windows Actions job ran that route successfully.
- M16's Linux source install deliberately used `--ignore-scripts`; it installed 298 locked packages but did not install Electron's platform runtime payload. Local `pwsh`, CMake, and Wine were unavailable. Therefore no local Windows executable/package or packaged GUI smoke was run.
- `scripts/package-windows.ps1` deletes an existing staging directory and portable ZIP before assembling its distribution. It was not run in M16. Use a disposable checkout with fresh outputs; preserve existing user files and evidence.
- `.github/workflows/release.yml` push filter lists only `arena/66abfdc9-tri-core-browser`, not the current fixed branch `arena/18bfbe1a-tri-core-browser`. The workflow also exposes `workflow_dispatch`; M16 did not dispatch or edit it. Owner review is needed before relying on the release workflow from this branch.

The combination of an exact lockfile, `npm ci`, exact Node selection, and a successful hosted Windows build supports a repeatable build procedure. It does **not** establish byte-for-byte reproducibility: the hosted Windows image/toolchain floats, the Windows tool versions were not captured, the produced artifact bytes could not be downloaded, and no second independent Windows binary hash was compared. No workflow/toolchain pin change was made because that would require a separate, tested Windows-tooling change.

## 4. Graphics and packaged-runtime evidence

These scopes remain distinct:

| Test scope | M16 result | What it does not prove |
|---|---|---|
| Node source/unit tests | **PASS — 100/100** | No packaged Electron GUI or hardware was exercised. |
| Windows x64 packaged smoke + Level A evidence validator | **PASS at validator scope** on run `38599630672` | Does not reveal the exact optional WebGPU status or establish physical GPU/release acceptance. |
| Independent packaged WebGPU compute known-answer probe | **UNKNOWN** because the diagnostics and job log were unavailable | A compute probe is not bundled FSR1 scene processing. |
| Bundled WebGPU FSR1 EASU/RCAS scene | **UNKNOWN**; successful optional validation allows either a genuine `PASS` or safe no-adapter `SKIPPED` | No dispatch count, adapter identity, output dimensions, stage contribution, or visible-pixel result is claimed. Not arbitrary-page upscaling. |
| Packaged `capturePage()` PNG → D3D12 helper | **PASS at Level A validator scope; WARP software only** | Not live WebGPU integration, zero-copy, physical GPU, or continuous arbitrary-webpage processing. |
| Separate native D3D12 FSR1 harness | Run [38599630609](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38599630609) passed configure/build and official EASU+RCAS exercise on WARP | Software-only; not packaged WebGPU, physical GPU, or a performance claim. The artifact itself remains metadata-only. |
| Level B physical-GPU packaged validation | **NOT RUN**; job skipped | No GPU model, driver, hardware, or physical-GPU acceptance is asserted. |
| DLSS / Streamline | **NOT IMPLEMENTED / NOT TESTED** | No NVIDIA/DLSS claim. |
| Ordinary pages / general browser upscaling | **NOT IMPLEMENTED / NOT ESTABLISHED** | Remote pages remain normal Chromium views; no external games, DRM video, cloud video, or compositor interception is claimed. |

No manual workflow dispatch or runner provisioning occurred. The current WARP checks are software evidence and do not substitute for the separately gated Level B physical-GPU result.

## 5. Dependencies and security status

### Current test evidence

| Exact command/check | Exit | Result | External evidence |
|---|---:|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | 0 | 298 packages installed; lifecycle scripts deliberately disabled; `package-lock.json` SHA remained `24708fc…`. | `/home/user/m16-audit/2026-10-14_180744_UTC_M16/logs/npm-ci-ignore-scripts.log` (SHA-256 `e45e211c3ba6bdbb332d3a5dda74041efa9e094ec591bfa9cae94f8226ba0a33`). |
| `npm test` (after locked install; repeated immediately before staging) | 0 | **100 passed, 0 failed, 0 skipped.** A pre-install run also passed 100/100. | Final log `/home/user/m16-audit/2026-10-14_180744_UTC_M16/logs/npm-test-review-final.log` (SHA-256 `f9bb23d15a2261c534cf26f8837441b3703c83a3c192401e1f0e059f5d6551ec`); post-install log `/home/user/m16-audit/2026-10-14_180744_UTC_M16/logs/npm-test-postinstall.log` (SHA-256 `5798397048cb7b5e1668093af3b0b81a08996cad5392d2b8f090e624d527d2cd`); pre-install log `/home/user/m16-audit/2026-10-14_180744_UTC_M16/logs/npm-test-preinstall.log` (SHA-256 `d37a4c9ca6715c8d810e177213c0ad3b1d9638c60be372131cae073401a2d99e`). |
| `npm run build -- --outDir /home/user/m16-audit/2026-10-14_180744_UTC_M16/renderer-build-e094` | 0 | Vite 8.3.4; 11 modules; 11 output files, 275,509 bytes. Output remained outside the repo. | `/home/user/m16-audit/2026-10-14_180744_UTC_M16/logs/npm-run-build.log` (SHA-256 `8cdec26a4bf35a6827d7dcf4140c7e755360a1ca642ec8e88916914f18a35145`). |
| 31 `node --check <file>` invocations | 0 | All 31 `.js/.cjs/.mjs` files under `app/electron/src/tests/scripts` parsed. | `/home/user/m16-audit/2026-10-14_180744_UTC_M16/logs/syntax-config-checks.log` (combined record SHA-256 `e9510add5a06ea95903f6815972fc2b75de170cd2092f9a5923b75350b280592`). |
| Parse 3 workflow YAML files and `package.json`/`package-lock.json` | 0 | `js-yaml` and JSON parser accepted all files. | `/home/user/m16-audit/2026-10-14_180744_UTC_M16/logs/syntax-config-checks.log` (SHA-256 `e9510add5a06ea95903f6815972fc2b75de170cd2092f9a5923b75350b280592`). |
| Parse acceptance JSON and resolve relative links in the report/guide (final precommit validation) | 0 | JSON valid; 2 Markdown documents and 9 relative links checked; 0 broken links. | `/home/user/m16-audit/2026-10-14_180744_UTC_M16/logs/docs-validation-final-post-release.log` (SHA-256 `1dbe531bd216c4159fa5ce13ba94d41d59ed02ae83ee0735834e45a98ba2207c`). |
| `npm ls --all --json` | 0 | No dependency-tree problems. | `/home/user/m16-audit/2026-10-14_180744_UTC_M16/logs/npm-ls-all.json` (SHA-256 `8c595de8e67de42ebfb0b4a2c0bd99aba6831fdc430e92becfae29675e12d8d4`). |
| `npm audit --json --package-lock-only` | **1** | Eight moderate, zero high, zero critical. The default full-audit gate is not clear. | `/home/user/m16-audit/2026-10-14_180744_UTC_M16/logs/npm-audit-full.json` (SHA-256 `52842e9e8e5d77cb5f43624ed95bfda36ba00b0fd349ccfa228ad5867989666d`). |
| `npm audit --audit-level=high --json --package-lock-only` | 0 | Same eight moderate findings; only the configured high/critical threshold passes. | `/home/user/m16-audit/2026-10-14_180744_UTC_M16/logs/npm-audit-high.json` (same JSON SHA-256 as full audit). |
| npm registry read-only metadata queries | 0 | Highest published `sprintf-js` version remains `1.1.3`; `electron-builder@latest` is `26.15.3`; `26.5.0` exists, but the audit labels the suggested 26.5.0 builder change semver-major relative to this pin. | `/home/user/m16-audit/2026-10-14_180744_UTC_M16/logs/npm-registry-refresh.json` (SHA-256 `86fff5a602b78fff8c1ed928eeccc775f9e4868306c9b4f876d2963de6210ca9`). |
| `npm run package:win` locally | **NOT RUN** | Linux host had no PowerShell, CMake, Wine, or Electron runtime payload; no Windows package was attempted locally. | Tool-availability check in the M16 tool transcript; no package output created. |

### Audit finding

The current audit reports eight moderate package records arising from the same advisory, **GHSA-hp3w-g68c-fv3c**, “sprintf-js vulnerable to denial of service through unbounded precision specifiers” (CVSS 5.3; CWE-1284), affecting `sprintf-js <=1.1.3`. The lockfile path is:

```text
electron-builder@26.17.0
  -> app-builder-lib@26.17.0
  -> nested @electron/get@3.1.0
  -> global-agent@3.0.0
  -> roarr@2.15.4
  -> sprintf-js@1.1.3
```

The npm audit fix hint is `electron-builder@26.5.0` with `isSemVerMajor: true`; registry metadata confirms that version exists, but version availability/engine compatibility does not prove Windows packaging compatibility or advisory remediation. `sprintf-js` still has no version above `1.1.3` in the registry version list observed during M16. No dependency change, forced downgrade, override, or `npm audit fix` was applied. The current finding remains a build-tooling risk; the audit result does not by itself prove the vulnerable code is shipped in the runtime.

The M15 [`DEPENDENCY_REMEDIATION_PROPOSAL_M15.md`](DEPENDENCY_REMEDIATION_PROPOSAL_M15.md) remains the no-change proposal. The high-only CI pass must not be represented as a clean audit or release approval.

## 6. Images decision

[`IMAGES_FEATURE_DECISION_M15.md`](IMAGES_FEATURE_DECISION_M15.md) remains the current decision record. The original M8/M9 source or patch was not recovered; no first-party Images import/resize/export implementation was found in the reviewed project tree; the current graphics diagnostic PNGs are not an Images product workflow. **Default remains defer; owner decision required.**

M16 did not add UI, IPC, dependencies, image processing code, or package changes. Do not describe the absent feature as restored, FSR, DLSS, AI/neural, GPU-accelerated, or webpage-wide upscaling. Provide the original source for comparison or explicitly approve new scope before implementation.

## 7. Acceptance and release gates

The machine-readable companion is [`WINDOWS_ACCEPTANCE_M16.json`](WINDOWS_ACCEPTANCE_M16.json); the clean Windows procedure and artifact instructions are [`WINDOWS_TEST_GUIDE_M16.md`](WINDOWS_TEST_GUIDE_M16.md).

| Gate | M16 status | Required to close |
|---|---|---|
| Pre-edit preservation and exact remote-tree reconciliation | **PASS** | 90/90 baseline files and 90/90 remote blobs/modes matched; local ref advanced without touching the files. |
| Source/unit tests | **PASS** | 100/100 Node tests; not a GUI/GPU result. |
| Renderer build/config/syntax | **PASS** | Local Vite build, 31 JS syntax checks, three workflow YAML and package JSON/lock parse checks. |
| Full dependency audit | **FAIL — 8 MODERATE** | Approved supported remediation or explicit owner risk disposition; high-only threshold is insufficient. |
| Hosted Windows x64 package build and executable validation | **PASS — workflow scope** | Run 38599630672 passed build and executable validation; candidate bytes still require independent recovery/integrity check. |
| Packaged-app Level A smoke and validator | **PASS — bounded** | Run 38599630672 passed; exact WebGPU status remains unknown. |
| Packaged independent WebGPU compute | **UNKNOWN** | Recover and validate the actual report and output evidence. |
| Bundled WebGPU FSR1 scene | **UNKNOWN** | Recover diagnostics and inspect adapter, shader, pipeline, EASU/RCAS dispatch, output, stage and visible-canvas evidence. |
| Packaged capturePage-to-D3D12 WARP diagnostic | **PASS — software only / validator scope** | Not physical GPU or page interception. |
| Native D3D12 WARP harness | **PASS — software only** | Not the WebGPU scene or physical GPU. |
| Physical-GPU Level B | **NOT RUN** | Explicit owner-controlled environment and required-policy packaged evidence; no dispatch in M16. |
| Candidate/diagnostics bytes and independent integrity | **BLOCKED** | Attach exact ZIPs via the official Actions UI; compare GitHub metadata digest/size; do not execute candidate. |
| Original M8/M9 source provenance | **NOT RECOVERED** | Original source/patch and provenance evidence. |
| Images product decision | **DEFERRED / OWNER DECISION REQUIRED** | Owner supplies original source or approves a clearly new scope; no implementation presumed. |
| DLSS and arbitrary-page upscaling | **NOT IMPLEMENTED / NOT ESTABLISHED** | No capability claim. |
| Release workflow trigger alignment | **NEEDS OWNER REVIEW** | Current `release.yml` push filter names `arena/66abfdc9-tri-core-browser`, not the fixed M16 branch; no dispatch or workflow change was made. |
| Release eligibility | **BLOCKED** | Resolve artifact integrity, exact WebGPU state, Level B, dependency disposition, and provenance/Images decision. |

## 8. Changes, exclusions, and evidence locations

M16 changes are documentation/evidence only:

- `docs/MILESTONE_16_REPORT.md` — this report.
- `docs/WINDOWS_TEST_GUIDE_M16.md` — clean Windows build, Level A smoke, artifact-handling, and reproducibility checklist.
- `docs/WINDOWS_ACCEPTANCE_M16.json` — machine-readable M16 gate results.

The complete prepublication external evidence inventory is `/home/user/m16-audit/2026-10-14_180744_UTC_M16/M16_prepublication_evidence_manifest_final2.tsv` (SHA-256 `3ad85bcac408e648e57b8f906ef87d2aeab65f4e641f8ea7d48a2b7747cd4bda`); the pre-edit baseline and remote-tree comparison are recorded separately in §1. No README, renderer/Electron/native source, tests, workflow, dependency manifest/lock, Images implementation, release/tag, or PR-state change is part of M16. `node_modules/` created by the ignored-script local install remains ignored and is not staged. Renderer output, audit JSON, test logs, artifact-attempt files, and branch-alignment evidence remain outside the repository under `/home/user/m16-audit/`; no binary, ZIP, signed URL, credential, or cache is approved for publication.

**Next actions:** obtain the exact current-run candidate/diagnostics ZIPs through the GitHub Actions UI and attach them without executing the candidate; inspect and validate the reports; arrange separately authorized Level B hardware validation; resolve the moderate advisory with an owner-reviewed compatible fix or risk disposition; recover M8/M9 source or obtain an explicit Images scope decision. Until those gates are directly evidenced, **release readiness remains blocked**.
