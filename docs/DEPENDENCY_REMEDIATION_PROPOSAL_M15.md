# Dependency remediation proposal — M15

- **Date:** 2026-10-14 (Asia/Kolkata)
- **Status:** Proposal only; **no dependency or lockfile change is authorized or made in M15**.
- **Release implication:** The full npm audit still exits nonzero. The high/critical-only threshold passes; this is not a clean audit or a release approval.

## Current finding

M15 reran the audit against the existing lockfile:

| Command | Exit | Result |
|---|---:|---|
| `npm audit --json --package-lock-only` | 1 | 8 moderate; 0 high; 0 critical. |
| `npm audit --audit-level=high --json --package-lock-only` | 0 | Same 8 moderate; the configured threshold ignores moderate findings. |

All eight package records trace to **GHSA-hp3w-g68c-fv3c**, a moderate `sprintf-js` denial-of-service advisory involving unbounded precision specifiers (CVSS 5.3, CWE-1284). The locked chain is:

`electron-builder@26.17.0` → `app-builder-lib@26.17.0` → nested `@electron/get@3.1.0` → `global-agent@3.0.0` → `roarr@2.15.4` → `sprintf-js@1.1.3`.

The audit also reports the sibling builder packages `dmg-builder` and `electron-builder-squirrel-windows`. The affected lockfile entries are development dependencies. This points to build/tooling exposure; it does **not** prove that the vulnerable code is shipped in the app, nor does it remove the risk to build hosts. The application package has no root production dependency edges in the reviewed lockfile. The unchanged `package-lock.json` SHA-256 is `24708fc5609edbc5eaf4d6ad7f4042dad9f25d3e961de24e44d2ce7c12f522c6`.

## Registry and fix-candidate evidence (2026-10-14)

- The npm registry `latest` result for `sprintf-js` is `1.1.3`; querying `sprintf-js@1.1.4` returned not-found. No patched leaf version was verified.
- `app-builder-lib@26.17.0` requests `@electron/get` in the `^3.0.0` range. The lockfile has a nested 3.1.0 even though a separate top-level `@electron/get@5.1.0` also exists; a top-level v5 does not establish compatibility with that nested range.
- The audit marks `electron-builder@26.5.0` as `fixAvailable`, with `isSemVerMajor: true` (an out-of-pin downgrade from 26.17.0). It exists in the registry but has not been tested here.
- Registry `latest` for `electron-builder` returned `26.15.3`; exact `26.17.0` also resolves. `27.0.0-alpha.3` is available but is prerelease. The current lock is in the audit's affected range; a dist-tag or available version alone is not proof of a fix.

These facts are advisory inputs, not a recommendation to change versions automatically.

## Proposed remediation path

1. **Keep the current manifest and lockfile unchanged** until an owner approves a candidate. Do not run `npm audit fix --force`, downgrade the builder family, or add an unverified override as part of an audit.
2. Prefer a **supported stable upstream builder-family release** whose complete resolved tree removes the advisory. Verify the release and transitive constraints from registry metadata and the resulting audit JSON. If no such stable release exists, record an owner-approved temporary risk disposition with a review date rather than claiming remediation.
3. Treat the audit-suggested 26.5.0 downgrade as a candidate for a separately reviewed compatibility experiment only. Confirm supported Node/Electron/Windows packaging requirements, inspect the entire builder-family lock diff, and reject it if the maintained package line or required build behavior is lost. Do not assume the npm fix hint is product-compatible.
4. Consider a narrow `sprintf-js` or transitive override only after a patched version is actually published and the parent package ranges/API compatibility are proven. Do not force `@electron/get@5` into a dependency requesting `^3.0.0`, and do not remove optional packages without confirming the packaging paths they support.
5. For an approved change, review the exact `package.json` and lockfile diff; run a clean `npm ci --ignore-scripts`, full audit, `npm ls --all`, unit tests, renderer build, JavaScript/config parsing, and Windows x64 portable build plus packaged smoke. Preserve the current full-audit result and compare it to the new result. Keep lifecycle scripts disabled during the source-only install checks.

## Acceptance and release gate

A technical remediation is complete only when the selected stable dependency graph is supported, the full audit is clear or every residual moderate finding has an explicit owner-approved disposition, the lockfile is reproducible, tests/build pass, and Windows packaging/smoke remain valid. The M15 audit's high-only exit 0 is **not** sufficient by itself. No dependency change, Windows package build, or release action was performed for this proposal.
