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

A push of this session-branch commit is intended to start the hosted `windows-latest` Level A build and packaged-smoke workflow. Its result must be recorded from the run for the exact pushed commit. Level A can produce a portable EXE candidate, but it does not run the opt-in self-hosted physical-GPU job. A green Level A run does not establish physical-GPU support, live FSR processing, release eligibility, or arbitrary-page upscaling.
