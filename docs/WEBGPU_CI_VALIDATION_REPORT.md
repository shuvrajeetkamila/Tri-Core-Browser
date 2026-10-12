# WebGPU CI validation report

## Executive summary

The packaged Windows smoke path now separates ordinary packaged-app verification from WebGPU/FSR1 GPU evidence. A hosted Windows runner uses an **optional** GPU policy: safe no-adapter detection is reported as `SKIPPED`, never as a GPU `PASS`, and a successful hosted smoke is explicitly **not release-eligible**. A separate opt-in Level B job and the prerelease build require a configured self-hosted Windows runner labelled `self-hosted`, `windows`, `x64`, and `gpu`. Level B fails unless compute, bundled FSR1 output, physical-adapter identity, an active Chromium GPU device, and a non-empty driver version are all verified.

The implementation commit `499e44e8fefc8650ca6b438299d16d4092c52e76` passed hosted Windows Level A and Linux checks in [run 38265255323](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38265255323). The same code passed those checks again in [run 38266911828](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38266911828) at `c4df55dadd06c35a7f636e4f19e3c7fbe0cc66ab` (documentation-only follow-up). Both runs show the packaged smoke/validator and diagnostic-artifact upload succeeded; the unverified-candidate upload succeeded; portable-package assembly/upload and Level B were skipped. Artifact metadata confirms `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` and `TriCoreBrowser-Packaged-Smoke-Diagnostics` were uploaded. The candidate is correctly named unverified, not a validated portable release.

I retried `gh run download` for the diagnostic artifacts and `gh run view --log` for both Windows jobs. Artifact downloads failed with `EOF` from GitHub's `productionresultssa*.blob.core.windows.net` result-storage host; log retrieval failed with `EOF` from `results-receiver.actions.githubusercontent.com`. The accessible run/job metadata proves the Level A smoke step and shared validator succeeded, which constrains the optional aggregate WebGPU status to `PASS` or `SKIPPED`; it does **not** reveal which one. Do not infer the actual WebGPU status, EASU/RCAS dispatches, output dimensions, or output pixels from a green job. The Level B job was skipped because both runs were push events, not because a runner was proven absent. A separate D3D12/WARP harness run [38265255364](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38265255364) passed its WARP-only EASU+RCAS step; this is software evidence, not the packaged WebGPU scene or physical-GPU validation.

A fresh `gh api repos/shuvrajeetkamila/Tri-Core-Browser/actions/runners` request returned HTTP 403 (`Resource not accessible by integration`). Therefore configured self-hosted runner availability is **UNKNOWN**, not confirmed absent or present. No physical GPU/driver result or live packaged WebGPU FSR1 PASS is claimed.

## Milestone 3 evidence/reporting changes on the current branch

The current unpushed branch adds a deterministic, report-driven Actions summary without changing the optional/required GPU policies or distribution gates:

- Level A and Level B now have distinct packaged-process and packaged-evidence-validation steps. The latter's actual GitHub step outcome is passed to the always-run summary step, so a process crash yields validation `NOT RUN`, a failed JSON/PNG validator yields `FAIL`, and only a successful validator yields `PASS`.
- Both summaries run after diagnostic/distribution artifact handling and append to `GITHUB_STEP_SUMMARY`; they do not overwrite earlier failures or turn a failed smoke step green. They record run/commit/branch, versions, actual package/executable/process/validator/build/upload step outcomes, independent GPU-free checks, adapter/device/driver classification, compute and EASU/RCAS stage statuses, output dimensions/pixel metrics/hashes/timing, failure detail, and artifact names. Missing/crashed reports are explicit `FAIL`/`NOT RUN`; synthetic fixtures are labeled and cannot establish hardware evidence. Logs are bounded and secret-like values are redacted.
- The packaged evidence validator now enforces packaged/acceptance schema version 1, checks PNG chunk CRCs and zlib-decompressed scanline/filter structure (including supported color depths/interlace layouts), checks report/path/hash/dimension consistency, and requires finite non-trivial pixel metrics plus a sufficiently accurate visible-canvas comparison before accepting a live FSR report. WARP remains separately labeled software-only.
- Deterministic summary tests cover `PASS`, `SKIPPED`, required `UNSUPPORTED`, `FAIL`, `NOT RUN`, missing/crashed reports, JSON/summary inconsistencies, validator outcomes, secret redaction, and fixture-vs-hardware classification. Validator tests cover malformed compressed PNG data, schema mismatch, and output-dimension mismatch.

