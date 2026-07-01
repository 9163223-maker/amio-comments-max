# АдминКИТ — current handoff

Updated: 2026-07-01 12:24 UTC
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

## PR263 runtime note
PR263 runtime passed, but tenant matrix row was fixture/user `real-user-1`. If real MAX user still sees zero channels, next issue is live userId/tenantId mismatch or real-data backfill, not the general PR263 server contract.

## PR264 status
PR264:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/264
- Title: `Maximal flow matrix and manual route checklist`
- Branch: `codex/pr264-maximal-flow-matrix-v2`
- Base: `main`
- Final head: `856d3c17c2d803927e073de29539d97c894a4c19`
- CI: PR regression tests #550, run id `28510799754`, conclusion `success`.
- Audit-only: PASS shown by user screenshot on 2026-07-01 12:21 UTC.
- Merge method: squash merge.
- Main squash commit: `f4f32c4fd2fdd6c12d034638c74861cb5f4ee55f`.

PR264 scope:
- Adds `services/maximalFlowMatrixService.js`.
- Adds runtime export `runtime/maximal-flow-matrix.json`.
- Adds `scripts/test-pr264-maximal-flow-matrix.js` and wires it into `npm test`.
- Wires maximal matrix into `pr180-startup-log-bootstrap.js` expected diagnostic files/export queue.
- Matrix renders all root sections, repeated root opens, and broad post-scoped scenarios for comments/gifts/buttons/polls/highlights/editor.
- Scenarios include zero/one/multiple channels, dangerous chat records, zero posts, selected post, malformed/missing payload, missing required id, foreign post, stale/deleted post.
- Matrix integrates tenant-channel-binding matrix.
- Matrix includes manual MAX checklist M01-M12 for later selective user verification.

PR264 CI fix history:
- CI #546 failed because maximal matrix treated legitimate Push/Account/Settings word `чат` as channel/post chat leakage, and embedded tenant matrix inherited residue from the PR263 missing-binding fixture.
- Fixed: chat leakage is BLOCK only in channel/post target flows; Push/Account/Settings chat wording is not a channel-target leak.
- Fixed: embedded tenant matrix not-ok after fixture residue is WARN inside maximal matrix, not PR264 BLOCK; PR263 tenant matrix remains the source of truth for tenant binding BLOCKs.
- CI #550 passed on head `856d3c17c2d803927e073de29539d97c894a4c19`.

Next required action:
1. Verify runtime pickup for main commit `f4f32c4fd2fdd6c12d034638c74861cb5f4ee55f`.
2. Verify `runtime/startup-log.json`, `runtime/diagnostic-export-status.json`, and `runtime/maximal-flow-matrix.json`.
3. Produce server-contract success table and manual MAX checklist summary.
