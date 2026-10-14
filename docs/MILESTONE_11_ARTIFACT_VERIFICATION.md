# Milestone 11 — M10 artifact verification

**Status:** BLOCKED — the exact M10 candidate bytes could not be recovered into the agent workspace.

**Audit date:** 2026-10-14 (UTC)

**Candidate provenance:** run [38428201500](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38428201500), branch `arena/18bfbe1a-tri-core-browser`, source `ba16afd6ca4efeac00a1237e654da777c2eb6d14`.

This document distinguishes live GitHub metadata, successful hosted-run evidence, local source checks, and checks that could not be performed. It is not a malware-clearance certificate or a release approval.

## GitHub artifact metadata

The exact run remains completed with conclusion `success`; artifact `workflow_run` metadata ties each row below to the repository, branch, full SHA, and run ID shown above.

| Artifact | ID | Size | GitHub-reported SHA-256 | Expiration (UTC) | Status |
|---|---:|---:|---|---|---|
| `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` | `11828834204` | 109,724,572 bytes | `c02b8c75bb6b086cfe32eca1413d2f386372b5900d57699c79b9064916cc0430` | 2026-11-12 16:13:20 | Unexpired remotely |
| `TriCoreBrowser-Packaged-Smoke-Diagnostics` | `11830246929` | 737,412 bytes | `66ecf85a89220c73ee41083a68a45c3d1a500e244d2b02fe374adce0eb5b5398` | 2026-11-12 16:13:54 | Unexpired remotely |
| `TriCoreBrowser-Linux-checks` | `11828993261` | 10,274 bytes | `e3eac1cf4285aad5186dcbe674e64576b2ff5e7cdac0fe630f1e394b8ae0cd1e` | 2026-11-12 16:10:03 | Unexpired remotely |
| `TriCore-FSR1-D3D12-WARP-POC` (separate run `38428201442`) | `11830316353` | 59,487 bytes | `3bf7db361e307b0939f408c2751f488954b474a89b85f47f98a5ec725c2b6bcf` | 2026-11-12 16:10:20 | Unexpired remotely |

The first digest is GitHub's Actions **ZIP/archive** digest. The ZIP could not be downloaded, so the digest was **not independently recalculated**. It is not the EXE digest. The exact EXE filename is expected to be `TriCoreBrowser.exe` because that is the workflow's upload path, `release/TriCoreBrowser.exe`; the archive contents were not inspected.

## Retrieval attempts and result

- The prior M10 review records a GitHub API artifact request and a separate run-log request ending in `EOF` after redirects.
- On 2026-10-14, GitHub CLI authentication was checked without displaying credentials. A clean destination was used with `gh run download 38428201500 --name TriCoreBrowser-Windows-x64-unverified-smoke-candidate`. It failed with `EOF` after redirect to Actions artifact storage. The destination remained empty; no partial ZIP or EXE was saved.
- The sandbox does not provide an authenticated interactive GitHub web session, so the GitHub Actions web UI could not be used by the agent. The live artifact metadata still reports `expired=false`.
- This CLI transfer reproduced the earlier EOF. No repeated download loop was run, no signed redirect was recorded in this report, and no alternate binary was substituted.

**Owner retrieval action:** open [run 38428201500](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38428201500), use its **Artifacts** section to download the candidate and diagnostics ZIPs, then attach both here or provide an authorized accessible file path. Do not place the 100+ MB ZIP/EXE in Git history.

## Independent verification checklist

| Check | Result | Evidence boundary |
|---|---|---|
| Run identity / branch / commit | **VERIFIED from GitHub metadata** | Run is a successful push on the session branch at exact source SHA `ba16afd…`. |
| Artifact existence, name, ID, size, expiry | **VERIFIED from GitHub API metadata** | Candidate remains unexpired remotely. |
| ZIP integrity and inventory | **NOT RUN** | No ZIP bytes were obtained. |
| Independent ZIP SHA-256 | **NOT RUN** | GitHub-reported archive digest only: `c02b…0430`. |
| EXE exact byte size / SHA-256 | **UNKNOWN** | Windows workflow verifies a size greater than 30,000,000 bytes; exact log output could not be retrieved. No EXE bytes. |
| PE file type / x64 architecture / package contents | **NOT INSPECTED** | Build configuration targets Windows x64 portable Electron, but a filename/configuration is not independent binary proof. |
| Authenticode status | **NOT INDEPENDENTLY INSPECTED** | Source packaging documentation says unsigned; do not treat that as a signature check on these exact bytes. |
| Antivirus / binary malware scan | **NOT RUN** | No candidate bytes and no authorized external scan. No “malware-free” claim. |
| Hosted Windows launch | **PASS, as recorded by run steps** | The packaged app launched and passed its smoke/evidence checks on GitHub-hosted Windows. This is not a local or manual launch. |
| Local Windows launch | **NOT RUN** | Agent environment is Debian 12 x86_64. |
| Physical GPU | **NOT RUN** | Level B job skipped. Separate D3D12 WARP run is software-only. |
| Dependency audit | **PASS at `--audit-level=high`; 8 moderate, 0 high/critical** | This scans the locked npm dependency graph, not the EXE. |

The workflow's candidate artifact upload path contains only `release/TriCoreBrowser.exe`; no `SHA256SUMS.txt` was uploaded in this M10 artifact. The portable-distribution assembly/upload steps were skipped. No M10 checksum manifest, ZIP inventory, EXE inspection record, or security-scan result has been fabricated.

## Tests actually performed

- Local `npm test -- --test-reporter=spec`: **100/100 passed** against available source.
- Local `npm audit --audit-level=high`: exit **0**, reporting **8 moderate and 0 high/critical** advisories. No package or lockfile edits were made.
- Hosted run `38428201500`: Linux renderer tests/build/audit passed; Windows portable packaging threshold, packaged launch, and Level A validator passed.
- Hosted run [38428201442](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38428201442): isolated D3D12 FSR1 WARP-only test passed. This is software rendering, not physical-GPU validation.

## Release decision

**Do not upload this M10 candidate to a new GitHub Release yet.** Mandatory artifact-byte, independent checksum, PE/package, signature-status, and binary-scan gates remain unresolved; the run skipped physical-GPU validation and the repository release workflow's strict gate requires a physical-GPU pass. Existing older prereleases are separate artifacts and do not verify this M10 candidate.
