# Download and verify the Windows x64 portable EXE — M18

This is the user handoff for the M18 Windows artifact. It is a GitHub Actions artifact from a successful hosted Windows build—not a GitHub Release. The artifact expires on **2026-11-14 11:52:13 UTC**, so download it before then.

## Official download page

1. Open the [official Windows build run](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38729756733) and sign in to GitHub if requested.
2. In the run's **Artifacts** section, download the artifact whose exact name is:

   ```text
   TriCoreBrowser-Windows-x64-M18-EXE-ba0280c89296c2c9ac8f75274f04554686c2759fe39e4418b06dbeddf2cc00af-BYTES-109797006-ZIP-BYTES-109729146-SHA256-044ae6f6fd17b386544e3d64718634143875b264c88d1172c67c03312e040cfc-NODE-v22.22.3-NPM-10.9.8
   ```

3. GitHub downloads one outer artifact ZIP (about 219 MB). Save it to a new folder, then use **Extract All** in File Explorer. The extracted folder should contain:
   - `TriCoreBrowser.exe` — the portable app;
   - `TriCoreBrowser-Windows-x64-M18.zip` — a convenience ZIP containing the EXE and documentation;
   - `M18_BUILD_MANIFEST.json` — build, source, toolchain, and EXE provenance;
   - `M18_ARTIFACT_HASHES.txt` — build-time sizes and SHA-256 values for the EXE, convenience ZIP, and JSON manifest.

There is no direct `.exe` URL: the exact file is inside the named Actions artifact. The outer artifact is retained for 30 days from its creation.

## Verify before running

The EXE and ZIP values below were calculated by the Windows build job. They are not a malware scan or a locally verified digest. If a local hash or size does not match, **stop and do not run the file**.

Open PowerShell in the extracted outer-artifact folder and run:

```powershell
$exe = Get-Item .\TriCoreBrowser.exe
$exe.Length
(Get-FileHash .\TriCoreBrowser.exe -Algorithm SHA256).Hash.ToLowerInvariant()

$zip = Get-Item .\TriCoreBrowser-Windows-x64-M18.zip
$zip.Length
(Get-FileHash .\TriCoreBrowser-Windows-x64-M18.zip -Algorithm SHA256).Hash.ToLowerInvariant()
```

Expected values:

| File | Bytes | SHA-256 |
|---|---:|---|
| `TriCoreBrowser.exe` | `109797006` | `ba0280c89296c2c9ac8f75274f04554686c2759fe39e4418b06dbeddf2cc00af` |
| `TriCoreBrowser-Windows-x64-M18.zip` | `109729146` | `044ae6f6fd17b386544e3d64718634143875b264c88d1172c67c03312e040cfc` |

`M18_ARTIFACT_HASHES.txt` inside the artifact provides the same build-time values. The exact artifact's GitHub-reported **outer archive** digest is `sha256:8638ac90a48f0317d57e9fe13af83c42b5c307bb60965c32752cd7e377ef3752`; that digest is different from the EXE and inner ZIP hashes. If you hash the downloaded outer ZIP, compare it separately to that value.

If you prefer the convenience ZIP, right-click `TriCoreBrowser-Windows-x64-M18.zip` → **Extract All**. The Windows build job checked that it contains exactly `TriCoreBrowser.exe`, `M18_BUILD_MANIFEST.json`, `README.md`, `LICENSE`, `THIRD_PARTY_NOTICES.txt`, and `KNOWN_LIMITATIONS.md`, and that the embedded EXE has the expected uncompressed size.

## Run the app

After the EXE's size and SHA-256 match, double-click `TriCoreBrowser.exe` from the extracted folder. This is an Electron **portable target**, not a setup/installer wizard. The build was made for Windows x64 on GitHub's hosted `windows-latest` runner; ARM64 is not the target. No physical-desktop launch is claimed by this report—the hosted Windows CI did launch the packaged app with its bounded `--smoke-test` and reported a successful exit.

No code-signing certificate was configured by this change; inspect `authenticodeStatus` in `M18_BUILD_MANIFEST.json`. Windows may show a publisher/SmartScreen warning. Do not bypass a warning just because the file hash matches: a hash confirms file identity, not that the program is safe or malware-free. If you do not trust the source or cannot verify the hash, do not run it.

## What this build does—and does not—prove

- The packaged browser smoke and Level A evidence validator passed in the hosted Windows workflow. Optional graphics checks may be skipped when unsupported; this is not a physical-GPU acceptance result.
- The exact per-run packaged WebGPU compute and bundled-scene FSR1 reports were not independently reviewed. WebGPU FSR1 remains blocked for independent acceptance; the separate D3D12/WARP harness is software-only.
- The bundled FSR1 scene is not general upscaling of arbitrary web pages. DLSS Super Resolution/Frame Generation and ordinary webpage upscaling remain **not implemented**.
- This artifact is not a formal release, security certification, malware scan, or claim of bit-for-bit reproducibility.

For run provenance, hashes, scope, and the full M18 evidence assessment, see [`MILESTONE_18_REPORT.md`](MILESTONE_18_REPORT.md) and [`WINDOWS_ACCEPTANCE_M18.json`](WINDOWS_ACCEPTANCE_M18.json).
