# Milestone 11 recovery audit

**Audit date:** 2026-10-14 (UTC)

**Repository:** [shuvrajeetkamila/Tri-Core-Browser](https://github.com/shuvrajeetkamila/Tri-Core-Browser) — public; default branch `main`; current CLI identity has repository admin permission.

**Fixed session branch:** `arena/18bfbe1a-tri-core-browser`

**Current local HEAD after safe alignment:** `ba16afd6ca4efeac00a1237e654da777c2eb6d14`

**M10 build source:** `ba16afd6ca4efeac00a1237e654da777c2eb6d14`

**M10 run:** [38428201500](https://github.com/shuvrajeetkamila/Tri-Core-Browser/actions/runs/38428201500)

This document records a read-only audit of GitHub plus a safe local fast-forward. It does not claim binary verification, original M8/M9 recovery, or release readiness.

## Live repository and local branch state

Live refs were queried without changing the default branch:

| Ref | Live target |
|---|---|
| `main` (default) | `e27cb207d6be86a346420901a979b831cf849c00` |
| `arena/18bfbe1a-tri-core-browser` | `ba16afd6ca4efeac00a1237e654da777c2eb6d14` |
| `arena/66abfdc9-tri-core-browser` | `3b05d2f9070732b36573016d7dbd3c250289839b` |
| `arena/9b1d75c5-tri-core-browser` | `1d61c8d79a0b346ddddd3322caa86e3c6ed46e66` |

The successful run's branch still points to the exact source commit `ba16afd6ca4efeac00a1237e654da777c2eb6d14`; the remote head did not move. The M10 commit is present on GitHub and was fetched and inspected locally. The session branch has 43 commits beyond `main` and 3 beyond the available `arena/66...` source baseline; it has no unique local commits relative to its live remote branch.

At the start of this M11 session, the fixed local branch was at `e27cb207` while a preserved working-tree source snapshot had a modified README and 78 untracked files. Before changing the branch, every one of the 78 files and modes was compared against the fetched M10 commit tree by Git blob hash: all matched exactly. `docs/MILESTONE_10_REPORT.md` was the sole additional file. A normal `git merge --ff-only` correctly aborted rather than overwrite those untracked paths. A forward-only `git reset --mixed` to the already verified descendant `ba16afd` then aligned HEAD/index without changing working-tree contents; this was **not** a reset to an older commit. The current worktree contains only the untracked M10 report plus this newly written audit; no files were staged at the time of this audit.

The M10 report is absent from commit `ba16afd` and was untracked locally when inspected. Its contents were reviewed against the live run and artifact metadata. It accurately distinguishes archive versus EXE hashes, hosted versus local execution, software WARP versus physical GPU, source versus packaged evidence, and the missing original source. Publication is pending this audit's commit.

## M10 run and artifacts

GitHub identifies run `38428201500` as workflow **“Test and build Windows browser”**, event `push`, branch `arena/18bfbe1a-tri-core-browser`, source SHA `ba16afd6ca4efeac00a1237e654da777c2eb6d14`, conclusion `success`.

- **Renderer, WASM and dependency checks:** success (locked install, tests, renderer build, high/critical dependency-audit gate, audit report, Linux artifact upload).
- **Build and smoke-test Windows x64 portable app:** success. Package, size threshold, hosted packaged launch, Level A evidence validation, and diagnostics upload passed. The workflow's physical-GPU-only distribution assembly and upload steps were skipped.
- **Level B required physical-GPU validation:** skipped.

| Artifact | ID | Bytes | GitHub API SHA-256 | Expires (UTC) | Expired? |
|---|---:|---:|---|---|---|
| `TriCoreBrowser-Windows-x64-unverified-smoke-candidate` | `11828834204` | 109,724,572 | `c02b8c75bb6b086cfe32eca1413d2f386372b5900d57699c79b9064916cc0430` | 2026-11-12 16:13:20 | No |
| `TriCoreBrowser-Packaged-Smoke-Diagnostics` | `11830246929` | 737,412 | `66ecf85a89220c73ee41083a68a45c3d1a500e244d2b02fe374adce0eb5b5398` | 2026-11-12 16:13:54 | No |
| `TriCoreBrowser-Linux-checks` | `11828993261` | 10,274 | `e3eac1cf4285aad5186dcbe674e64576b2ff5e7cdac0fe630f1e394b8ae0cd1e` | 2026-11-12 16:10:03 | No |
| `TriCore-FSR1-D3D12-WARP-POC` (run `38428201442`) | `11830316353` | 59,487 | `3bf7db361e307b0939f408c2751f488954b474a89b85f47f98a5ec725c2b6bcf` | 2026-11-12 16:10:20 | No |

The candidate digest is the **GitHub-reported ZIP/archive digest**. It was not recalculated locally and is not an EXE hash. The ZIP and EXE exact bytes remain unavailable in this workspace. No standalone EXE size/hash, PE or Authenticode status, archive inventory, or binary malware-scan result is verified.

### Artifact retrieval attempt

`gh auth status` succeeded without exposing the token. A fresh destination was used for one `gh run download 38428201500` attempt for the exact candidate artifact. GitHub CLI failed with `EOF` after redirect to artifact storage. The destination contains no files. The earlier M10 API and job-log retrieval attempts also failed with `EOF`; no second retry was made after the fresh CLI attempt reproduced the transfer failure. The artifact remains unexpired remotely. The authenticated GitHub web UI is not operable from this shell session; the owner can still download the artifact ZIP from the run's Artifacts section and attach it for byte-level inspection.

## Releases, tags, pull requests, and release workflow

Live `gh`/API inspection found:

- Published prerelease `v1.0.0-alpha.1`, tag target commit `3822f4d6f366e6c974ab8ae3463a86cd733c3c29`, with EXE, portable ZIP, `BUILD_REPORT.txt`, `SIZE_AUDIT.txt`, and `SHA256SUMS.txt` assets.
- Published prerelease `v1.0.0-alpha.2`, tag target commit `9acb44d231dcd31adf0a614b779eb569e0ba2869`, with the same five asset types. Its earlier release workflow run `38109904267` succeeded and uploaded the release package. These are older commits/artifacts, not the M10 candidate; their assets were not downloaded or re-verified here.
- Draft release `v1.0` has no assets and no corresponding tag ref (the tag-ref API returns 404). It remains unchanged.
- Remote tags are `v1.0.0-alpha.1` and `v1.0.0-alpha.2`; no M10 tag was found.
- `gh pr list --state all` returned no pull requests (open or closed).

The checked-in `.github/workflows/release.yml` is named **“Build and publish Windows prerelease.”** Its push trigger is restricted to `arena/66abfdc9-tri-core-browser`; manual dispatch defaults `publish` to false. The build requires a configured self-hosted Windows x64 GPU runner and a required-policy physical-GPU/FSR pass; its publishing job verifies a physical-GPU PASS, `releaseEligible`, and WebGPU acceptance before creating a prerelease. The M10 run did not meet that gate. No workflow was dispatched and no release/tag was created or changed in this audit.

## M8/M9 recovery search

- Local reflogs show the initial clone at `e27cb207`, followed in this M11 session by the forward alignment to `ba16afd`; no original M8/M9 source commit surfaced.
- `git fsck --full --no-reflogs --unreachable` returned no unreachable objects.
- A bounded search of `/home/user` found no M8/M9 archive, patch, snapshot, ZIP, EXE, or recovery bundle. No local binary/archive was found.
- The current and available source trees were checked. The exact `3b05d2f..ba16afd` delta is three paths: added `docs/MILESTONE_9_REPORT.md`; modified `scripts/validate-packaged-smoke.cjs`; modified `tests/validate-packaged-smoke.test.js`. The other 75 tracked paths match. This is not evidence of fidelity to an unavailable original tree.
- The remote `arena/9b...` branch has a three-commit history and a small tree. Its `index.html`, `src/main.js`, and `electron/main.cjs` were queried directly; no user-facing Images UI/file-import flow was found. This older branch is not the missing M8/M9 source.
- Retained Actions artifacts were inventoried. No artifact name identified an M8/M9 source archive, patch, snapshot, or recovery bundle. Older `TriCoreBrowser-Windows-x64-release` artifacts exist, but are binary release packages from other commits, not the missing source tree.
- No pull request or report attachment provided a recovery source.

**Conclusion:** the exact original M8/M9 source and patch remain **NOT RECOVERED**. `ba16afd` is verified as the M10 build source, not as a recovered feature-complete product source. Do not infer or recreate M8/M9 fidelity from a checksum or an older binary.

## Validation and remaining work

- Local `npm test -- --test-reporter=spec`: **100/100 passed**.
- Local `npm audit --audit-level=high`: exit **0**; **8 moderate**, **0 high/critical** advisories. This is a dependency audit, not a binary scan; no dependency changes were made.
- No lint or format script is defined in `package.json`; Markdown whitespace and `git diff --check` are checked before publication.
- No Windows rebuild, local Windows launch, artifact extraction, independent ZIP/EXE hashing, Authenticode inspection, malware scan, or physical-GPU test was performed.
- No release is eligible from the M10 candidate on present evidence. Existing prereleases and the empty `v1.0` draft were left untouched.

### Work status at audit creation

**Completed:** live ref/run/release/PR/artifact audit; exact M10 commit verification; file-level preservation/fast-forward check; M10 report accuracy review; local test and dependency-audit run; recovery search.

**Pending:** separately commit/push this audit; publish the M10 report and remaining non-empty M11 status reports; decide whether a review PR should be opened; obtain the candidate and diagnostics through the owner-accessible GitHub UI; inspect bytes only after receipt; original M8/M9 source remains unresolved.

**Release:** blocked; no new draft prerelease is justified until the required binary and release checks pass.
