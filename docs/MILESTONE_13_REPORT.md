# Milestone 13 audit — recovery, feature map, and graphics evidence

- **Date:** 2026-10-14 (Asia/Kolkata)
- **Status:** Audit/report only; original M8/M9 source and Images feature remain **NOT RECOVERED**. No replacement feature was implemented. **Physical-GPU validation: NOT RUN. No release.**
- **Scope:** Read-only source/recovery review, bounded artifact retrieval, source tests/build/security checks, and a local-only report. This report does **not** establish release readiness.

## Executive result

- The checked-in source context was verified against the fixed remote branch tree `61cf63a689642bbe6906062c4b18977872d840aa`; this does not authenticate it as the missing M8/M9 source. The described user-facing Images workflow was not found in the available source or inspected recovery branches.
- One bounded retrieval was attempted for each of three current-run Windows artifacts. Each ended with EOF after redirect and left a zero-byte file. The Windows executable, diagnostics, and WARP artifact contents could not be inspected or locally hashed.
- Current hosted Windows packaging/smoke and Level A evidence-validation steps report success. The optional WebGPU FSR result remains **UNKNOWN** because the diagnostic artifact is unavailable. The separate D3D12/WARP job reports success but is software-only. The Level B physical-GPU job was skipped; physical-GPU acceptance is **NOT RUN**.
- Local `npm test` passed **100/100**; the renderer build, 31-file JavaScript syntax check, YAML/JSON parsing, and high/critical-threshold npm audit passed. The dependency audit still reports **8 moderate** advisories.
- No repository source, README, prior report, user artifact, remote ref, or release was changed. This report is a new local untracked file. The pre-existing modified `README.md` and existing untracked work were preserved.

## 1. Source context and preservation

The active branch remains `arena/18bfbe1a-tri-core-browser`. The local shallow/grafted Git `HEAD` is `e27cb207d6be86a346420901a979b831cf849c00`; the verified remote fixed-branch source is `61cf63a689642bbe6906062c4b18977872d840aa`. The 84 tracked source files in that remote tree match the local files by mode and Git blob ID. No checkout, reset, index update, staging, commit, push, rebase, tag, PR operation, or workflow dispatch was performed.

Before this report, the worktree had one tracked modification (`README.md`) and 83 existing untracked files. They were not edited, deleted, moved, or overwritten. `node_modules/` was absent at inventory time and was created as an ignored local dependency-install tree for checks; `package-lock.json` remained byte-identical (SHA-256 `24708fc5609edbc5eaf4d6ad7f4042dad9f25d3e961de24e44d2ce7c12f522c6`). The renderer build output was directed outside the repository. No `dist/` or native build output was created in the worktree.

The M13 report path was confirmed absent before writing. It is local-only and has not been staged or published. Earlier records remain unchanged: [M11 source recovery](MILESTONE_11_SOURCE_RECOVERY.md), [M11 recovery audit](MILESTONE_11_RECOVERY_AUDIT.md), and [M12 report](MILESTONE_12_REPORT.md).

## 2. M8/M9 recovery and Images decision

**Exact original M8/M9 source/patch: NOT RECOVERED. Described Images feature: NOT FOUND in available source.**

Recovery checks covered the local branch/reflog/object database, a bounded name-only workspace search, current GitHub branch/tag/PR metadata, recursive trees for the fixed branch and two candidate recovery branches, and all retained Actions artifact names. No original M8/M9 source archive, patch, snapshot, bundle, or image-feature source was found. `git fsck --full --no-reflogs --unreachable` returned no unreachable objects; the M12-referenced object is absent from the current clone. Prior M11 recovery records also directly inspected the small `arena/9b1d75c5-tri-core-browser` branch's UI/main files without finding an Images picker/editor flow.

Read-only GitHub metadata showed the fixed branch at `61cf63a…`, `arena/66abfdc9-tri-core-browser` at `3b05d2f9070732b36573016d7dbd3d250289839b`, and `arena/9b1d75c5-tri-core-browser` at `1d61c8d79a0b346ddddd3322caa86e3c6ed46e66`. The latter candidate trees and the fixed tree had no image/images/resize/upscale/file-picker/file-dialog paths. PR #1 remains open from the fixed branch to `main`; no PR action was taken. Historical alpha tags/releases and packaged binaries are not source-tree recovery.

