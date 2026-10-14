# Milestone 15 — repository forensics, publication review, and release-gate update

- **Date:** 2026-10-14 (Asia/Kolkata)
- **Branch:** `arena/18bfbe1a-tri-core-browser`
- **Verified publication base:** `61cf63a689642bbe6906062c4b18977872d840aa`
- **Overall:** **BLOCKED — this work does not establish release readiness.** Original M8/M9 source is still not recovered; Images is absent; current artifact bytes remain unavailable; packaged WebGPU outcome is unknown; physical-GPU validation was not run; the full dependency audit reports eight moderate findings.
- **M15 project scope:** documentation and evidence only. No runtime source, package manifest, lockfile, workflow, release, or product feature was changed.

## Executive result

1. **Provenance and branch safety:** the current target branch and PR were rechecked. PR #1 remains open and draft against `main`; the fixed branch was at `61cf63a…`, 46 commits ahead of `main` and zero behind. GitHub’s recursive tree has 84 blobs, all of which match the local files by Git blob ID and mode. M12–M14 reports are the three local-only documents. The local branch was aligned to the verified descendant without changing worktree files; details are in §1.
2. **Publication manifest:** six reviewed documentation files are the only intended project publication: the existing M12, M13, and M14 reports plus the new M15 report, Images decision note, and dependency-remediation proposal. Their sizes and SHA-256 hashes are in the separate, private manifest named in §2. The existing README and the other 84 files already match the remote tree and are not being republished as local changes. Ignored/generated data and external evidence are excluded.
3. **Artifact recovery:** one bounded M15 attempt was made for each of the current candidate, packaged-smoke diagnostics, and WARP artifacts. All three returned exit 1/EOF with zero bytes. No signed URL was exposed; no ZIP was extracted and no executable was run. Metadata still reports the artifacts unexpired, but its digests are not local verification.
4. **Separate graphics findings:** the Windows packaged smoke and Level A evidence validator pass at their configured gate; the optional WebGPU scene’s exact result remains **UNKNOWN** because Level A allows either a validated pass or safe skip and the diagnostics archive was unavailable. The screenshot-to-D3D12/WARP smoke assertions and the separate synthetic WARP harness report success, **software-only**. The physical Level B job was skipped; runner-list access returned 403, so runner availability remains unknown and physical validation is **NOT RUN**.
5. **Local checks:** `npm test` passed 100/100; the renderer build, 31-file JavaScript syntax check, YAML/JSON parsing, and `git diff --check` passed. The full npm audit exited 1 with eight moderate, zero high, and zero critical findings; the high-only threshold exited 0 with the same findings. No package change was made.
6. **Owner decisions remain:** M8/M9 source recovery or explicit approval of Images as new scope; dependency finding disposition; and any future physical-GPU validation on an already-authorized runner. No DLSS, ordinary-page upscaling, or release-readiness claim is made.

## 1. Repository forensics and fixed-branch ancestry

### Baseline and preservation

Before M15 project edits, a read-only local inventory was saved at `/home/user/m15-audit/2026-10-14_160536_UTC_pre-M15_file_manifest.tsv` (SHA-256 `28ad0d53f98a7be3a797b36c9b01961651a0b024bd72f12a7aa381b10b0b8165`). The append-only evidence log is `/home/user/m15-audit/2026-10-14_160536_UTC_M15_evidence.log`. The original README, ignored M14 dependency outputs, `node_modules/`, and all existing reports/artifacts were preserved.

The pre-M15 checkout was shallow at `e27cb207d6be86a346420901a979b831cf849c00`. Its pre-existing `README.md` working content (SHA-256 `252d72f82d2c1ec2d5998a9dc7c8cc1e798732b149a805865b35912ac61a8241`) matched the feature-branch README blob exactly; the README diff hash recorded before M15 was `4c1646921083630a13a4031d9f6fb6241b1f3abdaec00edc8a3c1ed9745c36ff`. It was not rewritten. Once the local branch was aligned with its already-matching remote version, it was clean rather than a pending README change.

M12, M13, and M14 reports were read in full and their original hashes were unchanged. The initial local status also contained 84 remote-tree files as untracked, plus those three reports; `package.json` and `package-lock.json` were among the files already identical to the remote tree. The ignored `node_modules/`, `dependency-audit.json`, and `dependency-tree.json` were retained and not staged.

