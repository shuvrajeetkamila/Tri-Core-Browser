# Browser/game upscaling audit, decision, and implementation plan

**Audit date:** 2026-10-12
**Repository:** `shuvrajeetkamila/Tri-Core-Browser`
**Working branch:** `arena/66abfdc9-tri-core-browser` (session branch; do not switch)
**Audited starting commit:** `e27cb207d6be86a346420901a979b831cf849c00` (`Create Initial Release`)
**Current work:** commit `f0151657b9d40ec337de6ae1659ef3a7bcec2bd0` adds a diagnostic-only EXE artifact upload before the strict packaged smoke; earlier commit `3123975` contains the game-owned WebGPU FSR1 EASU + RCAS vertical slice, safe adapter retries, and Microsoft Basic Render Driver/WARP classification correction. The older `capturePage()` PNG → D3D12 WARP path remains a separate diagnostic. Local `npm ci`, `npm test` (56/56), renderer build, syntax checks, and high/critical audit threshold passed. Packaged Windows run [38242786245](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38242786245) built/validated the EXE and uploaded an explicitly unverified candidate, then passed fullscreen, browser/WASM, HTTPS, and the separate three-frame PNG/WARP diagnostic; all four WebGPU adapter requests still returned `null` on the Basic Render Driver/WARP runner. No shaders, compute dispatches, GPU texture comparisons, or visible-WebGPU output were verified. We did not enable unsafe WebGPU or bypass Chromium's adapter blocklist. The viable live-test route is to run the candidate on Windows with a Chromium-supported WebGPU adapter. Physical-GPU, arbitrary-page, performance-gain, DLSS, and public-release claims remain **NOT RUN / NOT IMPLEMENTED / UNSUPPORTED** as appropriate. See [`docs/TEST_RESULTS.md`](TEST_RESULTS.md), [`docs/GRAPHICS_INTEGRATION.md`](GRAPHICS_INTEGRATION.md), and [`docs/FSR1_WEBGPU_ACCEPTANCE_LEDGER.md`](FSR1_WEBGPU_ACCEPTANCE_LEDGER.md) for evidence and limits.

## Technical audit and decision

### Existing browser and graphics path

- TRI-CORE is an Electron 44.7.0 Windows x64 desktop app that packages Chromium/V8. `electron/main.cjs` manages three sandboxed `WebContentsView` browser cores and their tabs; each page is rendered/composited inside Chromium renderer/GPU processes. The repository does not contain or build a Chromium fork.
- The app can ask Electron/Chromium for GPU devices, feature status, WebGL/WebGPU capability and renderer strings. These are diagnostic observations. They do not expose an arbitrary web page's D3D12/Vulkan device, native color/depth/motion-vector resources, swap-chain or compositor texture handle, resource lifetime, or synchronization primitive.
- Electron's supported `WebContents.capturePage()` returns a `NativeImage`; `toPNG()` gives a safe screenshot/readback boundary. It is not zero-copy and does not provide a path back into Chromium's compositor.
- The native FSR1 harness owns its D3D12 device, queue and textures. Its PNG decode/upload path is retained strictly as a screenshot diagnostic.
- **Decision:** add a bounded game-owned WebGPU vertical slice: lower-resolution browser-owned game color texture → AMD FSR1 EASU + RCAS WGSL passes → visible WebGPU canvas. This is a genuine GPU frame path for the bundled controlled scene, not a generic browser compositor integration.
- Electron 44.7.0 also documents experimental offscreen shared-texture transfer and WebGPU consumption, but the upstream end-to-end spec is gated to macOS arm64 and no Windows app-level round trip was verified. Do not route normal tabs through it yet.
- **Rejected alternatives:** speculative handles/memory access; arbitrary-page code injection; desktop/DRM capture. General all-page processing requires a maintained Chromium compositor/device bridge or explicit game-side integration.

### NVIDIA DLSS / Streamline

The official NVIDIA Streamline README, DLSS Super Resolution guide and separate DLSS Frame Generation guide were reviewed on 2026-10-11. Streamline v2.14.1 documentation says feature binaries come from official release ZIPs, the DLSS-G plugin is prebuilt-only, production builds should use signed DLLs or signature checks, and NGX components require an NVIDIA-provided application ID. DLSS-SR requires native color/depth/motion-vector/exposure resources and per-frame constants; DLSS-G additionally requires proxy swap-chain/present integration, HUD-less color, Reflex/frame pacing, and its own OS/HWS/driver conditions. The exact release redistribution terms still need direct review. No SDK/runtime/application-ID approval or native renderer is included; DLSS SR and FG remain **not implemented / not tested**.

