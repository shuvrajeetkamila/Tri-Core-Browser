# Milestone 9 report — recovered-source Windows build

**Date:** 2026-10-13  
**Session branch:** `arena/18bfbe1a-tri-core-browser`  
**Available application source base:** `3b05d2f9070732b36573016d7dbd3c250289839b` (formerly `arena/66abfdc9-tri-core-browser`)

## Source recovery and fidelity

The initial session checkout contained only `Initial Release` and `README.md` at `e27cb207`; it had no app source, `package.json`, Windows Actions workflow, M8 patch, M9 report, or recovery archive. The reported M8 patch SHA-256 is not sufficient to reconstruct the patch contents.

To make a Windows build possible, the fixed session branch was fast-forwarded to the repository's available complete app source at `3b05d2f`. This is **not a byte-for-byte recovery of the missing M8/M9 working tree**. The available source does not contain the Images UI or Images tests described in the handoff. This report and the M8-equivalent change below must not be represented as the original missing patch.

## M8-equivalent smoke-log repair

The packaged-smoke validator previously allowed `--smoke-log` to be omitted, allowing JSON/PNG reports to be accepted without checking the app's text log. It now:

- requires an explicit `--smoke-log <path>`;
- rejects missing or empty logs;
- requires the final packaged-runtime `PASS` marker; and
- rejects a log containing the packaged-smoke failure marker.

A regression test covers omitted and empty logs. This is a new two-file implementation based on the supplied description, not the original patch or its original hash. It hardens CI acceptance; it does not add a user-facing browser feature. Tests and the validator are not bundled into the portable EXE.

## M9 scope and product limitations

M9 is this documentation report; it adds no browser runtime feature. The available app source contains an opt-in app-owned WebGPU FSR1 diagnostic scene and a separate screenshot/readback diagnostic. This does not upscale ordinary webpages. DLSS is not implemented, WASM is a diagnostic, and physical-GPU acceptance remains a separate gate. The Images UI described in the handoff is not in this recovered source.

## Local verification

- `npm ci`: **PASS** (8 moderate audit findings were reported; no dependency or lockfile changes were made).
- `npm test`: **PASS, 100/100** on the recovered source including the new smoke-log regression.
- `npm run build`: **PASS** (Vite renderer build).
- `npm audit --audit-level=high`: **PASS**; this does not clear the 8 moderate findings.
- `git diff --check`: **PASS**.

The earlier handoff's `126/126` total and Images-source test results belong to source not present here; they were not reproduced on this source.

## Windows Actions status

The first session-branch run, [38426660450](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38426660450) at `d977ea6`, passed Linux checks, built and size-validated the Windows EXE, uploaded its diagnostic candidate, and launched the packaged smoke process successfully. The Level A evidence validator then failed because this new validator change incorrectly required an overall-runtime `PASS` marker even when the runner correctly reported no compatible WebGPU adapter and a safe `SKIPPED` GPU result.

The uploaded smoke diagnostics showed Microsoft Basic Render Driver, no WebGPU adapters, GPU-dependent FSR safely skipped, and the separate D3D12 WARP screenshot diagnostic passing. Physical-GPU validation remained **NOT RUN**. This was a validator regression, not a Windows packaging or launch failure, but the candidate from that failed run is not the accepted final artifact.

The validator fix now accepts either a final runtime PASS or the explicit safe no-adapter skip (while still requiring a non-empty app log, all GPU-independent checks, and no failure marker). The corrective commit is being retested on hosted Windows before treating its EXE artifact as accepted. Level A does not run the opt-in self-hosted physical-GPU job; even a green rerun will not establish physical-GPU support, live FSR processing, release eligibility, or arbitrary-page upscaling.