The available `index.html`, `src/main.js`, `electron/main.cjs`, and `electron/preload.cjs` contain no app-owned Images panel/module, native file picker, image import/export IPC, user-image resize flow, or image-file input. `createImageData`/`putImageData`, screenshots, PNG previews, and readbacks belong to the controlled FSR diagnostics—not a general Images feature. Websites may independently use Chromium file inputs; that is not an app-owned image workflow and was not tested in the packaged Windows application.

**Decision:** do not implement or label a guessed feature as restoration. No Images runtime code was added. A proposed new-feature plan appears in §8; implementation requires explicit owner approval.

## 3. Current Windows Actions evidence and artifact retrieval

The current push run is [38550224302](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38550224302), for source `61cf63a…`.

| Artifact | ID | GitHub-declared ZIP size | GitHub-declared SHA-256¹ | One M13 retrieval attempt |
|---|---:|---:|---|---|
| `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` | `11886880645` | 109,724,572 bytes | `7436b6850164ce7742aece8adbd3b7b2e7b257de39f9afd67dad5df9c627dd24` | EOF after redirect; 0 bytes |
| `TriCoreBrowser-Packaged-Smoke-Diagnostics` | `11886696126` | 732,049 bytes | `3a53342fc6608044f08fcb5f3d5faa54068938126ed0a0d0d006a385b8efbb79` | EOF after redirect; 0 bytes |
| `TriCore-FSR1-D3D12-WARP-POC` (run `38550224344`) | `11886655622` | 59,482 bytes | `990c1ab9801cac8781d5f05d10e4c90b1900f6262c5a68837c9c7218f5b73f90` | EOF after redirect; 0 bytes |

¹ These are GitHub artifact-metadata digests, **not** locally verified archive or executable hashes. Each artifact received exactly one bounded attempt (120-second timeout, shell file-size limit); no retry or extraction was performed. No Windows binary was executed or sent to a third-party scanner. Saved attempt records contain no signed download URL or credential. The prior retrieval summary's conversion of `ulimit -f 240000` to a “120 MB” limit is unverified and is not relied on.

Current run/job metadata and step conclusions:

- Windows x64 build/smoke job `115806084996`: **success**. Dependency install, automated tests, high/critical-threshold audit, Windows build/executable validation, packaged smoke, and Level A packaged-evidence validation all report success. The diagnostics upload succeeded. The portable distribution assembly and Windows portable-package upload were **skipped**.
- Renderer/WASM/dependency job `115806085308`: **success**; tests, renderer build, and audit steps report success.
- Level B required physical-GPU job `115806086735`: **skipped**.
- Separate D3D12/WARP harness job `115806085078`: **success**; native configuration/build and WARP exercise steps report success. This is software rendering only.

The Windows job-level success is not a substitute for inspecting its diagnostics. In particular, Level A permits a correctly evidenced optional WebGPU result to be either `PASS` or safe `SKIPPED`; the exact current-run WebGPU outcome remains **UNKNOWN**. The WARP artifact's report/image bytes likewise remain unavailable. No GitHub-declared hash above has been recomputed locally.

The retained metadata inventory and retrieval logs are under `/home/user/m13-audit/` (not in Git): `phase2_actions_artifacts.tsv`, `phase2_artifact_retrieval_summary.txt`, and `artifacts/`. A recovery/tree summary is `phase2_source_recovery.txt`. Do not interpret its artifact-size metadata as archive verification.

## 4. Browser feature matrix (source vs tests vs runtime)

