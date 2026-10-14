# Milestone 12 audit — working baseline established; recovery and release gates remain blocked

**Audit date:** 2026-10-14
**Fixed branch:** `arena/18bfbe1a-tri-core-browser`
**Report base:** `61cf63a689642bbe6906062c4b18977872d840aa` (`docs: finalize M11 release and recovery status`)
**Decision:** keep this as the provisional, reproducible forward-work base. It is **not** authenticated as the original M8/M9 source. Do not release the candidate binaries on current evidence.

This report answers the 13 audit questions below. Status words describe evidence, not intent: **PASS** is supported by an executed check; **SOURCE ONLY** means code exists without corresponding runtime proof; **SKIPPED/NOT RUN/BLOCKED/UNKNOWN** are not passes.

## Executive result

- Local `HEAD` and the remote fixed-branch head both equal `61cf63a…`; the M12 inventory began with a clean worktree. All 78 tracked M10 source files at `ba16afd6ca4efeac00a1237e654da777c2eb6d14` are byte/mode-identical in the current tree. The six paths added since `ba16afd` are M10/M11 reports only. This makes `61cf` a defensible working base, **not proof of M8/M9 fidelity**.
- The original M8/M9 tree, patch, and recovery bundle remain **NOT RECOVERED**. A newly inspected unreachable Git blob is an earlier M11 recovery-audit document, not application source; its exact bytes were copied outside the repository and preserved.
- Both distinct candidate Windows ZIP requests returned **0 bytes / EOF after redirect**. GitHub’s recorded archive sizes and SHA-256 values remain metadata only; neither archive nor EXE was independently verified. Do not repeat these two requests.
- The Images UI/file workflow is **absent**. No image picker/editor/import/resize/export module or Images IPC was found. It is not safe to call new implementation a restoration; the exact new-feature plan and blockers are in answer 6.
- FSR evidence remains separated: the packaged `capturePage()`→PNG→D3D12 WARP diagnostic **PASS (software only)**; the native synthetic WARP harness **PASS (software only)**; the bundled WebGPU FSR scene’s optional current-run outcome is **UNKNOWN** (`PASS` versus safe `SKIPPED`) because its report was not retrieved; physical-GPU validation is **NOT RUN**. None proves ordinary-page upscaling.
- Local source tests/build and the current-head hosted Level A Windows run passed. The strict physical-GPU and distribution steps were skipped. Binary bytes, Authenticode, and malware status are unverified; no release is approved.
- This file is the only M12 repository change. Work remains local/unpublished: no source edit, staging, commit, push, workflow dispatch, tag, or release was made.

## 1. What is the established baseline?

**PASS — provisional working/report base.** The local branch is `arena/18bfbe1a-tri-core-browser` at `61cf63a689642bbe6906062c4b18977872d840aa`; the independently queried remote head matches. `main` remains `e27cb207d6be86a346420901a979b831cf849c00`.

The current tree contains 84 tracked paths: the 78-path M10 tree plus six M10/M11 documentation files (`MILESTONE_10_REPORT.md` and five M11 reports/status documents). `git diff ba16afd..61cf63a` has no runtime-source changes. The local report is written against this exact current head so its M12 findings do not silently modify the M10 build source.

**Boundary:** `61cf` is reproducible relative to the known M10 source and current remote branch. The missing original M8/M9 tree has not been authenticated or reconstructed; do not call this the canonical, feature-complete original.

## 2. Was the README and existing work preserved?

**PASS — current README content is preserved in the working base.** `README.md` differs from `main` in the available M10 history by 94 insertions and one deletion. Its blob ID at `ba16afd` and current `HEAD` is the same (`dd4fbc85161ccac874739350a6764630ef56c873`); there is no M10-to-current README diff. The README edit recorded in M11 is therefore present in the established source tree, not an uncommitted M12 edit. The M12 audit did not restore, replace, or rewrite it.

At M12 inventory time there were no staged changes, tracked modifications, or non-ignored untracked work. The 78 source files M11 recorded as untracked in an earlier checkout had already been compared to the M10 tree and are tracked in the present base. No such files were removed in M12. The later `npm ci` created only ignored `node_modules`; the renderer build output was placed outside the repository.