### Remote state and safe local alignment

Read-only rechecks established:

- `origin` feature branch: `61cf63a689642bbe6906062c4b18977872d840aa`.
- `main`: `e27cb207d6be86a346420901a979b831cf849c00`.
- PR #1: **OPEN, DRAFT**, base `main`, head `arena/18bfbe1a-tri-core-browser` at the same feature SHA.
- GitHub compare from `main` to the feature branch: **46 ahead / 0 behind**.
- Remote recursive tree: `af643c04f4405e95afcf5e23a0123dcd4f9f0eed`, not truncated; **84/84 blobs and modes match locally**, zero missing or mismatched. The only paths local to this checkout and not in that tree were the M12, M13, and M14 reports.

After fetching the exact branch, `git merge-base` confirmed that local `e27cb20…` was an ancestor of remote `61cf63a…` (0 local-only / 46 remote-only commits). A normal `git merge --ff-only` correctly refused to overwrite the locally modified/untracked paths, even though their contents matched. No content was lost. After a second full blob-and-mode check, the local index alone was advanced with `git read-tree` (without `-u`) and the existing branch ref was advanced by compare-and-swap from `e27cb20…` to its verified descendant `61cf63a…`. A private pre-transition index copy is preserved at `/home/user/m15-audit/2026-10-14_160536_UTC_index-before-safe-advance.bin` (SHA-256 `820ad30aba72fefb6eca1afa2376c7637671f4d2b211142fb1dc216095000624`). The resulting index tree equals the remote tree, tracked/staged diffs are empty, and the worktree paths were not touched by this alignment. No history was rewritten and no force operation was used.

The **remote** feature ref was not changed by the read-only checks or local alignment; only the local branch was advanced. The M15 document publication is limited to the reviewed manifest. Its exact commit identity and independent post-push remote verification are recorded in the append-only evidence log rather than self-referenced in this report.

## 2. Explicit publication manifest and exclusions

The reviewed publication manifest is `/home/user/m15-audit/2026-10-14_161516_UTC_M15_publication_manifest.tsv`. It lists each selected path, its byte size, SHA-256, provenance, review, and disposition. The six selected documents are:

| Path | M15 disposition |
|---|---|
| `docs/MILESTONE_12_REPORT.md` | Publish as the unchanged historical M12 report. |
| `docs/MILESTONE_13_REPORT.md` | Publish as the unchanged historical M13 report. |
| `docs/MILESTONE_14_REPORT.md` | Publish as the unchanged historical M14 report. |
| `docs/MILESTONE_15_REPORT.md` | Publish this current report. |
| `docs/IMAGES_FEATURE_DECISION_M15.md` | Publish the decision note; it does not implement Images. |
| `docs/DEPENDENCY_REMEDIATION_PROPOSAL_M15.md` | Publish the proposal; it does not change dependencies. |

The intended scope contains documentation only. The bounded credential-pattern scan of the three pre-existing report candidates returned zero matches; newly written documents were also reviewed before staging. Before publication, the complete staged diff must—and did—match this manifest; no other paths are approved for staging.

**Explicit exclusions:**

- `README.md`: its existing contents are already the remote branch version; no README update is included.
- The other 84 paths in the verified remote tree, including runtime source, tests, workflows, `package.json`, and `package-lock.json`: contents/modes already match the remote branch; no duplicate or unrelated changes are included.
- `node_modules/`, `dependency-audit.json`, and `dependency-tree.json`: ignored local generated state; preserved, never staged.
- `/home/user/m15-audit/` baseline inventory, evidence log, npm audit/registry outputs, npm cache, test/build logs, renderer output, index backup, and retrieval attempt files: external evidence only; not part of Git publication.
- No candidate/diagnostic/WARP bytes were received. No binary, cache, signed URL, credential, temporary log, or release asset is included.

## 3. Current Actions artifacts and bounded retrieval

The newest branch runs observed are push runs `38550224302` (Windows browser) and `38550224344` (native WARP); matching pull-request runs `38550229640` and `38550229636` also completed successfully on `61cf63a…`. Current GitHub artifact metadata is:

