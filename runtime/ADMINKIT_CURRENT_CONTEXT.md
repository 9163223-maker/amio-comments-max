# АдминКИТ — current handoff

Updated: 2026-06-30 19:25 UTC
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

## PR260 status
PR260 merged into `main` at 2026-06-30 18:20 UTC.
- Final head: `a70ab9116f3b9dab6b01f1cd6351f5d0e99dd222`
- CI: PR regression tests #505, success.
- Audit-only: PASS.
- Merge commit: `cc33ac39aee2817070ea8e65693553d36df103aa`.

PR260 runtime pickup passed. `runtime/full-section-matrix.json` appeared and was OK. `runtime/channel-target-matrix.json`, `runtime/process-events.json`, and `runtime/northflank-startup-log.json` did not appear. PR261 was opened to serialize/retry exports and expand journey matrix.

## PR261 current state
PR261:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/261
- Title: `Reliable runtime diagnostics and expanded user journey matrix`
- Branch: `codex/add-reliable-runtime-diagnostics-mechanism`
- Base: `main`
- Current head: `8d8729ca9496e872d546c64140c9abdf7ef48250`
- Open, not merged.
- Mergeable: true at latest check before latest fix.
- Previous CI: PR regression tests #510, run id `28468429808`, success on head `5b286f9cc732578ce77ba92fbf153bee9a285eba`.
- New CI after audit-block fix is pending/checking. Do not audit/merge until CI green on current head.

PR261 changes:
- Adds serialized runtime export queue with retry/backoff in `services/runtimeExportService.js`.
- Runtime exports are restricted to `runtime/*.json`, reject `..`, refuse `main`, default safely to `runtime-status`, sanitize errors, read current file SHA, and retry content API conflicts.
- `services/startupLogService.js` delegates runtime JSON writes to the reliable runtime export service.
- `pr180-startup-log-bootstrap.js` exports full-section, channel-target, user-journey, process-events, northflank diagnostics, then delayed diagnostic-export-status.
- Adds `services/userJourneyMatrixService.js` with expanded user journey matrix.
- Adds workflow `.github/workflows/adminkit-post-merge-runtime-check.yml` for workflow-based delayed post-merge runtime verification.
- Adds tests `scripts/test-pr261-reliable-runtime-diagnostics.js` and `scripts/test-pr261-expanded-user-journey-matrix.js`, wired into `npm test` and PR regression workflow.

Assistant review/follow-up before first audit:
- Found a pre-audit blocker: `diagnostic-export-status` built its payload before its queued write ran, so it could snapshot pending exports as missing when writes were slow.
- Fixed `services/runtimeExportService.js` so `payload` can be a function and is resolved at queued execution time.
- `exportStatus()` now passes a lazy payload builder, so status sees completed earlier queued exports.
- CI #510 passed after this fix.

Audit BLOCK at 2026-06-30 19:16 UTC:
- Blocker file: `services/userJourneyMatrixService.js`.
- Reason: `REQUIRED_SCENARIOS` listed edge-case scenario names, but `buildMatrix()` did not actually model/execute several of them: malformed_payload, missing_payload, missing_required_id, stale_or_deleted_post, back_navigation, main_menu_navigation, direct_callback_without_prior_state.
- Required fix: buildMatrix must model each required scenario or emit explicit info/not_supported. Tests must assert each scenario is exercised or explicitly marked, not merely listed.

Assistant fix applied:
- `services/userJourneyMatrixService.js` now emits `scenarioCoverage` records.
- Existing rendered journeys mark scenarios as rendered.
- Edge cases malformed_payload, missing_payload, and missing_required_id use synthetic detector checks and must be detected by validation.
- stale_or_deleted_post and direct_callback_without_prior_state are rendered as safe-state checks.
- back_navigation and main_menu_navigation are explicitly covered in section navigation checks.
- Missing scenario coverage creates an info/not_supported violation instead of silent false coverage.
- `scripts/test-pr261-expanded-user-journey-matrix.js` now asserts every REQUIRED_SCENARIO is either in scenarioCoverage with a real mode or explicitly info/not_supported; it also asserts detector coverage for malformed/missing/missing_required_id and rendered coverage for stale/direct/back/main navigation.

Next required action:
1. Check CI for current head `8d8729ca9496e872d546c64140c9abdf7ef48250`.
2. If CI red, use diagnostics artifact and fix in existing PR261 branch.
3. If CI green, run repeat audit-only PASS/BLOCK for PR261 current head.
4. Do not merge PR261 until audit-only PASS.
