# WebGPU CI validation report

## Executive summary

The packaged Windows smoke path now separates ordinary packaged-app verification from WebGPU/FSR1 GPU evidence. A hosted Windows runner uses an **optional** GPU policy: safe no-adapter detection is reported as `SKIPPED`, never as a GPU `PASS`, and a successful hosted smoke is explicitly **not release-eligible**. A separate opt-in Level B job and the prerelease build require a configured self-hosted Windows runner labelled `self-hosted`, `windows`, `x64`, and `gpu`. Level B fails unless compute, bundled FSR1 output, physical-adapter identity, an active Chromium GPU device, and a non-empty driver version are all verified.

This repository/session has **not run either Windows workflow after these changes**. The GitHub runner inventory could not be read in this session (the Actions runner API returned HTTP 403), so the presence and configuration of the required self-hosted GPU runner remain unverified. No physical GPU, driver, EASU/RCAS dispatch, packaged FSR1 output, or release result is claimed as tested by this report.

## Investigation of the observed failure

The latest available GitHub run was `38249515260` at source commit `8f5bcd4ea899c437820e2f9efa0918b72ccac2a9`. Its Windows job failed at **“Run packaged-app smoke test.”** The preceding executable build, package validation, automated tests, and audit succeeded; the separate Linux renderer/WASM/dependency job succeeded. Distribution assembly and upload were skipped.

The packaged smoke source has a distinct WebGPU adapter-discovery result: the independent probe can report `UNSUPPORTED` when the API exists but every safe adapter request returns `null`. The bundled FSR1 scene can also report unsupported before shader compilation or frame processing. The former smoke gate treated unsupported as fatal without separating that capability state from a device/shader/runtime/output failure. GitHub's Actions log details were not retrieved in this session, so the available run metadata does **not** establish that the observed failure was specifically caused by null adapter requests; that remains a source-supported hypothesis, not a verified runner trace.

The implementation now validates the adapter-request evidence before allowing an optional skip. An API error, a rejected device request, a shader/pipeline/resource failure, an incomplete dispatch, or missing/invalid output evidence remains a failure.

## Status model

The implementation and JSON reports keep these states distinct:

- `PASS`: the named check actually ran and met its acceptance criteria.
- `SKIPPED`: only an optional no-compatible-adapter result, with safe API/adapter discovery evidence and no processing, may use this status.
- `UNSUPPORTED`: the required GPU path lacks the capability or hardware evidence it needs; required jobs fail.
- `FAIL`: a check ran and encountered a runtime, device, shader, pipeline, resource, dispatch, output, security, or report error.
- `NOT RUN`: no attempt was made; this is never a pass.
- `BLOCKED`: only the external HTTPS connectivity probe may be blocked; it does not disable certificate validation or mark other checks passed.

A skip does not make the GPU acceptance status pass. The enclosing Level A packaged smoke may pass its **GPU-independent** gates while carrying `webGpuAcceptance.status = SKIPPED`, `physicalGpuValidation = NOT RUN`, and `releaseEligible = false`.

## Level A: hosted Windows checks

`.github/workflows/build.yml` runs Level A on `windows-latest` with `TRICORE_GPU_TEST_MODE=optional`. It retains the packaged executable size/existence check and these packaged runtime checks:

- Electron startup and the browser shell / graphics-mode controls.
- Immersive fullscreen enter/exit and three-core layout restoration.
- Local HTTP page, JavaScript, and the controlled WebAssembly `add(19, 23) = 42` diagnostic.
- Browser tab create/select/close lifecycle.
- HTTPS navigation using Chromium certificate validation; external-network failure is recorded as `BLOCKED`, without certificate bypass.
- The existing WebGL2 `WebContentsView` → `capturePage()` PNG → native D3D12 FSR1 helper on **WARP software**, with three changing frames, three capture resolutions, per-frame reports, processed/reference PNGs, and image/report checks.
- Report generation, smoke logs, executable candidate upload, and always-run diagnostic artifact upload.

WebGPU compute/FSR checks may run on a hosted adapter. If all safe adapter requests return unavailable, the reports say `UNSUPPORTED`/`SKIPPED`, record zero dispatches/frames and `NOT RUN` output checks, and the ordinary Level A smoke remains successful only if the independent checks above passed. A WebGPU runtime pass on a software/hosted adapter still leaves physical validation `NOT RUN`. The distribution assembly and portable-package upload steps are gated off on Level A (`TRICORE_FSR_INTEGRATION_SMOKE=SKIPPED`). The diagnostic executable is uploaded under an explicitly unverified name before the runtime gate; that candidate is not a release package.

WARP evidence is limited to this diagnostic route. It is software processing, not physical-GPU validation and not the bundled game-side WebGPU FSR1 scene.

## Level B: required physical-GPU validation

The `windows-gpu-validation` job in `.github/workflows/build.yml` is opt-in through the `workflow_dispatch` input `run_physical_gpu_validation` (default `false`). It is isolated from ordinary push/pull-request CI and runs on:

```yaml
runs-on: [self-hosted, windows, x64, gpu]
```

The repository must have a Windows x64 GitHub Actions self-hosted runner carrying all four labels, with a supported GPU and driver installed. If that runner is absent/offline, an opted-in job will remain queued or fail to start; CI must not fall back to `windows-latest`. Runner registration, labels, host security, driver version, and GPU availability must be managed by the repository owner. The current session could not inspect Actions runner inventory.

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

`tests/windows-smoke-workflows.test.js` asserts the Level A/Level B/release runner policies, artifact retention, shared validation script, and strict package gate. These tests validate control-flow and policy only; they are not evidence of WebGPU initialization, dispatch, rendered output, a physical GPU, or packaged FSR execution.

The shared `scripts/validate-packaged-smoke.cjs` checks the emitted JSON reports and PNG evidence. `scripts/package-windows.ps1` independently gates distribution assembly.

## Evidence and limitations

| Check | Current result |
|---|---|
| Source investigation | Windows packaged-smoke step failure confirmed from run metadata; exact adapter trace not retrieved |
| Level A/Level B workflow implementation | Added in this change; not yet run on GitHub |
| Self-hosted GPU runner availability | Unknown; Actions runner inventory request returned 403 |
| `npm ci` | PASS (locked dependencies installed; 8 moderate audit findings reported) |
| `npm test` | PASS — 85 tests, 0 failures (including deterministic policy, path-confinement, and synthetic report-validator tests; mocks only) |
| `npm run build` | PASS — Vite production renderer build |
| `npm audit --audit-level=high` | PASS — 8 moderate findings, 0 high/critical findings |
| Packaged Windows executable after changes | Not built in this Linux session |
| Packaged WebGPU compute after changes | Not executed in this session |
| Live bundled WebGPU FSR1 EASU/RCAS output after changes | Not executed in this session |
| Physical GPU / driver / output validation | Not executed in this session; no PASS claimed |
| WARP PNG processing after changes | Not executed in this session; WARP remains software-only |
| Ordinary external websites / games / cloud video | No FSR page interception or arbitrary game support claimed |
| DLSS | Not implemented; no fallback/substitution claim |

After any actual run, record the exact workflow URL/run ID, commit, runner/GPU/driver identity, report paths and statuses, and whether packaged FSR reached visible output. Do not promote a software/hosted result to physical-GPU evidence or a `SKIPPED` result to `PASS`.
