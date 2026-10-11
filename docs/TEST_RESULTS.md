# Test results

**Recorded:** 2026-10-11 (UTC)
**Source branch:** `arena/66abfdc9-tri-core-browser`
**Source state:** current branch revision; Windows CI results must be tied to the exact pushed commit before being treated as verified.

## Local Linux verification

| Check | Result | Evidence / limits |
| --- | --- | --- |
| `npm test` | **PASS — 35/35** | Node tests cover URL parsing, fixed graphics lifecycle/priority/fallback, persistent preferences, accessible panel disclosure behavior, real WebAssembly execution, FSR capture request/context/size limits, native argument construction, per-frame bilinear-reference paths, and browser-PNG report validation. |
| `npm run build` | **PASS** | Vite 8.3.4 production renderer build completed. This does not build the Electron main process as a package or compile the Windows helper. |
| JavaScript syntax checks | **PASS** | `node --check` passed for all JavaScript/CommonJS files under `electron/`, `src/`, `tests/`, and `scripts/`. |
| `git diff --check` | **PASS** | No whitespace errors. |
| Workflow/package JSON syntax | **PASS** | `js-yaml` parsed all three GitHub workflow files; `package.json` parsed as valid JSON. PowerShell script syntax remains unverified on Linux. |
| `npm audit --audit-level=high` | **PASS (threshold)** | Fresh audit reports 8 moderate, 0 high, 0 critical findings. `npm audit fix --force` was not run because it requests a breaking electron-builder downgrade. |

## Current-revision Windows validation — not yet run

| Gate | Result | Required evidence |
| --- | --- | --- |
| MSVC/CMake build of `TriCoreFsr1Poc.exe` and bundled AMD shader inputs | **NOT RUN** | Windows Actions must compile the D3D12/WIC helper and package the helper/resources. Linux Arena does not have MSVC or the Windows SDK. |
| Packaged Windows x64 portable app | **NOT BUILT** | Requires the Windows packaging job. A previous revision's artifact is not proof for this revision. |
| Packaged WebContentsView → `capturePage()` PNG → FSR1 → preview on WARP | **NOT RUN** | Required smoke opens the bundled animated WebGL2 scene, varies the WebContentsView size, requires three unique captured PNG frames at three distinct resolutions, processes them via WARP, validates per-frame reports plus input/output/bilinear-reference PNGs and unique reference paths, and retains captures. This gate is implemented but not yet executed for this source. |
| Physical GPU / AMD-vendor path | **NOT RUN** | WARP is software. Run the helper with `--hardware --adapter-index N` on identified physical hardware and review adapter model/vendor/driver/API/features, reports and captures. |
| NVIDIA DLSS / Frame Generation | **NOT IMPLEMENTED / NOT TESTED** | No authorized Streamline/DLSS runtime, native controlled renderer or NVIDIA hardware result is present. |
| Arbitrary webpage, game, WebGPU, video, DRM, cloud-stream or external-app upscaling | **UNSUPPORTED / NOT TESTED** | No supported Chromium compositor texture/swap-chain bridge or such integration is included. |
| Performance improvement / image-quality superiority | **NOT CLAIMED** | Screenshot, native wall/fence and GPU timings (when available) are diagnostic measurements. They are not general page FPS or evidence of a performance gain. |

Prior-commit CI evidence (not acceptance for this current merge revision): on `7c4920d34003ad493a9399d81d42ff2607f3fbd1`, the isolated native D3D12/WARP harness passed in [run 38143083177](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38143083177), and the Linux tests/build passed. The Windows portable packaging command also succeeded, but the packaged-app smoke verification failed in [run 38143083272](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38143083272); the Windows package-upload steps were skipped, so no portable artifact or successful browser-capture-to-FSR proof came from that run. The exact smoke failure detail was not retrievable here. Re-run CI after pushing the current revision; the updated workflow is now configured to retain smoke logs/captures as a diagnostic artifact even if validation fails. A successful current-revision smoke must retain the three input PNGs, FSR outputs, bilinear-reference captures, and per-frame reports before a portable ZIP or release can be accepted.
