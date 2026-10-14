# Milestone 15 — repository forensics, publication review, and release-gate update

- **Date:** 2026-10-14 (Asia/Kolkata)
- **Branch:** `arena/18bfbe1a-tri-core-browser`
- **Verified publication base:** `61cf63a689642bbe6906062c4b18977872d840aa`
- **Overall:** **BLOCKED — this work does not establish release readiness.** Original M8/M9 source is still not recovered; Images is absent; current artifact bytes remain unavailable; packaged WebGPU outcome is unknown; physical-GPU validation was not run; the full dependency audit reports eight moderate findings.
- **M15 project scope:** documentation and evidence only. No runtime source, package manifest, lockfile, workflow, release, or product feature was changed.

## Executive result

1. **Provenance and branch safety:** before publication, the verified feature head was `61cf63a689642bbe6906062c4b18977872d840aa`, 46 commits ahead of `main` and zero behind. The first M15 docs publication is `6fc443a9748b17b5f66fa5f35c22cb4c238cf4dd`; at the post-push check GitHub reported the branch 47 ahead / 0 behind, PR #1 still OPEN/DRAFT against `main`. The follow-up report-completeness change is documentation-only; its exact commit and final remote ref are in the append-only evidence log referenced in §8. No force-push, merge, tag, release, or `main` update occurred.
2. **Complete publication inventory:** the six M12–M15/decision/proposal documents are the only project paths published by M15. The complete final inventory records every tracked path, byte count, SHA-256, Git blob/mode, provenance, and disposition; it also separates the unchanged remote tree, ignored local outputs, external generated evidence, and GitHub Actions artifacts. See §2 and the external manifest there.
3. **README claim review:** `README.md` is unchanged and byte-identical to the verified remote blob (Git blob `dd4fbc85161ccac874739350a6764630ef56c873`; SHA-256 `252d72f82d2c1ec2d5998a9dc7c8cc1e798732b149a805865b35912ac61a8241`). It explicitly keeps WebGPU **UNKNOWN**, WARP **software-only**, physical GPU **NOT RUN**, and DLSS absent; it does not promise an Images utility or browser-wide upscaling. Its citation to older run `38287627583` is noted, but no unsupported claim warranted a README edit.
4. **Post-publication remote checks:** push run `38597249592` and native WARP run `38597249390` both completed successfully on the first M15 commit. The Windows package/build/smoke and Level A checks passed; the physical Level B job and physical-GPU-validated portable-distribution assembly were skipped. PR runs `38597256189` and `38597256459` also succeeded; the PR Windows/Level B jobs were skipped, while the separate WARP harness passed.
5. **Artifacts and evidence limits:** GitHub metadata for the first M15 code-bearing commit lists unexpired candidate, diagnostics, Linux-check, and WARP artifacts with sizes/digests. One bounded current-ID archive GET each for candidate and diagnostics returned exit 1/EOF and zero bytes; prior M15 attempts on earlier IDs also returned no bytes. No local archive hash, inner executable/signature verification, or diagnostic-content inspection is available; the metadata SHA values are not local verification. The candidate was not extracted or executed.
6. **Graphics findings stay separate:** the packaged Level A validator passed its allowed gate, but the optional WebGPU scene’s exact pass-versus-safe-skip remains **UNKNOWN** without the diagnostics ZIP. Packaged screenshot-to-D3D12/WARP smoke assertions and the standalone synthetic WARP harness passed at their bounded scope, **software-only**. Physical Level B was skipped; runner-list access returned 403, so runner availability is unknown and physical-GPU validation is **NOT RUN**.
7. **Post-publication local checks:** `npm test` passed 100/100; renderer build, 31-file JavaScript syntax, workflow YAML/JSON parsing, and whitespace checks passed. The full npm audit exits 1 with eight moderate, zero high, and zero critical findings; its high-only threshold and the repository dependency-audit script in a clean isolated install exit 0. No package or lockfile change was made.
8. **Release remains blocked:** unresolved items include original M8/M9 source provenance, candidate/diagnostics bytes and independent integrity, exact packaged WebGPU outcome, physical-GPU acceptance, and an owner disposition or supported remediation for the moderate dependency advisory. No DLSS, ordinary-page upscaling, Images implementation, or release-readiness claim is made.

## 1. Repository forensics and fixed-branch ancestry

### Baseline and preservation

