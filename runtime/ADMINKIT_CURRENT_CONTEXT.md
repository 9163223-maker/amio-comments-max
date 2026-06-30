# АдминКИТ — current handoff

Updated: 2026-06-30 19:33 UTC
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

## PR261 status
PR261:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/261
- Title: `Reliable runtime diagnostics and expanded user journey matrix`
- Branch: `codex/add-reliable-runtime-diagnostics-mechanism`
- Base: `main`
- Final head: `8d8729ca9496e872d546c64140c9abdf7ef48250`
- CI: PR regression tests #514, run id `28470014190`, conclusion `success`.
- Audit-only: PASS confirmed by user screenshot at 2026-06-30 19:29 UTC.
- Merged into `main` at 2026-06-30 19:31 UTC.
- Merge commit: `126d3a9d9a841b266337dceecce41d51855b6a3c`.

PR261 changes:
- Adds serialized runtime export queue with retry/backoff in `services/runtimeExportService.js`.
- Runtime exports are restricted to `runtime/*.json`, reject `..`, refuse `main`, default safely to `runtime-status`, sanitize errors, read current file SHA, and retry content API conflicts.
- `services/startupLogService.js` delegates runtime JSON writes to the reliable runtime export service.
- `pr180-startup-log-bootstrap.js` exports full-section, channel-target, user-journey, process-events, northflank diagnostics, then delayed diagnostic-export-status.
- Adds `services/userJourneyMatrixService.js` with expanded user journey matrix.
- Adds workflow `.github/workflows/adminkit-post-merge-runtime-check.yml` for workflow-based delayed post-merge runtime verification.
- Adds tests `scripts/test-pr261-reliable-runtime-diagnostics.js` and `scripts/test-pr261-expanded-user-journey-matrix.js`, wired into `npm test` and PR regression workflow.

Assistant pre-audit fixes:
- Fixed `diagnostic-export-status` to build its payload lazily when its queued export runs, avoiding stale pending-export snapshots.
- Fixed `userJourneyMatrixService` so every `REQUIRED_SCENARIOS` entry is exercised via rendered/synthetic/safe-state scenario coverage or explicitly marked info/not_supported.

Current required action:
1. Verify runtime pickup for merge commit `126d3a9d9a841b266337dceecce41d51855b6a3c` from `runtime/startup-log.json`.
2. Verify production start path and active entrypoint unchanged.
3. Verify expected runtime-status diagnostic files materialize:
   - `runtime/full-section-matrix.json`
   - `runtime/channel-target-matrix.json`
   - `runtime/user-journey-matrix.json`
   - `runtime/process-events.json`
   - `runtime/northflank-startup-log.json`
   - `runtime/diagnostic-export-status.json`
4. Verify matrix OK summaries and no restart loop.
5. Update this file again after runtime pickup check.
