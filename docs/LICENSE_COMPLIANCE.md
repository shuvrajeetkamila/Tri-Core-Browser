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

- **NVIDIA Streamline/DLSS:** the official [Streamline repository](https://github.com/NVIDIA-RTX/Streamline) was inspected for integration requirements and its `license.txt`/release guidance. No Streamline SDK, DLSS feature plugin, NGX runtime, DLL, model/weight file, proprietary header, or sample was copied into this project or release. Streamline's README notes that some feature binaries are obtained through official release artifacts and calls out signed production plugin use. Because no such component is redistributed, this repository does not grant permission to distribute it; any future integration requires a fresh feature-specific SDK/EULA, application-ID, signing, driver and redistribution review.
- **AMD FidelityFX SDK/FSR:** the official [FidelityFX-SDK repository](https://github.com/GPUOpen-LibrariesAndSDKs/FidelityFX-SDK) and its versioned license documentation were inspected. No SDK source, shader, compiled binary, or sample was copied into this project or release. A future integration must pin the exact SDK/technique version, include its license and third-party notices, and verify the current redistribution terms before shipping.

## Distribution checks

- No NVIDIA or AMD binary is loaded from an arbitrary system DLL path.
- No non-project graphics SDK binary is included in the repository or planned release.
- Windows packages include the executable, user-facing documentation and notices; CI records SHA-256 checksums and size reports.
- Generated executables and ZIPs are ignored by Git and uploaded as GitHub artifacts/releases rather than committed to source history.

This audit does **not** certify that all future Electron/Chromium transitive notices are reproduced by every packaging configuration. The Windows CI package must be inspected after each Electron version change to confirm the upstream runtime license files remain present in its packaged resources.