A read-only `git fsck --full --no-reflogs --unreachable` found one object, which corrects the earlier M11 audit’s “no unreachable objects” statement:

- Git object `78b0b4a7b7076f2d0190d6073300fb7ae6bfe2a7`, type `blob`, 9,791 bytes.
- Inspection identified it as an earlier **Milestone 11 recovery-audit Markdown document**, not an M8/M9 source file or README copy.
- Exact content was copied without changing Git objects to `/home/user/m12-audit/unreachable-blob-78b0b4a7b7076f2d0190d6073300fb7ae6bfe2a7` (mode 600); content SHA-256: `3a906dcb60c675b58ff97ee629b394b20f993e307792789ff8c42934bd6dc1bc`.

This orphaned report is preserved recovery material, but it does not resolve source recovery. No object was pruned, moved, or written into `.git/lost-found`.

## 3. Was the original M8/M9 source recovered?

**NO — NOT RECOVERED.** The M8/M9 working tree, original patch contents, and source/recovery archive were not found in the available workspace, branch trees, history, or retained Actions artifact-name inventory. The previously supplied patch digest cannot recreate missing patch contents. The single unreachable blob described above is an M11 report, not product source.

Available-tree comparisons do not substitute for the missing original:

- Current `61cf` vs M10 source `ba16afd`: all 78 source paths are identical; six documentation-only files were added.
- `arena/66abfdc9-tri-core-browser` vs `ba16afd`: 75 paths match; the two differences are `scripts/validate-packaged-smoke.cjs` and its test; `docs/MILESTONE_9_REPORT.md` is M10-only.
- `arena/9b1d75c5-tri-core-browser`: 18 paths total, 8 identical and 10 modified against the M10 tree; 60 M10 paths are absent, with no branch-only image UI path identified.

The 150 retained Actions artifact records previously inventoried included no M8/M9/recovery/source/image-named bundle. Older Windows artifacts are packaged binaries, not a source-tree recovery. No alternate branch has been relabelled as original. If the exact M8/M9 archive/tree/patch or README recovery copy exists outside this workspace, it must be supplied for an untouched, file-by-file comparison.

## 4. Were the two candidate Windows ZIPs retrieved and independently verified?

**BLOCKED — both bounded requests returned no archive bytes.** The two distinct artifacts were each requested once through the authenticated GitHub API; both requests ended in `EOF` after redirect, received zero bytes, and have no locally observed SHA-256. Their clean destinations contain 0-byte response markers and sanitized attempt logs. No request will be repeated.

| Candidate | GitHub run / source | Artifact ID | GitHub-declared ZIP size | GitHub-declared ZIP SHA-256 | M12 retrieval result |
|---|---|---:|---:|---|---|
| Original M10 build candidate | [run 38428201500](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38428201500) / `ba16afd6…` | `11828834204` | 109,724,572 bytes | `c02b8c75bb6b086cfe32eca1413d2f386372b5900d57699c79b9064916cc0430` | **FAIL — 0 bytes; EOF after redirect; unexpired remotely** |
| Later current-head candidate | [run 38550224302](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38550224302) / `61cf63a…` | `11886880645` | 109,724,572 bytes | `7436b6850164ce7742aece8adbd3b7b2e7b257de39f9afd67dad5df9c627dd24` | **FAIL — 0 bytes; EOF after redirect; unexpired remotely** |

The metadata shows two different ZIP digests; neither is a locally computed digest, and neither is an EXE hash. No candidate bytes were available for ZIP inventory, separate EXE hashing, PE inspection, Authenticode verification, or binary scanning. Attempt records are preserved at `/home/user/m12-artifacts/original-m10-38428201500/` and `/home/user/m12-artifacts/later-candidate-38550224302/`.

## 5. What browser capabilities are present and what was actually tested?

