# Architecture

## Browser engine and process model

Tri-Core Browser is a Windows desktop application, not a browser-looking web page. The checked-in application is an Electron shell. Electron ships its own Chromium runtime and V8; the Windows portable executable packages that runtime and the application together. A separate Chrome/Edge install is not required. This project does not build Chromium from source or use CEF.

```text
Windows portable executable
└── Electron main process
    ├── Native BrowserWindow (local app UI only)
    │   ├── sandboxed renderer + narrow contextBridge preload
    │   └── three Chromium WebContentsView browser cores
    │       ├── per-core persistent Chromium session partition
    │       └── one active view + up to 19 inactive tabs
    ├── validated IPC handlers (navigation, tabs, data, diagnostics)
    ├── local profile JSON (bookmarks, history, home page)
    ├── Chromium/Electron GPU capability query (diagnostics only)
    └── native AMD FSR1 helper (manual test-scene PNG only; owns its D3D12 device/resources)
```

The local interface is built with Vite. In the desktop app, each `WebContentsView` is a real Chromium page surface positioned over its corresponding core's content viewport. The active tab is shown; other tabs remain in the same core's session with zero-sized bounds. Three persistent partitions (`persist:tri-core-1` through `persist:tri-core-3`) keep core cookies and site storage separate; tabs within one core share its session.

The prominent **Full screen** action sends only the requested boolean and active core index through sender-validated IPC to `BrowserWindow.setFullScreen()`; on entry, the main process returns keyboard focus to that core's active tab. Immersive mode selects the active core, resizes its `WebContentsView` to fill the fullscreen window, and hides the app toolbar, settings, address/tab controls, and other panes. One accessible exit strip remains, with an **Exit full screen** button and an F11 toggle; leaving fullscreen restores the previous focus/layout state. This is window/layout presentation only and does not inject code into the remote page or claim graphics acceleration.

Remote sites never receive the app preload. The shell uses `contextIsolation`, `sandbox`, `webSecurity`, and `nodeIntegration: false`; the preload exposes only specific operations to the local UI. IPC handlers verify the sender, validate core/tab identifiers and HTTP(S) URLs, and restrict downloads/reveal actions. Site permission prompts are denied. Chromium's browser sandbox is not disabled as a graphics shortcut.

## Navigation, tabs, and profile features

- The address bar normalizes HTTP(S) addresses and sends other ordinary text to DuckDuckGo. `javascript:`, `file:`, `data:`, and other non-web schemes are not navigated.
- Links opened with `window.open` are routed to a new tab in the originating core; external arbitrary protocols are denied (the narrowly handled `mailto:` case goes to the operating system).
- Each core keeps at least one tab and enforces a 20-tab ceiling. Back/Forward/Reload/Stop/Home operate on that core's active tab.
- Bookmarks, history, and the home-page preference are written atomically to the Electron per-user profile file `browser-data.json`. History is capped at 500 entries. Downloads are saved under the OS Downloads directory and tracked in memory for the current session; completed files can be revealed in Explorer but are not executed.
- The settings panel reports the default-deny permission policy and per-core storage model. It does not claim to provide password management, extension support, private browsing, or sync.

## WebAssembly

The browser's existing Chromium V8 runtime executes WASM. `src/wasm-benchmark.js` compiles a tiny module with an exported `add(i32, i32)` function, verifies `add(19, 23) === 42`, and times 500,000 calls with a checksum. The matching human-readable WAT is `app/diagnostics/wasm-add.wat`. Unit tests execute the actual module under Node/V8; the packaged Windows smoke test executes it inside a real Chromium `WebContentsView`.

This is a controlled runtime/CPU diagnostic. It does not alter website compositing, provide GPU acceleration, or imply a frame-rate improvement. Normal pages continue to render when the diagnostic has not been run.

## Graphics capability and mode controller

`src/graphics-controller.js` is a deterministic policy/controller module with tests. The main process exposes Electron's GPU device/feature status; the UI optionally probes `navigator.gpu.requestAdapter()` and displays the returned information. These values are diagnostics, not proof that an upscaler is usable.

- **Standard:** the actual active path—normal Chromium rendering and driver-selected hardware/software compositing.
- **WASM:** runs the controlled WASM test, then reports the standard webpage-rendering path separately.
- **DLSS:** always unavailable; no Streamline/DLSS runtime or native renderer integration is present, and Chromium stays active.
- **FSR:** source implements a bounded app-owned WebGPU game scene with a lower-resolution color target, distinct AMD FSR1 EASU/RCAS compute passes, and visible-canvas presentation. The frame-processing path contains no CPU pixel readback; explicit texture/screenshot copies are post-processing evidence only. Latest hosted Level A run 38287627583 passed build, packaged smoke, and evidence validation, but its per-stage report was not inspected; WebGPU `PASS` versus safe `SKIPPED`, pipeline/dispatch, numerical output, and visible pixels remain **UNKNOWN**. Do not report accepted runtime support. Only this bundled scene is integrated; other pages are not intercepted, and the path is deliberately excluded from automatic selection for ordinary tabs. A separate `capturePage()` PNG → D3D12 helper remains a manual screenshot diagnostic only.
- **Hybrid:** applies the automatic priority only to compatible, initialized integrations; the FSR screenshot helper is not auto-eligible. It never stacks unsupported upscalers and falls back to standard rendering.

