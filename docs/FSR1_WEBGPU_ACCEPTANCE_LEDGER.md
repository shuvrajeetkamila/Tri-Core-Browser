# FSR1 WebGPU acceptance ledger

**Recorded:** 2026-10-12 (Asia/Kolkata)
**Repository:** `shuvrajeetkamila/Tri-Core-Browser`
**Required branch:** `arena/66abfdc9-tri-core-browser`
**Source identity:** `31239756723c2c43872e03e6dc8a6ae2b72a14a5` (`fix: retry WebGPU adapter discovery safely`), pushed to `arena/66abfdc9-tri-core-browser`.
**Latest packaged attempt:** run [38228901586](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38228901586), source `3123975`; all four WebGPU adapter requests returned `null` before shader or output checks.
**Physical-GPU validation:** **NOT RUN**.

This ledger distinguishes code/static evidence from packaged Windows runtime evidence. A passing parser, renderer build, pipeline-creation call, queue completion, WARP result, or adapter label does not by itself establish correct visible output or physical-GPU support.

## Acceptance gates

| ID | Acceptance criterion | Current result | Evidence / limitation |
| --- | --- | --- | --- |
| A-01 | Preserve browser features, sandboxing, CSP, narrow local-scene IPC, keyboard-accessible collapsible UI, preferences, WASM tests, native screenshot diagnostic, safe Chromium fallback, and automatic/manual policy. | **PASS — local regressions** | `npm test` passes 56/56, including the adapter-retry and WARP/Microsoft Basic Render Driver classification regressions, fullscreen restoration/accessibility, sender validation, restrictive local CSP, FSR policy/failure states, WASM, panel persistence/collapse, and the separate PNG diagnostic. Static tests are not a packaged runtime test. |
| A-02 | Keep detection, adapter/device initialization, shader/pipeline/resource failure, processing, output submission, visible verification, unsupported, and device-loss states distinct. | **PARTIAL — adapter discovery exercised** | Source/UI and static lifecycle assertions distinguish these states and preserve failure stages. Run 38228901586 recorded `null` for all four requests (high-performance, low-power, default, and explicit fallback); later WebGPU states were not reached. |
| A-03 | Compile EASU and RCAS WGSL and successfully create both **compute** pipelines plus the presentation pipeline. | **NOT RUN — adapter unavailable** | Runs 38227656945 and 38228901586 both stopped before shader compilation because WebGPU adapter discovery returned `null`. The parser-only `wgsl_reflect@1.6.0` result is not Dawn/Tint semantic validation or WebGPU pipeline creation. |
| A-04 | Dispatch EASU and RCAS repeatedly on the controlled scene's own lower-resolution GPU target. | **NOT RUN — adapter unavailable** | Runs 38227656945 and 38228901586 returned no WebGPU adapter; neither compute pass ran. The strict smoke gate still requires at least three dispatches per pipeline and is not weakened. |
| A-05 | Present processed output and verify screenshot pixels against the processed GPU output. | **NOT RUN — adapter unavailable** | Both packaged runs stopped before WebGPU output generation. The strict gate still requires a post-processing `WebContentsView` PNG to match frozen RCAS texture samples; queue completion alone is not accepted as display proof. |
| A-06 | Compare the low-resolution scene target, EASU intermediate, and RCAS output; report numerical checks and limitations honestly. | **PARTIAL** | Node unit tests pass for the CPU bilinear baseline comparison, stage contribution/detail checks, and malformed/flat image rejection. No actual WebGPU texture captures or runtime numerical report exists. The bilinear baseline is not an AMD conformance oracle. |
| A-07 | Prove changing scene frames and retain structured summaries, hashes, three stage PNGs, and visible-canvas screenshot evidence. | **NOT RUN — adapter unavailable** | The opt-in packaged smoke failed adapter discovery before WebGPU frame/evidence generation. The separate screenshot→D3D12 WARP diagnostic did pass; it is not WebGPU evidence. |
| A-08 | Build and run the current-source packaged Windows x64 app; run both the separate capturePage→D3D12 WARP diagnostic and WebGPU smoke. | **PARTIAL — run 38228901586** | Source `3123975` packaged/validated the executable, passed fullscreen/browser/WASM/HTTPS checks, and processed three changing capturePage PNG frames through D3D12 WARP. Live WebGPU returned `null` for high-performance, low-power, default, and explicit fallback requests. Chromium reported Microsoft Basic Render Driver / ANGLE D3D11 WARP; D3D12 diagnostics showed WARP available and zero non-software adapters. No WebGPU shader/dispatch/output gate passed. |
| A-09 | Validate physical GPU identity and physical-device FSR1 behavior. | **NOT RUN** | No named physical adapter/device was tested. WARP and software adapters are never physical-GPU evidence. |
| A-10 | Make no claims of DLSS, arbitrary-page/game support, DRM/video/cloud-stream support, or performance gains without direct evidence. | **PASS — scoped source/docs** | DLSS remains unimplemented; the live path is opt-in and limited to the bundled game-owned WebGPU scene. Ordinary pages remain Chromium; no FPS or performance gain is claimed. |
| A-11 | Review the eight moderate npm findings and avoid forced/breaking upgrades. | **PARTIAL — reviewed, unresolved upstream chain** | Full locked tree has 8 moderate, 0 high, 0 critical. They converge on `sprintf-js@1.1.3` through `roarr@2.15.4` → `global-agent@3.0.0` → builder's `@electron/get@3.1.0`. Registry reports no `sprintf-js@1.1.4`; audit's suggested `electron-builder@26.5.0` remediation is flagged semver-major and would change the pinned `26.17.0` build chain. No force, downgrade, or unverified override was applied. Re-test a compatible upstream fix with Windows packaging before adopting it. |
| A-12 | Add a prominent active-core fullscreen toggle that hides normal browser chrome, restores the previous layout, and remains keyboard-accessible/exitable. | **PASS — packaged Windows smoke** | Run 38227656945 passed immersive fullscreen entry/exit and browser-view expansion/restoration checks. Unit tests cover the keyboard-accessible controls and F11 behavior. |
| A-13 | Commit/push only the existing session branch, bind results to the exact SHA/CI run, and publish only through the existing validated release workflow. | **PASS — existing branch only** | Commit `31239756723c2c43872e03e6dc8a6ae2b72a14a5` was pushed only to `arena/66abfdc9-tri-core-browser`. Packaged result is run 38228901586; native WARP build/result is run 38228901578. No pull request or release was created. |

