# License and redistribution audit

**Review date:** 2026-10-11. This is an engineering inventory, not legal advice. Recheck upstream notices and redistribution terms for every dependency/runtime update.

## Project code

- Application source and original assets are licensed under the repository's MIT `LICENSE`.
- The WAT test module and its small WebAssembly instruction bytes are project-authored and are not copied from a third-party SDK.

## Build-time JavaScript dependencies

Versions are pinned in `package.json` and `package-lock.json`:

- `electron` 44.7.0 — MIT license. The packaged Electron distribution contains the Electron/Chromium runtime and its upstream license materials.
- `electron-builder` 26.17.0 — MIT, build tooling only.
- `vite` 8.3.4 — MIT, build tooling only.
- `@fontsource-variable/dm-sans` 5.3.0 and `@fontsource-variable/manrope` 5.3.0 — the distributed fonts are under the SIL Open Font License 1.1; preserve the relevant font package license/metadata when packaging.
- Other transitive npm packages are build tooling. CI audits the full lockfile (including Electron and electron-builder), retains the audit/tree JSON, and fails on high or critical findings. Electron is a dev dependency for packaging; it is nevertheless shipped as the application runtime and included in the full audit.

The portable executable is built from Electron's official platform distribution. Its runtime/Chromium third-party licenses are upstream materials, not a new Tri-Core Browser license. The Windows packaging script copies electron-builder's retained `LICENSE.electron.txt` and `LICENSES.chromium.html` files from `release/win-unpacked`, plus the two font-package licenses, into the portable ZIP's `third-party/` directory; electron-builder also retains Electron's license files in the packaged application. The unsigned build is not code-signed or notarized.

## Graphics SDKs

- **NVIDIA Streamline/DLSS:** the official [Streamline repository](https://github.com/NVIDIA-RTX/Streamline) and separate [DLSS Super Resolution](https://github.com/NVIDIA-RTX/Streamline/blob/main/docs/ProgrammingGuideDLSS.md) and [DLSS Frame Generation](https://github.com/NVIDIA-RTX/Streamline/blob/main/docs/ProgrammingGuideDLSS_G.md) guides were inspected on 2026-10-11. The README identifies v2.14.1, says DLSS/Streamline binary artifacts are obtained from official release ZIPs rather than the source repository, marks the DLSS-G plugin as prebuilt-only, recommends production builds, and calls for original NVIDIA-signed DLLs or a signature-checking signing policy. The DLSS guide requires an NVIDIA-provided application ID when using NGX components. No Streamline SDK, DLSS feature plugin, NGX runtime, DLL, model/weight file, proprietary header, or sample was copied into this project or release. These observations do not establish the applicable license or redistribution terms; any future integration requires review of the exact official release/license, feature-specific authorization, app-ID approval, signing, driver and redistribution requirements before packaging.
- **AMD FSR1 source:** the official [GPUOpen-Effects/FidelityFX-FSR repository](https://github.com/GPUOpen-Effects/FidelityFX-FSR) is pinned at commit `a21ffb8f6c13233ba336352bdff293894c706575` (FSR 1.0.2). The separate D3D12 PNG diagnostic helper uses `ffx_a.h`, `ffx_fsr1.h`, and the sample wrapper `FSR_Pass.hlsl`; the app's game-side WebGPU scene uses a WGSL adaptation of AMD's EASU/RCAS algorithms in `app/diagnostics/fsr1-webgpu.js`. The upstream MIT license, original headers/attributions, source paths, and SHA-256 hashes are retained in `native/fsr1-poc/third_party/amd/UPSTREAM.md`; the AMD MIT license notice is also included in the WGSL source header. No proprietary AMD runtime or compiled SDK binary is bundled. This source license does not imply support for arbitrary browser content or performance gains; recheck notices/terms on every update.

## Distribution checks

- No NVIDIA or AMD proprietary runtime binary is loaded from an arbitrary system DLL path; the helper compiles the pinned AMD FSR1 shader source locally through D3DCompile.
- The only included graphics vendor code is the licensed AMD FSR1 shader source and its required notices; no DLSS plugin/model, driver DLL, or proprietary upscaler binary is included.
- Windows packages include the executable, user-facing documentation/notices, and controlled-scene PNG/report evidence; CI records SHA-256 checksums and size reports.
- Generated executables and ZIPs are ignored by Git and uploaded as GitHub artifacts/releases rather than committed to source history.

This audit does **not** certify that all future Electron/Chromium transitive notices are reproduced by every packaging configuration. The Windows CI package must be inspected after each Electron version change to confirm the upstream runtime license files remain present in its packaged resources.
