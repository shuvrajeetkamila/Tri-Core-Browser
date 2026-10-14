# Milestone 11 recovery audit

**Audit date:** 2026-10-14 (UTC)

**Repository:** [shuvrajeetkamila/Tri-Core-Browser](https://github.com/shuvrajeetkamila/Tri-Core-Browser) — public; default branch `main`; the authenticated CLI identity has repository admin permission.

**Fixed session branch:** `arena/18bfbe1a-tri-core-browser`

**M10 build source:** `ba16afd6ca4efeac00a1237e654da777c2eb6d14`

**M10 run:** [38428201500](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38428201500)

This is a point-in-time audit of GitHub and local recovery work. It does not claim independent binary verification or recovery of the original M8/M9 source.

## Live refs and preserved local state

Live refs were queried without changing the default branch:

| Ref | Live target |
|---|---|
| `main` (default) | `e27cb207d6be86a346420901a979b831cf849c00` |
| `arena/18bfbe1a-tri-core-browser` | `ba16afd6ca4efeac00a1237e654da777c2eb6d14` at audit start; later advanced by documented M11 commits |
| `arena/66abfdc9-tri-core-browser` | `3b05d2f9070732b36573016d7dbd3c250289839b` |
| `arena/9b1d75c5-tri-core-browser` | `1d61c8d79a0b346ddddd3322caa86e3c6ed46e66` |

At the start of M11, the fixed local branch pointed to `e27cb207` while its preserved working-tree snapshot had a modified README and 78 untracked source files. Before changing the branch, all 78 file contents and modes were compared to the fetched M10 commit by Git blob hash: every file matched. `docs/MILESTONE_10_REPORT.md` was the only extra file. A normal `git merge --ff-only` aborted rather than overwrite untracked paths and made no changes. A forward-only `git reset --mixed` to the already verified descendant `ba16afd` aligned HEAD/index without changing file contents; it was **not** a reset to an older commit. The M10 report remained untracked until its M11 publication commit.

The M10 source branch still pointed to the exact source SHA used by run `38428201500`. At the start, the session branch was 43 commits ahead of `main` and 3 ahead of the available `arena/66...` source branch, with no unique local commits. The source delta and recovery implications are recorded below.

## M10 run and artifacts

GitHub identifies run `38428201500` as **“Test and build Windows browser”**, event `push`, branch `arena/18bfbe1a-tri-core-browser`, source SHA `ba16afd6ca4efeac00a1237e654da777c2eb6d14`, conclusion `success`.

- **Renderer, WASM and dependency checks:** success (locked install, tests, renderer build, high/critical dependency-audit gate, audit report, Linux artifact upload).
- **Build and smoke-test Windows x64 portable app:** success. Packaging, executable threshold, hosted packaged launch, Level A evidence validation, diagnostics upload, and job summary passed. Physical-GPU-only distribution assembly/upload were skipped.
- **Level B required physical-GPU validation:** skipped.

| Artifact | ID | Bytes | GitHub API SHA-256 | Expires (UTC) | Expired? |
|---|---:|---:|---|---|---|
| `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` | `11828834204` | 109,724,572 | `c02b8c75bb6b086cfe32eca1413d2f386372b5900d57699c79b9064916cc0430` | 2026-11-12 16:13:20 | No |
| `TriCoreBrowser-Packaged-Smoke-Diagnostics` | `11830246929` | 737,412 | `66ecf85a89220c73ee41083a68a45c3d1a500e244d2b02fe374adce0eb5b5398` | 2026-11-12 16:13:54 | No |
| `TriCoreBrowser-Linux-checks` | `11828993261` | 10,274 | `e3eac1cf4285aad5186dcbe674e64576b2ff5e7cdac0fe630f1e394b8ae0cd1e` | 2026-11-12 16:10:03 | No |
| `TriCore-FSR1-D3D12-WARP-POC` (run `38428201442`) | `11830316353` | 59,487 | `3bf7db361e307b0939f408c2751f488954b474a89b85f47f98a5ec725c2b6bcf` | 2026-11-12 16:10:20 | No |

The M10 candidate digest is the GitHub-reported **ZIP/archive** digest, not an EXE digest. The ZIP was not downloaded, so it was not independently hashed. The EXE's exact bytes, byte size, SHA-256, PE contents, and Authenticode status remain unknown/not inspected. The workflow's size gate confirms only a size greater than 30,000,000 bytes.

### Artifact transfer attempt

`gh auth status` succeeded without displaying credentials. A clean destination was used for one `gh run download 38428201500` attempt for the exact candidate. GitHub CLI failed with `EOF` after redirect to Actions artifact storage; the destination remained empty. The earlier M10 GitHub API and run-log requests also failed with `EOF`. No signed redirect was retained or copied into this report. The artifacts remain unexpired remotely. The authenticated web UI is not available to the agent shell; owner download remains possible from the run's Artifacts section.

## Existing releases, tags, PRs, and release workflow

At the start of M11, live `gh`/API inspection found two published prereleases and one empty draft:

| Release / tag | State and target | Existing assets from GitHub metadata |
|---|---|---|
| [`v1.0.0-alpha.1`](https://github.com/shuvrajeetkamila/Tri-Core-Browser/releases/tag/v1.0.0-alpha.1) | Published prerelease; tag target `3822f4d6f366e6c974ab8ae3463a86cd733c3c29` | `TriCoreBrowser.exe` (asset `629703718`, 109,613,141 bytes); portable ZIP (`629703720`, 112,228,025 bytes); `BUILD_REPORT.txt` (`629703727`, 1,360 bytes); `SIZE_AUDIT.txt` (`629703721`, 397 bytes); `SHA256SUMS.txt` (`629703719`, 192 bytes). |
| [`v1.0.0-alpha.2`](https://github.com/shuvrajeetkamila/Tri-Core-Browser/releases/tag/v1.0.0-alpha.2) | Published prerelease; tag target `9acb44d231dcd31adf0a614b779eb569e0ba2869` | `TriCoreBrowser.exe` (`629714707`, 109,613,139 bytes); portable ZIP (`629714705`, 112,228,255 bytes); `BUILD_REPORT.txt` (`629714702`, 1,360 bytes); `SIZE_AUDIT.txt` (`629714706`, 397 bytes); `SHA256SUMS.txt` (`629714703`, 192 bytes). |
| `v1.0` | Draft; no corresponding tag ref (GitHub tag-ref lookup returned 404); no assets. | Unchanged. |

The alpha releases' `SHA256SUMS.txt` files were not downloaded or independently checked. Those releases and builds are from older commits, not the M10 candidate. Earlier workflow run `38109904267` for alpha.2 completed successfully and uploaded its package; this does not verify run `38428201500`.

`gh pr list --state all` returned no PRs at audit start. A separate draft review PR, [#1](https://github.com/shuvrajeetkamila/Tri-Core-Browser/pull/1), was subsequently opened from the fixed branch to `main`; it was not merged.

The checked-in `.github/workflows/release.yml` is **“Build and publish Windows prerelease.”** Push-triggering is limited to `arena/66abfdc9-tri-core-browser`; manual dispatch defaults `publish` to false. The build requires a configured self-hosted Windows x64 GPU runner and required-policy physical-GPU/FSR evidence. The publishing job checks a physical-GPU PASS, `releaseEligible`, and WebGPU acceptance before making a prerelease. M10 skipped Level B and does not meet this gate. No workflow was manually dispatched, and no release or tag was created or changed.

## M8/M9 recovery search

- Local reflogs began at `e27cb207`; no original M8/M9 source commit surfaced. `git fsck --full --no-reflogs --unreachable` found no unreachable objects.
- A bounded `/home/user` search found no M8/M9 archive, patch, snapshot, ZIP, EXE, or recovery bundle. No local binary/archive was found.
- The exact `3b05d2f..ba16afd` diff is three paths: added `docs/MILESTONE_9_REPORT.md`; modified `scripts/validate-packaged-smoke.cjs`; modified `tests/validate-packaged-smoke.test.js`. The other 75 tracked paths match. This only compares the available source baseline; it cannot prove fidelity to the missing original tree.
- Remote `arena/9b...` has three commits and a small source tree. Its `index.html`, `src/main.js`, and `electron/main.cjs` were queried directly; no user-facing Images file-picker/editor path was found. It is not the original M8/M9 source.
- Retained Actions artifacts were inventoried; none was named as an M8/M9 source archive, patch, snapshot, or recovery bundle. Older `TriCoreBrowser-Windows-x64-release` artifacts are packaged binaries from other commits, not the missing source tree.
- No PR/report attachment supplied a recovery source.

**Conclusion:** exact original M8/M9 source and patch remain **NOT RECOVERED**. `ba16afd` is verified as the M10 build source, not as a recovered feature-complete product tree. Do not infer or recreate M8/M9 fidelity from a checksum or older binary.

## Publication and automatic CI update

The M10 report and safe status documents have been pushed to the fixed branch:

- `e78a249baa03e4eb734df2ae84e6d7fcfc4d4a6d` — separately committed recovery audit.
- `33337959717f27a4ba7f2e6d57bee50529cd1643` — M10 report, artifact verification, source recovery, release-notes draft, and M11 status report.

Both pushes were verified against the remote ref. Draft PR #1 is open from the session branch to `main`. It covers the complete 45-commit branch delta from initial `main`—not just the reports. At the final check GitHub reported `mergeable=MERGEABLE` and `mergeStateStatus=CLEAN`; no merge was performed. On the PR event, the renderer/WASM/dependency checks and WARP harness passed; the Windows packaging and Level B jobs were skipped by their event conditions.

The documentation pushes automatically triggered normal push-CI builds. These are separate, run-scoped build artifacts and did **not** overwrite or replace the M10 run:

| Run / source | Conclusion and important steps | Separate candidate artifact (GitHub metadata only) |
|---|---|---|
| [38549119442](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38549119442) / `e78a249…` | Success; hosted Windows package, smoke, and Level A passed; physical GPU and distribution assembly skipped. | ID `11885867535`; 109,711,627-byte artifact ZIP; SHA-256 `34af2033114aaae2b2a8697d4096a02322579aadc1c4feb768155691d9bdfa1b`. Separate/unverified. |
| [38549407652](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38549407652) / `3333795…` | Success; hosted Windows package, smoke, and Level A passed; physical GPU and distribution assembly skipped. | ID `11885314472`; 109,714,193-byte artifact ZIP; SHA-256 `d4b3e651b5995b97b327be1bc4e06fe2d0cf7b353a3cf7e982ee53d4cd48291b`. Separate/unverified. |

Both hashes above are GitHub-reported archive digests, not locally computed EXE hashes. Diagnostics were also uploaded for each run; the artifacts were not downloaded or scanned. WARP-only workflow runs `38549119422` and `38549407634` passed software-only tests. These automatic CI builds do not satisfy physical-GPU validation and do not replace the original M10 artifact.

## Validation and unresolved work

- Local `npm test -- --test-reporter=spec`: **100/100 passed**.
- Local `npm audit --audit-level=high`: exit **0**; **8 moderate**, **0 high/critical** advisories. This audits npm dependencies, not the EXE. No dependency changes were made.
- No lint or format script is defined in `package.json`; Markdown whitespace and `git diff --check` were checked for the published reports.
- No manual Windows rebuild or local Windows launch was initiated. Normal documentation pushes did trigger the distinct automated builds listed above.
- The original M10 ZIP/EXE was not extracted, independently hashed, signature-inspected, or scanned. Physical-GPU validation remains **NOT RUN**.
- Existing prereleases and the empty `v1.0` draft were left unchanged. No new release is justified from the M10 candidate on current evidence.

**Next owner actions:** download the exact candidate and diagnostics from [run 38428201500](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38428201500) in the GitHub UI and attach them here; provide the original M8/M9 tree/archive/patch if available. Until then, keep the release blocked and the source-recovery conclusion negative.
