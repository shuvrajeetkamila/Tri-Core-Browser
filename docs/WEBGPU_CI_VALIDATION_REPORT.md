# WebGPU CI validation report

## Executive summary

The packaged Windows smoke path now separates ordinary packaged-app verification from WebGPU/FSR1 GPU evidence. A hosted Windows runner uses an **optional** GPU policy: safe no-adapter detection is reported as `SKIPPED`, never as a GPU `PASS`, and a successful hosted smoke is explicitly **not release-eligible**. A separate opt-in Level B job and the prerelease build require a configured self-hosted Windows runner labelled `self-hosted`, `windows`, `x64`, and `gpu`. Level B fails unless compute, bundled FSR1 output, physical-adapter identity, an active Chromium GPU device, and a non-empty driver version are all verified.

The hardened source was pushed as commit `499e44e8fefc8650ca6b438299d16d4092c52e76`. Post-change workflow run [38265255323](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38265255323) passed both Linux checks and the hosted Windows Level A build/package smoke; the packaged-smoke validator and diagnostics upload succeeded, while portable distribution assembly was skipped. Its diagnostic executable is explicitly unverified. The separate Level B job was skipped because this was a push, not an opt-in `workflow_dispatch`. The exact optional WebGPU compute/FSR status was not retrieved: this sandbox could not fetch GitHub Actions log/artifact content from its result-storage host. Thus this run is not cited as proof of a WebGPU compute PASS or live FSR PASS. A separate post-change D3D12/WARP harness run [38265255364](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38265255364) passed; it is software-only. No physical GPU, physical driver, Level B, or release result is claimed. The Actions runner inventory could not be read (runner API returned HTTP 403), so the required self-hosted GPU runner's presence/configuration remains unverified.

## Investigation of the observed failure

The latest pre-hardening run was `38249515260` at source commit `8f5bcd4ea899c437820e2f9efa0918b72ccac2a9`. Its Windows job failed at **“Run packaged-app smoke test.”** The preceding executable build, package validation, automated tests, and audit succeeded; the separate Linux renderer/WASM/dependency job succeeded. Distribution assembly and upload were skipped.

The full failure annotation (check `114789255916`) confirms the cause. The hosted Windows runner reported Microsoft Basic Render Driver / ANGLE D3D11 WARP; its D3D12 diagnostics showed WARP available and no non-software adapters. The packaged browser, fullscreen, local HTTP/JavaScript/WASM, tab, HTTPS, and separate screenshot→PNG→D3D12-WARP diagnostic all passed. The bundled WebGPU FSR1 scene then tried high-performance, low-power, default, and explicit fallback adapter requests; all four returned unavailable. Smoke failed at `webgpu-pipeline-dispatch-validation` before EASU/RCAS shader compilation, pipeline creation, dispatch, or FSR output. The failing gate treated the no-adapter `UNSUPPORTED` state as fatal under its strict policy. This confirms an adapter-availability failure, not a shader/dispatch/output defect. The D3D12 WARP screenshot diagnostic is a separate software path and does not establish WebGPU or physical-GPU support.

The implementation now validates adapter-request evidence before allowing an optional Level A skip. API/device request errors, a rejected adapter request, selected-adapter initialization/runtime failures, shader/pipeline/resource failures, incomplete dispatch, and missing/invalid output evidence remain failures.

The post-change Level A run `38265255323` passed the packaged Windows smoke and the shared validator. The exact WebGPU outcome (`PASS` versus a valid optional `SKIPPED`) could not be read from the Actions artifact/log in this sandbox; do not infer either. Level B did not run.

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

Post-change run `38265255323` built/size-validated the Windows executable, passed the packaged smoke/validator, and uploaded the diagnostics; it skipped distribution assembly and the portable package. The exact optional WebGPU status in that run could not be retrieved from the job artifact/log.

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
| Source investigation | Confirmed in annotation 114789255916: all four WebGPU adapter requests unavailable on a WARP-only hosted runner; failure occurred before shader/dispatch/output |
| Level A/Level B workflow implementation | Level A passed in run 38265255323; Level B was skipped because this was a push, not an opt-in dispatch |
| Self-hosted GPU runner availability | Unknown; Actions runner inventory request returned 403 |
| `npm ci` | PASS (locked dependencies installed; 8 moderate audit findings reported) |
| `npm test` | PASS — 85 tests, 0 failures (including deterministic policy, path-confinement, and synthetic report-validator tests; mocks only) |
| `npm run build` | PASS — Vite production renderer build |
| `npm audit --audit-level=high` | PASS — 8 moderate findings, 0 high/critical findings |
| Packaged Windows executable after changes | Built and size-validated in run 38265255323; uploaded only as an explicitly unverified diagnostic candidate artifact (109,719,020-byte archive) |
| Packaged WebGPU compute after changes | Attempted under optional policy; Level A validator passed, but the exact report status/result was not retrievable from Actions artifacts/logs |
| Live bundled WebGPU FSR1 EASU/RCAS output after changes | Attempted under optional policy; exact `PASS` versus safe `SKIPPED` state and frame/output details not retrievable; no live FSR PASS claimed |
| Physical GPU / driver / output validation | NOT RUN; Level B was skipped on push; no physical-GPU PASS claimed |
| WARP PNG processing after changes | Level A packaged validator passed the screenshot→PNG→WARP evidence gate; separate native WARP harness run 38265255364 also passed; both are software-only |
| Ordinary external websites / games / cloud video | No FSR page interception or arbitrary game support claimed |
| DLSS | Not implemented; no fallback/substitution claim |

After any actual run, record the exact workflow URL/run ID, commit, runner/GPU/driver identity, report paths and statuses, and whether packaged FSR reached visible output. Do not promote a software/hosted result to physical-GPU evidence or a `SKIPPED` result to `PASS`.