| Capability | Source finding | Evidence/status |
|---|---|---|
| Electron/Chromium browser shell, navigation controls, fullscreen, three cores and tab lifecycle | **PRESENT.** Three sandboxed `WebContentsView`s use separate persistent session partitions; they are three views/sessions in one Electron/Chromium application, not three independent browser engines. | Current-head hosted Windows run passed executable validation, packaged smoke, and Level A evidence validation. Local GUI launch **NOT RUN**. |
| Remote-page security boundaries | **PRESENT in source:** context isolation, Node integration disabled, sandbox and `webSecurity` enabled; site permission request/check handlers deny by default; navigation accepts web URLs. | Static tests and packaged smoke assertions pass; this is not a complete security certification. |
| Bookmarks/history/settings/downloads | **PRESENT in source.** Download handling sanitizes names and picks a suffix when a filename already exists. | Not all persistence, cancellation, race, or file-dialog behaviors were exercised by the packaged smoke. The download suffix logic is not an Images save implementation. |
| Website `<input type="file">` behavior | Chromium may handle website file inputs through its normal dialog path; TRI-CORE has no app-owned Images picker in source. | **NOT RUN / UNKNOWN** for packaged dialog behavior. |
| User-facing Images utility | **ABSENT** — no Images UI, import/preview/resize/export flow, `showOpenDialog`/`showSaveDialog` image handler, or Images preload API. | **NOT IMPLEMENTED / NOT TESTED.** Diagnostic PNGs are not an image utility. |
| WASM arithmetic diagnostic | **PRESENT.** The controlled module compiles/executes and checks `19 + 23 = 42`. | Packaged smoke and local tests pass; this is a runtime diagnostic, not image processing/upscaling. |
| FSR and DLSS | Details are separated in answers 7–11. | A mode/control label is not proof of backend initialization or frame processing. |
| Ordinary webpage upscaling | **ABSENT.** Standard pages continue through Chromium. | No all-page, video, DRM, external-app, or general compositor upscaling evidence. |

The current packaged run’s common Level A validator checks browser-independent acceptance and the separately labelled WARP PNG evidence. The checked-in smoke harness includes a normal-certificate-validation HTTPS probe; external connectivity can be reported as **BLOCKED** without bypassing TLS. The per-run diagnostic bodies were not retrieved, so no individual HTTPS result is asserted here.

## 6. Is Images implemented, and what is the safe code-change plan?

**ABSENT; not implemented in M12.** The available source has no user-facing Images panel/module, image picker, image decode/preview/resize/export flow, or app-owned image IPC. Its PNG files belong to FSR diagnostics. Normal website file-input dialog behavior is not evidence for an Images feature. The current browser download suffix behavior does not prove safe output collision handling for an image save.

Implementing a guessed replacement now would be **new product work**, not restoring M8/M9. In addition, this Debian host has no usable Electron runtime/Windows GUI for packaged native-dialog verification. The safe, narrowly scoped plan for a separately authorized Images feature is:

1. Add an opt-in Images panel in `index.html`, controls/styles in `src/styles.css`, and renderer orchestration in `src/main.js`; keep it isolated from website tabs and remote content.
2. Add a pure, testable `src/image-resizer.js` implementing conventional **CPU bilinear interpolation** on decoded RGBA pixels, with alpha handled consistently. Initial scope: user-selected **PNG input only**, fixed **2×** resize, **PNG output only**, local processing only. Do not call it FSR, DLSS, AI, neural, or GPU upscaling.
3. Add only `selectPng()` and `savePng()` to the existing isolated `electron/preload.cjs` bridge. Implement sender-validated handlers in `electron/main.cjs` using native open/save dialogs; restrict them to the trusted shell `webContents`, never expose filesystem paths or Node APIs to remote `WebContentsView`s.
4. Bound work before allocation: propose a 25 MiB compressed-input cap, 8,000,000 input pixels, 20,000,000 output pixels, 16,384 maximum output dimension, and 80 MiB encoded-output cap. Verify PNG signature/IHDR before decode, then require decoder dimensions to match; reject malformed, wrong-format, truncated, or over-limit files. Release bitmaps/canvases/buffers in `finally` paths and surface allocation/decode/encode failures.
5. Treat chooser cancellation as `{status: "cancelled"}` with no output and no loss of the existing preview. Save with exclusive creation (`open(..., "wx")`); if the chosen path already exists, never overwrite or silently rename it—return a collision status and ask the user to choose again. After writing, sync/close, read back, verify PNG signature/dimensions and SHA-256/byte integrity; remove only a partial file created by this attempt if validation fails.
6. Add unit/bridge/UI tests for bilinear pixels and alpha, exact dimensions, invalid format/header, corrupt decode, byte/pixel/dimension limits, cancellation at both dialogs, save collision/no-overwrite, write/permission errors, cleanup, and output read-back/hash mismatch. Add a Windows packaged smoke with a generated PNG fixture that opens, resizes, saves, reopens/verifies dimensions/hash, and separately cancels both dialogs.

