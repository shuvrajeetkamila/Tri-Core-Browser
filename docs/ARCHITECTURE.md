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
- **FSR:** the selectable control reports its honest lifecycle state. A separate, manual-only FSR1 diagnostic can capture the bundled animated WebGL2 scene from its active `WebContentsView` via `capturePage()` PNG, process it with a separate D3D12 helper, and return a comparison preview. It never replaces Chromium rendering or becomes an automatic/general-page upscaler.
- **Hybrid:** applies the automatic priority only to compatible, initialized integrations; the FSR screenshot helper is not auto-eligible. It never stacks unsupported upscalers and falls back to standard rendering.

`native/fsr1-poc/` contains a Windows D3D12 helper with a synthetic regression input and a PNG input path. The app uses the PNG path only for its own diagnostic scene; the helper owns its device, queue, textures, upload, FSR1 passes, readback, and output. The end-to-end Windows build/WARP smoke for the current source must pass before it is reported as validated. No Chromium compositor texture bridge or authorized DLSS plugin is included.

## Why Chromium-wide upscaling is not a webview switch

An upscaler integration needs ownership/control of a render path and compatible GPU resources at the right point in the frame. Temporal methods require frame-to-frame information such as motion vectors and depth; upscalers also need correctly formatted low-resolution input and high-resolution output, resource lifetime/synchronization, and frame/presentation integration. The public Electron `WebContentsView` navigation/embedding surface used here does not hand the shell those page-specific render inputs or a supported native swap-chain. WebGL/WebGPU pages own their own rendering devices/queues, while ordinary DOM pages are composited inside Chromium's GPU process. A GPU name or WebGPU adapter cannot bridge those process/resource boundaries.

The controlled `capturePage()` experiment is the largest safe alternative supported by Electron's public APIs, but screenshot readback adds latency and does not connect to the compositor. Broad webpage support would need upstream Chromium compositor integration or another explicit, supported graphics-interop design that preserves GPU-process and site isolation. The controlled experiment must not be generalized to arbitrary WebGL/WebGPU pages, video, DRM, cloud gaming, or external applications.
