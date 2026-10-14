# Tri-Core Browser — M10 Windows candidate release notes (BLOCKED DRAFT)

**Publication status:** NOT PUBLISHED. These notes are not attached to a release.

**Candidate run:** [38428201500](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38428201500)

**Source:** `ba16afd6ca4efeac00a1237e654da777c2eb6d14`

**Candidate artifact:** `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` (artifact `11828834204`).

These notes preserve accurate intended scope for a possible later M10 release candidate. They must not be used to publish the current candidate while the gates below remain unmet.

## Candidate summary

The source config targets a portable Windows x64 Electron application using Electron's bundled Chromium runtime. A separate Chrome or Edge installation is not intended. The M10 hosted Windows workflow built the portable EXE, passed its existence/size threshold, launched it on the hosted runner, and passed the packaged smoke and Level A evidence validation.

This is hosted CI evidence—not a local Windows installation or manual end-user test. The uploaded object is an explicitly **unverified smoke candidate**, not a release-certified binary. The original artifact bytes were not retrievable in the agent workspace.

## Implemented scope in the available source

- Three side-by-side Electron `WebContentsView` browser cores with per-core persistent sessions and tab lifecycle. These are three views/sessions in one Electron/Chromium runtime, not three independent browser engines.
- Browser navigation controls, fullscreen behavior, local bookmarks/history/home preference, and session downloads.
- A controlled WebAssembly diagnostic, not an image upscaler.
- A bundled app-owned WebGPU FSR1 diagnostic/game scene and a separate screenshot-to-native D3D12 diagnostic.

Source implementation is not by itself proof that every feature works in the packaged binary. The packaged smoke did not separately verify bookmarks/history, downloads, or every session-isolation property.

## Graphics and image limitations

- **DLSS:** not integrated or verified.
- **General webpage upscaling:** not implemented or demonstrated; ordinary pages render in Chromium.
- **FSR1:** restricted to diagnostic paths. The optional M10 WebGPU outcome is unknown because the diagnostic artifact was not obtained. Run `38428201442` passed a D3D12 WARP software-only harness test.
- **Physical GPU:** not validated; Level B was skipped.
- **Images UI:** absent from the available source. No user-facing image file picker, format-import matrix, preview/edit/resize/export workflow, or cancellation behavior is claimed.

## Verification and distribution status

- GitHub reports the ZIP/archive digest as `c02b8c75bb6b086cfe32eca1413d2f386372b5900d57699c79b9064916cc0430`; the ZIP was not locally downloaded or rehashed. This is not the EXE hash.
- Standalone EXE size/hash, PE contents, and Authenticode status were not independently inspected. Packaging documentation describes the target as unsigned, but the exact candidate signature was not checked.
- No antivirus or binary malware scan was performed. The npm audit is not an EXE scan.
- No verified ZIP/EXE asset or release URL exists for this M10 candidate. Do not put the binary in Git history.

## Existing repository releases (not this candidate)

`v1.0.0-alpha.1` and `v1.0.0-alpha.2` are already published prereleases for older commits. They were left unchanged and are not substitutes for or independent verification of M10. The draft `v1.0` release has no assets and no tag; it was left unchanged. No new release or tag was created.

## Publication gate

**Blocked.** Retrieve the exact M10 candidate and diagnostics ZIPs from the Artifacts section of run `38428201500`, then independently verify ZIP integrity/hash, EXE size/hash/architecture/package contents, and signature status. Perform a suitable binary scan where authorized. The repository's current release workflow also requires a physical-GPU FSR PASS, which the M10 run does not have. Until the mandatory checks pass, these notes are not release-ready and must not be attached to a public or draft release.
