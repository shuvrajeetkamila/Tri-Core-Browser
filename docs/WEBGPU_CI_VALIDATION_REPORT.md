# WebGPU CI validation report

## Executive summary

The packaged Windows workflow separates normal browser/package checks from WebGPU/FSR1 acceptance. Hosted Level A uses an optional policy: a safe no-adapter result may be `SKIPPED`; a passing Level A job is not release-eligible. The separate physical-GPU Level B job and release path require a configured `[self-hosted, windows, x64, gpu]` runner and strict compute, FSR output, adapter, active-driver, and visible-pixel evidence.

**Latest published source tested:** commit `ef83a601907ca13f501164f59a2b22db798d8a3b` on `arena/66abfdc9-tri-core-browser`. Hosted run [38287627583](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38287627583) completed `success`: Linux renderer/WASM/dependency checks passed; Windows EXE build, package validation, packaged-app smoke, Level A evidence validation, diagnostics upload, and the summary-writing step passed. The `Surface packaged smoke diagnostics` step was skipped; portable distribution assembly/upload and Level B physical-GPU validation were skipped on the push event.

The successful optional evidence validator allows the current aggregate WebGPU result to be either a genuine optional `PASS` or a safe no-adapter `SKIPPED`. The latest per-stage report and summary body were not inspected. Therefore the exact WebGPU branch, independent known-answer compute result, EASU/RCAS pipeline/dispatch counts, image-stage metrics and visible pixels are **UNKNOWN / NOT VERIFIED**. No bundled WebGPU FSR runtime PASS is claimed. Earlier retrieval attempts for run 38285641210 returned `EOF`; that historical failure does not prove the new run's storage path is inaccessible.

Run 38287627583 uploaded:

| Artifact | Size | SHA-256 | Meaning |
| --- | ---: | --- | --- |
| `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` | 109,718,163 bytes | `33ed04b9d6597a2ec69493ceb544238540493136200b4970df6d717478d03636` | Diagnostic EXE archive; not acceptance-certified or a release package. |
| `TriCoreBrowser-Packaged-Smoke-Diagnostics` | 736,876 bytes | `27c34b973e5386a10642c53485a28e414842ad98244c4b6fac491d74f45ff16f` | Uploaded JSON/PNG/report diagnostics; contents were not inspected. |
| `TriCoreBrowser-Linux-checks` | 10,274 bytes | `d8334603a7b5fe4c7738154d537502d5983d21cbe15b756075b2079029ffa550` | Linux check reports. |

Separate run [38287627651](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38287627651) completed `success` for “Build and exercise isolated D3D12 FSR1 harness (WARP only).” Its workflow required official EASU+RCAS processing of one synthetic frame, `status=PASS`, WARP classified as software, physical-GPU gate `NOT RUN`, and non-empty output/reference images. The harness also rejects blank/constant output or output identical to its bilinear reference. Artifact `TriCore-FSR1-D3D12-WARP-POC` is 59,486 bytes (SHA-256 `ccd81a0c07688a30037b96b24bf32baa1d4d128ae6a9343faf86c19b1b54be8c`); its contents were not inspected. This is a native D3D12 software test, not the bundled WebGPU path or physical-GPU evidence.

The runner-inventory API returned HTTP 403 (`Resource not accessible by integration`), so configured self-hosted runner availability is **UNKNOWN**. Level B was skipped because this was a push event; no runner was registered or dispatched. Physical GPU/driver validation is **NOT RUN**.

## Milestone 4 published evidence/reporting changes

Commit `e8a1745` adds deterministic, report-driven Actions summaries without changing optional/required GPU policies or distribution gates:

- Level A and Level B keep packaged-process and packaged-evidence-validation outcomes separate. A crash produces validation `NOT RUN`, a failed report/PNG validator produces `FAIL`, and only a successful validator produces `PASS`.
- Always-run job summaries record run/commit/branch, runtime versions, actual package/process/validator/build/upload outcomes, independent checks, adapter/device/driver classification, compute and EASU/RCAS stages, output dimensions/pixel metrics/hashes/timing, failure details, and artifact names. Missing/crashed reports remain explicit. Fixture data is marked synthetic, logs are bounded, and secret-like values are redacted.
- The shared validator enforces report schemas, PNG chunk/CRC/zlib image structure, evidence paths and hashes, dimensions, stage metrics, visible output, and policy consistency. WARP remains separately labeled software-only.
- Deterministic tests cover `PASS`, `SKIPPED`, `UNSUPPORTED`, `FAIL`, `NOT RUN`, missing/crashed reports, consistency errors, validator outcomes, secret redaction, and fixture-versus-hardware classification.