Local verification for these edits: `npm ci` **PASS** (locked install; npm reported 8 moderate audit findings), `npm test` **PASS — 99/99** (85 pre-existing tests plus 14 new tests), `npm run build` **PASS** (Vite 8.3.4; 11 modules), Node syntax checks for the modified JavaScript **PASS**, YAML parsing of `build.yml`, `release.yml`, and `fsr1-native-poc.yml` **PASS**, and `git diff --check` **PASS**. `actionlint` and PowerShell (`pwsh`) are not installed here. A Windows executable package, hosted Windows smoke, WARP run, and packaged WebGPU smoke were **NOT RUN** locally; this Linux checkout cannot execute the Windows package. Physical-GPU Level B remains **NOT RUN**. The runner inventory response remains inconclusive (HTTP 403), so no runner is presumed available or absent. No CI artifact or new physical-GPU claim is made from these local checks.

## Investigation of the observed failure

The latest pre-hardening run was `38249515260` at source commit `8f5bcd4ea899c437820e2f9efa0918b72ccac2a9`. Its Windows job failed at **“Run packaged-app smoke test.”** The preceding executable build, package validation, automated tests, and audit succeeded; the separate Linux renderer/WASM/dependency job succeeded. Distribution assembly and upload were skipped.

The full failure annotation (check `114789255916`) confirms the cause. The hosted Windows runner reported Microsoft Basic Render Driver / ANGLE D3D11 WARP; its D3D12 diagnostics showed WARP available and no non-software adapters. The packaged browser, fullscreen, local HTTP/JavaScript/WASM, tab, HTTPS, and separate screenshot→PNG→D3D12-WARP diagnostic all passed. The bundled WebGPU FSR1 scene then tried high-performance, low-power, default, and explicit fallback adapter requests; all four returned unavailable. Smoke failed at `webgpu-pipeline-dispatch-validation` before EASU/RCAS shader compilation, pipeline creation, dispatch, or FSR output. The failing gate treated the no-adapter `UNSUPPORTED` state as fatal under its strict policy. This confirms an adapter-availability failure, not a shader/dispatch/output defect. The D3D12 WARP screenshot diagnostic is a separate software path and does not establish WebGPU or physical-GPU support.

The implementation now validates adapter-request evidence before allowing an optional Level A skip. API/device request errors, a rejected adapter request, selected-adapter initialization/runtime failures, shader/pipeline/resource failures, incomplete dispatch, and missing/invalid output evidence remain failures.

Post-change Level A runs `38265255323` and `38266911828` both passed the packaged Windows smoke and shared validator. Because the validator rejects aggregate `UNSUPPORTED`, `FAIL`, and `NOT RUN` under the optional policy, the successful step constrains `webGpuAcceptance.status` to `PASS` or `SKIPPED`; the inaccessible report/log prevents determining which. If it was `PASS`, that would establish the bundled scene's runtime evidence on that hosted adapter only, not physical-GPU validation. If it was `SKIPPED`, no WebGPU FSR processing occurred. Neither branch can be selected without the missing artifact/log.

## Status model

The implementation and JSON reports keep these states distinct:

- `PASS`: the named check actually ran and met its acceptance criteria.
- `SKIPPED`: only an optional no-compatible-adapter result, with safe API/adapter discovery evidence and no processing, may use this status.
- `UNSUPPORTED`: the required GPU path lacks the capability or hardware evidence it needs; required jobs fail.
- `FAIL`: a check ran and encountered a runtime, device, shader, pipeline, resource, dispatch, output, security, or report error.
- `NOT RUN`: no attempt was made; this is never a pass.
- `BLOCKED`: only the external HTTPS connectivity probe may be blocked; it does not disable certificate validation or mark other checks passed.

A skip does not make the GPU acceptance status pass. The enclosing Level A packaged smoke may pass its **GPU-independent** gates while carrying `webGpuAcceptance.status = SKIPPED`, `physicalGpuValidation = NOT RUN`, and `releaseEligible = false`.

## Per-stage evidence and status separation

The packaged reports keep the following gates distinct; a compute-probe pass is not an FSR pass, and a packaged-app pass is not a physical-GPU pass.

