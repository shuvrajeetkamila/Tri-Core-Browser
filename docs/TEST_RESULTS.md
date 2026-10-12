# Test results and acceptance status

**Recorded:** 2026-10-12
**Branch:** `arena/66abfdc9-tri-core-browser`
**Source identity:** `f0151657b9d40ec337de6ae1659ef3a7bcec2bd0` (`ci: upload diagnostic exe before strict smoke`), pushed to `arena/66abfdc9-tri-core-browser`.
**Latest packaged attempt:** [run 38242786245](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38242786245) built and launched source `f015165`; it uploaded the unverified EXE candidate, then all four adapter requests returned `null` before shader/dispatch validation.
**Physical-GPU validation:** **NOT RUN**.

Local checks are separate from target-runtime acceptance. Passing Node tests, a Vite renderer build, or parser-only WGSL acceptance does not prove WebGPU pipeline creation, dispatch, visible pixels, Windows packaging, or physical-GPU behavior. See [`FSR1_WEBGPU_ACCEPTANCE_LEDGER.md`](FSR1_WEBGPU_ACCEPTANCE_LEDGER.md) for gate-by-gate status.

## Current-source local checks (Linux)

| Check | Result | Evidence / limits |
| --- | --- | --- |
| `npm ci` | **PASS** | Clean lockfile install completed. npm reported eight moderate findings; no lockfile or dependency change was made to silence them. |
| `npm test` | **PASS — 56/56** | Includes safe WebGPU adapter retries, software-adapter classification, graphics-policy/lifecycle/fallback and preferences, accessible/collapsible UI, immersive fullscreen/IPC/security/layout tests, WASM, native PNG bridge tests, WebGPU analysis-helper tests, source/IPC/security assertions, and Windows workflow/package-gate assertions. Static tests do not execute Electron or WebGPU. |
| `npm run build` | **PASS** | Vite 8.3.4 production renderer build completed. This does not package Electron or validate WGSL in Dawn/Tint. |
| JavaScript/CommonJS syntax checks | **PASS** | `node --check` passed for project files under `app/diagnostics`, `electron`, `src`, `tests`, and `scripts`. WGSL template strings require a separate parser/runtime check. |
| WGSL grammar parse | **PASS — parser-only** | Five modules in `app/diagnostics/fsr1-webgpu.js` parsed with ad-hoc `wgsl_reflect@1.6.0`: fullscreen vertex, game fragment, EASU compute, RCAS compute, and presentation fragment. It was not retained in `package.json`/lockfile and was removed by the subsequent clean `npm ci`. This is not Dawn/Tint semantic validation, pipeline creation, or GPU execution. |
| Workflow/package metadata parse | **PASS** | `js-yaml` parsed `build.yml`, `fsr1-native-poc.yml`, and `release.yml`; `package.json` parsed as JSON. PowerShell execution is still a Windows-only gate. |
| Immersive fullscreen source/accessibility tests | **PASS — static and packaged checks** | Unit tests cover the large toggle, visible exit control, F11, sender/type validation, security settings and layout restoration. Packaged Windows run 38242786245 also passed fullscreen entry/exit and active-view expansion/restoration. |
| `git diff --check` | **PASS** | No whitespace errors at the time of the check. |
| `npm audit --audit-level=high` | **PASS — threshold only** | Audit reports 8 moderate, 0 high, and 0 critical findings. Moderate findings remain unresolved; see below. |
| Current-source Windows PowerShell/package execution | **PARTIAL — run 38242786245** | PowerShell packaging, executable validation, and the unverified-candidate artifact upload passed on Windows Actions; the strict smoke then failed at WebGPU adapter discovery. This Linux host cannot execute the Windows PowerShell gate locally. |

## WebGPU and packaged-runtime acceptance