| Artifact | ID | GitHub size | GitHub-reported SHA-256 | M15 attempt 1/2 |
|---|---:|---:|---|---|
| `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` | `11886880645` | 109,724,572 bytes | `7436b6850164ce7742aece8adbd3b7b2e7b257de39f9afd67dad5df9c627dd24` | `gh api` archive GET, 120-second bound: exit 1, EOF, 0 bytes. |
| `TriCoreBrowser-Packaged-Smoke-Diagnostics` | `11886696126` | 732,049 bytes | `3a53342fc6608044f08fcb5f3d5faa54068938126ed0a0d0d006a385b8efbb79` | `gh api` archive GET, 120-second bound: exit 1, EOF, 0 bytes. |
| `TriCore-FSR1-D3D12-WARP-POC` | `11886655622` | 59,482 bytes | `990c1ab9801cac8781d5f05d10e4c90b1900f6262c5a68837c9c7218f5b73f90` | `gh api` archive GET, 120-second bound: exit 1, EOF, 0 bytes. |

GitHub still lists these artifacts as unexpired through 2026-11-13 UTC. The digests and sizes above are **GitHub metadata only**; no local archive digest, ZIP path/CRC check, inner executable hash, signature, or diagnostic-content inspection is available. Each M15 attempt wrote to a mode-0600 external destination; stderr was classified without printing or recording a signed URL. No archive was extracted and no candidate was executed. M15 made one attempt per artifact and did not repeat the same failing transfer. The precise post-redirect failure cause remains **UNKNOWN**; do not infer expiry, corruption, or authorization failure.

Historical reports record prior attempts: M13 made one attempt per current artifact, and M14 made one additional bounded range probe for the candidate. Those attempts do not supply bytes or independent integrity evidence.

## 4. WebGPU, WARP, and physical-GPU findings

These are separate results and are not interchangeable:

| Path | Current evidence | M15 finding |
|---|---|---|
| App-owned WebGPU EASU/RCAS scene | Source owns its controlled scene and visible canvas. Windows packaged job `115806084996` and Level A validator report success, but the policy permits a real WebGPU pass or a safe unsupported skip. The diagnostics archive was unavailable. | **SOURCE PRESENT; packaged outcome UNKNOWN.** No exact dispatch, adapter, shader, or visible-canvas result is independently asserted. This is not arbitrary webpage upscaling. |
| Bundled WebGL2 screenshot → D3D12/WARP helper | The Windows packaged smoke and Level A evidence validator report success for the configured bounded screenshot/WARP assertions. The separate D3D12 WARP job is not this same path. Per-run images/reports were unavailable. | **PASS at bounded smoke-gate level; software-only.** Not continuous, zero-copy, physical-GPU, or general-page processing. |
| Standalone synthetic D3D12/WARP harness | Job `115806085078` reports success for native configure/build and the synthetic EASU/RCAS exercise on WARP. | **PASS; software-only.** Not physical hardware or a browser-wide feature. |
| Physical-GPU / Level B | Job `115806086735` is **skipped**. A read-only runner-list API request returned 403. | **NOT RUN.** Runner registration/availability is unknown; no runner was provisioned and no workflow was dispatched. |
| DLSS / Streamline | No licensed runtime, feature binary, or integrated renderer path was found in the reviewed tree. | **NOT IMPLEMENTED / NOT TESTED.** No DLSS or NVIDIA-hardware claim. |
| Ordinary pages / general browser upscaling | Current tabs remain normal Chromium views; neither bounded FSR diagnostic is connected to arbitrary page frames. | **NOT IMPLEMENTED / NOT ESTABLISHED.** No website, video, DRM, external-game, or compositor upscaling claim. |

A successful Windows workflow or software WARP result does not establish physical-GPU acceptance. No release eligibility is inferred.

## 5. Local regression, build, and audit checks