| Gate | Report/evidence fields | What they establish |
|---|---|---|
| Packaged application execution | `packaged-smoke-summary.json` `checks.*`, smoke process/validator step | Electron/browser startup and GPU-independent app checks. Both post-change hosted Level A smoke steps succeeded. |
| WebGPU API and adapter discovery | `webgpu-compute-smoke-summary.json` `apiDetected`, `adapterRequestResults`, `failureStage`; `fsr1-webgpu-summary.json` `adapterRequestResults`, `adapterDetected`, `failureStage` | API exposure and individual safe adapter-request outcomes. The old pre-hardening annotation confirms four FSR adapter requests unavailable; post-hardening per-request evidence is inaccessible. |
| Device initialization | Compute report `deviceRequested`, shader/pipeline/resource statuses; FSR report `lifecycle.state`, `adapterDetected`, shader/pipeline/resource initialization, and failure stage such as `device-request` | A compute probe device is separate from the FSR scene's device. A successful compute probe alone cannot prove the FSR device or pipelines initialized. |
| Shader compilation | `lifecycle.shaderCompilationStatus` and the compute probe's shader status | Compilation only; not dispatch or output. |
| EASU and RCAS execution | `dispatch.easuDispatches` and `dispatch.rcasDispatches`, plus completed-frame count and queue-completion evidence | Separate counts for EASU and RCAS work submitted and completed as part of frames. A nonzero count alone is not output correctness. |
| Output generation/presentation | `input`, `intermediate`, and `output` dimensions; `lifecycle.outputSubmittedToVisibleCanvas`, `framesPresented`, visible capture | Output dimensions and submission to the canvas. A PNG's validity alone does not prove it came from both FSR passes. |
| Output correctness | `imageValidation.stageComparison` (`easuContributes`, `rcasContributes`, detail and dimensions checks), `imageValidation.visibleCanvas`, motion fingerprints, saved captures/hashes | Post-processing GPU texture readback analysis plus visible-canvas comparison. This is a sanity/reference comparison, not bit-exact AMD shader conformance or a quality/performance claim. Readback is validation-only. |
| Physical-GPU confirmation | aggregate `webGpuAcceptance.physicalGpuValidation`, adapter/software classification, active Chromium GPU device and driver evidence | Must be `PASS` under required Level B after both compute and FSR evidence. Optional Level A is always `NOT RUN` for physical validation. |

For the two post-change hosted runs, the packaged application/smoke validator passed, but missing diagnostic JSON/logs prevent determining any individual WebGPU stage. The successful optional validator means the aggregate was either `PASS` (which would require actual compute and FSR output acceptance on the hosted adapter) or `SKIPPED` (no compatible adapter and no FSR processing). We cannot distinguish those branches. The earlier pre-hardening run is definitively `UNSUPPORTED` at adapter discovery and reached no FSR shader, EASU/RCAS dispatch, or FSR output. The native WARP harness is a different path. No post-change WebGPU dimensions, output pixels, stage metrics, adapter identity, or FSR execution are asserted here.

## Level A: hosted Windows checks

`.github/workflows/build.yml` runs Level A on `windows-latest` with `TRICORE_GPU_TEST_MODE=optional`. It retains the packaged executable size/existence check and these packaged runtime checks:

- Electron startup and the browser shell / graphics-mode controls.
- Immersive fullscreen enter/exit and three-core layout restoration.
- Local HTTP page, JavaScript, and the controlled WebAssembly `add(19, 23) = 42` diagnostic.
- Browser tab create/select/close lifecycle.
- HTTPS navigation using Chromium certificate validation; external-network failure is recorded as `BLOCKED`, without certificate bypass.
- The existing WebGL2 `WebContentsView` → `capturePage()` PNG → native D3D12 FSR1 helper on **WARP software**, with three changing frames, three capture resolutions, per-frame reports, processed/reference PNGs, and image/report checks.
- Report generation, smoke logs, executable candidate upload, and always-run diagnostic artifact upload.

Post-change runs `38265255323` (code commit `499e44e`) and `38266911828` (commit `c4df55d`) built/size-validated the Windows executable, passed the packaged smoke/validator, and uploaded diagnostics; each skipped distribution assembly and the portable package. Artifact metadata reports the diagnostic archive sizes as 734,629 bytes and 736,234 bytes respectively, plus explicitly unverified executable candidates (109,719,020 bytes and 109,711,042 bytes). Those byte counts establish that artifacts exist, not what their reports contain. The exact optional WebGPU status and all WebGPU-specific runtime details remain unavailable because the artifact/log downloads ended in `EOF`. Given the successful Level A validator, the aggregate status was necessarily `PASS` or `SKIPPED`; it cannot be narrowed further.

