# FSR1 WebGPU acceptance ledger

**Recorded:** 2026-10-12 (Asia/Kolkata)
**Repository:** `shuvrajeetkamila/Tri-Core-Browser`
**Required branch:** `arena/66abfdc9-tri-core-browser`
**Latest packaged source:** `e8a17450499ea449c626cd2ebd47e6786c0f5560` (run [38285641210](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38285641210)), pushed on the authorized branch. Windows build, packaged smoke, Level A evidence validation, diagnostics upload, and job-summary-writing step passed; portable distribution assembly and Level B were skipped.
**Current bundled WebGPU FSR1 result:** **UNKNOWN / NOT VERIFIED**. The optional validator can accept either `PASS` or safe `SKIPPED`; the diagnostic archive and job logs could not be retrieved (GitHub Actions storage returned `EOF`). Do not claim current adapter/device, EASU/RCAS dispatch, or visible output evidence.
**Separate native D3D12/WARP harness:** run [38285641259](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38285641259) passed a synthetic one-frame official EASU+RCAS test and WARP output sanity gates. This is software-only and not bundled WebGPU or physical-GPU evidence.
**Physical-GPU validation:** **NOT RUN**. Level B was skipped on the push event; runner availability remains unknown.

This ledger distinguishes code/static evidence from packaged Windows runtime evidence. A passing parser, renderer build, pipeline-creation call, queue completion, WARP result, or adapter label does not by itself establish correct visible output or physical-GPU support.

## Acceptance gates

