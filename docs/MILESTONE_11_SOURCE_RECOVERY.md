# Milestone 11 — M8/M9 source recovery

**Result:** NOT RECOVERED.

**Known reproducible M10 build source:** `ba16afd6ca4efeac00a1237e654da777c2eb6d14`.

**Audit date:** 2026-10-14 (UTC).

The exact original M8/M9 working tree, patch, and described Images UI remain unavailable. This report records what was checked; it does not infer missing files from a checksum or relabel the available source as the original.

## Source and repository refs checked

The default branch is `main` at `e27cb207d6be86a346420901a979b831cf849c00`. Live remote heads were:

| Branch | Live SHA | Finding |
|---|---|---|
| `arena/18bfbe1a-tri-core-browser` | `ba16afd6ca4efeac00a1237e654da777c2eb6d14` | Exact source revision for M10 run `38428201500`; current working branch. |
| `arena/66abfdc9-tri-core-browser` | `3b05d2f9070732b36573016d7dbd3c250289839b` | Available app-source baseline used for the M9 build; not the original M8/M9 tree. |
| `arena/9b1d75c5-tri-core-browser` | `1d61c8d79a0b346ddddd3322caa86e3c6ed46e66` | Three-commit earlier app tree; not the missing M8/M9 tree. |
| `main` | `e27cb207d6be86a346420901a979b831cf849c00` | Small initial repository baseline. |

The `ba16afd` tree is 43 commits beyond `main` and 3 beyond `3b05d2f`. The exact `3b05d2f..ba16afd` delta is:

1. Added `docs/MILESTONE_9_REPORT.md`.
2. Modified `scripts/validate-packaged-smoke.cjs` to require and validate the smoke log while allowing an explicit safe no-adapter skip.
3. Modified `tests/validate-packaged-smoke.test.js` with regression coverage.

The other 75 tracked paths are identical. The validator/test repair was recreated from the supplied behavior description, not recovered byte-for-byte from the original M8 patch. It is not a user-facing feature.

The `arena/9b...` tree inventory has no image-named UI/module path. Its `index.html`, `src/main.js`, and `electron/main.cjs` were also queried directly; no user-facing image picker/editor flow was found in those files. The only matching image markup was an application SVG favicon. This limited source check is not evidence that an unavailable original tree never existed.

## Local recovery material checked

- Current local branches, reflog, and commit graph. The original checkout began at `e27cb207`; no original M8/M9 commit surfaced.
- `git fsck --full --no-reflogs --unreachable`: no unreachable objects.
- Bounded `/home/user` search for M8/M9 names, recovery bundles, patches, diffs, archives, EXEs, and ZIPs: none found.
- Current M10 branch source files: all 78 files in fetched commit `ba16afd` were compared by Git blob hash and file mode against the preserved local snapshot before fast-forward alignment. They matched exactly; `docs/MILESTONE_10_REPORT.md` was the only additional file.
- GitHub pull requests in all states: none.
- Retained Actions artifact names: no M8/M9 source, patch, snapshot, or recovery archive identified. Older Windows release artifacts exist but are packaged binaries from other commits, not a source-tree recovery.
- Current GitHub releases/tags: `v1.0.0-alpha.1` and `.2` point at older commits; a draft `v1.0` exists without a tag or assets. No M8/M9 recovery material is identified by them.

The report's earlier statement that an M8 patch digest was supplied does not make its contents reconstructible. No unseen source, local recovery copy, or README patch was guessed, recreated, overwritten, or merged.

## Safe source recommendation

- Use `ba16afd6ca4efeac00a1237e654da777c2eb6d14` only as the reproducible source revision for the hosted M10 candidate.
- Do not designate it as the recovered, feature-complete M8/M9 product tree. The Images UI described by earlier handoff material is absent from the available source.
- If the original tree/archive/patch is later supplied, preserve an untouched copy and compare path-by-path and content-by-content against `ba16afd` before reconciling. Do not overwrite either tree or infer conflict resolutions.
- If no original can be recovered, implement any missing Images workflow as explicitly new product work with its own tests; do not call it a restoration.

**Owner action to resolve:** provide the original M8/M9 checkout/archive/patch and any README recovery copy, or authorize treating the missing Images UI as a new feature rather than a source recovery.
