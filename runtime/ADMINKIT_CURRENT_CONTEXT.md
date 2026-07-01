# АдминКИТ — current handoff

Updated: 2026-07-01 18:38 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## First action in every new AdminKIT chat
Read this file first from branch `runtime-status`, then check current GitHub state. Continue from GitHub/runtime state, not from memory.

Update this file after major events: new PR/head SHA, CI red/green, audit PASS/BLOCK, merge, deploy/runtime-status, manual MAX result, live mismatch, or process error.

## Core rules
Do not use GitHub `@codex` comments. Do not create a new PR if the existing PR can be updated. Do not merge before final audit-only PASS/waiver. Green CI is not done. Merge is not done. Runtime readiness is not visual UX done.

After a PR is initially created from a requested task: read this context, fetch PR metadata/head/base/state, check CI for exact head, inspect comments/reviews/diff, fix blockers in the same PR branch, update this context, then run audit-only PASS/BLOCK only after green CI and no known code blocker.

Standard post-audit workflow: confirm exact head and green CI; merge only that head; verify runtime-status and production contract; produce a server-contract success table; then run/manual request MAX visual check.

Production start path must remain:
`node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`

Active entrypoint must remain:
`clean-entrypoint-1.53.10-pr89.js`

Diagnostics branch: `runtime-status`.

## Product rule
Channel/post features must use only real channels and channel posts. Chats are a separate future product area and must not appear as channel/post targets.

## Recent merged PRs
PR259: `c087323dcf38d1a6bbec082efe3b9bbdb496e747`.
PR260: `cc33ac39aee2817070ea8e65693553d36df103aa`.
PR261: `126d3a9d9a841b266337dceecce41d51855b6a3c`.
PR262: `bc1e3f548ea65a18644d39335cd93c0f60f42cfb`, runtime PASS.
PR263: `babac89e266044cf1cfb4e0026df913808f3a139`, runtime PASS.
PR264: `f4f32c4fd2fdd6c12d034638c74861cb5f4ee55f`, runtime PASS.
PR265: `f63d7c900b6f38af6b10ad705b6c5663be31d0af`, runtime pickup now confirmed through PR266 deployment.
PR266: `a0278effba94c56ba33bf061d25a94a61a6f966d`, runtime pickup confirmed with remaining Northflank API env config BLOCK.

## PR265 status
PR265:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/265
- Final head: `67e9060d2c8d0b06749f70135a00faba38559e7b`
- Merge commit: `f63d7c900b6f38af6b10ad705b6c5663be31d0af`.
- CI #572 success, audit-only PASS, merged squash.
- Purpose: generic live tenant self-diagnostic for current MAX user, visible account entry, private commands, runtime export `runtime/live-tenant-self-diagnostic-matrix.json`.
- Initially runtime pickup was stale on PR264, but after PR266 deployment `runtime/live-tenant-self-diagnostic-matrix.json` exists and diagnostic-export-status expectedFiles includes it.

## PR266 status
PR266:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/266
- Title: `Real Northflank runtime observability and post-merge deploy gate`
- Branch: `codex/add-northflank-runtime-observability-and-deploy-gate`
- Base: `main`
- Final head: `c9337a7dc1525cefd45b9f8692493e4339aefb98`
- CI: PR regression tests #579, run id `28534255353`, conclusion `success`.
- Pre-audit BLOCK review `4611108294` was fixed directly through GitHub connector.
- Audit PASS recorded as review COMMENT `4611969203` because GitHub does not allow approving own PR.
- Merge method: squash.
- Merge commit: `a0278effba94c56ba33bf061d25a94a61a6f966d`.
- Northflank commit status: success, build `misty-sanctuary-5794`.

PR266 purpose:
- Replace placeholder Northflank startup log with real observability fetch/service payload.
- Add strict post-merge runtime pickup gate.
- Prevent runtime diagnostic export noise/writes when debug branch points to `main`.

PR266 fix details:
- `scripts/check-post-merge-runtime-pickup.js` defines `REQUIRED_RUNTIME_FILES` including `runtime/live-tenant-self-diagnostic-matrix.json`, product-semantic, tenant-channel-binding, maximal-flow, etc.
- `diagnosticComplete` requires every required file to be present in `diagnostic.expectedFiles` and absent from `diagnostic.missingFiles`.
- `runtime-post-merge-check.json` outputs `diagnostic_expected_files_count`, `diagnostic_undeclared_required_files`, and `diagnostic_missing_required_files`.
- `scripts/test-pr266-post-merge-runtime-gate.js` covers stale/short `expectedFiles` missing `runtime/live-tenant-self-diagnostic-matrix.json` and requires `likely_reason: runtime_export_failed`.
- `services/northflankStartupLogService.js` returns `ok:false`, `ready:false`, `configured:false` when `NORTHFLANK_API_TOKEN`, `NORTHFLANK_PROJECT_ID`, `NORTHFLANK_SERVICE_ID` are missing.
- `services/pushDispatchLogService.js` safely falls back to `runtime-status` when debug branch points to `main` and avoids repeated log spam.

Post-merge runtime status after PR266:
- `runtime/startup-log.json` updated at `2026-07-01T18:36:03.455Z`.
- `latest.githubMainHeadSha` is `a0278effba94c56ba33bf061d25a94a61a6f966d`.
- active entrypoint remains `clean-entrypoint-1.53.10-pr89.js`.
- production start path on main remains `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`.
- `runtimeContract.contractLiveOk` true.
- `runtimeContract.startupPath.ok` true.
- `finalRuntimeReadinessGate.ok` true.
- `finalRuntimeReadinessGate.readyForManualMaxTest` true.
- `diagnostic-export-status.json` generated at `2026-07-01T18:36:12.962Z`, ok true, expectedCount 9, okCount 9, missingFiles [].
- expectedFiles includes `runtime/live-tenant-self-diagnostic-matrix.json` and `runtime/northflank-startup-log.json`.
- `runtime/live-tenant-self-diagnostic-matrix.json` exists, generated at `2026-07-01T18:36:07.450Z`, ok true.
- `runtime/northflank-startup-log.json` exists and now uses PR266 payload semantics; it is current but configured:false/ok:false because Northflank API env variables are missing.

Remaining BLOCK / manual infrastructure action:
- `runtime/northflank-startup-log.json` reports missing `NORTHFLANK_API_TOKEN`, `NORTHFLANK_PROJECT_ID`, `NORTHFLANK_SERVICE_ID`.
- This is now correctly visible as an observability BLOCK: `ok:false`, `ready:false`, `configured:false`, `startupSeen:false`, `staleRuntimeSuspected:true`.
- To complete Northflank automatic runtime-log observability, add these three env vars/secrets to production Northflank service and redeploy/restart.
- After env setup, verify `runtime/northflank-startup-log.json` becomes configured:true and contains sanitized status/log tail.

Manual MAX check status:
- Server contract is ready for manual MAX test (`readyForManualMaxTest: true`).
- For PR265 user diagnostic, test private `/tenant` or visible account button `Диагностика привязки`.
- Northflank runtime-log automation is not complete until env variables are configured.
