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
- **FSR:** source implements a bounded app-owned WebGPU game scene with a lower-resolution color target, distinct AMD FSR1 EASU/RCAS compute passes, and visible-canvas presentation. The frame-processing path contains no CPU pixel readback; explicit texture/screenshot copies are post-processing evidence only. Current-source Windows pipeline/dispatch/numerical/visible-pixel validation is pending, so source must not be reported as accepted runtime support. Only this bundled scene is integrated; other pages are not intercepted, and the path is deliberately excluded from automatic selection for ordinary tabs. A separate `capturePage()` PNG → D3D12 helper remains a manual screenshot diagnostic only.
- **Hybrid:** applies the automatic priority only to compatible, initialized integrations; the FSR screenshot helper is not auto-eligible. It never stacks unsupported upscalers and falls back to standard rendering.

`app/diagnostics/fsr1-webgpu.html` and `fsr1-webgpu.js` implement the game-owned WebGPU vertical slice. The browser page owns a lower-resolution GPU color target; EASU and RCAS are separate WGSL compute passes, followed by a presentation render pass into the visible canvas. This processing path does not use screenshot input or CPU pixel readback. The packaged smoke freezes completed frames and performs separate diagnostic texture copies plus a `capturePage()` screenshot comparison after processing. Those checks are evidence-only and do not feed FSR. The path is opt-in and applies only to the bundled test scene unless a game explicitly integrates its own render target. Static source checks do not prove shader compilation, pipeline creation, dispatch, or visible output; current-source Windows packaged validation is pending.

`native/fsr1-poc/` contains a separate Windows D3D12 helper with a synthetic regression input and a PNG diagnostic input path. It owns its device, queue, textures, upload, FSR1 passes, readback, and output. The PNG route remains diagnostic only. No Chromium compositor texture bridge or authorized DLSS plugin is included.

## Why Chromium-wide upscaling is not a webview switch

An upscaler integration needs ownership/control of a render path and compatible GPU resources at the right point in the frame. Temporal methods require frame-to-frame information such as motion vectors and depth; upscalers also need correctly formatted low-resolution input and high-resolution output, resource lifetime/synchronization, and frame/presentation integration. The public Electron `WebContentsView` surface used here does not hand the shell arbitrary pages' resources or a supported native swap-chain. The controlled WebGPU scene can apply FSR because it owns its own render target and queue. That does not bridge other pages: WebGL/WebGPU games own their own devices/queues, while ordinary DOM pages are composited inside Chromium's GPU process.

Electron 44.7.0 documents experimental shared-texture import/send APIs for offscreen contents, including a WebGPU `VideoFrame` consumer. This is a candidate future shell architecture, not a validated Windows integration in this app; Electron's upstream end-to-end test is gated to macOS arm64 and the normal `WebContentsView` does not expose the same path. See `docs/GRAPHICS_INTEGRATION.md` for evidence and the decision not to route ordinary tabs through this experimental route yet.

The separate `capturePage()` experiment provides a public screenshot boundary, but its readback path is diagnostic only and does not connect to Chromium's compositor. Broad page support needs a supported, maintained Chromium compositor/device bridge or an explicit page/game integration that owns its render target. The controlled scene must not be generalized to arbitrary WebGL/WebGPU pages, video, DRM, cloud gaming, or external applications.