Local verification: `npm ci` **PASS**; `npm test` **PASS — 99/99**; `npm run build` **PASS** (Vite 8.3.4); JavaScript syntax checks **PASS**; YAML parsing of `build.yml`, `release.yml`, and `fsr1-native-poc.yml` **PASS**; `git diff --check` **PASS**. `npm audit --json` reported 8 moderate, 0 high, and 0 critical advisories (it exits nonzero because moderate advisories exist); the hosted `--audit-level=high` steps passed. No dependency changes were made. `actionlint` and PowerShell are not installed in the Linux environment. The hosted Windows package and WARP runs above did execute; physical-GPU validation remains **NOT RUN**.

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

For the post-hardening hosted runs 38265255323, 38266911828, 38285641210, and the latest 38287627583, the packaged application/smoke validator passed, but the current per-stage report was not inspected. The successful optional validator means the aggregate was either `PASS` (which would require actual compute and FSR output acceptance on the hosted adapter) or `SKIPPED` (no compatible adapter and no FSR processing). We cannot distinguish those branches. The earlier pre-hardening run is definitively `UNSUPPORTED` at adapter discovery and reached no FSR shader, EASU/RCAS dispatch, or FSR output; that does not establish the current adapter state. No current WebGPU dimensions, output pixels, stage metrics, adapter identity, or bundled FSR execution are asserted here. Separate D3D12 WARP tests do not substitute for this WebGPU evidence.

## Level A: hosted Windows checks

`.github/workflows/build.yml` runs Level A on `windows-latest` with `TRICORE_GPU_TEST_MODE=optional`. It retains the packaged executable size/existence check and these packaged runtime checks:

- Electron startup and the browser shell / graphics-mode controls.
- Immersive fullscreen enter/exit and three-core layout restoration.
- Local HTTP page, JavaScript, and the controlled WebAssembly `add(19, 23) = 42` diagnostic.
- Browser tab create/select/close lifecycle.
- HTTPS navigation using Chromium certificate validation; external-network failure is recorded as `BLOCKED`, without certificate bypass.
- The existing WebGL2 `WebContentsView` → `capturePage()` PNG → native D3D12 FSR1 helper on **WARP software**, with three changing frames, three capture resolutions, per-frame reports, processed/reference PNGs, and image/report checks.
- Report generation, smoke logs, executable candidate upload, and always-run diagnostic artifact upload.

Latest Level A run [38287627583](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38287627583) on `ef83a601907ca13f501164f59a2b22db798d8a3b` built and size-validated the Windows executable, passed the packaged smoke and shared validator, uploaded diagnostics, and wrote the job summary. Portable distribution assembly/upload and Level B were skipped on the push event. Artifact names, byte sizes, and SHA-256 values are listed in the executive summary; these establish upload metadata, not report contents. The exact optional WebGPU status and stage details were not inspected. The successful Level A validator bounds the aggregate to `PASS` or `SKIPPED`, but does not identify which.

Earlier runs `38265255323` (code commit `499e44e`), `38266911828` (commit `c4df55d`), and `38285641210` (commit `e8a1745`) also passed the packaged smoke/validator and uploaded unverified candidates/diagnostics. Artifact/log retrieval for run 38285641210 ended in `EOF`; those prior details do not establish the new run's WebGPU result.

WebGPU compute/FSR checks may run on a hosted adapter. If all safe adapter requests return unavailable, the reports say `UNSUPPORTED`/`SKIPPED`, record zero dispatches/frames and `NOT RUN` output checks, and the ordinary Level A smoke remains successful only if the independent checks above passed. A WebGPU runtime pass on a software/hosted adapter still leaves physical validation `NOT RUN`. The distribution assembly and portable-package upload steps are gated off on Level A (`TRICORE_FSR_INTEGRATION_SMOKE=SKIPPED`). The diagnostic executable is uploaded under an explicitly unverified name before the runtime gate; that candidate is not a release package.