Before M15 project edits, a read-only local inventory was saved at `/home/user/m15-audit/2026-10-14_160536_UTC_pre-M15_file_manifest.tsv` (SHA-256 `28ad0d53f98a7be3a797b36c9b01961651a0b024bd72f12a7aa381b10b0b8165`). The append-only evidence log is `/home/user/m15-audit/2026-10-14_160536_UTC_M15_evidence.log`. The original README, ignored M14 dependency outputs, `node_modules/`, and all existing reports/artifacts were preserved.

The pre-M15 checkout was shallow at `e27cb207d6be86a346420901a979b831cf849c00`. Its pre-existing `README.md` working content (SHA-256 `252d72f82d2c1ec2d5998a9dc7c8cc1e798732b149a805865b35912ac61a8241`) matched the feature-branch README blob exactly; the README diff hash recorded before M15 was `4c1646921083630a13a4031d9f6fb6241b1f3abdaec00edc8a3c1ed9745c36ff`. It was not rewritten. Once the local branch was aligned with its already-matching remote version, it was clean rather than a pending README change.

### README graphics/product-claim review

The exact README blob is `dd4fbc85161ccac874739350a6764630ef56c873` (mode `100644`, 11,452 bytes; SHA-256 as above), also equal to the remote blob. The review found cautious, explicitly delimited wording: WebGPU runtime **UNKNOWN**, WARP **software-only**, physical GPU **NOT RUN**, DLSS absent, and no Images utility or ordinary-page/browser-wide upscaling promise. The README is dated 2026-10-12 and cites older run `38287627583`; M15 records the newer run results below, but they do not justify a broader capability claim. **Disposition: no README edit**; preserve the remote-identical README and keep all claims bounded.

M12, M13, and M14 reports were read in full and their original hashes were unchanged. The initial local status also contained 84 remote-tree files as untracked, plus those three reports; `package.json` and `package-lock.json` were among the files already identical to the remote tree. The ignored `node_modules/`, `dependency-audit.json`, and `dependency-tree.json` were retained and not staged.

### Remote state and safe local alignment

The pre-publication rechecks established:

- `origin` feature branch before M15: `61cf63a689642bbe6906062c4b18977872d840aa`.
- `main`: `e27cb207d6be86a346420901a979b831cf849c00`; the shallow boundary is exactly this commit, with no grafts.
- PR #1 before publication: **OPEN, DRAFT**, base `main`, fixed head branch `arena/18bfbe1a-tri-core-browser`.
- GitHub compare before M15: **46 ahead / 0 behind**.
- Remote recursive tree at the pre-publication head: `af643c04f4405e95afcf5e23a0123dcd4f9f0eed`, not truncated; **84/84 blobs and modes matched locally**, zero missing or mismatched. The only paths local to that tree were the M12, M13, and M14 reports.

After the first normal push, commit `6fc443a9748b17b5f66fa5f35c22cb4c238cf4dd` was the exact feature head; that compare reported **47 ahead / 0 behind**. PR #1 remains OPEN/DRAFT, based on `main`. The final documentation-only follow-up commit and the exact remote branch SHA after that push are recorded in `/home/user/m15-audit/2026-10-14_M15_final_evidence.log` (no self-referential commit hash is placed in this report).

After fetching the exact branch, `git merge-base` confirmed that local `e27cb20…` was an ancestor of remote `61cf63a…` (0 local-only / 46 remote-only commits). A normal `git merge --ff-only` correctly refused to overwrite the locally modified/untracked paths, even though their contents matched. No content was lost. After a second full blob-and-mode check, the local index alone was advanced with `git read-tree` (without `-u`) and the existing branch ref was advanced by compare-and-swap from `e27cb20…` to its verified descendant `61cf63a…`. A private pre-transition index copy is preserved at `/home/user/m15-audit/2026-10-14_160536_UTC_index-before-safe-advance.bin` (SHA-256 `820ad30aba72fefb6eca1afa2376c7637671f4d2b211142fb1dc216095000624`). The resulting index tree equals the remote tree, tracked/staged diffs are empty, and the worktree paths were not touched by this alignment. No history was rewritten and no force operation was used.

The read-only checks and safe local alignment did not change the **remote** feature ref. The initial M15 documentation set was then published by a normal, non-force push to the fixed feature branch; its exact ref and successful post-push checks are recorded in §2–§5. A second documentation-only follow-up contains only the reviewed M15 report and Images decision-note corrections. No source, workflow, dependency, release, PR-state, or `main` change was made. The final follow-up commit identity and independently queried remote ref are retained in the append-only evidence log rather than self-referenced here.

## 2. Explicit publication manifest and exclusions