| Feature | Source finding | Test/runtime evidence and limits |
|---|---|---|
| Three browser cores and tabs | Present: three `WebContentsView` cores, up to 20 tabs per core, separate persistent storage partitions, and a per-core tab model; see [main process](../electron/main.cjs#L39-L75) and [view creation/security](../electron/main.cjs#L395-L449). | Source/contract tests pass. Current hosted Windows packaged smoke job and Level A validator report success, but this was not a manual feature-by-feature browser exercise. |
| Address bar, navigation and search | Present; app navigation is limited to HTTP/HTTPS, with non-URLs handled as search; unsafe protocols are rejected. New web windows are denied and safe web targets become tabs. | Source tests pass; remote job-level smoke success only. No local Electron UI launch was possible. |
| Sync | Present but narrow: when enabled, submitting an address opens it in all three cores; it is not account, profile, or cloud sync. UI defaults OFF. | Source/UI only; no cloud-sync service exists in the reviewed app path. |
| Bookmarks, history and home setting | Present, persisted locally in `browser-data.json`; per-core website storage remains separate. | Source and preference tests pass. Current packaged-run metadata does not independently establish full interactive feature acceptance. |
| Downloads | Present: sanitized names, collision suffixes, progress/state tracking, and reveal-in-folder; downloaded files are not automatically launched. | Source review; no dedicated live-download runtime test in this M13 check. |
| Fullscreen/immersive view | Present with sender/argument validation and active-core layout changes. | Source tests pass. The packaged-smoke regression contract covers enter/exit/restoration; current Windows smoke job reports success. |
| Images panel / import / resize / export | **Absent; original M8/M9 source unrecovered.** Diagnostic PNG preview/capture is not a user-image feature. | No app-owned feature tests or packaged Images runtime test. No replacement implementation. |
| WebAssembly diagnostic | Present as a capability/known-answer test, not an image scaler. | Tests execute real WebAssembly compilation/instantiation and a known-answer function. WASM is not called GPU, AI, FSR, or DLSS upscaling. |
| AMD FSR1 WebGPU scene | Present only in the bundled app-owned game-like scene. Not an ordinary-page mode. | Source/contract tests pass. Current Level A validation passed, but the optional FSR result is **UNKNOWN** without its report. Physical-GPU result is **NOT RUN**. |
| Screenshot → native D3D12/WARP diagnostic | Present only for the exact bundled WebGL2 diagnostic scene; bounded `capturePage()` PNG → separate helper → preview. | Current Windows Level A validator and separate WARP job report success; artifact contents were not retrieved. WARP is software-only, not a live compositor path or physical-GPU result. |
| DLSS / arbitrary webpage upscaling | No DLSS/Streamline runtime and no supported all-page frame-processing path. Standard Chromium remains the fallback. | Not implemented/not tested. GPU vendor detection or a UI mode label is not runtime evidence. |

## 5. Separate FSR source and runtime audit

### A. App-owned WebGPU scene → EASU → RCAS → visible canvas

`app/diagnostics/fsr1-webgpu.html` and [`fsr1-webgpu.js`](../app/diagnostics/fsr1-webgpu.js#L801-L875) implement a local controlled scene. The page owns its WebGPU target, renders a game-like animated scene at half the presentation dimensions, then dispatches separate AMD FSR1 EASU and RCAS compute passes before presenting the RCAS texture to that page's visible canvas ([frame loop](../app/diagnostics/fsr1-webgpu.js#L911-L1003)). Adapter requests retry high-performance, low-power, default and explicit fallback preferences without weakening the acceptance policy. The live processing loop does not read pixels back to the CPU. Post-run texture/screenshot copies are explicitly diagnostic validation and do not feed FSR. `performance.now()` queue-completion figures are wall timings, not GPU timestamps.

**Runtime:** the current hosted Level A smoke and evidence validator succeeded, but the diagnostic ZIP is unavailable; therefore the current packaged WebGPU outcome, exact EASU/RCAS dispatch evidence, and visible-canvas comparison are **UNKNOWN / not independently verified**. No arbitrary website, video, third-party game, compositor surface, or other core is thereby shown to be processed.

### B. `capturePage()` PNG → separate native D3D12 FSR helper

The other path is deliberately separate: an explicit request must target the active, visible, bundled WebGL2 test-scene tab; requests are limited to 1–5 frames, a 4096-pixel side and 2,097,152 input pixels ([bridge bounds/context](../electron/fsr1-bridge.cjs#L6-L79)). Electron captures a PNG, and the helper decodes/uploads it, dispatches EASU then RCAS, reads back/writes an output PNG and report, and returns a diagnostic preview. This screenshot/file/CPU boundary is not zero-copy or continuous browser-frame processing. It does not intercept the Chromium compositor or process arbitrary pages.

Native source separates `--warp` from `--hardware`, excludes WARP/Microsoft Basic Render Driver from hardware enumeration, checks D3D12 format/shader features, and refuses to silently fall back from hardware mode ([adapter selection](../native/fsr1-poc/Fsr1Poc.cpp#L143-L154), [enumeration/selection](../native/fsr1-poc/Fsr1Poc.cpp#L253-L334)). The report also distinguishes software identity from a non-software adapter; physical vendor/driver acceptance remains a separate gate.

**Runtime:** the Windows Level A evidence validator reports success and the separate synthetic D3D12/WARP Actions job reports success. Their output files were not retrieved, so M13 did not independently inspect exact PNGs, hashes, reports, or per-frame values. WARP is software-only. It does not validate physical GPU, live WebGPU integration, zero-copy, or page-wide processing.

## 6. Physical-GPU availability and acceptance

**Physical-GPU validation: NOT RUN.** The current Level B job was skipped on the push run. The workflow requires an explicit manual dispatch with `run_physical_gpu_validation=true` and labels `[self-hosted, windows, x64, gpu]` ([workflow gate](../.github/workflows/build.yml#L273-L317)); no runner was provisioned and no workflow was dispatched.

The current sandbox is Linux x86_64 with `/dev/dri` absent; `nvidia-smi`, `vulkaninfo`, `lspci`, PowerShell, and CMake are absent. It cannot run the packaged Windows app, build the Windows D3D12 helper, or establish physical hardware. A read-only GitHub self-hosted-runner listing request returned HTTP 403 (“Resource not accessible by integration”), so runner registration/online status is **unknown**, not “none available.”

Acceptance would require the Level B required-policy run on an identified non-software adapter, actual WebGPU compute and FSR evidence, active driver/API/device details, validated output/captures, and the release-gate summary. WARP and software adapters are explicitly excluded. No current metadata satisfies that physical gate; no release is justified.

## 7. General webpage upscaling and DLSS feasibility

**General pages:** the current visible `WebContentsView` path exposes no supported page-owned D3D12/Vulkan render target or compositor synchronization bridge. `capturePage()` returns a screenshot and incurs readback/encode/decode/upload costs; it is a bounded diagnostic, not a real-time page pipeline. Electron's offscreen shared-texture route is experimental and distinct from these visible views; the app has no verified Windows capture/import/synchronization/presentation implementation. A maintained Chromium/Viz integration or a separately consented companion viewer could be researched, but would need its own Windows ownership, lifetime, resize/occlusion/device-loss, security, visible-output, performance and upgrade tests. It is not a current feature. See the existing [browser-frame decision record](BROWSER_FRAME_UPSCALING_DECISION_RECORD.md) and [known limitations](KNOWN_LIMITATIONS.md).

**DLSS:** no Streamline/DLSS runtime, NVIDIA feature binary, NGX identifier, game-owned native renderer input, motion/depth resources, or compatible physical-NVIDIA runtime evidence is present. DLSS Super Resolution and Frame Generation are separate native integrations; a GPU label or UI option cannot substitute for renderer resource/present integration. Proprietary NVIDIA components were not downloaded or redistributed; exact applicable licensing and production-signature review would be required before any authorized implementation or packaging. DLSS remains **NOT IMPLEMENTED / NOT TESTED**. No browser-wide upscaling, DLSS, performance, or image-quality claim is made.

## 8. Safe regression, build and security checks

| Check | Result |
|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | **PASS**; 298 locked packages installed; lockfile SHA unchanged. Lifecycle scripts were disabled. The Electron package shim exists, but no Electron executable payload was installed or run. |
| `npm test` | **PASS — 100/100**. Includes source/contract, mocked WebGPU-policy, bridge-boundary, package-evidence, fullscreen, graphics-policy and WASM tests; it is not a physical-GPU or live Electron test. |
| `npm run build -- --outDir /home/user/m13-audit/m13-renderer-build` | **PASS**; Vite production renderer output written outside the repository. |
| `node --check` | **PASS — 31** JS/CJS/MJS files under `app`, `electron`, `src`, `tests`, and `scripts`. |
| YAML/JSON parse | **PASS**; `build.yml`, `release.yml`, `fsr1-native-poc.yml`, and `package.json`. |
| `npm audit --audit-level=high` | **PASS at configured high/critical threshold**; 8 moderate, 0 high, 0 critical. The findings include the locked Electron Builder/transitive tooling chain (`@electron/get`, `app-builder-lib`, `electron-builder`, `global-agent`, `roarr`, and `sprintf-js`). No lockfile update or automatic fix was applied. JSON evidence: `/home/user/m13-audit/m13-npm-audit.json`. |
| `git diff --check` | **PASS** for the pre-existing tracked diff; this new untracked report was separately checked for trailing whitespace. |
| Runtime-source security marker review | No switch mutation (`appendSwitch`/`appendArgument`/`setSwitchValue`) and no certificate/security bypass API was found in app runtime source. The reviewed browser views retain `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, `webSecurity:true`, and deny permissions; navigation is restricted to web URLs plus the exact local diagnostic pages. |

Install emitted deprecated-transitive-package notices; they were not treated as proof of an exploitable runtime issue. No `npm audit fix`, package change, local Windows build, Electron GUI launch, local C++ compile, third-party binary scan, or manual website test was performed. In particular, failed ZIP retrieval means no executable-signature or binary inspection was possible.

## 9. Images recovery/new-feature plan — approval required

The original Images implementation is unrecovered, so this is a **proposed new feature**, not a restoration. A conservative MVP plan—only if explicitly approved—is:

1. Agree a written product scope and name; keep it separate from browser rendering and the graphics-mode/FSR/DLSS claims. Start with one user-selected local PNG and explicit target dimensions or scale; define input/output and memory limits before coding.
2. Add an app-owned Images dialog with sender-validated native open/save dialogs. Validate file type/signature, decoded dimensions, target dimensions and byte/pixel limits; handle cancellation and failure without changing the source file. Avoid network upload, arbitrary website access, automatic writes, and automatic file launch.
3. Perform an explicitly named **CPU bilinear resize** in a bounded worker over decoded RGBA pixels, with defined alpha/border behavior; preview the original and result and export only after a user-selected save path. This is conventional CPU resampling—not AI, neural, GPU, AMD FSR, or NVIDIA DLSS upscaling.
4. Add deterministic tests for identity and enlargement, gradients/checkerboards, odd and one-pixel dimensions, alpha edges, malformed/oversized input, target bounds, canceled dialogs, untrusted IPC, overwrite/collision handling and atomic export. Add an opt-in packaged Windows test before any release claim.
5. Keep the feature disabled/out of the runtime until the owner explicitly approves this new scope. If original M8/M9 source is later supplied, compare it before deciding whether to replace this proposal.

No step above was implemented. **M13 stops at the audit and plan pending explicit authorization.**

## 10. Release status and owner actions

There was no release, public publication, tag, push, workflow dispatch, or portable distribution assembly. The current Windows candidate remains an explicitly unverified smoke artifact whose bytes could not be retrieved. Physical-GPU acceptance is **NOT RUN**, the optional packaged WebGPU result is **UNKNOWN**, and DLSS/general-page upscaling are not implemented. **Do not treat this report or the current candidate as release readiness.**

Next owner decisions: (1) provide the original M8/M9 source/patch if available, or explicitly authorize Images as new product scope; (2) if physical acceptance is wanted, arrange authorized access to a suitable existing Windows GPU runner and explicitly authorize the required manual run; (3) if per-run runtime evidence is required, provide an authorized artifact retrieval path other than the repeatedly failing redirect route; and (4) review the eight moderate dependency findings before any release work. No such action is taken automatically.

## Local evidence supplements (not committed)

- Initial inventory: `/home/user/m13-audit/2026-10-14_173854_IST_phase1_inventory.txt` (SHA-256 `781e955609bca735e89c7baf7ea8f6843dd83008cf23673272401a6dcb2afb4b`).
- Recovery/tree summary: `/home/user/m13-audit/phase2_source_recovery.txt`.
- GitHub artifact metadata and bounded-attempt records: `/home/user/m13-audit/phase2_actions_artifacts.tsv`, `/home/user/m13-audit/phase2_artifact_retrieval_summary.txt`, `/home/user/m13-audit/artifacts/`.
- Local dependency audit JSON: `/home/user/m13-audit/m13-npm-audit.json`.
- Renderer build output: `/home/user/m13-audit/m13-renderer-build/`.
