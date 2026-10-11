# Test results

**Recorded:** 2026-10-11 (UTC)
**Source branch:** `arena/66abfdc9-tri-core-browser`
**Source commit:** `59018a6f21852761db2677d3d1fee58f5864834e` (merge of local session work and remote branch updates)

## Local Linux verification

| Check | Result | Evidence / limits |
| --- | --- | --- |
| `npm test` | **PASS — 36/36** | Node tests cover URL parsing, fixed graphics lifecycle/priority/fallback, persistent preferences, accessible panel disclosure behavior, real WebAssembly execution, FSR capture request/context/size limits, native argument construction, per-frame bilinear-reference paths, and browser-PNG report validation. |
| `npm run build` | **PASS** | Vite 8.3.4 production renderer build completed. This does not build the Electron main process as a package or compile the Windows helper. |
| JavaScript syntax checks | **PASS** | `node --check` passed for all JavaScript/CommonJS files under `electron/`, `src/`, `tests/`, and `scripts/`. |
| `git diff --check` | **PASS** | No whitespace errors in the current candidate changes. |
| Workflow/package JSON syntax | **PASS** | `js-yaml` parsed all three GitHub workflow files; `package.json` parsed as valid JSON. PowerShell script syntax remains unverified on Linux. |
| `npm audit --audit-level=high` | **PASS (threshold)** | Fresh audit reports 8 moderate, 0 high, 0 critical findings. `npm audit fix --force` was not run because it requests a breaking electron-builder downgrade. |

## Current-source Windows CI — commit `59018a6`

| Gate | Result | Evidence / limits |
| --- | --- | --- |
| Native MSVC/CMake build | **PASS** | The isolated D3D12 FSR1 workflow built the helper on Windows: [run 38144964911](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38144964911). |
| Native synthetic-input FSR1 on WARP | **PASS — software regression only** | The same run executed AMD FSR1 EASU + RCAS using D3D12 WARP and uploaded its POC evidence. This is not physical-GPU or browser-frame evidence. |
| Linux renderer, tests, and dependency checks | **PASS** | The Linux job passed in [run 38144964898](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38144964898). |
| Windows x64 portable executable build | **BUILD STEP PASS; distribution gate failed** | `npm run package:win` completed, but the following step—which checks the executable and runs the packaged smoke—failed. The exact failing subcheck is unavailable. Portable distribution assembly and package upload were skipped; no tested ZIP/executable was published. |
| Packaged WebContentsView → `capturePage()` PNG → FSR1 → preview on WARP | **NOT ACCEPTED — smoke gate failed** | The current run's “Verify executable and run packaged-app smoke test” step exited nonzero. No passing three-frame/three-resolution browser-to-FSR report or reviewed capture set is available, and the exact cause remains unknown. The workflow uploaded `TriCoreBrowser-Packaged-Smoke-Diagnostics` (306 bytes), but this environment could not retrieve the signed artifact download; its contents remain unreviewed. See [run 38144964898](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38144964898). |
| Physical GPU / AMD-vendor path | **NOT RUN** | WARP is software. Run the helper with `--hardware --adapter-index N` on identified physical hardware and review adapter model/vendor/driver/API/features, reports and captures. |
| NVIDIA DLSS / Frame Generation | **NOT IMPLEMENTED / NOT TESTED** | No authorized Streamline/DLSS runtime, native controlled renderer or NVIDIA hardware result is present. |
| Arbitrary webpage, game, WebGPU, video, DRM, cloud-stream or external-app upscaling | **UNSUPPORTED / NOT TESTED** | No supported Chromium compositor texture/swap-chain bridge or such integration is included. |
| Performance improvement / image-quality superiority | **NOT CLAIMED** | Screenshot, native wall/fence and GPU timings (when available) are diagnostic measurements. They are not general page FPS or evidence of a performance gain. |

No release was published for this commit. The release workflow did not produce a portable package; the current packaged-browser smoke must pass before a Windows distribution or stronger browser-frame processing claim is accepted. The native WARP pass proves only that the isolated FSR1 harness can process its synthetic regression input on software D3D12. The intended browser experiment remains a bounded screenshot/readback route, not zero-copy or arbitrary-page integration.

Historical context: on previous remote commit `7c4920d34003ad493a9399d81d42ff2607f3fbd1`, native WARP also passed in [run 38143083177](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38143083177) while the packaged browser smoke failed in [run 38143083272](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38143083272). Those results are superseded by the current-commit run above and do not establish browser-frame success.