**Blockers to claim it as restored or runtime-verified:** original M8/M9 source/acceptance fixtures are unavailable; no Images implementation exists on this base; no local Electron binary could be launched, no `pwsh`/CMake is installed, and a real Windows packaged-dialog test was not run. Proceed only as an explicitly new feature after source recovery or owner approval, then pass the above tests and packaged Windows smoke. Until then, make no Images capability claim.

## 7. Are the AMD FSR1 source and attribution present?

**PASS — source and notice audit.** The project pins the upstream `GPUOpen-Effects/FidelityFX-FSR` source at commit `a21ffb8f6c13233ba336352bdff293894c706575`. `native/fsr1-poc/third_party/amd/UPSTREAM.md` records copied shader inputs, upstream hashes, and attribution; `FSR1_LICENSE.txt` retains the AMD MIT notice; the `ffx_a.h` third-party attribution is retained; `app/diagnostics/fsr1-webgpu.js` contains an AMD license notice for its WGSL adaptation. No proprietary AMD runtime is bundled. This confirms notices/source provenance in the checked-in tree, not shader conformance, product qualification, or performance.

## 8. What do the separate FSR paths prove?

| Path | Source boundary | M12 evidence/status |
|---|---|---|
| Bundled live WebGPU scene | The bundled local game-like page owns a lower-resolution WebGPU texture, runs separate EASU and RCAS WGSL compute passes, and presents to its own visible canvas without CPU pixel readback in the processing loop. It is not connected to ordinary tabs. | Source **PRESENT**. Current-head Level A run and validator **PASS**, but optional WebGPU could be either genuine `PASS` or safe no-adapter `SKIPPED`. Because the per-stage report was not retrieved, runtime outcome is **UNKNOWN**; physical GPU is **NOT RUN**. |
| Screenshot diagnostic | Exact bundled WebGL2 test scene → `WebContentsView.capturePage()` PNG/readback → separate native D3D12 FSR1 helper → output PNG/reference. | Packaged Level A validator **PASS** enforces three changing frames at three resolutions, PNG/report validation, and WARP software classification. **Diagnostic-only; WARP is software**, not a live compositor path or physical GPU. |
| Native synthetic-pattern harness | Standalone D3D12 helper owns its device/resources and processes its deterministic synthetic input on WARP. | [Run 38550224344](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38550224344) **PASS** for the Windows native build and synthetic EASU+RCAS WARP regression. Software-only and separate from both browser paths. |
| Physical GPU | Requires a named non-software adapter, active driver, strict reports, and output evidence. | **NOT RUN.** Level B was skipped; no GPU runner was registered or provisioned. |

A successful WARP diagnostic does not prove WebGPU execution, physical-GPU support, arbitrary-page processing, image-quality improvement, or performance gain. Queue-completion wall time is not a GPU timestamp or FPS claim.

## 9. What do WASM and ordinary pages do?

**WASM:** controlled V8/WebAssembly compile/instantiate and arithmetic `19 + 23 = 42`; the app’s WASM mode explicitly reports no upscaling. It does not resize images, process frames, accelerate a game, or establish a GPU path.

**Ordinary pages:** remain standard Chromium-rendered `WebContentsView`s. A selected FSR/DLSS/Hybrid control does not create a backend; the controller safely falls back when an actual compatible initialized integration is absent. The bundled game-owned WebGPU scene is not included in automatic ordinary-tab processing. No arbitrary webpage, video, DRM/protected content, cloud stream, external game, or compositor upscaling is implemented or claimed.

## 10. Is browser-wide FSR feasible through the current app boundary?

