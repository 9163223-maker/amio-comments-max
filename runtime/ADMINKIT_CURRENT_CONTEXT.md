# АдминКИТ — current handoff

Updated: 2026-07-01 10:23 UTC
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

## PR263 post-merge runtime check — 2026-07-01 08:12 UTC
Runtime pickup, production contract, diagnostic export, and tenant-channel-binding matrix all passed for main squash commit `babac89e266044cf1cfb4e0026df913808f3a139`.

Important PR263 runtime note:
- `runtime/tenant-channel-binding-matrix.json` showed knownTenant true, tenantChannelsCount 1, visiblePickerChannelsCount 1, blockCount 0.
- Matrix row was for fixture/user `real-user-1`. If real MAX user still sees zero channels, next issue is live userId/tenantId mismatch or real-data backfill, not the general PR263 server contract.

## PR264 current state
PR264:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/264
- Title: `Maximal flow matrix and manual route checklist`
- Branch: `codex/pr264-maximal-flow-matrix-v2`
- Base: `main`
- Base SHA: `babac89e266044cf1cfb4e0026df913808f3a139`
- Current head: `28601237307858ab752c879b3009b7c488eea975`
- State: open, not merged, not draft.
- CI: PR regression tests #546, run id `28510586045`, currently in_progress at creation check.

PR264 scope:
- Adds `services/maximalFlowMatrixService.js`.
- Adds runtime export `runtime/maximal-flow-matrix.json`.
- Adds `scripts/test-pr264-maximal-flow-matrix.js` and wires it into `npm test`.
- Wires maximal matrix into `pr180-startup-log-bootstrap.js` expected diagnostic files/export queue.
- Matrix renders all root sections, repeated root opens, and broad post-scoped scenarios for comments/gifts/buttons/polls/highlights/editor.
- Scenarios include zero/one/multiple channels, dangerous chat records, zero posts, selected post, malformed/missing payload, missing required id, foreign post, stale/deleted post.
- Matrix integrates tenant-channel-binding matrix.
- Matrix includes manual MAX checklist M01-M12 for later selective user verification.

Known PR264 caveat:
- Assistant attempted to add a named wrapper and node --check line to `.github/workflows/pr-regression-tests.yml`, but the full YAML update was blocked by tool safety layer.
- The test is still included in `npm test`, and the PR workflow already runs `npm-test`, so CI still exercises PR264 maximal matrix.

Next required action:
1. Wait for CI #546 result.
2. If CI red, inspect diagnostics artifact and fix in the same PR264 branch.
3. If CI green, do pre-audit code review and then audit-only PASS/BLOCK on exact head.
4. Do not merge without final audit-only PASS or explicit waiver.