The WARP PNG diagnostic is separate from the native synthetic D3D12 WARP harness. Both are software-only: they do not establish physical-GPU support, do not establish the bundled game-side WebGPU scene, and are not ordinary-page integration.

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
| Current hosted Level A | Run `38287627583` on `ef83a601907ca13f501164f59a2b22db798d8a3b` passed Windows executable build/validation, packaged smoke, evidence validator, diagnostics upload, and summary-writing step. Portable distribution assembly/upload and Level B were skipped on the push event. Runs `38265255323`, `38266911828`, and `38285641210` are historical. |
| Current candidate/diagnostic artifacts | Run `38287627583` uploaded `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` (109,718,163 bytes), `TriCoreBrowser-Packaged-Smoke-Diagnostics` (736,876 bytes), and `TriCoreBrowser-Linux-checks` (10,274 bytes). See the executive-summary table for SHA-256 values. Names/sizes prove upload only, not report contents. |
| Artifact and log retrieval | The report and summary body for current run `38287627583` were not inspected; its uploaded artifact metadata is available. Prior diagnostics-download and job-log attempts for run `38285641210` ended in `EOF`. The current exact aggregate WebGPU status and per-stage JSON/PNG contents remain unknown. |
| Aggregate optional WebGPU status | Bounded by the successful smoke/validator to `PASS` or `SKIPPED`; which one is **UNKNOWN**. `UNSUPPORTED`, `FAIL`, and `NOT RUN` are not valid aggregate outcomes for the successful optional validator. Do not infer one branch. |
| Post-change packaged compute / EASU / RCAS / output | Actual compute status, EASU and RCAS dispatch counts, dimensions, stage metrics, visible pixels, and output images are **UNKNOWN** because evidence content is inaccessible. No packaged WebGPU FSR pass is claimed. |
| Self-hosted GPU runner availability | **UNKNOWN**; `gh api repos/shuvrajeetkamila/Tri-Core-Browser/actions/runners` returned HTTP 403 `Resource not accessible by integration`. No runner was registered or dispatched. |
| Physical GPU / driver / Level B | **NOT RUN**; Level B was skipped on push events. No physical-GPU or driver PASS claimed. |
| Separate native D3D12/WARP harness | Run `38287627651` passed a one-frame official EASU+RCAS harness test and WARP evidence checks; artifact `TriCore-FSR1-D3D12-WARP-POC` is 59,486 bytes (SHA-256 `ccd81a0c07688a30037b96b24bf32baa1d4d128ae6a9343faf86c19b1b54be8c`). The archive was not inspected. This is software WARP, not packaged WebGPU FSR or physical hardware. |
| `npm ci` (current branch) | **PASS** — 298 locked packages installed; npm reported 8 moderate audit findings. No dependency update was applied. |
| `npm test` (current branch) | **PASS — 99/99**, 0 failures/skips (85 existing tests plus 14 evidence/reporting tests). Deterministic mocks and synthetic evidence only; not GPU evidence. |
| `npm run build` (current branch) | **PASS** — Vite 8.3.4 production renderer build, 11 modules. No Windows executable package was built locally. |
| Workflow/config validation (current branch) | **PASS** — `js-yaml` parsed `build.yml`, `release.yml`, and `fsr1-native-poc.yml`; modified JavaScript syntax checks and workflow-policy tests passed. PowerShell and `actionlint` checks were unavailable because those tools are not installed. |
| `npm audit --audit-level=high` | Hosted Linux/Windows audit steps passed. Local `npm audit --json` found 8 moderate, 0 high, and 0 critical findings and exited 1 because moderate advisories exist. No dependency change or forced major-version remediation was applied. |
| `git diff --check` (current branch) | **PASS** — no whitespace errors. |
| WARP PNG processing | The Level A validator passed in run `38287627583`, which validates the required WARP PNG diagnostic gate; exact image metrics were not inspected. The separate native harness run `38287627651` passed its WARP synthetic-frame checks; both paths are software-only. |
| Ordinary external websites / games / cloud video | No FSR page interception or arbitrary game support claimed. |
| DLSS | Not implemented; no fallback/substitution claim. |

### Evidence-recovery commands and outcomes (2026-10-12)

- `gh run view --repo shuvrajeetkamila/Tri-Core-Browser 38287627583 --json databaseId,headSha,event,status,conclusion,createdAt,jobs` confirmed the current `success` push run on `ef83a601907ca13f501164f59a2b22db798d8a3b`: Windows build, packaged smoke, shared evidence validator, diagnostic upload, and summary-writing steps succeeded; portable distribution assembly/upload and Level B were skipped. The separate native WARP run `38287627651` also completed `success`, including build, EASU+RCAS execution, and evidence upload.
- `gh api "repos/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38287627583/artifacts" --jq '.artifacts[] | {name,size_in_bytes,digest,expired,created_at}'` returned current Windows candidate, diagnostics, and Linux-check metadata. `gh api` for run `38287627651` returned native WARP artifact metadata. Sizes and SHA-256 digests are recorded in the executive summary; artifacts were not expired.
- The current run `38287627583` diagnostic archive and job-log body were not inspected. Prior artifact and log retrieval attempts for run `38285641210` returned `EOF`; those failures are documented and were not retried against the latest run.
- `gh api repos/shuvrajeetkamila/Tri-Core-Browser/actions/runners` returned HTTP 403, `Resource not accessible by integration`. No runner inventory conclusion can be drawn from that response.

The exact current WebGPU branch and stages remain **UNKNOWN**, not converted to `SKIPPED` or `PASS`. After the current Level A diagnostics become inspectable, record the actual aggregate and per-stage report. Do not promote a software/hosted result to physical-GPU evidence or a `SKIPPED` result to `PASS`.