**NOT IMPLEMENTED; no verified general-page route.** This app owns ordinary pages as separate `WebContentsView`s but its current code has no page GPU texture, native swap-chain, depth/motion data, or compositor synchronization bridge. Its `capturePage()` call returns screenshot evidence through `NativeImage`/PNG; that readback path cannot be described as live, zero-copy compositor processing.

Electron 44.7.0 documents `sharedTexture` import/send APIs as **experimental** and describes shared-texture rendering for an **offscreen** BrowserWindow. The upstream shared-texture end-to-end spec itself is gated to macOS arm64. This establishes a research candidate, not a verified Windows integration for TRI-CORE’s existing visible tabs. A product proof would still need resource lifetime/release and GPU synchronization, input/navigation/accessibility, visible presentation, resize/occlusion/device-loss behavior, security review, packaged Windows testing, performance measurement, and upgrade maintenance.

A transparent all-page requirement likely requires a maintained Chromium/Viz integration or a separately proven offscreen architecture. Do not simulate it with page injection, memory inspection, overlays, or screenshot loops. A dedicated user-selected image/local-video viewer is a narrower and more feasible future scope; it still needs the explicit input/output ownership and safety gates in answer 6.

## 11. Is NVIDIA DLSS implemented or ready to license/package?

**NO — DLSS Super Resolution and Frame Generation are NOT IMPLEMENTED / NOT TESTED.** No NVIDIA Streamline/DLSS runtime, feature plugin, NVIDIA application ID/engine metadata, game-owned D3D12/Vulkan renderer, or genuine DLSS output is present. Vendor detection or a UI control is not support.

DLSS-SR and DLSS-FG are distinct integrations with separate renderer inputs and lifecycle requirements; FG additionally needs frame-generation/present integration and feature-specific coordination. The repository’s prior technical audit points to the Streamline guides and a dated 2023 RTX SDK license document; that old document is not a substitute for reviewing the exact license shipped with a future selected runtime. No proprietary NVIDIA SDK component was downloaded, no license terms were accepted, and no binary was bundled. Do not claim DLSS, and do not distribute any future runtime without exact-license review, required authorization/identifier, production-binary authenticity checks, and supported physical NVIDIA-hardware evidence.

## 12. Are the candidate artifacts release-ready from a security/trust perspective?

**NO — release BLOCKED.**

- Current `npm audit --audit-level=high`: **PASS at the configured threshold only**, with **8 moderate, 0 high, 0 critical** findings. The reported chain includes `sprintf-js@1.1.3` (moderate denial-of-service risk via unbounded precision) through `roarr`/`global-agent`/`@electron/get`/the builder dependency tree. npm proposes a force/breaking builder change; no forced downgrade, override, or lockfile edit was applied. npm audit is not an EXE malware scan.
- Workflow actions are pinned to commit SHAs; ordinary build permissions are read-only. The release workflow gates distribution/publication on the strict required physical-GPU validation and defaults manual publication to false. Level A intentionally labels and uploads an **unverified smoke candidate** before its smoke; for the current run, executable validation/smoke/Level A evidence passed, while physical-GPU validation and portable-distribution assembly/upload were **SKIPPED**.
- Packaging documentation says the Windows executable is unsigned; no signing step, Authenticode verification, malware scan, or artifact-attestation step was found for these candidates. The exact candidate bytes were unavailable, so exact signature status is **NOT INDEPENDENTLY INSPECTED**. No third-party binary scanner was used.
- The archive digests in answer 4 are GitHub metadata, not local verification. Candidate EXE hashes, PE/package contents, and any candidate-side checksum manifest remain **UNKNOWN**. The `SHA256SUMS.txt` created by the strict distribution script is not evidence for these unverified Level A candidate artifacts.
- No M12 release, tag, workflow dispatch, runner provisioning, or permission change was made.

Do not publish until the exact archive/EXE bytes and provenance are independently verified, all artifact hashes and contents reconcile to the source, appropriate signing and approved binary-security checks are completed, the strict physical-GPU/runtime gate passes where required, and the moderate dependency issue has an owner-reviewed disposition.

## 13. What safe tests ran, and what remains to be done?

