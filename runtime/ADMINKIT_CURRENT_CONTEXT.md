# АдминКИТ — current handoff

Updated: 2026-07-01 18:59 UTC
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
PR265: `f63d7c900b6f38af6b10ad705b6c5663be31d0af`, runtime pickup confirmed through PR266 deployment.
PR266: `a0278effba94c56ba33bf061d25a94a61a6f966d`, runtime pickup confirmed with remaining Northflank API env config BLOCK.

## Current runtime after PR266
- `runtime/startup-log.json` updated at `2026-07-01T18:36:03.455Z`.
- `latest.githubMainHeadSha` is `a0278effba94c56ba33bf061d25a94a61a6f966d`.
- active entrypoint remains `clean-entrypoint-1.53.10-pr89.js`.
- production start path on main remains `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`.
- `runtimeContract.contractLiveOk` true.
- `runtimeContract.startupPath.ok` true.
- `finalRuntimeReadinessGate.ok` true.
- `finalRuntimeReadinessGate.readyForManualMaxTest` true.
- `diagnostic-export-status.json` generated at `2026-07-01T18:36:12.962Z`, ok true, expectedCount 9, okCount 9, missingFiles [].
- `runtime/live-tenant-self-diagnostic-matrix.json` exists, generated at `2026-07-01T18:36:07.450Z`, ok true.
- `runtime/northflank-startup-log.json` current but configured:false/ok:false because `NORTHFLANK_API_TOKEN`, `NORTHFLANK_PROJECT_ID`, `NORTHFLANK_SERVICE_ID` are missing. This is observability-only, not product runtime failure.

## Manual MAX check status
- Server contract is ready for manual MAX test (`readyForManualMaxTest: true`).
- For PR265 user diagnostic, test private `/tenant` or visible account button `Диагностика привязки`.

## PR267 current state
PR267:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/267
- Title: `Tenant-aware section matrix`
- Branch: `codex/pr267-tenant-section-matrix`
- Base: `main`
- Base SHA: `a0278effba94c56ba33bf061d25a94a61a6f966d`
- Current head: `3dc2d71e338239f42eaba7537ae86aacd394ce75`
- State: open, not merged, not draft.
- CI: PR regression tests #590, run id `28540780852`, status `in_progress` as of 18:59 UTC.

PR267 purpose:
- Add tenant-aware matrix across all client-visible sections and all post-scoped sections.
- Check current-user tenant binding, live self diagnostic, tenant channel binding, picker isolation, channels list, account root, and post-scoped choose_channel/choose_post/selected_post screens.
- Ensure user A does not see user B channel and vice versa in matrix fixtures.
- Ensure chat-like records do not leak into channel/post flows.
- Export `runtime/tenant-section-matrix.json` from startup diagnostics.
- Add the new matrix to diagnostic expected files and post-merge runtime pickup gate.
- Add `scripts/test-pr267-tenant-section-matrix.js` and wire it into `npm test` and PR regression workflow.

Files changed in PR267:
- `services/tenantSectionMatrixService.js`
- `scripts/test-pr267-tenant-section-matrix.js`
- `pr180-startup-log-bootstrap.js`
- `scripts/check-post-merge-runtime-pickup.js`
- `package.json`
- `.github/workflows/pr-regression-tests.yml`

Next required action:
1. Wait for CI #590 on exact head `3dc2d71e338239f42eaba7537ae86aacd394ce75`.
2. If CI red, inspect diagnostics and fix in the same PR267 branch.
3. If CI green, inspect diff/comments, then audit-only PASS/BLOCK.
4. Do not merge before audit PASS.