| Gate | Result | Evidence / limits |
| --- | --- | --- |
| Game-owned FSR1 processing path | **Implemented in source; runtime UNVERIFIED** | The bundled sandboxed page owns a lower-resolution WebGPU target, separate EASU/RCAS compute pipelines, and a presentation pass. No CPU pixel readback feeds FSR. Source/static evidence is not runtime evidence. |
| Adapter/device/shader/pipeline/resource lifecycle distinctions | **PARTIAL — adapter discovery exercised** | Run 38242786245 recorded null from high-performance, low-power, default, and explicit fallback requests; later lifecycle states were not reached. The application preserves unsupported/failure distinction and includes per-request results in the failure snapshot. |
| WGSL compilation and WebGPU pipeline creation | **NOT RUN in target runtime** | Only the parser-only check above has run. Dawn/Tint compilation and actual EASU/RCAS compute-pipeline creation require Windows packaged smoke. |
| EASU/RCAS dispatch and processed queue completion | **NOT RUN in target runtime** | The Windows smoke requires at least three dispatches per compute pipeline and completed frames. No current-source dispatch count or GPU result exists. |
| Numerical comparison of original target, EASU intermediate, and RCAS output | **PARTIAL** | Node unit tests pass with synthetic RGBA inputs, simple bilinear comparison, EASU/RCAS contribution/detail checks, malformed inputs, and flat-stage rejection. No actual GPU texture captures or numerical runtime report exists. The bilinear baseline is not an AMD shader-conformance oracle. |
| Visible-canvas output screenshot comparison | **PARTIAL** | Node tests cover BGRA→RGBA conversion, capture scaling, sample matching, and insufficient-sample rejection. No packaged `capturePage()` image has been compared to actual frozen RCAS output yet. A completed queue alone is not accepted as pixel-level display proof. |
| Active-core OS fullscreen enter/exit and layout restoration | **PASS — run 38242786245** | Packaged Windows smoke on source `f015165` entered/exited fullscreen and verified view expansion/restoration; unit tests cover keyboard/accessibility behavior. |
| Packaged Windows app and dual FSR smoke | **PARTIAL — run 38242786245** | Packaging/executable validation, candidate upload, fullscreen, browser/WASM/HTTPS checks, and three changing `capturePage()` PNG frames through native D3D12 WARP passed on source `f015165`. Live WebGPU adapter discovery returned `null` for all four attempts; no shader, dispatch, numerical-output, or visible-canvas check ran. The official portable ZIP assembly was skipped as required. |
| Physical GPU / vendor identity / hardware-mode run | **NOT RUN** | WARP/software adapters are not physical-GPU evidence. No named physical device has been tested. |
| DLSS, arbitrary webpage/game support, general performance gain | **NOT IMPLEMENTED / UNSUPPORTED / NOT CLAIMED** | No Streamline/DLSS runtime is included; ordinary pages remain standard Chromium; no performance or general image-quality gain is inferred. |

## npm advisory review and safe remediation decision

The clean install and full audit reported **8 moderate, 0 high, 0 critical** findings. The eight npm findings form one transitive builder chain rooted in `sprintf-js@1.1.3` (`GHSA-hp3w-g68c-fv3c`, unbounded precision-specifier denial of service):

`electron-builder@26.17.0` → `app-builder-lib@26.17.0` → `@electron/get@3.1.0` → `global-agent@3.0.0` → `roarr@2.15.4` → `sprintf-js@1.1.3`.

The other affected audit entries are the builder packages sharing that tree (`app-builder-lib`, `dmg-builder`, `electron-builder-squirrel-windows`, and `@electron/get`). The separate Electron dependency uses `@electron/get@5.1.0`; the affected copy is in the build-tool branch. These are development/build dependencies and are not shipped as application npm runtime dependencies, but they still run in CI and remain in the locked build tree.

The registry currently exposes `sprintf-js` only through `1.1.3`; no patched semver-compatible package release is available to pin. `npm audit fix --dry-run` did not offer a non-forced remediation and continued to report the findings. npm's suggested forced remediation would change the pinned `electron-builder@26.17.0` tree to `26.5.0` and is marked breaking. No `--force`, downgrade, or unverified transitive override was applied. Safe next action: retain the lock, keep the high/critical CI threshold and full audit artifact, monitor upstream, then evaluate a compatible patched builder/transitive release in a separate change with `npm ci`, tests, Windows packaging, and packaged smoke. Do not blindly override `roarr`/`@electron/get` across major APIs.

## Prior Windows evidence — different source revision

The following results predate the WebGPU FSR1 scene and must not be used to claim current-source WebGPU support:

| Gate | Prior result | Evidence / limits |
| --- | --- | --- |
| Native MSVC/CMake helper build | **PASS** | Windows run [38149140851](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140851) compiled the isolated D3D12 helper. |
| Synthetic-input FSR1 on WARP | **PASS — software regression only** | The same prior-source run executed AMD FSR1 EASU + RCAS on Microsoft WARP. This is not physical-GPU evidence and does not validate the new WebGPU shaders. |
| Packaged browser `capturePage()` → FSR diagnostic | **PASS — WARP, diagnostic only** | Prior-source run [38149140832](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140832) validated three changing PNG captures at three resolutions from the bundled WebGL2 scene, per-frame native reports, and output/reference evidence. This is screenshot/readback plus a separate helper—not live WebGPU processing, zero-copy, arbitrary-page integration, real-time support, or physical-GPU evidence. |
| Portable distribution and Actions artifact | **PASS for the prior source only** | `TriCoreBrowser-Windows-x64` was uploaded in run 38149140832. That artifact predates this WebGPU change; it is not a current build or public GitHub Release. |

Update the Windows/CI rows and acceptance ledger only after attaching results to the exact immutable source commit and Actions run. Keep physical-GPU validation **NOT RUN** unless a named physical device is actually tested.
