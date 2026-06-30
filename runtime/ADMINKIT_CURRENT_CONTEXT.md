# АдминКИТ — current handoff

Updated: 2026-06-30 18:13 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## First action in every new AdminKIT chat
Read this file first from branch `runtime-status`, then check current GitHub state. Continue from GitHub/runtime state, not from memory.

Update this file after major events: new PR/head SHA, CI red/green, audit PASS/BLOCK, merge, deploy/runtime-status, manual MAX result, live mismatch, or process error.

## Core rules
Do not use GitHub `@codex` comments. Do not create a new PR if the existing PR can be updated. Do not merge before final audit-only PASS/waiver. Green CI is not done. Merge is not done. Runtime readiness is not visual UX done.

Production start path must remain:
`node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`

Active entrypoint must remain:
`clean-entrypoint-1.53.10-pr89.js`

Diagnostics branch: `runtime-status`.

## Product rule
Channel/post features must use only real channels and channel posts. Chats are a separate future product area and must not appear as channel/post targets. This includes root channel management and all post-scoped flows.

## PR259 status
PR259 merged into `main` at 2026-06-30 15:50 UTC.
- Final head: `23c417b1ef945395cce64fcc320a69427af79645`
- CI: PR regression tests #498, success.
- Audit-only: PASS.
- Merge commit: `c087323dcf38d1a6bbec082efe3b9bbdb496e747`.

Runtime pickup for PR259 was confirmed from `runtime/startup-log.json`. No restart loop was visible. PR259 product fix is ready for manual MAX visual check. PR259 diagnostic files did not materialize in `runtime-status`, so PR260 was opened.

## PR260 current state
PR260:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/260
- Title: `Runtime observable full section matrix diagnostics`
- Branch: `codex/add-runtime-diagnostics-for-adminkit-sections`
- Base: `main`
- Current head: `a70ab9116f3b9dab6b01f1cd6351f5d0e99dd222`
- Open, not merged.
- Mergeable: true at latest check.
- CI after audit-block fix: PR regression tests #505, run id `28465897836`, conclusion `success`.
- Audit-only: pending repeat audit. Do not merge yet.

PR260 goal:
- Make PR259 diagnostics observable after deploy by wiring `channel-target-matrix`, `process-events`, `northflank-startup-log`, and `full-section-matrix` through the proven startup-log runtime-status export path.
- Add detailed server-side full-section matrix for all main sections and post-scoped routes.

Audit BLOCK at 2026-06-30 18:06 UTC:
- Blocker file: `services/fullSectionMatrixService.js`.
- Reason: `buildMatrix()` did not detect chat-like fixture IDs leaking in callback payloads.
- It scanned chat-like human titles but not dangerous fixture identifiers such as chat/group/private/dialog/danger IDs.
- Required fix: derive dangerous fixture values from `channelMatrix.dangerousRecords(...)` for each scenario and scan visible text, button text, and callback payload strings. Add a negative test proving injected chat-like payload ID fails the matrix.

Assistant fix applied and CI green:
- `services/fullSectionMatrixService.js` now derives dangerous values from `channelMatrix.dangerousRecords(context.channels)` and scans both visible text/buttons and callback payload strings.
- Added exported `dangerousValues()` helper.
- `addScreenChecks()` now receives scenario context and reports `chat_like_record_leak` with `offendingText` or `offendingPayload`.
- `scripts/test-pr260-full-section-matrix.js` now monkeypatches `menu.render()` to inject a dangerous chat-like payload ID into `comments:choose_channel`, asserts `buildMatrix().ok === false`, asserts `chatLeakCount > 0`, and asserts the violation identifies the injected payload ID.
- CI #505 passed on current head.

Next required action:
1. Run repeat audit-only PASS/BLOCK for PR260 current head `a70ab9116f3b9dab6b01f1cd6351f5d0e99dd222`.
2. If audit BLOCK, fix exact blocker in existing PR260 branch.
3. If audit PASS, merge with expected head SHA.
4. After merge, verify runtime pickup and that diagnostic files appear in `runtime-status`.
5. Do not merge PR260 until audit-only PASS.