WebGPU compute/FSR checks may run on a hosted adapter. If all safe adapter requests return unavailable, the reports say `UNSUPPORTED`/`SKIPPED`, record zero dispatches/frames and `NOT RUN` output checks, and the ordinary Level A smoke remains successful only if the independent checks above passed. A WebGPU runtime pass on a software/hosted adapter still leaves physical validation `NOT RUN`. The distribution assembly and portable-package upload steps are gated off on Level A (`TRICORE_FSR_INTEGRATION_SMOKE=SKIPPED`). The diagnostic executable is uploaded under an explicitly unverified name before the runtime gate; that candidate is not a release package.

WARP evidence is limited to this diagnostic route. It is software processing, not physical-GPU validation and not the bundled game-side WebGPU FSR1 scene.

## Level B: required physical-GPU validation

The `windows-gpu-validation` job in `.github/workflows/build.yml` is opt-in through the `workflow_dispatch` input `run_physical_gpu_validation` (default `false`). It is isolated from ordinary push/pull-request CI and runs on:

```yaml
runs-on: [self-hosted, windows, x64, gpu]
```

The repository must have a Windows x64 GitHub Actions self-hosted runner carrying all four labels, with a supported GPU and current vendor driver installed. It must run in a logged-in interactive Windows session because the packaged Electron smoke opens a window and captures its visible canvas. The host must keep the normal Chromium/WebGPU security policy enabled; do not set unsafe WebGPU, blocklist-bypass, GPU-disable, or sandbox-disable flags. If a matching runner is absent/offline, an opted-in job remains queued or fails to start; CI must not fall back to `windows-latest`. Runner registration, labels, host security, driver version, and GPU availability are repository-owner responsibilities. The current session's runner inventory request returned HTTP 403 (`Resource not accessible by integration`), so availability is unknown.

#### Exact Level B dispatch procedure

1. A repository owner first confirms the Windows x64 runner is registered and **online** in **Settings → Actions → Runners**, has exactly the required labels `self-hosted`, `windows`, `x64`, and `gpu`, is in an interactive logged-in desktop session, and has its supported GPU vendor driver installed. Do not dispatch while these prerequisites are uncertain.
2. In GitHub, open **Actions → Test and build Windows browser → Run workflow**. Select the branch containing the workflow (for this session, `arena/66abfdc9-tri-core-browser`) and set `run_physical_gpu_validation` to **true**, then dispatch. The dispatcher needs the repository's normal workflow-run permission.
3. The hosted Level A and Linux jobs still run independently. Level B is a separate job and can start only on the matching self-hosted labels. A queued job, skipped job, or no matching runner is **not** a pass. Do not register a runner or change labels as part of this code change.
4. Wait for **Level B required physical-GPU validation** to finish. Inspect the job conclusion and `packaged-smoke-summary.json`, `webgpu-compute-smoke-summary.json`, `fsr1-webgpu-summary.json`, failure report if present, smoke log, and PNG evidence in the `TriCoreBrowser-Level-B-GPU-Diagnostics` artifact (30-day retention). Verify both independent compute and actual EASU+RCAS acceptance, non-software adapter identity, active Chromium device/driver, output dimensions/pixels, and `physicalGpuValidation = PASS`. The separate `TriCoreBrowser-Windows-x64-physical-GPU-validated` artifact is uploaded only after strict acceptance; neither an artifact's existence nor a queued job is itself proof.

Level B sets `TRICORE_GPU_TEST_MODE=required`. It fails unless all of these checks pass:

1. The packaged independent WebGPU probe detects the API and obtains a device in a secure renderer context.
2. Shader compilation, pipeline creation, and resources succeed; exactly one known-answer compute dispatch completes and readback equals `42` for `19 + 23`.
3. The probe's adapter information is classified non-software, and Electron/Chromium records an active non-software GPU device with a useful identity and driver version. The same checks apply to the bundled FSR run; WARP/SwiftShader/other recognized software strings and unknown/empty identity or driver values are rejected.
4. The bundled FSR1 scene reports at least three processed frames, EASU and RCAS dispatches, larger output dimensions, shader/pipeline/resource success, changing input, numerical EASU/RCAS stage contribution, and a post-processing visible-canvas sample comparison.
5. PNG captures have valid signatures, chunk CRCs, IHDR dimensions, IDAT data, and IEND; saved stage and visible-output SHA-256 values match the report. Diagnostic texture/screenshot readbacks are validation-only and never feed FSR processing.
6. GPU launch diagnostics do not show disabled WebGPU/GPU/sandbox, unsafe WebGPU, a blocklist bypass, or disabled driver workarounds.

