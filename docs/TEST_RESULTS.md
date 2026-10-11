# Test results

**Recorded:** 2026-10-11 (UTC)
**Source branch:** `arena/66abfdc9-tri-core-browser`
**Source revision:** verified local tree on `arena/66abfdc9-tri-core-browser`; Windows CI results must be tied to the exact pushed commit before being treated as verified.

## Local Linux verification

| Check | Result | Evidence / limits |
| --- | --- | --- |
| `npm test` | **PASS — 34/34** | Node tests cover URL parsing, fixed graphics lifecycle/priority/fallback, persistent preferences, accessible panel disclosure behavior, real WebAssembly execution, FSR capture request/context/size limits, native argument construction, and browser-PNG report validation. |
| `npm run build` | **PASS** | Vite 8.3.4 production renderer build completed. This does not build the Electron main process as a package or compile the Windows helper. |
| JavaScript syntax checks | **PASS** | `node --check` passed for all JavaScript/CommonJS files in `electron/`, `src/`, `tests/`, and `scripts/`. |
| Workflow YAML parse | **PASS** | `js-yaml` parsed `.github/workflows/build.yml`, `fsr1-native-poc.yml`, and `release.yml`. |
| `git diff --cached --check` | **PASS** | Checked all staged source, documentation, license and workflow files after removing trailing whitespace. |
| `npm audit --audit-level=high` | **PASS threshold** | 8 moderate vulnerabilities; no high/critical findings. The suggested `--force` remediation is breaking, so dependency versions were not changed. |

## Current-revision Windows validation — not yet run

| Gate | Result | Required evidence |
| --- | --- | --- |
| MSVC/CMake build of `TriCoreFsr1Poc.exe` and bundled AMD shader inputs | **NOT RUN** | Windows Actions must compile the D3D12/WIC helper and package the helper/resources. Linux Arena does not have MSVC or the Windows SDK. |
| Packaged Windows x64 portable app | **NOT BUILT** | Requires the Windows packaging job. A previous revision's artifact is not proof for this revision. |
| Packaged WebContentsView → `capturePage()` PNG → FSR1 → preview on WARP | **NOT RUN** | Required smoke opens the bundled animated WebGL2 scene, varies the WebContentsView size, requires three unique captured PNG frames at three distinct resolutions, processes them via WARP, validates reports/output PNGs, and retains captures. This gate is implemented but not yet executed for this source. |
| Physical GPU / AMD-vendor path | **NOT RUN** | WARP is software. Run the helper with `--hardware --adapter-index N` on identified physical hardware and review adapter model/vendor/driver/API/features, reports and captures. |
| NVIDIA DLSS / Frame Generation | **NOT IMPLEMENTED / NOT TESTED** | No authorized Streamline/DLSS runtime, native controlled renderer or NVIDIA hardware result is present. |
| Arbitrary webpage, game, WebGPU, video, DRM, cloud-stream or external-app upscaling | **UNSUPPORTED / NOT TESTED** | No supported Chromium compositor texture/swap-chain bridge or such integration is included. |
| Performance improvement / image-quality superiority | **NOT CLAIMED** | Screenshot, native wall/fence and GPU timings (when available) are diagnostic measurements. They are not general page FPS or evidence of a performance gain. |

The native synthetic-pattern WARP job passed on an earlier commit, recorded in the historical implementation plan; that result does not validate the new PNG input, the packaged browser-to-FSR route, or this unpushed source. After push, the Windows Actions logs and uploaded `TriCoreBrowser-Windows-x64` / `TriCore-FSR1-D3D12-WARP-POC` artifacts are authoritative for the exact commit. The portable ZIP is gated on successful browser-frame WARP evidence and contains the controlled input/output captures and per-frame reports.
