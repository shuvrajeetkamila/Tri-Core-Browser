# Milestone 10 report — hosted Windows candidate and source audit

**Date:** 2026-10-13

**Session branch:** `arena/18bfbe1a-tri-core-browser`

**Source revision:** `ba16afd6ca4efeac00a1237e654da777c2eb6d14`
**Decision:** preserve this revision as the provenance baseline for the hosted candidate. Do **not** call it a recovered, feature-complete M8/M9 source tree or a release.

## Executive result

GitHub Actions run [38428201500](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38428201500) completed successfully for a `push` on the session branch at the exact source revision above. The Windows x64 portable executable was built, passed the workflow's existence/size gate, was launched on the hosted Windows runner, and passed the packaged smoke and Level A evidence-validator steps. Its candidate artifact remains available in GitHub Actions and was unexpired at audit time.

The artifact ZIP could not be retrieved into this workspace: the GitHub API request and a separate run-log request both failed with `EOF` after redirect. No ZIP or EXE was saved. Therefore the ZIP digest below is **GitHub artifact metadata, not a locally recomputed hash**; the standalone EXE's exact size and SHA-256, PE contents, and Authenticode status were not independently inspected. The app was **not launched locally**. The optional physical-GPU validation job and strict distribution-assembly/upload steps were skipped.

The available source is the build source for this candidate, but it is not proven to be the user's missing original M8/M9 tree. The described Images UI is absent from the source available here. No source reconciliation, new build, release, or workflow dispatch was performed for this report.

## 1. Run provenance and retained artifacts

Run metadata was read from GitHub. The run's event is `push`; its full branch and SHA match this checkout. The Linux test/build/dependency-audit job and Windows packaged-app job concluded `success`. Windows steps for package build, executable validation, packaged launch, Level A evidence validation, diagnostics upload, and job-summary write passed. The Level B physical-GPU job and the steps named “Assemble portable distribution and reports (physical-GPU validated only)” and “Upload Windows portable package and reports” were skipped.

| GitHub artifact | Artifact ID | Size | GitHub API SHA-256 | Expiration at audit | Local status |
|---|---:|---:|---|---|---|
| `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` | `11828834204` | 109,724,572 bytes | `c02b8c75bb6b086cfe32eca1413d2f386372b5900d57699c79b9064916cc0430` | 2026-11-12 16:13:20 UTC | Unexpired remotely; download failed; no local copy |
| `TriCoreBrowser-Packaged-Smoke-Diagnostics` | `11830246929` | 737,412 bytes | `66ecf85a89220c73ee41083a68a45c3d1a500e244d2b02fe374adce0eb5b5398` | 2026-11-12 16:13:54 UTC | Unexpired remotely; not downloaded |
| `TriCoreBrowser-Linux-checks` | `11828993261` | 10,274 bytes | `e3eac1cf4285aad5186dcbe674e64576b2ff5e7cdac0fe630f1e394b8ae0cd1e` | 2026-11-12 16:10:03 UTC | Unexpired remotely; not downloaded |

The candidate's digest is the **Actions artifact ZIP/archive digest** reported by GitHub metadata. It is not the standalone `TriCoreBrowser.exe` digest. The ZIP bytes were not obtained, so that digest was not recomputed here. The exact EXE SHA-256 and exact EXE byte size are **unknown**. The workflow only establishes that its size check passed the threshold of 30,000,000 bytes; the logged exact byte count was not retrieved. No PE/signature inspection or antivirus scan of the EXE was possible.

The Windows workflow uploads `release/TriCoreBrowser.exe` as the candidate, then runs that executable with `--smoke-test`. That upload configuration identifies the intended artifact contents, but the downloaded archive contents were not inspected. The run and artifact can be opened from the [Actions run page](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38428201500). To continue byte-level verification, download the candidate ZIP and diagnostics ZIP from its Artifacts section and attach both here; do not substitute the ZIP hash for an EXE hash.

## 2. What the Windows evidence does—and does not—prove

### Hosted runtime evidence

The workflow launched the packaged executable on GitHub's hosted Windows runner, waited up to five minutes, and required a zero exit code. The smoke test and Level A evidence validator both passed. The checked-in smoke harness covers Electron startup/browser shell and graphics controls, fullscreen enter/exit and layout restoration, a local HTTP page with JavaScript and WebAssembly (`add(19, 23) = 42`), tab create/select/close, and an HTTPS navigation attempt using normal Chromium certificate validation. The HTTPS result may be reported as `BLOCKED` if the runner cannot reach the site; TLS checks are not bypassed.