The required WebGPU acceptance summary reports `physicalGpuValidation = PASS` only after both the compute and FSR reports satisfy the physical adapter/active-driver checks. A missing adapter, software adapter, missing driver, runtime failure, or incomplete output fails Level B. The physical GPU result is separate from `fsr1-webgpu-summary.json`'s per-scene `physicalGpuValidation = NOT RUN` field; the packaged policy summary supplies the runner-level classification without rewriting the scene report.

Level B retains its smoke log and JSON/PNG evidence for 30 days. Distribution assembly is only reached after strict validation and is additionally guarded by `scripts/package-windows.ps1`.

## Release gate

`.github/workflows/release.yml` uses the same `[self-hosted, windows, x64, gpu]` runner labels and the required policy. Release asset assembly requires `TRICORE_SMOKE_TEST=PASS`, `TRICORE_FSR_INTEGRATION_SMOKE=PASS`, a required-policy packaged-smoke summary, `physicalGpuValidation=PASS`, and `releaseEligible=true`; the package script repeats the strict checks and verifies the retained image evidence. Prerelease publication depends on that build and checks the packaged report embedded in the ZIP. The workflow cannot publish a Level A skipped/optional package.

The GPU runner is deliberately not configured through a fallback expression. Owners must provision the labelled runner and should verify that its GPU model, driver, and security configuration meet the intended validation environment before opting in.

## Deterministic tests and checks

`tests/webgpu-smoke-policy.test.js` uses deterministic report objects (mocks), not a GPU. It covers:

- policy normalization and `NOT RUN` behavior;
- strict known-answer PASS evidence and unsafe-launch rejection;
- safe no-adapter evidence versus selected-adapter, rejected-request, device/runtime failures;
- optional `SKIPPED` versus required `UNSUPPORTED`/job failure;
- missing reports and omitted FSR execution as failures;
- FSR dispatch/motion/stage/visible-output acceptance;
- software-adapter evidence versus required physical adapter and driver evidence;
- runtime failures failing both policies.

`tests/smoke-job-summary.test.js` covers truthful `PASS` / `SKIPPED` / `UNSUPPORTED` / `FAIL` / `NOT RUN` reporting, missing/crashed reports, consistency between packaged and per-stage JSON, validator outcomes, original failure preservation, secret redaction, and fixture-vs-hardware classification. `tests/validate-packaged-smoke.test.js` also covers malformed compressed PNG data with recomputed CRCs, schema-version mismatch, and inconsistent stage dimensions. `tests/windows-smoke-workflows.test.js` asserts the Level A/Level B/release runner policies, actual smoke/validator/build/artifact outcomes, always-run summaries, artifact retention, and strict package gate. These tests validate control-flow, policy, and synthetic data only; they are not evidence of WebGPU initialization, dispatch, rendered output, a physical GPU, or packaged FSR execution.

The shared `scripts/validate-packaged-smoke.cjs` checks the emitted JSON reports, evidence paths, PNG chunk CRCs and decompressed image data, hashes, declared/report dimensions, stage metrics, visible output, and policy consistency. `scripts/package-windows.ps1` independently gates distribution assembly.

## Evidence and limitations

