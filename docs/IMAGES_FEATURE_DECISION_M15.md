# Images feature decision note — M15

- **Date:** 2026-10-14 (Asia/Kolkata)
- **Decision status:** **OWNER DECISION REQUIRED**
- **Current product status:** Images is **not implemented**; original M8/M9 source is **not recovered**.
- **M15 action:** No Images code, UI, dependency, or package change was made.

## Decision requested

Choose one of the following before any implementation:

1. **Provide the original M8/M9 source or patch** for a preservation-first, file-by-file comparison. If it is found, establish whether it contains the expected Images feature before changing anything.
2. **Explicitly approve Images as new product scope**, using the proposed MVP below as a starting point—not as a claim that the original feature has been restored.
3. **Defer Images** (the M15 default). Keep the feature absent and make no Images capability claim.

## Evidence and boundary

The fixed feature branch at `61cf63a689642bbe6906062c4b18977872d840aa` has 84 tracked blobs. M15 compared every local file with that tree by Git blob ID and file mode; all 84 matched. The bounded path-name search found no Images/image-picker/import/export/resize feature path. The available UI, Electron bridge, and main-process code use PNGs for controlled graphics diagnostics; that is not an app-owned image utility. No browser page, file input, screenshot, or diagnostic preview is evidence of an Images workflow.

This is a statement about the available repository and reviewed evidence, not proof that no external M8/M9 source exists. The M12–M14 reports record the prior recovery review; none supplied original Images source.

## Proposed MVP, only if approved as new scope

- One user-selected local PNG input; one user-selected output PNG.
- Conventional **CPU bilinear resampling** over decoded RGBA pixels, with explicit target dimensions or scale and documented alpha/border handling.
- Keep the tool isolated from remote browser tabs and the FSR/DLSS controls. Do not call it AI, neural, GPU, FSR, DLSS, or browser-wide upscaling.
- Use sender-validated native open/save dialogs available only to the trusted application shell. Do not expose local paths or filesystem APIs to website views.
- Validate PNG signature and decoded dimensions before allocating output buffers. Proposed initial bounds (to be reviewed and approved before coding): 25 MiB compressed input, 8,000,000 input pixels, 20,000,000 output pixels, 16,384 pixels on either output side, and 80 MiB encoded output.
- Cancellation must leave the source and existing preview unchanged. Export only after explicit user choice; never overwrite an existing file silently. Report errors and partial-write cleanup clearly.

## Proposed file touchpoints (planning only; none were created)

If—and only if—the owner explicitly approves new Images scope, the smallest likely file set is:

- Modify `src/main.js` and `src/styles.css` only to add the isolated Images entry/view and labels.
- Add a focused renderer utility such as `src/image-resizer.js` for bounded RGBA bilinear resampling; keep it independent of FSR/DLSS modules.
- If native file dialogs are retained, add only narrow typed open/save IPC handlers in `electron/main.cjs` and matching allowlisted methods in `electron/preload.cjs`; do not add a general filesystem API.
- Add `tests/image-resizer.test.js`, `tests/image-ipc.test.js`, and one Windows packaged smoke test/fixture under `tests/`.
- Do not touch `app/diagnostics/*`, the existing FSR bridges/validation modules, native FSR code, workflows, `package.json`, or the lockfile unless a separately reviewed requirement makes that necessary.

These are candidate paths, not an implementation plan approved for execution. No such files or code were added in M15.

## Security boundaries and principal risks

- The feature must remain app-owned and isolated from remote website views. A website must never be able to invoke local open/save dialogs, learn local paths, or call arbitrary filesystem functions.
- Main-process IPC must validate the exact trusted top-level application sender and message schema; reject untrusted frames, unexpected origins, arbitrary paths, and oversized payloads. Expose only the two narrow dialog operations.
- Treat compressed PNGs as hostile input: validate format and decoded dimensions before output allocation, use overflow-safe byte calculations, enforce the proposed caps, and fail closed on malformed/truncated data.
- Memory/CPU exhaustion, image-decoder bugs, alpha/border/color-space artifacts, event-loop stalls/cancellation races, accidental overwrite, and partial-write residue are explicit risks. Write atomically, clean partial output, and never replace an existing file without an explicit user-confirmed policy.
- Product copy must not imply FSR, DLSS, AI/neural processing, GPU acceleration, physical-GPU validation, or upscaling of arbitrary pages/video. This proposed MVP is CPU bilinear image resizing only.

## Required validation if approved

1. Unit tests for identity/enlargement, gradients/checkerboards, odd and one-pixel dimensions, alpha edges, malformed/truncated PNGs, target and memory limits, and deterministic output dimensions.
2. IPC tests for trusted-sender checks, rejected website senders, both dialog-cancel paths, permissions/errors, no-overwrite collision handling, and partial-output cleanup.
3. A Windows packaged smoke test using a generated fixture: open, resize, save, reopen, and verify dimensions/hash; exercise cancellation and collision paths.
4. Review the final product copy and UI labels to ensure this CPU operation is not represented as FSR, DLSS, AI, or general webpage processing.

No code is authorized by this note. The owner should select source recovery, explicit new-scope approval, or deferral before implementation begins.
