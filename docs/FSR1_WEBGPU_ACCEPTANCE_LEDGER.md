# FSR1 WebGPU acceptance ledger

**Recorded:** 2026-10-12 (Asia/Kolkata)
**Repository:** `shuvrajeetkamila/Tri-Core-Browser`
**Required branch:** `arena/66abfdc9-tri-core-browser`
**Source identity:** current working changes based on `0c11d17d72804a7462eae70b9b791c106499ede7`; these adapter-discovery fixes have not yet been committed or run on Windows.
**Latest packaged attempt:** run [38227656945](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38227656945), source `0c11d17`; packaging/browser checks passed, but WebGPU adapter discovery returned `null` before shader or output checks.
**Physical-GPU validation:** **NOT RUN**.

This ledger distinguishes code/static evidence from packaged Windows runtime evidence. A passing parser, renderer build, pipeline-creation call, queue completion, WARP result, or adapter label does not by itself establish correct visible output or physical-GPU support.

## Acceptance gates

| ID | Acceptance criterion | Current result | Evidence / limitation |
| --- | --- | --- | --- |
| A-01 | Preserve browser features, sandboxing, CSP, narrow local-scene IPC, keyboard-accessible collapsible UI, preferences, WASM tests, native screenshot diagnostic, safe Chromium fallback, and automatic/manual policy. | **PASS — local regressions** | `npm test` passes 56/56, including the adapter-retry and WARP/Microsoft Basic Render Driver classification regressions, fullscreen restoration/accessibility, sender validation, restrictive local CSP, FSR policy/failure states, WASM, panel persistence/collapse, and the separate PNG diagnostic. Static tests are not a packaged runtime test. |
| A-02 | Keep detection, adapter/device initialization, shader/pipeline/resource failure, processing, output submission, visible verification, unsupported, and device-loss states distinct. | **PARTIAL** | Source/UI and static lifecycle assertions distinguish these states and preserve failure stages. Run 38227656945 exercised adapter-discovery failure (`navigator.gpu.requestAdapter()` returned `null`) but did not reach later WebGPU states. This revision records each safe adapter request and result; packaged rerun pending. |
| A-03 | Compile EASU and RCAS WGSL and successfully create both **compute** pipelines plus the presentation pipeline. | **NOT RUN — adapter unavailable** | Run 38227656945 stopped before shader compilation because WebGPU adapter discovery returned `null`. The parser-only `wgsl_reflect@1.6.0` result is not Dawn/Tint semantic validation or WebGPU pipeline creation. Retry change awaits packaged Windows execution. |
| A-04 | Dispatch EASU and RCAS repeatedly on the controlled scene's own lower-resolution GPU target. | **NOT RUN — target runtime** | The smoke gate requires per-pipeline dispatch counters and at least three dispatches each, but no current-source frame was run on a packaged Windows app. |
| A-05 | Present processed output and verify screenshot pixels against the processed GPU output. | **NOT RUN — target runtime** | Source captures a post-processing `WebContentsView` PNG and compares samples with frozen RCAS texture samples. Unit tests exercise scaling/channel order and comparison logic; no packaged screenshot exists yet. Queue completion alone is not accepted as display proof. |
| A-06 | Compare the low-resolution scene target, EASU intermediate, and RCAS output; report numerical checks and limitations honestly. | **PARTIAL** | Node unit tests pass for the CPU bilinear baseline comparison, stage contribution/detail checks, and malformed/flat image rejection. No actual WebGPU texture captures or runtime numerical report exists. The bilinear baseline is not an AMD conformance oracle. |
| A-07 | Prove changing scene frames and retain structured summaries, hashes, three stage PNGs, and visible-canvas screenshot evidence. | **NOT RUN — target runtime** | Implemented in the opt-in packaged smoke; evidence inventory/failure summary is wired. No current Windows artifact has been generated. |
| A-08 | Build and run the current-source packaged Windows x64 app; run both the separate capturePage→D3D12 WARP diagnostic and WebGPU smoke. | **NOT RUN** | Linux workstation has no Windows desktop, MSVC/Windows SDK, or PowerShell. The current-source Windows CI gate must validate it. Prior run 38149140832 is from an earlier source revision and covers the PNG/WARP path only. |
| A-09 | Validate physical GPU identity and physical-device FSR1 behavior. | **NOT RUN** | No named physical adapter/device was tested. WARP and software adapters are never physical-GPU evidence. |
| A-10 | Make no claims of DLSS, arbitrary-page/game support, DRM/video/cloud-stream support, or performance gains without direct evidence. | **PASS — scoped source/docs** | DLSS remains unimplemented; the live path is opt-in and limited to the bundled game-owned WebGPU scene. Ordinary pages remain Chromium; no FPS or performance gain is claimed. |
| A-11 | Review the eight moderate npm findings and avoid forced/breaking upgrades. | **PARTIAL — reviewed, unresolved upstream chain** | Full locked tree has 8 moderate, 0 high, 0 critical. They converge on `sprintf-js@1.1.3` through `roarr@2.15.4` → `global-agent@3.0.0` → builder's `@electron/get@3.1.0`. Registry reports no `sprintf-js@1.1.4`; audit's suggested `electron-builder@26.5.0` remediation is flagged semver-major and would change the pinned `26.17.0` build chain. No force, downgrade, or unverified override was applied. Re-test a compatible upstream fix with Windows packaging before adopting it. |
| A-12 | Add a prominent active-core fullscreen toggle that hides normal browser chrome, restores the previous layout, and remains keyboard-accessible/exitable. | **PASS — packaged Windows smoke** | Run 38227656945 passed immersive fullscreen entry/exit and browser-view expansion/restoration checks. Unit tests cover the keyboard-accessible controls and F11 behavior. |
| A-13 | Commit/push only the existing session branch, bind results to the exact SHA/CI run, and publish only through the existing validated release workflow. | **NOT RUN** | No commit, push, current-source Actions run, or release has occurred yet. Fill in the exact source SHA and run URLs only after those actions succeed. |

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
| Current-source Windows packaged smoke | **NOT RUN** | Pending current-source Actions result. |

## Current-source CI and release record

- Latest completed packaged smoke: [run 38227656945](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38227656945), source `0c11d17d72804a7462eae70b9b791c106499ede7`; packaging and non-WebGPU checks passed, then adapter discovery failed. Check-run annotation `114739027226` has the detailed failure report.
- Native D3D12 FSR1 WARP harness: [run 38227656939](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38227656939) passed; software-only and separate from WebGPU.
- Adapter retry and Microsoft Basic Render Driver classification changes in this tree: local tests/build passed; immutable commit and packaged Windows rerun **PENDING**.
- Packaged WebGPU shader/pipeline/dispatch/visible-pixel acceptance: **NOT RUN** until the strict smoke gate passes.
- Public Windows release/prerelease: **NOT PUBLISHED**.
- Physical-GPU acceptance: **NOT RUN**.

Do not promote the earlier WARP path or the failed WebGPU adapter probe into live FSR/WebGPU or physical-GPU evidence. Update this section after the exact immutable source commit and its packaged Windows run are known.