The first publication used `/home/user/m15-audit/2026-10-14_161516_UTC_M15_publication_manifest.tsv`. The final inventory is `/home/user/m15-audit/2026-10-14_M15_complete_publication_manifest.tsv`; it lists all **90 tracked paths**, Git modes and blob IDs, byte counts, SHA-256 hashes, provenance/category, review, and final status. A separate nontracked/external inventory at `/home/user/m15-audit/2026-10-14_M15_ignored_external_inventory.tsv` records ignored/generated files and GitHub artifacts without adding them to the repository. The six approved documentation paths and dispositions are:

| Path | M15 disposition |
|---|---|
| `docs/MILESTONE_12_REPORT.md` | Historical M12 report; unchanged in the follow-up. |
| `docs/MILESTONE_13_REPORT.md` | Historical M13 report; unchanged in the follow-up. |
| `docs/MILESTONE_14_REPORT.md` | Historical M14 report; unchanged in the follow-up. |
| `docs/MILESTONE_15_REPORT.md` | M15 report; amended only for the missing acceptance details and post-publication evidence. |
| `docs/IMAGES_FEATURE_DECISION_M15.md` | Decision note; amended only to make proposed files, security boundaries, tests, and risks explicit. It does not implement Images. |
| `docs/DEPENDENCY_REMEDIATION_PROPOSAL_M15.md` | Historical proposal; unchanged, no dependency or lockfile change. |

The initial M15 commit published these six documentation files; the follow-up commit changes only the M15 report and Images decision note. Before each push, explicit paths were staged and the full staged diff reviewed against the manifest; no source, generated, or unrelated path was approved. The original M12–M14 reports were checked for credential-patterns before the initial publication, and the follow-up documents were reviewed again.

**Explicit exclusions:**

- `README.md`: its existing contents are already the remote branch version; no README update is included.
- The other 84 paths in the verified remote tree, including runtime source, tests, workflows, `package.json`, and `package-lock.json`: contents/modes already match the remote branch; no duplicate or unrelated changes are included.
- `node_modules/`, `dependency-audit.json`, and `dependency-tree.json`: ignored local generated state; preserved, never staged.
- `/home/user/m15-audit/` baseline inventory, evidence log, npm audit/registry outputs, npm cache, test/build logs, renderer output, index backup, and retrieval attempt files: external evidence only; not part of Git publication.
- No candidate/diagnostic/WARP bytes were received. No binary, cache, signed URL, credential, temporary log, or release asset is included.

## 3. Artifacts from the first M15 code-bearing commit and bounded retrieval

The latest completed branch runs on the first M15 commit `6fc443a9748b17b5f66fa5f35c22cb4c238cf4dd` are push run `38597249592` (Windows/package/browser checks) and `38597249390` (isolated native WARP harness). Matching PR runs `38597256189` and `38597256459` completed on the same head. GitHub API metadata for the push-run artifacts is:

| Run | Artifact | ID | GitHub size | GitHub-reported SHA-256 | Expires (UTC) | Local bytes |
|---|---|---:|---:|---|---|---|
| `38597249592` | `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` | `11911446601` | 109,719,889 bytes | `2a3a30b238c80e27ebe11183ae401eb44968412b54a4577f18b83101b2a8f74f` | `2026-11-13T16:24:52Z` | No; one bounded GET ended EOF/0 bytes. |
| `38597249592` | `TriCoreBrowser-Packaged-Smoke-Diagnostics` | `11910897091` | 735,202 bytes | `adce71ea8c03a5b5a15aad2ab72e1676b999bc5e606c944a357412ff7644e466` | `2026-11-13T16:25:26Z` | No; one bounded GET ended EOF/0 bytes. |
| `38597249592` | `TriCoreBrowser-Linux-checks` | `11909544402` | 10,273 bytes | `a980fbe00e111c1410f30d4bfc5b6f06fb70a807b78adee86ad448e93b008e3b` | `2026-11-13T16:20:54Z` | Metadata only; not downloaded. |
| `38597249390` | `TriCore-FSR1-D3D12-WARP-POC` | `11910565398` | 59,487 bytes | `55865d13f66d83855dffb9e647daa2172400b25dacb3c1d6343bee485f82bb8b` | `2026-11-13T16:21:09Z` | Metadata only; not downloaded. |