This is **hosted Windows smoke evidence**, not a manual end-user test and not a local launch. The local agent environment is Debian 12 x86_64 and cannot launch this Windows EXE. The exact diagnostics and per-stage GPU report were not retrieved, so the latest run's optional aggregate WebGPU result is **UNKNOWN** (the validator permits either an optional `PASS` or a safe `SKIPPED`).

### Packaging and trust

`package.json` configures Electron 44.7.0 / electron-builder for a Windows x64 `portable` target named `TriCoreBrowser.exe`, with ASAR and the app's renderer, Electron main/preload files, assets, diagnostics, and native FSR helper resources. The portable target includes Electron/Chromium; it is not intended to require a separate Chrome or Edge installation. A separate NSIS installer target exists in source but is not the target uploaded by this workflow. The workflow's successful build and smoke do not make this artifact a signed installer or a release.

The Windows packaging script and repository build/license documentation say the package is unsigned and warn that SmartScreen may display its normal publisher warning; no signing step or signing credential is configured in the inspected workflow. Treat the candidate as **unsigned** for handling purposes. Because the actual EXE could not be inspected, its Authenticode status is not independently verified. No malware/antivirus scan was run. A passing `npm audit --audit-level=high` is a dependency audit, not a scan of the Windows binary; the previous source audit recorded moderate dependency advisories.

### Graphics evidence

The separate [run 38428201442](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38428201442) is explicitly named “Build and exercise isolated D3D12 FSR1 harness (WARP only)” and succeeded on the same branch and SHA. This is **software-rendering/WARP-only** evidence. It is not a physical-GPU test and does not prove live FSR operation in ordinary tabs. In run 38428201500, physical-GPU/Level B validation was **skipped**. No physical-GPU result is claimed.

## 3. Available-source feature audit

“Hosted smoke” below means the checked-in packaged smoke path passed on the hosted Windows runner; it is not a local manual test. Source presence alone is not runtime proof.

| Feature | Available source | Milestone 10 evidence / finding |
|---|---|---|
| Browser shell, navigation controls, fullscreen | Present | Packaged startup, browser shell controls, and fullscreen enter/exit are in the hosted smoke path and passed. Not locally launched. |
| Three browser cores and tabs | Three `WebContentsView` cores; each uses its own persistent Electron session partition | Tab lifecycle is in the hosted smoke path. These are separate views/sessions in one Electron/Chromium runtime, **not three independent browser engines**. Session isolation is source architecture, not a complete isolation-security test. |
| Bookmarks, history, home-page preference | Present; stored in one JSON file under Electron user data | Not separately exercised by the packaged smoke test. No cloud sync is present in the inspected source. |
| Downloads | Present; saves to the user's Downloads folder, tracks active downloads, and avoids filename collisions | Source implementation only for this audit; download completion/cancellation/concurrent-download behavior was not established by the hosted smoke. The app does not automatically launch downloaded files. |
| WASM diagnostic | Present | Packaged smoke exercises controlled WebAssembly and checks `19 + 23 = 42`; this is a runtime diagnostic, **not** an image upscaler. |
| User-facing Images UI / image import, preview, resize or export | **Absent from available source** | No Images panel/module, app-owned image picker (`showOpenDialog`), or image-editing flow was found. Internal diagnostic PNGs do not establish supported user image formats or a file picker. A website's own file-input dialog behavior was not tested. Do not claim the EXE has the missing Images UI. |
| AMD FSR1 | Present only in a bundled, app-owned WebGPU game/diagnostic scene and a separate native screenshot diagnostic | The WebGPU path is scene-specific and does not intercept ordinary web pages. Latest packaged per-stage outcome is **UNKNOWN** because diagnostics were not retrieved. The separate WARP run is software-only. Physical-GPU validation is **NOT RUN**. |
| NVIDIA DLSS | Not integrated in available source | The UI documents it as unsupported; no Streamline/DLSS runtime or rendering bridge was found. |
| General webpage upscaling | Absent | Neither FSR nor DLSS is shown to upscale arbitrary pages, video, external applications, or ordinary browser compositor output. Standard Chromium rendering remains the fallback. |

The image data created or displayed by the FSR diagnostics is test evidence, not a customer-facing image-management feature. No claim about image-picker cancellation, supported image formats, or image resizing is justified from the available source or the smoke test.