### AMD FSR source and adapter behavior

- Use the official [GPUOpen-Effects/FidelityFX-FSR](https://github.com/GPUOpen-Effects/FidelityFX-FSR) source pinned at `a21ffb8f6c13233ba336352bdff293894c706575` (FSR 1.0.2). The minimal shader inputs and AMD MIT/third-party notices are retained in `native/fsr1-poc/third_party/amd/UPSTREAM.md` with SHA-256 hashes.
- The native helper accepts either its deterministic synthetic regression input or an explicit PNG path. PNG mode uses Windows Imaging Component, own D3D12 resources, EASU + RCAS, readback/PNG encoding, output validation, adapter/API/feature/dimension/frame/timing/capture-path reports.
- `--list-adapters` reports non-software D3D12 adapters and WARP availability. Hardware mode can select an adapter and never silently falls back to WARP; WARP is explicitly software-only and leaves physical-GPU acceptance `NOT RUN`.
- Adapter/model/vendor/driver identifiers and D3D12 feature reports are evidence, not proof of a physical AMD GPU. Physical hardware and AMD-vendor gates remain separate.

## Implementation stages and status

### Stage 0 — Preserve browser, security, and existing features (**preserved**)

Retain all three cores, navigation, tabs, profile, bookmarks/history, downloads, default-deny site permissions, HTTPS validation, tests, WASM diagnostic, and collapsible performance panel. Remote pages remain sandboxed with context isolation, no Node integration, and no unrestricted native-code API. No driver install, TLS bypass, sandbox weakening, or external-process graphics-memory access is permitted.

### Stage 1 — Honest capability controller and accessible persistent panel (**source implemented; packaged non-WebGPU checks passed; WebGPU adapter discovery failed**)

- Preserve visible/selectable DLSS, FSR, WASM, hybrid-policy, and standard modes in auto/manual settings.
- Keep GPU detection, WebGPU adapter availability, FSR shader compatibility/initialization, active processing, completed frames, failure and unsupported states distinct. Vendor identity does not imply support.
- Automatic upscaler selection is DLSS → FSR only when the implementation is compatible, initialized, and eligible for the current rendering scope; otherwise use standard Chromium. The scene-specific FSR path is excluded from automatic selection for ordinary tabs. WASM availability is reported independently as a CPU runtime and never as an upscaler or game accelerator.
- Unsupported/failed requests retain standard Chromium. The keyboard-operable performance panel remains collapsible and persistent; collapsing affects only UI/layout, not a scene's processing.
- Local `npm ci`, unit/static tests (`npm test`, 56/56), renderer build, JavaScript syntax, workflow/package metadata parsing, parser-only WGSL, and audit-threshold checks passed for the pushed source `f015165`. Packaged Windows run 38242786245 validated the executable and passed fullscreen, browser/WASM/HTTPS, and separate screenshot→D3D12 WARP diagnostics, but all four safe WebGPU adapter requests returned `null`; shader/dispatch/output acceptance was not reached. The run uploaded an explicitly unverified EXE candidate. The source branch is pushed; no physical-GPU evidence exists.

### Stage 2 — Native FSR1 D3D12 harness (**source implemented; current Windows CMake/MSVC + WARP component regression passed**)

- Keep synthetic regression support and add explicit app-owned PNG input/output/report flags.
- Enumerate adapters and report model/vendor/device IDs, non-software/WARP classification, D3D12 API and format/shader capabilities, FSR initialization/processing, input/output dimensions, processed frames, GPU timestamp when available, CPU fence/native timings, visual sanity metrics and capture/report paths.
- Link WIC/OLE support and statically link the MSVC runtime for the standalone helper. Package pinned AMD shader sources/notices beside the executable.
- The code is not compiled on the Linux Arena host. Windows CI compiled the helper and processed the isolated synthetic regression on WARP in [run 38149140851](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140851) on the earlier `eee56b7` source, then validated the updated helper/classification in run 38228901578 on source `3123975`. These are software-only component checks, separate from the packaged browser-frame test, and do not validate physical-GPU support.

### Stage 3 — `capturePage()` PNG diagnostic (**implemented; packaged WARP screenshot diagnostic passed; diagnostic-only**)

- Bundle a reproducible animated WebGL2 scene with changing visual frames, frame counter, no network assets, and responsive resolution.
- Capture only the exact bundled scene while its `WebContentsView` is active, visible and not loading. Revalidate context around capture/native processing, bound dimensions/bytes, invoke the helper with fixed `execFile` arguments (no shell), and retain standard rendering as fallback.
- Return input/output PNG previews; record hashes, capture/helper/native/GPU timings when available, dimensions/resolutions and real frame count. This is not continuous/zero-copy processing.
- Earlier run 38149140832 passed this separate diagnostic on app/source `eee56b7`; latest packaged run 38242786245 on source `f015165` also validated three changing Electron `capturePage()` PNG frames at three resolutions through D3D12 WARP, with per-frame native reports and image validation. The latest artifact is an unverified EXE candidate, not an acceptance-certified portable package. WARP is software-only evidence, not live WebGPU integration, physical-GPU support, or arbitrary-page validation.

### Stage 4 — Game-owned WebGPU FSR1 vertical slice (**source implemented; target-runtime acceptance pending**)

- A sandboxed local WebGPU scene owns a lower-resolution game target, runs distinct AMD FSR1 EASU and RCAS WGSL compute pipelines, then uses a render pipeline to submit the processed image to the visible canvas. The frame-processing path has no CPU pixel readback; timestamp readback is optional measurement only.
- The packaged Windows gate checks adapter/device and lifecycle stages, WGSL compilation, EASU/RCAS compute-pipeline creation, at least three successful dispatches for each pass, larger output dimensions, changing scene frames, and queue-completion wall timing (not a GPU timestamp).
- The smoke freezes two completed frames and copies the original target, EASU intermediate, and RCAS output to CPU memory only after processing. A CPU bilinear comparison and EASU/RCAS contribution/detail checks are explicit baselines, not AMD conformance tests. A saved `capturePage()` PNG is compared against frozen RCAS texture samples; readback and screenshots are never FSR inputs. Structured summaries, hashes, captures, and failure evidence are retained.
- The path is opt-in and limited to the bundled scene (or a game that explicitly integrates its own render target). It is excluded from automatic ordinary-page selection. Local Node tests exercise the analysis and workflow gates, and `wgsl_reflect` has parser-only coverage; neither proves Dawn/Tint compilation or runtime behavior. Packaged run 38242786245 failed at adapter discovery after all four safe requests returned `null`; shaders/dispatch/output were not run. Chromium's software-adapter blocklist was not bypassed. The run uploaded a diagnostic-only EXE candidate; the next route is the same packaged smoke on Windows with a Chromium-supported WebGPU adapter. The hard output gate remains unchanged.

### Stage 5 — DLSS / Streamline (**blocked**)

Proceed only after reviewing the exact official release license/redistribution terms, obtaining NVIDIA's required application ID and authorized production-signed feature runtime, and providing a controlled D3D12/Vulkan renderer with correct SR or FG inputs. Test Super Resolution and Frame Generation as separate features on compatible physical hardware. Do not claim either before initialization and actual processing.

### Stage 6 — General browser/game integration (**architecture-blocked**)

Do not extend to arbitrary websites or third-party games via shell interception, WebGPU hooks, video/DRM/cloud streams or external apps until a supported Chromium compositor/device bridge is demonstrated with ownership/synchronization, security, resize/occlusion, packaging, performance and upgrade tests. The experimental offscreen shared-texture API is a candidate future route, not a verified Windows integration. A Chromium/Electron fork may be required and must be kept current/security-patched.

### Stage 7 — Physical GPU and performance acceptance (**NOT RUN**)

On a real Windows device, report the physical adapter identity, vendor/model/driver, API, input/output resolutions, processed frames, visible captures, and timing definitions/values. Clearly separate GPU timestamps from wall timings. Validate AMD vendor support separately; a non-software adapter report alone is not sufficient. Compare against an honest baseline including upload/readback/dispatch costs; output resolution alone is not evidence of performance gain.

## Compatibility/evidence categories

| Category | Status | Evidence / next step |
| --- | --- | --- |
| Chromium WebAssembly | Tested runtime diagnostic | Real compile/instantiate and `19 + 23 = 42`; never image upscaling. |
| Standard Chromium browsing and safe fallback | Existing browser path; regression checks required | Ordinary pages stay Chromium; unsupported/failed upscaler requests must safely fall back. |
| Bundled WebGPU game target → FSR1 → visible canvas | **Adapter discovery failed in run 38242786245; later gates NOT RUN** | The latest packaged smoke on source `f015165` received `null` from high-performance, low-power, default, and explicit fallback requests. It did not reach shader/pipeline creation, repeated dispatches, numerical output checks, or visible screenshot evidence. Next route: run the unchanged strict smoke on Windows with a Chromium-supported WebGPU adapter. |
| Bundled WebGL2 scene → `capturePage()` PNG → FSR1 preview | **Packaged WARP diagnostic passed in run 38242786245; diagnostic only** | Current source `f015165` passed three changing frames at three resolutions through the separate helper; WARP/software-only, not live integration, arbitrary-page or physical-GPU evidence. |
| Native synthetic-pattern FSR1 | **WARP component regression passed in run 38228901578** | Source `3123975` passed the isolated D3D12 helper test; software only and separate from live WebGPU. |
| Physical AMD or other GPU | **NOT RUN** | Requires a real named device, adapter/API details, dimensions, frame count, captures and timing report. |
| Arbitrary webpages/third-party games/video/DRM/cloud/external apps | Unsupported / architecture-blocked | No supported general Chromium page-resource/compositor bridge. Game-owned explicit integration only. |
| NVIDIA DLSS Super Resolution / Frame Generation | Not implemented / not tested | No authorized runtime/application ID, controlled native renderer, or NVIDIA hardware validation. |

## Current local verification snapshot

| Check | Current status |
| --- | --- |
| `npm ci` | **PASS** — clean lockfile install. npm reported 8 moderate advisories; no forced fix or unverified override was applied. |
| `npm test` | **PASS — 56/56** on source `f015165`. Static/source and helper tests do not execute Electron or compile/execute WebGPU shaders. |
| `npm run build` | **PASS** on the current working tree; Vite production renderer build only. |
| JavaScript/CommonJS syntax checks | **PASS** — `node --check` across project app, Electron, renderer, test, and script files. |
| WGSL grammar parse | **PASS — parser-only** — five modules accepted by ad-hoc `wgsl_reflect@1.6.0`; not Dawn/Tint semantic validation, pipeline creation, or runtime execution. The temporary parser is not in the package lock. |
| GitHub workflow / package JSON syntax | **PASS** — `js-yaml` parsed all three workflows and `package.json` parsed as JSON. |
| `git diff --check` | **PASS** at last check. |
| `npm audit --audit-level=high` | **PASS (threshold only)** — 8 moderate, 0 high, 0 critical findings; the moderate builder chain remains unresolved. |
| Windows PowerShell/package-script execution | **NOT RUN** on this Linux host. Workflow assertions are statically tested only. |
| Current-source Windows packaged WebGPU FSR1 smoke | **FAILED at adapter discovery** — run 38242786245; no shader/pipeline/device/frame validation, numerical texture capture, or visible screenshot comparison occurred. The unverified EXE candidate uploaded separately. |
| Current-source Windows packaged `capturePage()` diagnostic | **PASS — run 38242786245, WARP diagnostic only** — three changing screenshot frames/resolutions were processed by the separate native helper; software-only and not WebGPU integration. |
| CMake/MSVC/native helper build | **PASS in Windows Actions run 38228901578** on the `3123975` implementation; the separate native WARP harness remains software-only. |
| Isolated synthetic-input FSR1 on WARP | **PASS in Windows Actions run 38228901578** on source `3123975`; software component regression only. |
| Packaged executable presence/size check | **PASS in run 38242786245** on source `f015165`; executable presence and the 30 MB minimum passed before the explicitly unverified candidate upload. |
| Packaged Windows `capturePage()` → FSR1 WARP frames | **PASS in current-source run 38242786245 for the bundled WebGL2 test scene only.** Three changing frames at three resolutions passed through the WARP helper; software-only diagnostic. Earlier report/artifact evidence is in [run 38149140832](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38149140832). |
| Portable distribution and Actions artifact | The current-source EXE candidate `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` uploaded in run 38242786245 after executable validation; it is **not acceptance-certified**. The full current-source portable ZIP and public release were correctly withheld after the WebGPU adapter gate failed. The older `TriCoreBrowser-Windows-x64` artifact in run 38149140832 predates the WebGPU scene. |
| Physical GPU/AMD vendor, DLSS, arbitrary-page upscaling | **NOT RUN / NOT IMPLEMENTED / UNSUPPORTED** as scoped above. |

Update this plan only with results tied to an immutable current-source commit and the corresponding Windows runs. Do not promote earlier-commit WARP/packaging evidence to current-source acceptance.
