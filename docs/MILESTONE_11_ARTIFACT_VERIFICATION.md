# Milestone 11 — M10 artifact verification

**Status:** BLOCKED — the exact M10 candidate bytes could not be recovered into the agent workspace.

**Audit date:** 2026-10-14 (UTC)

**M10 candidate provenance:** run [38428201500](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38428201500), branch `arena/18bfbe1a-tri-core-browser`, source `ba16afd6ca4efeac00a1237e654da777c2eb6d14`.

This document distinguishes live GitHub metadata, successful hosted-run evidence, local source checks, and checks that could not be performed. It is not a malware-clearance certificate or a release approval.

## Original M10 GitHub artifact metadata

The exact run is completed with conclusion `success`; artifact `workflow_run` metadata ties each row below to the repository, branch, full SHA, and run ID shown above.

| Artifact | ID | Size | GitHub-reported SHA-256 | Expiration (UTC) | Status |
|---|---:|---:|---|---|---|
| `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` | `11828834204` | 109,724,572 bytes | `c02b8c75bb6b086cfe32eca1413d2f386372b5900d57699c79b9064916cc0430` | 2026-11-12 16:13:20 | Unexpired remotely |
| `TriCoreBrowser-Packaged-Smoke-Diagnostics` | `11830246929` | 737,412 bytes | `66ecf85a89220c73ee41083a68a45c3d1a500e244d2b02fe374adce0eb5b5398` | 2026-11-12 16:13:54 | Unexpired remotely |
| `TriCoreBrowser-Linux-checks` | `11828993261` | 10,274 bytes | `e3eac1cf4285aad5186dcbe674e64576b2ff5e7cdac0fe630f1e394b8ae0cd1e` | 2026-11-12 16:10:03 | Unexpired remotely |
| `TriCore-FSR1-D3D12-WARP-POC` (separate run `38428201442`) | `11830316353` | 59,487 bytes | `3bf7db361e307b0939f408c2751f488954b474a89b85f47f98a5ec725c2b6bcf` | 2026-11-12 16:10:20 | Unexpired remotely |

The candidate digest is GitHub's Actions **ZIP/archive** digest. The ZIP could not be downloaded, so the digest was **not independently recalculated**. It is not the EXE digest. The expected EXE filename is `TriCoreBrowser.exe` because that is the workflow upload path (`release/TriCoreBrowser.exe`); the archive contents were not inspected.

## Retrieval attempts and result

- The M10 review records a GitHub API artifact request and a separate run-log request ending in `EOF` after redirects.
- On 2026-10-14, GitHub CLI authentication was checked without displaying credentials. A clean destination was used for `gh run download 38428201500 --name TriCoreBrowser-Windows-x64-unverified-smoke-candidate`. It failed with `EOF` after redirect to Actions artifact storage. The destination remained empty; no partial ZIP or EXE was saved.
- The sandbox has no authenticated interactive GitHub web session, so the agent could not use the Actions web UI. Live artifact metadata still reports `expired=false`.
- The clean CLI retry reproduced the earlier EOF. No repeated download loop was run, no signed redirect was recorded in this report, and no later candidate was substituted for the original.

**Owner retrieval action:** open [run 38428201500](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38428201500), download the candidate and diagnostics ZIPs from its **Artifacts** section, then attach both here or provide an authorized accessible file path. Do not put the 100+ MB ZIP/EXE in Git history.

## Independent verification checklist

| Check | Result | Evidence boundary |
|---|---|---|
| Run identity / branch / commit | **VERIFIED from GitHub metadata** | Successful push on the session branch at exact source SHA `ba16afd…`. |
| Artifact existence, name, ID, size, expiry | **VERIFIED from GitHub API metadata** | Candidate remains unexpired remotely. |
| ZIP integrity and inventory | **NOT RUN** | No ZIP bytes were obtained. |
| Independent ZIP SHA-256 | **NOT RUN** | GitHub-reported archive digest only: `c02b…0430`. |
| EXE exact byte size / SHA-256 | **UNKNOWN** | Workflow verifies only that the EXE exceeds 30,000,000 bytes; exact job-log output was unavailable. No EXE bytes. |
| PE type / x64 architecture / package contents | **NOT INSPECTED** | Build config targets Windows x64 portable Electron, but config/name is not independent binary proof. |
| Authenticode status | **NOT INDEPENDENTLY INSPECTED** | Packaging documentation says unsigned; this is not a signature check on these exact bytes. |
| Antivirus / binary malware scan | **NOT RUN** | No candidate bytes and no authorized external scan. No “malware-free” claim. |
| Hosted Windows launch | **PASS, as recorded by run steps** | Packaged app launched and passed its smoke/evidence steps on hosted Windows. Not a local or manual launch. |
| Local Windows launch | **NOT RUN** | Agent environment is Debian 12 x86_64. |
| Physical GPU | **NOT RUN** | Level B job skipped. Separate D3D12 WARP run is software-only. |
| Dependency audit | **PASS at `--audit-level=high`; 8 moderate, 0 high/critical** | Locked npm dependency graph only; not a binary scan. |

