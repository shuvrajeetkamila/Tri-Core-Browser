# Test results

**Recorded:** 2026-10-11 UTC
**Current source:** working branch `arena/66abfdc9-tri-core-browser`; commit SHA will be recorded by the Windows Actions report after push.

| Check | Result | Evidence / notes |
| --- | --- | --- |
| `npm ci` on Linux x64 / Node 22.22.3 | **PASS** | Lockfile restore completed. NPM reported 8 moderate build/development-tree audit findings; no high/critical finding was reported. |
| `npm test` | **PASS** | 15 Node tests passed: address parsing, five-mode controller/fallback policy, real WebAssembly compilation/execution and WASM source contract. |
| `npm run build` | **PASS** | Vite 8.3.4 generated the production renderer (`dist/`). |
| `node --check electron/main.cjs electron/preload.cjs src/main.js` | **PASS** | Main process, preload, and renderer syntax checks. |
| `npm audit --omit=dev` | **PASS** | Zero production/runtime package findings; full dev/build dependency report is retained separately by CI. |
| Graphics policy: Standard mode | **PASS** | Controller resolves to Chromium, with no upscaler claimed. |
| Graphics policy: DLSS/FSR fallback with vendor-like GPU labels | **PASS** | Tests confirm a detected GPU never activates an absent integration and the effective path remains Standard. |
| Hybrid policy | **PASS** | Controller reports partial WASM diagnostic and standard fallback; no upscaler is stacked. |
| WASM correctness under Node/V8 | **PASS** | Real module compiles, `add(19, 23)` returns `42`, and 2,000-call checksum matches `3,000`. Repeatable benchmark is unit-tested. |
| Actual packaged Windows x64 executable | **NOT BUILT IN THIS LINUX WORKSPACE** | This host has no Windows compiler/SDK/runtime. Check the Windows Actions run and its commit-specific `BUILD_REPORT.txt` artifact for whether CI produced one. |
| Packaged Electron app launch, website navigation, local WASM, tab lifecycle and HTTPS probe on Windows | **NOT RUN IN THIS WORKSPACE** | `--smoke-test` is implemented as a required Windows-workflow step. Its exact per-commit result is in the smoke log/report; HTTPS is recorded as BLOCKED rather than bypassing TLS if outbound access is unavailable. |
| DLSS runtime on NVIDIA hardware | **NOT IMPLEMENTED / NOT TESTED** | No Streamline integration or licensed runtime components are shipped; no compatible hardware/SDK session was available. |
| FSR runtime on AMD hardware | **NOT IMPLEMENTED / NOT TESTED** | No FidelityFX integration/render path is shipped; no compatible hardware test was available. |
| Browser-wide upscaling / performance or image quality | **NOT IMPLEMENTED / NOT TESTED** | Electron's public `WebContentsView` API used here does not provide the required native per-frame inputs or swap-chain bridge. No measurements are claimed. |

Historical Windows build logs found during the initial audit belong to another unmerged branch and are not counted as results for this change. This table records evidence available from the Linux workspace at review time; the Windows Actions run and its uploaded report/log are authoritative for each exact source commit. The packaging script appends that build's commit-specific Windows verification to the copy of this document inside a successfully smoke-tested portable ZIP.
