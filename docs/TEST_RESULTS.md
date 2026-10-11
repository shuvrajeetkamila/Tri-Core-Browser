# Test results

**Recorded:** 2026-10-11 (UTC)
**Source branch:** `arena/66abfdc9-tri-core-browser`
**App/source CI commit:** `eee56b78a5259429b4e5d7be3b73adf21ec99365`
**Successful Windows package run:** [38149140832](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140832)
**Successful native WARP run:** [38149140851](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140851)

## Local Linux verification

| Check | Result | Evidence / limits |
| --- | --- | --- |
| `npm test` | **PASS — 37/37** | URL/policy, graphics lifecycle/priority/fallback, persistence, accessible panel behavior, WebAssembly, FSR capture/context/size gates, native argument/report validation, exact bundled-scene URL matching, and Windows smoke/package workflow checks. |
| `npm run build` | **PASS** | Vite 8.3.4 production renderer build completed. This does not package Electron or compile the Windows helper. |
| JavaScript syntax checks | **PASS** | `node --check` passed for JavaScript/CommonJS files under `electron/`, `src/`, `tests/`, and `scripts/`. |
| `git diff --check` | **PASS** | No whitespace errors in the source/documentation changes. |
| Workflow/package metadata syntax | **PASS** | `js-yaml` parsed the build, native WARP and release workflows; `package.json` is valid JSON. The Windows PowerShell scripts were executed by the Windows CI pipeline. |
| Locked dependency audit | **PASS (threshold)** | CI audit completed with 8 moderate, 0 high, and 0 critical findings; the full audit/tree were retained. No forced breaking fix was run. |

## Windows CI and artifacts

| Gate | Result | Evidence / limits |
| --- | --- | --- |
| Native MSVC/CMake helper build | **PASS** | The isolated FSR1 helper compiled on Windows in [run 38149140851](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140851). |
| Native synthetic-input FSR1 on D3D12 WARP | **PASS — software regression only** | The same run executed AMD FSR1 EASU + RCAS on WARP and uploaded its POC evidence. This is not physical-GPU evidence. |
| Linux renderer/tests/dependency checks | **PASS** | Linux test/build/audit job passed in [run 38149140832](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140832). |
| Packaged Windows executable validation | **PASS** | The workflow confirmed `release/TriCoreBrowser.exe` exists and exceeds its 30,000,000-byte minimum. The exact byte count is recorded in the generated artifact report; it was not separately retrieved here. |
| Packaged browser capture → FSR smoke | **PASS — bundled test scene on WARP** | The packaged smoke and its PowerShell evidence checks passed. The checks require three distinct changing frames at three capture resolutions, real Electron `WebContentsView` `capturePage()` PNG input, WARP classification, three per-frame native reports, input/output/bilinear-reference PNGs, and three distinct reference paths. This proves only the bundled animated WebGL2 diagnostic scene through screenshot/readback and a separate D3D12 helper, not arbitrary pages, zero-copy compositor integration, real-time performance, or a physical GPU. |
| Portable distribution assembly | **PASS** | `scripts/package-windows.ps1` assembled the portable staging directory, ZIP and reports after the packaged smoke gate passed. |
| GitHub Actions artifact upload | **PASS** | At report time, `TriCoreBrowser-Windows-x64` was present and unexpired in run 38149140832. GitHub reports an aggregate artifact archive size of 223,507,513 bytes; that is not the executable or portable ZIP's individual size. Smoke diagnostics were uploaded separately. |
| Public GitHub Release | **NOT PUBLISHED** | The explicit opt-in prerelease workflow is skipped on ordinary source pushes. The current tested deliverable is an Actions artifact, not a Release-page download. |

## Fixes confirmed by the successful run

- The FSR capture policy now resolves and compares the exact bundled `file:` path, case-insensitively on Windows, rather than relying on raw URL-string equality. Query strings and other file/page paths remain rejected; the gate was not broadened to arbitrary content.
- The native report serializes Windows paths with `/`, while Node's path may use `\\`. Both sides are normalized with `System.IO.Path.GetFullPath()` before the Windows workflow and packaging scripts compare them.
- The Windows package evidence predicates were made PowerShell-parseable; the previous multiline `-or` layout stopped the first packaging run after smoke succeeded.

## Still unverified / unsupported

| Area | Status |
| --- | --- |
| Physical GPU, AMD-vendor identity, and hardware-mode initialization | **NOT RUN** — CI used Microsoft WARP software. |
| DLSS / Frame Generation | **NOT IMPLEMENTED / NOT TESTED** — no authorized Streamline runtime or NVIDIA hardware evidence. |
| Arbitrary webpages, third-party games, WebGPU pages, video/DRM, cloud streams, external applications | **UNSUPPORTED / NOT TESTED** — only the bundled app-owned diagnostic scene is accepted by the FSR capture path. |
| Performance gain or general image-quality superiority | **NOT CLAIMED** — capture/readback/helper timing is diagnostic and not general browser FPS. |

The successful run establishes packaged, bounded browser-frame FSR processing for the bundled test scene on WARP. It does not establish physical-GPU support, upscaling of ordinary web pages, or a public software release.