`app/diagnostics/fsr1-webgpu.html` and `fsr1-webgpu.js` implement the game-owned WebGPU vertical slice. The browser page owns a lower-resolution GPU color target; EASU and RCAS are separate WGSL compute passes, followed by a presentation render pass into the visible canvas. This processing path does not use screenshot input or CPU pixel readback. The packaged smoke freezes completed frames and performs separate diagnostic texture copies plus a `capturePage()` screenshot comparison after processing. Those checks are evidence-only and do not feed FSR. The path is opt-in and applies only to the bundled test scene unless a game explicitly integrates its own render target. Latest run 38287627583 passed packaged smoke and evidence validation, but the per-stage report was not inspected; shader compilation, pipeline creation, dispatch, and visible output are therefore not independently verified.

`native/fsr1-poc/` contains a separate Windows D3D12 helper with a synthetic regression input and a PNG diagnostic input path. It owns its device, queue, textures, upload, FSR1 passes, readback, and output. Native harness run 38287627651 passed its one-frame synthetic EASU+RCAS check on software WARP; the PNG route is still diagnostic only. Neither path is bundled WebGPU processing or physical-GPU evidence. No Chromium compositor texture bridge or authorized DLSS plugin is included.

## Why Chromium-wide upscaling is not a webview switch

An upscaler needs the right source image/resources, processing stage, lifetime/synchronization, and output presentation. **FSR1 is spatial:** this implementation uses the current frame and does not require temporal history or motion vectors. Temporal techniques such as DLSS SR/FG require additional game-render inputs (for example depth, motion vectors, camera data, and feature-specific frame/presentation integration). Electron's public `WebContentsView` surface does not give this shell arbitrary pages' GPU targets or a supported native swap-chain. The controlled WebGPU scene can process FSR because that page owns its own target and queue; that does not grant access to other pages' private WebGL/WebGPU devices or Chromium's composed output.

### Ordinary-page enhancement paths (Milestone 4 research)

| Path | Confirmed boundary | What remains a prototype/hypothesis |
| --- | --- | --- |
| **Chromium/Viz integration** | Chromium's RenderingNG architecture aggregates browser/renderer compositor frames in Viz before presentation. | A maintained Chromium/Electron hook could process the composed output, but requires a deep fork/integration, GPU-process/resource-lifetime/security work, and ongoing Chromium update maintenance. No public `WebContentsView` effect hook exists here. |
| **Electron offscreen shared texture** | Electron 44.7.0 documents experimental offscreen texture import/send and conversion to `VideoFrame`; an upstream fixture consumes it with WebGPU. | Upstream shared-texture E2E tests are gated to macOS arm64; Windows end-to-end import, presentation, interaction/input forwarding, synchronization, performance, and stability are not verified in TRI-CORE. |
| **Video/image-only** | WebGPU `importExternalTexture()` accepts a specific `HTMLVideoElement` or `VideoFrame`; security/origin checks apply. Chromium's VideoNG architecture can route video surfaces separately from ordinary DOM layers. | Access to an element/frame is not access to a whole remote page. Remote-site permissions, protected playback, audio/seek synchronization, visible presentation, and product-quality behavior are not implemented or tested. |
| **Windows companion capture** | Windows Graphics Capture provides system UI for user selection of a window/display and D3D11 capture frames. | A separate processor/preview could be built, but it would not replace the source app's swap chain or show processed pixels in the original window. Latency, HDR, overlays, resize, protected surfaces, and interaction need testing. |
| **App/game-owned WebGPU** | The page/game owns its GPU target and can schedule FSR as its own render pass. | Only the bundled scene is integrated. A third-party game must explicitly integrate its own target and lifecycle; automatic support for ordinary browser tabs does not follow. |

The separate `capturePage()` experiment provides a public `NativeImage` screenshot boundary, not a shared compositor texture. Its CPU readback/PNG path is diagnostic only. It cannot be treated as a continuous live browser pipeline. The no-risk implementation remains the app-owned scene plus standard Chromium fallback. A dedicated user-selected still-image/local-video viewer is the most practical limited feature to explore next; if transparent all-page enhancement is mandatory, first time-box a Windows Electron shared-texture proof, then budget for a maintained Chromium/Viz integration if the prototype cannot satisfy the requirement. Do not substitute page injection, graphics-memory inspection, unsafe flags, or an overlay that cannot replace the source presentation.

Primary references and the confirmed-vs-hypothesis decision table are in `docs/BROWSER_FRAME_UPSCALING_DECISION_RECORD.md`.