| Check | Result | Scope/limit |
|---|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | **PASS** — 298 packages installed | Lifecycle scripts were intentionally skipped; this did not install the Electron binary. Lockfile unchanged. |
| `npm test` | **PASS — 100/100** | Node source/unit/static tests; not a packaged app or WebGPU runtime test. |
| `npm run build -- --outDir /home/user/m12-audit/m12-renderer-build` | **PASS** — Vite 8.3.4, 11 modules | Output is outside the repo; renderer build only. |
| `node --check` | **PASS — 31 JavaScript/CommonJS files** | Syntax only. |
| Parse `build.yml`, `release.yml`, `fsr1-native-poc.yml`, and `package.json` | **PASS** | Syntax/config parse only; no workflow was dispatched. |
| `npm audit --audit-level=high` | **PASS — threshold only** | 8 moderate; 0 high/critical. Not a malware scan. |
| GitHub current-head run `38550224302` | **PASS** | Source `61cf63a…`; Linux tests/build/audit and Windows executable validation, packaged smoke, Level A evidence validator passed. Level B and physical-GPU distribution steps **SKIPPED**. |
| GitHub native WARP run `38550224344` | **PASS — software-only** | Windows synthetic native FSR1 harness on D3D12 WARP. |
| Local Electron launch / Windows package build | **NOT RUN / BLOCKED** | Electron install was intentionally `--ignore-scripts`; an `electron --version` probe attempted its normal binary fetch and failed with `TypeError: fetch failed`. `pwsh` and CMake are absent on this Debian host. No local GUI or native-dialog runtime test. |
| Physical-GPU Level B / browser-wide FSR / DLSS / Images packaged smoke | **NOT RUN / NOT IMPLEMENTED** | Requires source/product work and the appropriate Windows runtime/hardware; no runner was provisioned. |
| Candidate ZIP/EXE byte-level inspection | **BLOCKED** | Both ZIP requests returned zero bytes; no local hashes or binary inspection. |

**Safe next actions:** obtain the original M8/M9 tree/archive/patch if it exists; attach the two exact candidate ZIPs through an authorized workspace path for separate ZIP and EXE hashing; treat Images as new work only after owner approval and run its unit plus Windows packaged dialog tests; run Level B only on an already authorized physical-GPU runner; resolve dependency/signing/artifact-security gates before any publication. Until then, keep the release blocked and this report local/unpublished.

## Source and evidence references

- Project architecture and acceptance gates: [`BROWSER_FRAME_UPSCALING_DECISION_RECORD.md`](BROWSER_FRAME_UPSCALING_DECISION_RECORD.md), [`GAMING_UPSCALING_IMPLEMENTATION_PLAN.md`](GAMING_UPSCALING_IMPLEMENTATION_PLAN.md), [`BUILD_WINDOWS.md`](BUILD_WINDOWS.md), [`FSR1_WEBGPU_ACCEPTANCE_LEDGER.md`](FSR1_WEBGPU_ACCEPTANCE_LEDGER.md), and [`TEST_RESULTS.md`](TEST_RESULTS.md).
- Electron 44.7.0 APIs: [WebContents](https://github.com/electron/electron/blob/v44.7.0/docs/api/web-contents.md), [sharedTexture (experimental)](https://github.com/electron/electron/blob/v44.7.0/docs/api/shared-texture.md), [offscreen rendering](https://github.com/electron/electron/blob/v44.7.0/docs/tutorial/offscreen-rendering.md), and [upstream shared-texture spec](https://github.com/electron/electron/blob/v44.7.0/spec/api-shared-texture.spec.ts).
- AMD attribution and pinned upstream: [`native/fsr1-poc/third_party/amd/UPSTREAM.md`](../native/fsr1-poc/third_party/amd/UPSTREAM.md), [`FSR1_LICENSE.txt`](../native/fsr1-poc/third_party/amd/FSR1_LICENSE.txt), and [FidelityFX-FSR commit `a21ffb8f6c13233ba336352bdff293894c706575`](https://github.com/GPUOpen-Effects/FidelityFX-FSR/tree/a21ffb8f6c13233ba336352bdff293894c706575).
- NVIDIA reference material already recorded in the decision record: [Streamline](https://github.com/NVIDIA-RTX/Streamline), DLSS-SR/FG guides, and the dated RTX SDK license link. No SDK binary was fetched or licensed in M12.