| ID | Acceptance criterion | Current result | Evidence / limitation |
| --- | --- | --- | --- |
| A-01 | Preserve browser features, sandboxing, CSP, narrow local-scene IPC, keyboard-accessible collapsible UI, preferences, WASM tests, native screenshot diagnostic, safe Chromium fallback, and automatic/manual policy. | **PASS — local regressions** | The expanded `npm test` suite passes 99/99, including adapter retries and software classification, fullscreen restoration/accessibility, sender validation, restrictive local CSP, FSR policy/failure states, WASM, panel persistence/collapse, packaged-evidence policy, and deterministic PNG/path-confinement/report-validator fixtures. These are not packaged runtime or GPU evidence. |
| A-02 | Keep detection, adapter/device initialization, shader/pipeline/resource failure, processing, output submission, visible verification, unsupported, and device-loss states distinct. | **PARTIAL — local policy tests; current runtime detail unavailable** | Source/UI and deterministic lifecycle/status tests distinguish these states and preserve failure stages. The current Level A run 38285641210 passed its optional-policy validator, but the underlying report/log was not retrievable; exact WebGPU state remains unknown. Historical pre-hardening adapter failures do not establish the current adapter state. |
| A-03 | Compile EASU and RCAS WGSL and successfully create both **compute** pipelines plus the presentation pipeline. | **NOT VERIFIED — current report details unavailable** | Historical runs 38227656945, 38228901586, 38242786245, and 38249515260 failed adapter discovery before shader compilation. Current run 38285641210 passed the optional-policy validator, but the report/log contents were inaccessible; no current pipeline result can be inferred. The parser-only `wgsl_reflect@1.6.0` result is not Dawn/Tint semantic validation or WebGPU pipeline creation. |
| A-04 | Dispatch EASU and RCAS repeatedly on the controlled scene's own lower-resolution GPU target. | **NOT VERIFIED — current report details unavailable** | Earlier runs 38227656945, 38228901586, 38242786245, and 38249515260 returned no WebGPU adapter. The current bundled WebGPU dispatch status for run 38285641210 is unknown because its evidence was inaccessible. The strict physical-GPU gate still requires at least three dispatches per pipeline and is not weakened. The separate WARP harness processes one synthetic frame and is not this gate. |
| A-05 | Present processed output and verify screenshot pixels against the processed GPU output. | **NOT VERIFIED — current report details unavailable** | Run 38285641210 passed optional-policy evidence validation, but its underlying output report/captures were not retrievable, so current visible FSR output is not claimed. The strict gate still requires a post-processing `WebContentsView` PNG to match frozen RCAS texture samples; queue completion alone is not accepted as display proof. |
| A-06 | Compare the low-resolution scene target, EASU intermediate, and RCAS output; report numerical checks and limitations honestly. | **PARTIAL — deterministic tests only** | Node tests pass for the CPU bilinear baseline comparison, stage contribution/detail checks, and malformed/flat image rejection. Run 38285641210's output artifacts were not retrievable, so no current WebGPU texture capture or numerical runtime result is claimed. The bilinear baseline is not an AMD conformance oracle. |
| A-07 | Prove changing scene frames and retain structured summaries, hashes, three stage PNGs, and visible-canvas screenshot evidence. | **NOT VERIFIED — artifact contents unavailable** | Current run 38285641210 passed the Level A packaged smoke and report validator and uploaded diagnostics, but the artifact contents were not retrievable; no current live frame or output evidence is claimed. The separate screenshot→D3D12 WARP diagnostic and native WARP harness are not bundled-WebGPU evidence. |
| A-08 | Build and run the current-source packaged Windows x64 app; run both the separate capturePage→D3D12 WARP diagnostic and WebGPU smoke. | **PARTIAL — Level A run 38285641210** | Commit `e8a1745` built/size-validated the EXE; packaged smoke, shared validator, and diagnostics upload passed. Portable package assembly was skipped. The exact optional WebGPU `PASS` versus safe `SKIPPED` state was not retrievable from the Actions artifact/log; no bundled live FSR PASS is claimed. The summary-writing step passed, but its text was inaccessible. Physical-GPU validation is **NOT RUN**. |
| A-09 | Validate physical GPU identity and physical-device FSR1 behavior. | **NOT RUN** | No named physical adapter/device was tested. WARP and software adapters are never physical-GPU evidence. |
| A-10 | Make no claims of DLSS, arbitrary-page/game support, DRM/video/cloud-stream support, or performance gains without direct evidence. | **PASS — scoped source/docs** | DLSS remains unimplemented; the live path is opt-in and limited to the bundled game-owned WebGPU scene. Ordinary pages remain Chromium; no FPS or performance gain is claimed. |
| A-11 | Review the eight moderate npm findings and avoid forced/breaking upgrades. | **PARTIAL — reviewed, unresolved upstream chain** | Full locked tree has 8 moderate, 0 high, 0 critical. They converge on `sprintf-js@1.1.3` through `roarr@2.15.4` → `global-agent@3.0.0` → builder's `@electron/get@3.1.0`. Registry reports no `sprintf-js@1.1.4`; audit's suggested `electron-builder@26.5.0` remediation is flagged semver-major and would change the pinned `26.17.0` build chain. No force, downgrade, or unverified override was applied. Re-test a compatible upstream fix with Windows packaging before adopting it. |
| A-12 | Add a prominent active-core fullscreen toggle that hides normal browser chrome, restores the previous layout, and remains keyboard-accessible/exitable. | **PASS — packaged Windows smoke** | Runs 38227656945 and 38242786245 passed immersive fullscreen entry/exit and browser-view expansion/restoration checks. Unit tests cover the keyboard-accessible controls and F11 behavior. |
| A-13 | Commit/push only the existing session branch, bind results to the exact SHA/CI run, and publish only through the existing validated release workflow. | **PASS — authorized branch only; no release** | Earlier code/reporting commits were pushed only to `arena/66abfdc9-tri-core-browser`. Current hosted evidence is tied to exact source `e8a17450499ea449c626cd2ebd47e6786c0f5560` and run 38285641210; current documentation changes remain confined to the same session branch. Level B did not run. No PR or public release was created. |

## Local evidence completed so far

| Gate | Result | Limit |
| --- | --- | --- |
| `npm ci` | **PASS** | Clean lockfile install; npm reports eight unresolved moderate dependency findings. |
| `npm test` | **PASS — 99/99** | Includes safe WebGPU adapter retries, software-adapter classification, WebGPU validation-helper, stage-specific fallback, fullscreen UI/accessibility/IPC/security/layout assertions, Windows workflow assertions, deterministic policy status tests, synthetic PNG/path-confinement/report-validator tests; no Electron/GPU runtime. |
| `npm run build` | **PASS** | Vite renderer only; not Electron packaging or GPU validation. |
| JavaScript/CommonJS syntax checks | **PASS** | `node --check` passed for source, test, and script JavaScript/CommonJS files; does not compile WGSL in Dawn/Tint. |
| Workflow/package metadata parse | **PASS** | `js-yaml` parsed the build, native FSR diagnostic, and release workflows; `package.json` parsed as JSON. |
| `git diff --check` | **PASS** | No whitespace errors at check time. |
| WGSL parser check | **PASS — parser-only** | Five modules accepted by `wgsl_reflect@1.6.0`; not WebGPU semantic validation or pipeline creation. |
| `npm audit --audit-level=high` | **PASS — threshold only** | Eight moderate advisories remain; see A-11. |
| Windows PowerShell assertions/package script | **NOT RUN locally** | Linux host; CI is the authoritative Windows execution. |
| Historical packaged Windows smoke (source `f015165`) | **FAIL — WebGPU adapter discovery** | Run 38242786245: all four standard/fallback requests returned `null`. Packaging and non-WebGPU tests passed, and the explicitly unverified EXE candidate uploaded; the strict WebGPU gate remained failed. |
| Current packaged Windows Level A smoke (source `e8a1745`) | **PASS — package/smoke/evidence validator; WebGPU stage UNKNOWN** | Run 38285641210 passed the Windows build, packaged smoke, validator, diagnostics upload, and summary-writing step. Evidence archives/logs could not be retrieved; optional aggregate may be `PASS` or safe `SKIPPED`. Portable package/Level B were skipped. |
| Separate native D3D12/WARP FSR1 harness | **PASS — software-only synthetic frame** | Run 38285641259 built and exercised official EASU+RCAS in a one-frame native WARP harness. Workflow output sanity checks passed; artifact contents were not downloaded. Not bundled WebGPU, physical GPU, or ordinary-page processing. |