| Check | M15 result | Scope and evidence |
|---|---|---|
| `npm test` | **PASS — 100 passed, 0 failed, 0 skipped**; exit 0. | Node source/contract tests, not Electron GUI or live GPU execution. Log: `/home/user/m15-audit/2026-10-14_161134_UTC_npm-test.log`; SHA-256 `81341e5e79feaf02c054b8041f5bdf4c2897bc686d8f420b5d65ee199b72981e`. |
| `npm run build -- --outDir /home/user/m15-audit/2026-10-14_161134_UTC_renderer-build` | **PASS**; exit 0, Vite 8.3.4, 11 modules. | Output stayed outside the repository. Log SHA-256 `b5e169550510a803be86095e88b0b4a8e78a0a077592529b3def0db8e1c8daa4`. |
| `node --check` over `app`, `electron`, `src`, `tests`, and `scripts` | **PASS — 31 files**; exit 0. | Syntax only. Log SHA-256 `9478bf09188b6b429ed32e5cfec1a62f319151e4170b5078629cb92d2c186ac0`. |
| Parse `package.json`, `package-lock.json`, and three workflow YAML files | **PASS**. | JSON via Python; workflow YAML via installed `js-yaml`. |
| `git diff --cached --check` | **PASS — exit 0 on the complete staged six-file set before commit.** | Whitespace check only; the staged path set and full diff were also reviewed against the external manifest. |
| `npm audit --json --package-lock-only` | **FAIL at default threshold**; exit 1. | 8 moderate, 0 high, 0 critical. Output SHA-256 `52842e9e8e5d77cb5f43624ed95bfda36ba00b0fd349ccfa228ad5867989666d`. |
| `npm audit --audit-level=high --json --package-lock-only` | **PASS at high-only threshold**; exit 0. | Same 8 moderate findings; not a clean audit. Output SHA-256 matches the full-audit JSON. |
| `package-lock.json` preservation | **PASS — unchanged**. | SHA-256 before/after audits: `24708fc5609edbc5eaf4d6ad7f4042dad9f25d3e961de24e44d2ce7c12f522c6`. |
| Local Windows package/runtime/native build | **NOT RUN**. | `pwsh`, CMake, and an Electron executable payload are unavailable. A prior Electron package-shim probe attempted its normal binary fetch and failed; it was not repeated and no executable was run. |

The pre-existing ignored M14 outputs were not overwritten: `dependency-audit.json` SHA-256 `52842e9e8e5d77cb5f43624ed95bfda36ba00b0fd349ccfa228ad5867989666d`; `dependency-tree.json` SHA-256 `8c595de8e67de42ebfb0b4a2c0bd99aba6831fdc430e92becfae29675e12d8d4`. Fresh audit JSON and all build/test outputs were written outside Git. The full dependency finding and proposal are documented separately in `docs/DEPENDENCY_REMEDIATION_PROPOSAL_M15.md`.

## 6. Images decision and dependency proposal

### Images

The decision note is `docs/IMAGES_FEATURE_DECISION_M15.md`. **Default decision: defer; no implementation.** The original M8/M9 source was not recovered; the available repository has no user-facing Images import/resize/export workflow. If the owner wants restoration, provide the original source for comparison. If new work is desired, explicitly approve the proposed local PNG, CPU-bilinear MVP and its bounds, IPC/security design, and Windows packaged tests. It is not a restoration and must not be described as FSR, DLSS, AI, GPU, or general webpage upscaling.

### Dependencies

The proposal is `docs/DEPENDENCY_REMEDIATION_PROPOSAL_M15.md`. Current lockfile findings are all development-tooling records for the single moderate `GHSA-hp3w-g68c-fv3c` advisory. npm’s suggested `electron-builder@26.5.0` fix is an out-of-pin downgrade marked semver-major; the registry reports `sprintf-js` latest `1.1.3` and no `1.1.4`. No override, forced downgrade, automatic `npm audit fix`, package change, or lockfile change was made. A supported stable builder-family fix with full Windows packaging regression—or an explicit owner risk disposition—is needed before the dependency gate can close.

## 7. Updated release-gate table