GitHub reported all four current artifacts unexpired through 2026-11-13 UTC. These sizes/digests are **remote metadata only**, not locally verified archive hashes. For the current candidate and diagnostics IDs, the one correctly formed, bounded request per ID was `gh api repos/shuvrajeetkamila/Tri-Core-Browser/actions/artifacts/<ID>/zip` redirected to a mode-0600 external file, with a 120-second limit. Each exited 1 with `Get "[REDACTED URL] EOF` and zero bytes; the output placeholder SHA-256 is the empty-file digest `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. Redacted logs are `/home/user/m15-audit/2026-10-14_162900_UTC_candidate_11911446601_attempt2.log` (SHA-256 `8945a4c698812acb1352c9a20fe9213cf2549331457a0b4eaebbeb00a607ff42`) and `/home/user/m15-audit/2026-10-14_162900_UTC_diagnostics_11910897091_attempt2.log` (SHA-256 `f210b88faa92a06eef0c209a492d9d6a74940d61731890b7df7e9e409fd34983`). A preliminary invocation with unsupported `gh api --output` was rejected locally (`unknown flag`) and did not issue an HTTP request; its redacted log is preserved. No signed URL is retained or exposed.

The earlier IDs from run `38550224302`/`38550224344` were separately attempted once in M15 and likewise returned zero-byte EOF; their GitHub metadata was candidate `11886880645` / 109,724,572 bytes / SHA-256 `7436b6850164ce7742aece8adbd3b7b2e7b257de39f9afd67dad5df9c627dd24`, diagnostics `11886696126` / 732,049 bytes / `3a53342fc6608044f08fcb5f3d5faa54068938126ed0a0d0d006a385b8efbb79`, and WARP `11886655622` / 59,482 bytes / `990c1ab9801cac8781d5f05d10e4c90b1900f6262c5a68837c9c7218f5b73f90`. M13/M14 attempts are documented in their reports. No further retry was made. No archive was extracted, no candidate was executed, and no local ZIP/CRC, inner EXE hash, signature, malware scan, or diagnostic-content check is available. The precise EOF cause remains **UNKNOWN**; do not infer expiry, corruption, or authorization failure.

### Download/attachment instructions if the bytes are needed

1. Open the official run page for the current Windows candidate: <https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38597249592>. Verify it is the intended run on head `6fc443a9748b17b5f66fa5f35c22cb4c238cf4dd`.
2. In its **Artifacts** section, download `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` and `TriCoreBrowser-Packaged-Smoke-Diagnostics` as their original ZIP files. Do not copy/share any signed download URL.
3. Attach the exact downloaded ZIPs to this workspace without executing the candidate. Do not unpack or modify them first; independent size/digest and archive checks can then be performed offline.
4. If the separate software-only harness artifact is requested, use <https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38597249390> and select `TriCore-FSR1-D3D12-WARP-POC`. This artifact is not physical-GPU evidence.

## 4. WebGPU, WARP, and physical-GPU findings

These are separate results and are not interchangeable:

| Path | Current evidence | M15 finding |
|---|---|---|
| App-owned WebGPU EASU/RCAS scene | On push run `38597249592`, the packaged smoke and Level A evidence validator passed. Its policy accepts either an actual scene pass or a safe unsupported skip. Diagnostics artifact `11910897091` could not be retrieved. | **SOURCE PRESENT; packaged outcome UNKNOWN.** No exact dispatch, adapter type, shader result, or visible-canvas result is independently asserted. This is not arbitrary webpage upscaling. |
| Packaged screenshot → D3D12/WARP helper | The Windows x64 package/build, packaged smoke, and Level A validator steps all passed on run `38597249592`. The diagnostics ZIP (which would provide per-run detail) was unavailable. | **PASS at bounded smoke-gate level; software-only.** Not continuous, zero-copy, physical-GPU, or general-page processing. |
| Standalone synthetic D3D12/WARP harness | Push run `38597249390` and PR run `38597256459` both completed successfully; native configure/build, official EASU/RCAS exercise on D3D12 WARP, and evidence upload steps passed. | **PASS; software-only.** Not physical hardware or a browser-wide feature. |
| Physical-GPU / Level B | Level B job in push run `38597249592` was **skipped**; PR run `38597256189` also skipped it. A read-only runner-list API request returned 403. | **NOT RUN.** Runner registration/availability is unknown; no runner was provisioned and no workflow was dispatched. |
| DLSS / Streamline | No licensed runtime, feature binary, or integrated renderer path was found in the reviewed tree. | **NOT IMPLEMENTED / NOT TESTED.** No DLSS or NVIDIA-hardware claim. |
| Ordinary pages / general browser upscaling | Current tabs remain normal Chromium views; neither bounded FSR diagnostic is connected to arbitrary page frames. | **NOT IMPLEMENTED / NOT ESTABLISHED.** No website, video, DRM, external-game, or compositor upscaling claim. |

A successful Windows workflow or software WARP result does not establish physical-GPU acceptance. No release eligibility is inferred.

## 5. Local regression, build, and audit checks

The following were rerun after the first M15 publication on 2026-10-14 with Node `v22.22.3` and npm `10.9.8`. These are local source/config checks; they do not substitute for the separate hosted Windows package or physical-GPU gates.

| Exact command/check | Result | Log / limitation |
|---|---|---|
| `npm test` | **PASS**; exit 0, 100 passed / 0 failed / 0 skipped. | `/home/user/m15-audit/2026-10-14_162510_UTC_npm-test.log`; SHA-256 `345d7729961f58ffc2307ff02a4aa3c5530c874859635d472a398e39de34654a`. Node tests, not a live Electron GUI or GPU run. |
| `npm run build -- --outDir /home/user/m15-audit/2026-10-14_162510_UTC_renderer-build` | **PASS**; exit 0, Vite 8.3.4, 11 modules. | `/home/user/m15-audit/2026-10-14_162510_UTC_renderer-build.log`; SHA-256 `a0fb1c37d009f825ac2c95e2b3bd80df2c3d7855efc24100d377b91f7bea2a58`. Output is outside the repository. |
| `node --check` for 31 `.js/.cjs/.mjs` files under `app/electron/src/tests/scripts` | **PASS**; exit 0. | `/home/user/m15-audit/2026-10-14_162510_UTC_node-check.log`; SHA-256 `651367f75062d514b239e03846344f694754b716373c0b7529f4997df716ac34`. Syntax only. |
| Parse the 3 workflow YAML files and `package.json`/`package-lock.json` | **PASS**; exit 0. | `/home/user/m15-audit/2026-10-14_162510_UTC_config-parse.log`; SHA-256 `4ec837794cdce08d8dfeac0d5bf88faed6b952a23d759ef21ed8ea14bac0efe2`. |
| `git diff HEAD^ HEAD --check` on first M15 publication | **PASS**; exit 0. | Whitespace check; the complete six-path publication diff was reviewed against its manifest. The documentation-only follow-up staged diff is checked again before its push. |
| `npm audit --json --package-lock-only` | **FAIL at default threshold**; exit 1: 8 moderate, 0 high, 0 critical. | `/home/user/m15-audit/2026-10-14_162510_UTC_npm-audit-full.log`; SHA-256 `6bec0cd6ebd1016a0ae74764356ec70e22599bc754da1e55665b2f32463cd3b2`. This is not a clean audit. |
| `npm audit --audit-level=high --json --package-lock-only` | **PASS at high-only threshold**; exit 0, with the same 8 moderate findings. | `/home/user/m15-audit/2026-10-14_162510_UTC_npm-audit-high.log`; SHA-256 `02d3bd963b5a8d2c8ae63135b9b42f92091a875d45466ae8e64647c26bab54be`. Threshold pass is not audit clearance. |
| `npm ls --all --json` in the repository | **PASS**; exit 0, zero reported problems. | `/home/user/m15-audit/2026-10-14_162510_UTC_actual-repo-npm-ls.json`; SHA-256 `8c595de8e67de42ebfb0b4a2c0bd99aba6831fdc430e92becfae29675e12d8d4`. |
| `npm ci --ignore-scripts --no-audit --no-fund` in a fresh external copy, then `node /home/user/Tri-Core-Browser/scripts/dependency-audit.cjs` | **PASS**; install exit 0, audit-script exit 0; 0 informational/low, 8 moderate, 0 high/critical. | Install log `/home/user/m15-audit/2026-10-14_162700_UTC_npm-ci-ignore-scripts.log` (SHA-256 `c21204ef6b13178890d52e1e053a13829277f8fb0785b0d06c91ed1f3109a0f6`); script log `/home/user/m15-audit/2026-10-14_162700_UTC_dependency-audit-script.log` (SHA-256 `d5eb9c44bae45a1605b4f65ab55531b3ccd488b5f21069ab24be72ab525a395a`). The copied lockfile hash matched the repository; lifecycle scripts were disabled and generated JSON/tree stayed external. |
| First dependency-audit-script attempt in a sandbox whose `node_modules` was a symlink | **LOCAL SANDBOX FAILURE**; exit 1 at `npm ls`, reporting extraneous/missing entries. | `/home/user/m15-audit/2026-10-14_162510_UTC_dependency-audit-script.log`; SHA-256 `c956c243bf9942d00b326a3b7c3947b026dcb0a04e94ee2639a37fcaf300fc36`. The same repository's `npm ls` passed in-place and the clean isolated install/script passed; this failed symlink-layout attempt is not counted as a package-vulnerability failure. |
| `package-lock.json` preservation | **PASS — unchanged.** | SHA-256 before/after checks and copied lock: `24708fc5609edbc5eaf4d6ad7f4042dad9f25d3e961de24e44d2ce7c12f522c6`. |
| Local Windows package/runtime/native build | **NOT RUN.** | This environment lacks `pwsh`, CMake, and an Electron executable payload. A prior Electron package-shim probe attempted its normal binary fetch and failed; it was not repeated and no executable was run. Hosted Windows CI is recorded separately in §3–§4. |

The pre-existing ignored M14 outputs were preserved unchanged and not overwritten: repository-root `dependency-audit.json` SHA-256 `52842e9e8e5d77cb5f43624ed95bfda36ba00b0fd349ccfa228ad5867989666d`, `dependency-tree.json` SHA-256 `8c595de8e67de42ebfb0b4a2c0bd99aba6831fdc430e92becfae29675e12d8d4`. The fresh external audit JSON/tree have the same content hashes; they were written under `/home/user/m15-audit/2026-10-14_162700_UTC_dependency-audit-sandbox/`. No package or lockfile change was made. The finding and no-change remediation proposal are in `docs/DEPENDENCY_REMEDIATION_PROPOSAL_M15.md`.

## 6. Images decision and dependency proposal

### Images

The decision note is `docs/IMAGES_FEATURE_DECISION_M15.md`. **Default decision: defer; no implementation.** The original M8/M9 source was not recovered; the available repository has no user-facing Images import/resize/export workflow. If the owner wants restoration, provide the original source for comparison. If new work is desired, explicitly approve the proposed local PNG, CPU-bilinear MVP and its bounds. The note now enumerates candidate file touchpoints, trusted-sender/IPC boundaries, concrete security and quality risks, unit/IPC/Windows package tests, and paths that must remain untouched; it authorizes no code. This is not a restoration and must not be described as FSR, DLSS, AI, GPU, or general webpage upscaling.

### Dependencies

The proposal is `docs/DEPENDENCY_REMEDIATION_PROPOSAL_M15.md`. Current lockfile findings are all development-tooling records for the single moderate `GHSA-hp3w-g68c-fv3c` advisory. npm’s suggested `electron-builder@26.5.0` fix is an out-of-pin downgrade marked semver-major; the registry reports `sprintf-js` latest `1.1.3` and no `1.1.4`. No override, forced downgrade, automatic `npm audit fix`, package change, or lockfile change was made. A supported stable builder-family fix with full Windows packaging regression—or an explicit owner risk disposition—is needed before the dependency gate can close.

## 7. Updated release-gate table — all 20 categories

| # | Gate category | M15 status | Evidence / consequence |
|---:|---|---|---|
| 1 | Fixed-branch ancestry and source-tree match | **PASS — bounded** | Pre-publication remote tree: 84/84 blobs/modes matched; pre-M15 head was 46 ahead / 0 behind. At the first post-push check, the first M15 commit was on the fixed feature branch at 47 ahead / 0 behind; no history rewrite or force push. |
| 2 | Original M8/M9 source and provenance | **NOT RECOVERED** | No original source archive, patch, or Images implementation was recovered. Current branch identity is not proof of M8/M9 fidelity. |
| 3 | README/product-claim review | **PASS — no edit warranted** | README is exact remote blob/hash; it explicitly limits WebGPU/WARP/physical-GPU/DLSS claims and makes no Images or browser-wide-upscaling promise. Older run citation is recorded. |
| 4 | Publication manifest and intended-path scope | **PASS** | Six documentation paths only; initial six-file push plus a two-document follow-up. Complete final 90-path inventory and the ignored/external inventory record hashes, modes, provenance, and dispositions. |
| 5 | Source regression tests | **PASS** | Post-publication `npm test`: 100/100, 0 failures/skips; hosted renderer/dependency job also passed. This is not live GUI/GPU validation. |
| 6 | Renderer production build | **PASS** | Local Vite build and hosted renderer build pass; output outside Git. |
| 7 | JavaScript syntax and YAML/JSON configuration | **PASS** | 31 JavaScript files and all three workflow YAML plus package JSON/lock parse checks passed. |
| 8 | Full dependency audit | **FAIL — 8 MODERATE** | Default audit exits 1; zero high/critical. High-only threshold and clean-sandbox repository audit script exit 0, but findings remain and no dependency change was approved. |
| 9 | Windows x64 portable package build | **PASS — hosted build only** | Push run `38597249592` completed the build and packaged executable validation steps. Local Windows build was not run. Candidate remains explicitly unverified. |
| 10 | Packaged smoke and Level A evidence validator | **PASS — bounded** | Windows packaged smoke and Level A validator steps passed on `38597249592`; physical-GPU-validated portable-distribution assembly was skipped. The validator does not prove physical-GPU acceptance. |
| 11 | Packaged app-owned WebGPU EASU/RCAS outcome | **UNKNOWN** | Level A accepts a verified pass or safe unsupported skip; the diagnostic ZIP was unavailable, so the exact result, adapter, dispatch, and visible-canvas evidence are unknown. |
| 12 | Packaged screenshot-to-D3D12/WARP helper | **PASS — bounded / software-only** | Configured smoke assertions passed in the Windows package job. No continuous page processing, zero-copy path, or physical GPU is established. |
| 13 | Standalone native D3D12 WARP harness | **PASS — software-only** | Push run `38597249390` and PR run `38597256459` passed native configure/build, official EASU/RCAS exercise on WARP, and evidence upload. Not hardware validation. |
| 14 | Physical-GPU Level B acceptance | **NOT RUN** | Push and PR Level B jobs were skipped. Runner-list API returned 403; availability is unknown. No runner was provisioned and no workflow was dispatched. |
| 15 | Code-bearing M15 GitHub artifact metadata | **PASS — metadata only** | Candidate, diagnostics, Linux-check, and WARP artifact IDs/sizes/GitHub digests are recorded in §3 and the external inventory; all were listed unexpired. The follow-up is documentation-only and is logged separately. |
| 16 | Candidate/diagnostic archive bytes and independent integrity | **BLOCKED** | Latest candidate/diagnostics GETs returned exit 1/EOF/0 bytes. No local archive digest, ZIP/CRC validation, inner EXE hash, or diagnostic inspection is possible. |
| 17 | Code signing, binary scan, and source-to-artifact provenance | **UNKNOWN / NOT VERIFIED** | No local executable bytes to check Authenticode/signature, scan, or compare with the source commit. GitHub metadata is not an independent signature or provenance proof. |
| 18 | Images import/resize/export product feature | **NOT IMPLEMENTED — owner decision required** | Decision note defaults to defer; no runtime/UI/dependency changes. Original source recovery or explicit new-scope approval remains required. |
| 19 | DLSS/Streamline and ordinary-page/browser-wide upscaling | **NOT IMPLEMENTED / NOT TESTED** | No integrated DLSS path or arbitrary-page frame path was found; no such product claim is made. |
| 20 | Release eligibility/readiness | **BLOCKED — do not claim readiness** | Artifact integrity, WebGPU outcome, physical validation, dependency disposition, and M8/M9 provenance remain open. No tag, release, merge, or `main` push occurred. |

### Required evidence if a future physical-GPU Level B run is explicitly authorized

This was **not** performed or dispatched in M15. Any later acceptance record must identify the Windows build, host and runner, physical GPU vendor/model/device ID and driver, WebGPU adapter vendor/device/type and non-fallback status, Electron/runtime version, source commit and artifact hashes, display/render/input/output resolutions, shader compilation and EASU/RCAS dispatch counts, correctness fixture and output-image hashes, and any unsupported/safe-skip condition. For performance, record warm-up and measured repetitions, a defined GPU-timing method (or clearly label CPU wall-clock timing), the same-content/resolution baseline, power/display state, variance, and output correctness alongside timings. A successful WARP/software result must never satisfy this physical gate.

## 8. Changes, exclusions, hashes, and next action

### Complete change inventory and exclusions

The final Git tree contains **90 tracked paths**: 84 files already present and verified against the remote feature tree before M15, plus six M12–M15/decision/proposal documents. By top-level area the final tracked inventory is 43 app/renderer/Electron/native/test files, 3 workflow files, 24 documentation files, and 20 root/config/static-asset paths. The 84 pre-existing remote files—including `README.md`, source/tests, workflows, `package.json`, and `package-lock.json`—remain unchanged by this documentation work.

| Inventory class | Count / exact paths | M15 disposition |
|---|---|---|
| Selected tracked documentation | 6: `docs/MILESTONE_12_REPORT.md`, `docs/MILESTONE_13_REPORT.md`, `docs/MILESTONE_14_REPORT.md`, `docs/MILESTONE_15_REPORT.md`, `docs/IMAGES_FEATURE_DECISION_M15.md`, `docs/DEPENDENCY_REMEDIATION_PROPOSAL_M15.md` | Published by the first M15 documentation commit; only M15 report and Images note receive the two-path follow-up. |
| Pre-existing tracked app/source/tests/native | 43 paths across `app/`, `electron/`, `native/`, `src/`, and `tests/` | Remote-identical, not staged for M15. |
| Pre-existing tracked workflows | 3 paths under `.github/workflows/` | Remote-identical; inspected only. No dispatch or workflow edit. |
| Pre-existing tracked docs and root/config/assets | 18 other `docs/` files plus 20 root/config/static paths | Remote-identical, not staged. |
| Ignored local state | `node_modules/`, repository-root `dependency-audit.json`, repository-root `dependency-tree.json` | Preserved; not staged, overwritten, or removed. |
| External generated checks/evidence | `/home/user/m15-audit/` inventories/logs, clean isolated audit sandbox, audit/tree JSON, renderer build output, test/config/syntax logs, index backup, and zero-byte artifact attempt markers | Outside Git; preserved as evidence. No cache or generated binary is in the branch. |
| GitHub Actions artifacts | Candidate/diagnostics/Linux-check IDs from run `38597249592`; WARP artifact ID from `38597249390`; older metadata IDs listed in §3 | Remote metadata only. Candidate and diagnostics local transfers yielded zero bytes; WARP/Linux artifacts were not downloaded. No artifact was uploaded to Git. |

The initial normal push published all six selected docs. The follow-up uses explicit paths `docs/MILESTONE_15_REPORT.md` and `docs/IMAGES_FEATURE_DECISION_M15.md` only; the full staged diff is reviewed and checked before commit/push. No application source, tests, README, workflow, package manifest, lockfile, permission, PR state, release, tag, or remote history rewrite is part of M15. The README's existing, cautious graphics copy is preserved. No candidate was executed.

### Remote publication result

On the first M15 commit, GitHub verified feature head `6fc443a9748b17b5f66fa5f35c22cb4c238cf4dd`; the normal push run `38597249592` and native WARP run `38597249390` succeeded, and the matching PR runs `38597256189`/`38597256459` succeeded with the skips described above. The follow-up is a separate ordinary push to `arena/18bfbe1a-tri-core-browser`; final commit SHA, `git ls-remote` result, PR head/status, compare count, clean worktree, and new Actions results are recorded in `/home/user/m15-audit/2026-10-14_M15_final_evidence.log`. No push to `main`, merge, close, tag, release, permission change, or dispatch occurred.

### Selected existing hashes

| Item | SHA-256 |
|---|---|
| Pre-M15 file manifest | `28ad0d53f98a7be3a797b36c9b01961651a0b024bd72f12a7aa381b10b0b8165` |
| M12 report | `de2473faf820965943fda10b8a1f90872c652b8f71349e9b8414e4dce4c56a6c` |
| M13 report | `bb0a5f9b0b1a6c977af22cbf41382eb9107a548547e8af7bcff47c3bcdda6f05` |
| M14 report | `be041ed069bf8d08d7a3cde7e0265632920f8c890d99cc30be1617bcf0a621f6` |
| `package-lock.json` (unchanged) | `24708fc5609edbc5eaf4d6ad7f4042dad9f25d3e961de24e44d2ce7c12f522c6` |
| Images decision note after follow-up edits | `bca24f512c78de232867cd58cd2659edc45232fb4f8e3823f9c4408b62430eb1` |
| Dependency proposal | `1b1be2d342d0268b2da6a6808d75fefd331310d1b0066ae6c943a58f86a707ed` |

The complete SHA-256 list for all six publication paths is in the external M15 publication manifest. The M15 report’s own hash and the final publication commit/remote verification are recorded outside the report to avoid self-reference.

### Next action

**Obtain the original current-run candidate and packaged-smoke diagnostics ZIPs through an authorized GitHub UI/workspace path and attach the exact files without executing the candidate.** Then independently verify archive size/digest and inspect the diagnostics to resolve the WebGPU pass-versus-safe-skip result. The original M8/M9 source remains a separate recovery request; physical-GPU validation and any Images implementation still require their respective owner decisions and authorized environment.

**Release status remains BLOCKED.**