The original run's candidate upload path contains only `release/TriCoreBrowser.exe`; no `SHA256SUMS.txt` was uploaded with this candidate. Portable-distribution assembly/upload was skipped. No M10 checksum manifest, ZIP inventory, EXE inspection record, or binary-scan result has been fabricated.

## Separate push-triggered builds (not the M10 artifact)

Pushing the M11 documentation commits triggered the repository's normal push workflows. These produced separate run-scoped builds. They do **not** overwrite or replace the original successful run `38428201500`.

| Run / source | Outcome observed | Separate candidate artifact | Distinction |
|---|---|---|---|
| `38549119442` / `e78a249baa03e4eb734df2ae84e6d7fcfc4d4a6d` | Completed `success`; hosted Windows packaged smoke and Level A passed; physical-GPU and distribution steps skipped | ID `11885867535`, `TriCoreBrowser-Windows-x64-unverified-smoke-candidate`, 109,711,627 bytes, GitHub archive SHA-256 `34af2033114aaae2b2a8697d4096a02322579aadc1c4feb768155691d9bdfa1b`, expires 2026-11-13 10:26:00 UTC | New, unverified artifact from the audit-document commit; not downloaded or inspected. |
| `38549407652` / `33337959717f27a4ba7f2e6d57bee50529cd1643` | Completed `success`; hosted Windows packaged smoke and Level A passed; physical-GPU and distribution steps skipped | ID `11885314472`, `TriCoreBrowser-Windows-x64-unverified-smoke-candidate`, 109,714,193 bytes, GitHub archive SHA-256 `d4b3e651b5995b97b327be1bc4e06fe2d0cf7b353a3cf7e982ee53d4cd48291b`, expires 2026-11-13 10:27:58 UTC | New, unverified artifact from the report-documents commit; not downloaded or inspected. |

Additional artifacts for run `38549119442`: diagnostics ID `11885304124`, 730,932 bytes, archive digest `dbac6f0ff4e7428ad922051099a6889acaf2b3c682ce931d6f3a9307179539f6`; Linux checks ID `11885921866`, 10,274 bytes, archive digest `e0fe8ab7f4b23b68c035defc1cb0c2b84c4af5803e836e4d0eb007ffe1426ecb`. For run `38549407652`: diagnostics ID `11885663881`, 723,450 bytes, archive digest `7c48881d13a032ee657d84bca0ec6b4f49abc3b555bd50785441b587f53822d7`; Linux checks ID `11885254270`, 10,274 bytes, archive digest `b66d20558edab2ee1937803f9722ed63a7debe97d0bdc9f994428568fa796ff3`. These hashes are GitHub-reported archive metadata, not locally recomputed. None of these later run artifacts was downloaded or used as a replacement for M10.

## Tests actually performed

- Local `npm test -- --test-reporter=spec`: **100/100 passed**.
- Local `npm audit --audit-level=high`: exit **0**, reporting **8 moderate and 0 high/critical** advisories. No package or lockfile edits were made.
- Original run `38428201500`: Linux checks and Windows portable packaging, launch, and Level A validation passed.
- Separate run `38428201442`: D3D12 FSR1 WARP-only test passed. This is software rendering, not physical-GPU validation.
- Documentation-push runs `38549119442` and `38549407652`: both completed successfully with hosted Windows smoke; Level B physical-GPU and release-distribution steps were skipped. They are distinct new builds.

## Release decision

**Do not upload the M10 candidate to a new GitHub Release yet.** Mandatory artifact-byte, independent checksum, PE/package, signature-status, and binary-scan gates remain unresolved; the original run skipped physical-GPU validation and the repository release workflow's strict gate requires a physical-GPU pass. Existing older prereleases are separate artifacts and do not verify this M10 candidate.