## Local evidence completed so far

| Gate | Result | Limit |
| --- | --- | --- |
| `npm ci` | **PASS** | Clean lockfile install; npm reports eight unresolved moderate dependency findings. |
| `npm test` | **PASS — 56/56** | Includes safe WebGPU adapter retries, software-adapter classification, WebGPU validation-helper, stage-specific fallback, fullscreen UI/accessibility/IPC/security/layout assertions, and Windows workflow assertions; no Electron/GPU runtime. |
| `npm run build` | **PASS** | Vite renderer only; not Electron packaging or GPU validation. |
| JavaScript/CommonJS syntax checks | **PASS** | `node --check` passed for source, test, and script JavaScript/CommonJS files; does not compile WGSL in Dawn/Tint. |
| Workflow/package metadata parse | **PASS** | `js-yaml` parsed the build, native FSR diagnostic, and release workflows; `package.json` parsed as JSON. |
| `git diff --check` | **PASS** | No whitespace errors at check time. |
| WGSL parser check | **PASS — parser-only** | Five modules accepted by `wgsl_reflect@1.6.0`; not WebGPU semantic validation or pipeline creation. |
| `npm audit --audit-level=high` | **PASS — threshold only** | Eight moderate advisories remain; see A-11. |
| Windows PowerShell assertions/package script | **NOT RUN locally** | Linux host; CI is the authoritative Windows execution. |
| Current-source Windows packaged smoke | **FAIL — WebGPU adapter discovery** | Run 38228901586 built source `3123975`; all four standard/fallback requests returned `null`. Packaging and non-WebGPU tests passed, but the strict WebGPU gate remains failed. |

## Current-source CI and release record

- Latest packaged smoke: [run 38228901586](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38228901586), source `31239756723c2c43872e03e6dc8a6ae2b72a14a5`; packaging/browser checks passed, but all adapter requests returned `null`. The job artifact includes the complete smoke diagnostics; check-run annotation `114743190120` records the request outcomes and renderer details.
- Native D3D12 FSR1 WARP harness: [run 38228901578](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38228901578) passed, including the revised Basic Render Driver classification; software-only and separate from WebGPU.
- The adapter retry change did not create an adapter. Chromium reported Microsoft Basic Render Driver / ANGLE D3D11 WARP and the native probe found WARP available with zero non-software D3D12 adapters. Chromium's [software-WebGPU adapter issue 40277080](https://issues.chromium.org/issues/40277080) documents that CPU adapters may remain unavailable (`requestAdapter()` can return `null`) and that unsafe-WebGPU/blocklist overrides are separate developer-only escape hatches. None was applied here.
- Packaged WebGPU shader/pipeline/dispatch/visible-pixel acceptance: **NOT RUN**; the strict gate remains failed at adapter discovery.
- Public Windows release/prerelease: **NOT PUBLISHED**.
- Physical-GPU acceptance: **NOT RUN**.

The next viable route is to run the same packaged smoke on Windows with a Chromium-supported WebGPU adapter and its normal vendor driver. Do not bypass Chromium's software-adapter blocklist or relax the gate. The workflow is being updated to upload an explicitly unverified Windows EXE candidate before smoke, so it can be run on that supported machine; the full tested package/release remains gated on all live WebGPU checks passing. Do not promote WARP to physical-GPU evidence.