| Check | Current result |
|---|---|
| Source investigation | Pre-hardening annotation `114789255916` definitively shows all four WebGPU adapter requests unavailable on a WARP-only hosted runner; it failed before FSR shader/dispatch/output. It is not evidence about post-hardening runs. |
| Post-hardening hosted Level A | Runs `38265255323` (code `499e44e8fefc8650ca6b438299d16d4092c52e76`) and `38266911828` (same code, docs commit `c4df55dadd06c35a7f636e4f19e3c7fbe0cc66ab`) both passed the Windows packaged smoke/shared validator and uploaded diagnostics. Level B and distribution assembly were skipped on push events. |
| Candidate/diagnostic artifacts | Both runs uploaded `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` and `TriCoreBrowser-Packaged-Smoke-Diagnostics`. Metadata sizes: candidate 109,719,020 / 109,711,042 bytes; diagnostics 734,629 / 736,234 bytes. Names/sizes are not artifact-content evidence. |
| Artifact and log retrieval | Diagnostic artifact downloads for runs `38265255323` and `38266911828` ended in `EOF` from separate `productionresultssa*.blob.core.windows.net` hosts. Windows job-log retrieval ended in `EOF` from `results-receiver.actions.githubusercontent.com`. Actual per-stage JSON, images, and exact aggregate status remain unread. |
| Aggregate optional WebGPU status | Bounded by the successful smoke/validator to `PASS` or `SKIPPED`; which one is **UNKNOWN**. `UNSUPPORTED`, `FAIL`, and `NOT RUN` are not valid aggregate outcomes for the successful optional validator. Do not infer one branch. |
| Post-change packaged compute / EASU / RCAS / output | Actual compute status, EASU and RCAS dispatch counts, dimensions, stage metrics, visible pixels, and output images are **UNKNOWN** because evidence content is inaccessible. No packaged WebGPU FSR pass is claimed. |
| Self-hosted GPU runner availability | **UNKNOWN**; `gh api repos/shuvrajeetkamila/Tri-Core-Browser/actions/runners` returned HTTP 403 `Resource not accessible by integration`. No runner was registered or dispatched. |
| Physical GPU / driver / Level B | **NOT RUN**; Level B was skipped on push events. No physical-GPU or driver PASS claimed. |
| Separate native D3D12/WARP harness | Run `38265255364` passed official EASU/RCAS harness execution on WARP software. It is not packaged WebGPU FSR or physical hardware. |
| `npm ci` (current branch) | **PASS** — 298 locked packages installed; npm reported 8 moderate audit findings. No dependency update was applied. |
| `npm test` (current branch) | **PASS — 99/99**, 0 failures/skips (85 existing tests plus 14 evidence/reporting tests). Deterministic mocks and synthetic evidence only; not GPU evidence. |
| `npm run build` (current branch) | **PASS** — Vite 8.3.4 production renderer build, 11 modules. No Windows executable package was built locally. |
| Workflow/config validation (current branch) | **PASS** — `js-yaml` parsed `build.yml`, `release.yml`, and `fsr1-native-poc.yml`; modified JavaScript syntax checks and workflow-policy tests passed. PowerShell and `actionlint` checks were unavailable because those tools are not installed. |
| `npm audit --audit-level=high` | Not rerun on this branch. `npm ci` reported 8 moderate findings; the prior milestone's audit recorded 0 high/critical. No forced dependency update applied. |
| `git diff --check` (current branch) | **PASS** — no whitespace errors. |
| WARP PNG processing | Level A validator succeeded for the WARP diagnostic route in both hosted runs, but ZIP contents are unreadable here; separate WARP harness pass is software-only. |
| Ordinary external websites / games / cloud video | No FSR page interception or arbitrary game support claimed. |
| DLSS | Not implemented; no fallback/substitution claim. |

### Evidence-recovery commands and outcomes (2026-10-12)

- `gh run view --repo shuvrajeetkamila/Tri-Core-Browser --json databaseId,headSha,event,status,conclusion,createdAt,jobs` was used to inspect runs `38265255323` and `38266911828` (along with the separate `gh run view` inspection of `38265255364`). Both Level A runs were completed `success` push events; `Run packaged-app smoke test` and `Upload packaged smoke diagnostics` concluded `success`; portable distribution assembly and Level B concluded `skipped`. Run `38265255364` was the separate native D3D12/WARP harness.
- `gh api "repos/shuvrajeetkamila/Tri-Core-Browser/actions/runs/$run/artifacts" --jq '.artifacts[] | {name,size_in_bytes,expired,created_at}'` returned the candidate, diagnostics, and Linux-check artifact metadata for both Level A runs. The artifacts were not expired.
- `gh run download 38265255323 --name TriCoreBrowser-Packaged-Smoke-Diagnostics` and the corresponding command for `38266911828` both failed with `EOF` from distinct GitHub Actions result-storage blob hosts. No downloaded report or PNG was available for inspection.
- `gh run view --repo shuvrajeetkamila/Tri-Core-Browser --job 114871269505 --log` failed with `EOF` from `results-receiver.actions.githubusercontent.com`; an earlier Windows job-log attempt had the same result.
- `gh api repos/shuvrajeetkamila/Tri-Core-Browser/actions/runners` returned HTTP 403, `Resource not accessible by integration`. No runner inventory conclusion can be drawn from that response.

These retrieval failures are recorded, not converted into `SKIPPED` or `PASS` evidence. After a future accessible Level B run, record its exact workflow URL/run ID, commit, runner/GPU/driver identity, Electron/Chromium versions, report paths and stage statuses, measured duration, output dimensions/pixel metrics, and whether packaged FSR reached visible output. Do not promote a software/hosted result to physical-GPU evidence or a `SKIPPED` result to `PASS`.