## Current packaged CI and release record

### Windows packaged Level A

Run [38285641210](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38285641210) tested source commit `e8a17450499ea449c626cd2ebd47e6786c0f5560` on the authorized branch. Overall conclusion was `success`; Windows executable build/validation, packaged smoke, shared evidence validator, diagnostics upload, and the summary-writing step passed. Portable distribution assembly/upload and Level B were skipped on this push event. This establishes the build and packaged smoke gates, not successful WebGPU FSR execution.

| Artifact | Size | SHA-256 | Status |
| --- | ---: | --- | --- |
| `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` | 109,723,753 bytes | `1d403b4584d24f9a58b8d84f2ad111ae4b362d2c918269043a52a43b74ab8c5b` | Diagnostic candidate only; not a validated portable release. |
| `TriCoreBrowser-Packaged-Smoke-Diagnostics` | 724,587 bytes | `f26f3ad886cf473f9af72e6196c28a8efa9a323b4a3510462fa4620502b0f43f` | Uploaded, but archive could not be retrieved to inspect JSON/PNG contents. |
| `TriCoreBrowser-Linux-checks` | 10,274 bytes | `2d6849a6c10ae5bbb2871b1a9fd608c3417bc668ed7c20aab3ffa89bead2e8b4` | Linux check artifact. |

The successful optional Level A validator admits either a true aggregate WebGPU `PASS` or safe `SKIPPED`. GitHub job-log and diagnostics retrieval both returned `EOF`; the successful summary-writing step's body was also inaccessible. Thus current adapter/device status, known-answer WebGPU compute, WGSL/pipeline creation, EASU/RCAS dispatch counts, output dimensions/pixels, and visible-canvas comparison remain **UNKNOWN / NOT VERIFIED**. The report is not a GPU PASS. No output or processing is invented from artifact names or the green job.

### Separate native WARP harness

Run [38285641259](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38285641259) passed native D3D12 execution of the official EASU and RCAS passes on one synthetic frame using WARP. Workflow checks required software-WARP classification, `status=PASS`, nonempty output/reference images, and sanity checks rejecting blank/constant output or output identical to its bilinear reference. Artifact `TriCore-FSR1-D3D12-WARP-POC` is 59,484 bytes (SHA-256 `5557e3497c6cfe0634dd2dafa6f6e5521451de8d67cc26b9359dbd86bf60e87e`); its archive was not retrieved. This confirms the harness can exercise native FSR1 on software WARP. It is not the app's bundled WebGPU path, not ordinary-page processing, and not physical-GPU evidence.

### Historical failures, releases, and next evidence action

- Earlier pre-hardening packaged run [38249515260](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38249515260) definitively failed adapter discovery on WARP-only hosted hardware before shader compilation/dispatch/output. That historical result is not current-run adapter evidence. No Chromium blocklist or security override was used.
- The current EXE is explicitly an **unverified smoke candidate**. Portable ZIP assembly was skipped; no public Windows release/prerelease was produced.
- Runner inventory is **UNKNOWN** (API returned HTTP 403). Physical-GPU Level B and driver validation are **NOT RUN**; no runner was registered, dispatched, or authorized.
- The separate earlier screenshot-to-WARP PNG route is a diagnostic; it does not validate bundled WebGPU FSR or physical hardware.

**Next evidence action:** make the existing run `38285641210` diagnostic report/job-summary contents accessible and record its actual `PASS` versus `SKIPPED` WebGPU result. Do not register or dispatch a physical-GPU runner as part of this milestone.