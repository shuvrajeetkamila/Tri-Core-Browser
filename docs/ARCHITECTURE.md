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
    └── Chromium/Electron GPU capability query (diagnostics only)
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
- **DLSS / FSR:** each request is rejected as not integrated, leaves Chromium rendering active, and reports why. GPU vendor presence does not override this result.
- **Hybrid:** runs the independent WASM test, checks the known integration status, never stacks unsupported upscalers, and reports a partial result with a standard-renderer fallback.

There is no native renderer, D3D12/Vulkan swap-chain, Streamline plugin, FidelityFX integration, or WebContents texture bridge in this application. Therefore there is no graphics backend to claim for DLSS or FSR.

## Why Chromium-wide upscaling is not a webview switch

An upscaler integration needs ownership/control of a render path and compatible GPU resources at the right point in the frame. Temporal methods require frame-to-frame information such as motion vectors and depth; upscalers also need correctly formatted low-resolution input and high-resolution output, resource lifetime/synchronization, and frame/presentation integration. The public Electron `WebContentsView` navigation/embedding surface used here does not hand the shell those page-specific render inputs or a supported native swap-chain. WebGL/WebGPU pages own their own rendering devices/queues, while ordinary DOM pages are composited inside Chromium's GPU process. A GPU name or WebGPU adapter cannot bridge those process/resource boundaries.

Broad webpage support would need upstream Chromium compositor integration or another explicit, supported graphics interop design that preserves GPU-process and site isolation. A separate native D3D12 graphics sample could establish a controlled first integration, but none is included or claimed as operational here.
