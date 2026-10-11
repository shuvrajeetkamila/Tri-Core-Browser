# Test results

**Recorded:** 2026-10-11 (UTC)
**Source branch:** `arena/66abfdc9-tri-core-browser`
**CI-tested commit:** `b7e844fca45cd64c494d9862b3e19e153c283ed7`

## Local Linux verification

| Check | Result | Evidence / limits |
| --- | --- | --- |
| `npm test` | **PASS — 36/36** | Node tests cover URL parsing, fixed graphics lifecycle/priority/fallback, persistent preferences, accessible panel disclosure behavior, real WebAssembly execution, FSR capture request/context/size limits, native argument construction, per-frame bilinear-reference paths, browser-PNG report validation, and the Windows smoke workflow gates. |
| `npm run build` | **PASS** | Vite 8.3.4 production renderer build completed. This does not build the Electron main process as a package or compile the Windows helper. |
| JavaScript syntax checks | **PASS** | `node --check` passed for JavaScript/CommonJS files under `electron/`, `src/`, `tests/`, and `scripts/`. |
| `git diff --check` | **PASS** | No whitespace errors in the committed changes. |
| Workflow/package JSON syntax | **PASS** | `js-yaml` parsed all three GitHub workflow files; `package.json` parsed as valid JSON. PowerShell packaging-script execution remains unverified. |
| `npm audit --audit-level=high` | **PASS (threshold)** | Fresh audit reports 8 moderate, 0 high, 0 critical findings. `npm audit fix --force` was not run because it requests a breaking electron-builder downgrade. |

## Current-source Windows CI — commit `b7e844f`

| Gate | Result | Evidence / limits |
| --- | --- | --- |
| Native MSVC/CMake build | **PASS** | The isolated D3D12 FSR1 workflow built the helper on Windows: [run 38146013763](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38146013763). |
| Native synthetic-input FSR1 on WARP | **PASS — software regression only** | The same run executed AMD FSR1 EASU + RCAS using D3D12 WARP and uploaded its POC evidence. This is not physical-GPU or browser-frame evidence. |
| Linux renderer, tests, and dependency checks | **PASS** | The Linux job passed in [run 38146013775](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38146013775). |
| Packaged Windows executable validation | **PASS** | The workflow's separate validation step confirmed that `release/TriCoreBrowser.exe` exists and exceeds the 30,000,000-byte minimum. Exact file size is not available here; no executable artifact was published. |
| Packaged browser smoke | **FAIL — browser-frame gate not accepted** | The distinct PowerShell “Run packaged-app smoke test” step failed with exit code 1 after executable validation passed. The exact internal substep or app error is unknown because the raw log download returned EOF. The diagnostic-summary and artifact-upload steps succeeded; artifact `TriCoreBrowser-Packaged-Smoke-Diagnostics` is 596 bytes, but its signed download could not be retrieved in this environment, so contents remain unreviewed. See [run 38146013775](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38146013775). |
| Final Windows ZIP/package | **NOT BUILT / NOT UPLOADED** | Portable distribution assembly and upload were skipped after the smoke failure. The Windows release job was skipped; no current-source release was published. |
| Physical GPU / AMD-vendor path | **NOT RUN** | WARP is software. Run the helper with `--hardware --adapter-index N` on identified physical hardware and review adapter model/vendor/driver/API/features, reports and captures. |
| NVIDIA DLSS / Frame Generation | **NOT IMPLEMENTED / NOT TESTED** | No authorized Streamline/DLSS runtime, native controlled renderer or NVIDIA hardware result is present. |
| Arbitrary webpage, game, WebGPU, video, DRM, cloud-stream or external-app upscaling | **UNSUPPORTED / NOT TESTED** | No supported Chromium compositor texture/swap-chain bridge or such integration is included. |
| Performance improvement / image-quality superiority | **NOT CLAIMED** | Screenshot, native wall/fence and GPU timings (when available) are diagnostic measurements. They are not general page FPS or evidence of a performance gain. |

The smoke workflow now separates executable validation from app smoke, and the current run confirms the executable check passed while the smoke step did not. It also surfaces diagnostic tails in the job summary and uploads them even on failure, but the signed artifact/log storage could not be read from this environment. The next gate is to inspect that uploaded diagnostic from GitHub and fix the actual smoke failure; do not publish a portable package or claim browser-frame processing until a current packaged run validates three changing browser-rendered PNG inputs, three resolutions, FSR outputs, bilinear-reference PNGs, and per-frame reports.