| Gate | M15 status | Evidence / consequence |
|---|---|---|
| Fixed-branch ancestry and source-tree match | **PASS — bounded** | 0 behind / 46 ahead before M15; 84/84 remote blobs and modes matched. Local branch aligned by non-destructive index/ref fast-forward; no history rewrite. |
| Original M8/M9 source and provenance | **NOT RECOVERED** | No source archive/patch/Images implementation was found in the reviewed evidence. Current branch identity is not proof of M8/M9 fidelity. |
| App-owned Images import/resize/export | **NOT IMPLEMENTED** | Decision note prepared; implementation awaits explicit owner decision. |
| Candidate/diagnostics/WARP artifact metadata | **PASS — metadata only** | GitHub reports uploaded and unexpired artifacts with listed sizes/digests. |
| Candidate ZIP/EXE bytes and integrity | **BLOCKED** | M15 bounded attempts returned zero bytes/EOF; no local hash, archive check, signature, or binary scan. |
| Windows packaged build/smoke + Level A validator | **PASS — LIMITED** | Current hosted job reports success; it does not prove physical hardware or release readiness. |
| Packaged optional WebGPU FSR result | **UNKNOWN** | Level A accepts pass or safe skip; diagnostics unavailable. |
| Screenshot-to-D3D12/WARP smoke | **PASS — BOUNDED / SOFTWARE** | Level A assertions report success; exact image/report bytes unavailable. |
| Standalone synthetic D3D12/WARP harness | **PASS — SOFTWARE ONLY** | Separate current job reports successful native build and exercise. |
| Physical-GPU Level B acceptance | **NOT RUN** | Job skipped; runner API access 403; availability unknown. |
| DLSS / general webpage upscaling | **NOT IMPLEMENTED / NOT TESTED** | No integrated runtime or all-page frame path; no claim. |
| Local source tests and renderer build | **PASS** | 100/100 tests, renderer build, syntax, JSON/YAML parsing passed. |
| Full dependency audit | **FAIL — 8 MODERATE** | Full audit exits 1; high-only threshold exits 0; remediation proposal is pending. |
| Release readiness | **BLOCKED** | Artifact bytes/integrity, optional WebGPU outcome, physical acceptance, dependency disposition, and M8/M9 provenance remain open. **Do not claim readiness.** |

## 8. Changes, exclusions, hashes, and next action

### Project changes

- New documentation: this report, `docs/IMAGES_FEATURE_DECISION_M15.md`, and `docs/DEPENDENCY_REMEDIATION_PROPOSAL_M15.md`.
- Existing historical M12, M13, and M14 reports are unchanged and are included in the reviewed publication manifest.
- No application source, tests, README, workflow, package manifest, lockfile, release, tag, PR state, permission, or remote branch history was rewritten.
- No artifact bytes were recovered. Zero-byte attempt markers and all audit/build/test outputs remain outside the repository.

### Selected existing hashes

| Item | SHA-256 |
|---|---|
| Pre-M15 file manifest | `28ad0d53f98a7be3a797b36c9b01961651a0b024bd72f12a7aa381b10b0b8165` |
| M12 report | `de2473faf820965943fda10b8a1f90872c652b8f71349e9b8414e4dce4c56a6c` |
| M13 report | `bb0a5f9b0b1a6c977af22cbf41382eb9107a548547e8af7bcff47c3bcdda6f05` |
| M14 report | `be041ed069bf8d08d7a3cde7e0265632920f8c890d99cc30be1617bcf0a621f6` |
| `package-lock.json` (unchanged) | `24708fc5609edbc5eaf4d6ad7f4042dad9f25d3e961de24e44d2ce7c12f522c6` |
| Images decision note | `64c18ede248322c90862806416b667881b7e31b8f3866c7f9546721d5b292c47` |
| Dependency proposal | `1b1be2d342d0268b2da6a6808d75fefd331310d1b0066ae6c943a58f86a707ed` |

The complete SHA-256 list for all six publication paths is in the external M15 publication manifest. The M15 report’s own hash and the final publication commit/remote verification are recorded outside the report to avoid self-reference.

### Next action

**Obtain the original current-run candidate and packaged-smoke diagnostics ZIPs through an authorized GitHub UI/workspace path and attach the exact files without executing the candidate.** Then independently verify archive size/digest and inspect the diagnostics to resolve the WebGPU pass-versus-safe-skip result. The original M8/M9 source remains a separate recovery request; physical-GPU validation and any Images implementation still require their respective owner decisions and authorized environment.

**Release status remains BLOCKED.**