## 4. Source recovery, tree comparison, and reconciliation boundary

The original M8/M9 working tree, archive, and patch were not present in this checkout or the searched recovery locations. The reported M8 patch digest cannot reconstruct its contents. `git fsck --full --no-reflogs --unreachable` found no unreachable Git objects, and the bounded `/home/user` search found no M8/M9 archive, bundle, or patch. The current M9 report also records that the prior initial checkout was only the small `e27cb207` baseline and that the full app tree was made available from another branch; it explicitly disclaims exact recovery.

The source was not reset or refetched for this comparison. The available source baseline is `3b05d2f9070732b36573016d7dbd3c250289839b` (previously the `arena/66...` branch). Comparing that commit to this session revision shows exactly three changed paths:

- Added `docs/MILESTONE_9_REPORT.md`.
- Modified `scripts/validate-packaged-smoke.cjs` to require and validate the packaged smoke log while allowing an explicit safe no-adapter skip.
- Modified `tests/validate-packaged-smoke.test.js` with regression coverage for the smoke-log requirement.

The other 75 tracked source-branch paths are identical. This is a safe delta relative to the **available** source baseline only; it cannot reveal untracked files or conflicts from the unavailable original M8/M9 tree. The validator repair is an M8-equivalent implementation based on the supplied description, not a recreation of the original patch or hash. It hardens CI acceptance; it adds no end-user feature.

Relative to `main` at `e27cb207`, this branch has 77 changed paths (76 additions and one README modification in the branch history). The session branch is 43 commits ahead of `main` and 3 ahead of the available `arena/66...` source branch; no refs were fetched or moved. The live working tree was clean before this report; the README currently has no working-tree diff. The separate README edit mentioned in the handoff and any recovery copy are not available in this checkout, so no README restoration or overwrite was attempted. A separate remote `arena/9b...` tree was inspected by GitHub's tree API without fetching/moving refs; its small file inventory has no image-named UI file and does not establish that it is the missing M8/M9 source.

## 5. Canonical-source recommendation and safe reconciliation plan

1. **For reproducing the hosted candidate:** use `ba16afd6ca4efeac00a1237e654da777c2eb6d14` as the exact provenance baseline. The successful run is tied to this source SHA.
2. **For the intended M8/M9 product:** do not yet designate this as the feature-complete canonical tree. The original tree is unavailable and the described Images feature is missing from the available source. Preserve this revision as the buildable baseline, not as proof of exact recovery.
3. **When the original is recovered:** keep an untouched copy of its full tree/archive and any README/recovery material; compare paths and file contents against `ba16afd` without replacing either tree. Review the known validator/test/report delta above separately. Do not merge an unseen Images implementation by guessing.
4. **If no original can be recovered:** treat Images UI as new, explicitly scoped development work and authorize/review its design and tests as such. Do not describe it as restored M8/M9 functionality.
5. Keep generated `dist/`, `node_modules/`, build outputs, and release artifacts out of source reconciliation unless explicitly required. They are not evidence of the missing tree.

## 6. Checks and actions

- GitHub run `38428201500`: Linux tests/build/high-severity dependency audit and Windows packaged build/smoke/Level A validation: **PASS**.
- Local `npm test -- --test-reporter=spec`: **100/100 PASS** on the available source. This is source-test evidence, not proof of the missing source or binary.
- Separate native run `38428201442`: D3D12 FSR1 WARP software test: **PASS**; physical GPU: **NOT RUN**.
- Local artifact extraction, standalone EXE hash, PE/signature inspection, and binary scan: **NOT POSSIBLE** because artifact/log downloads failed with `EOF` after redirect. No signed redirect was retained in this report.
- Local Windows launch: **NOT RUN** (Debian 12 environment). Hosted Windows launch: **PASS**.
- Original M8/M9 source recovery/reconciliation, Images feature verification, new Windows build, publication/release, and workflow dispatch: **NOT DONE**.

### User action required to finish byte-level inspection

Open [run 38428201500](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38428201500), download `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` and `TriCoreBrowser-Packaged-Smoke-Diagnostics` from the Artifacts section, and attach the ZIPs here (or provide an authorized accessible file path). The archive and executable must be hashed separately. To resolve source fidelity, also provide the original M8/M9 tree/archive/patch and the missing README recovery copy if it exists. No release or reconciliation should proceed on assumptions.
