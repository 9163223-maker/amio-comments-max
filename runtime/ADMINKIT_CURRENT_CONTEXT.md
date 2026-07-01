# АдминКИТ — current handoff

Updated: 2026-07-01 08:12 UTC
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

## PR263 status
PR263:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/263
- Title: `Tenant channel binding contract and live channel ownership diagnostics`
- Branch: `codex/add-tenant-channel-binding-service`
- Base: `main`
- Final head: `34322880e3a065232e820c9e281227243678714c`
- CI: PR regression tests #539, run id `28502260093`, conclusion `success`.
- Audit-only: PASS shown by user screenshot on 2026-07-01 08:02 UTC.
- Merge method: squash merge.
- Merged at: 2026-07-01 08:05:27 UTC.
- Main squash commit: `babac89e266044cf1cfb4e0026df913808f3a139`.

PR263 scope:
- Added tenant-channel binding service.
- Binds real channels to the initiating user's tenant only when the user state is trusted and bot-admin proof is not explicitly negative.
- Keeps chats out of channel/post targets.
- Exports `runtime/tenant-channel-binding-matrix.json`.
- Adds regression test and wires it into npm test and PR workflow.

Audit/fix history:
1. Initial assistant BLOCK on 2026-07-01 07:15 UTC: tenant creation was too permissive when no tenant existed.
2. Follow-up fixed trusted access checks; CI #535 passed.
3. Audit BLOCK on 2026-07-01 07:48 UTC: negative `botAdminProof.proven === false` still refreshed active binding.
4. Follow-up fixed negative bot-admin proof handling: new/unbound channel is rejected without active binding; existing binding is persisted as `suspended`; picker hides it; tests cover both cases.
5. CI #539 passed; final audit-only PASS shown by user screenshot.

## PR263 post-merge runtime check — 2026-07-01 08:12 UTC
Runtime pickup confirmed from `runtime/startup-log.json`:
- updatedAt: `2026-07-01T08:06:57.913Z`
- latest startedAt: `2026-07-01T08:06:07.616Z`
- latest bootId: `mr1sl6j9-ed455b53`
- latest githubMainHeadSha: `babac89e266044cf1cfb4e0026df913808f3a139`
- entrypoint: `clean-entrypoint-1.53.10-pr89.js`
- postgresConfigured: true
- runtimeContract.contractLiveOk: true
- startupPath.ok: true
- dataProviders.ok: true
- finalRuntimeReadinessGate.ok: true
- finalRuntimeReadinessGate.missing: []
- readyForManualMaxTest: true

Production package on main:
- main: `clean-entrypoint-1.53.10-pr89.js`
- start: `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`
- npm test includes `scripts/test-pr263-tenant-channel-binding-contract.js`.

Diagnostic files:
- `runtime/tenant-channel-binding-matrix.json`: ok true, runtime `PR263-TENANT-CHANNEL-BINDING-CONTRACT-1.0`, knownTenant true, tenantChannelsCount 1, visiblePickerChannelsCount 1, missingBindings [], conflictingBindings [], inactiveBotAdminBindings [], violations [], warnings [], blockCount 0, warnCount 0. Note: botAdminProofMissing includes `channel-olga`, but it is not currently a warning/block in matrix.
- `runtime/diagnostic-export-status.json`: ok true, expectedCount 7, okCount 7, failedCount 0, missingCount 0, missingFiles []; includes `runtime/tenant-channel-binding-matrix.json`.
- `runtime/full-section-matrix.json`: ok true, 37 routes, violations [], blockCount 0.
- `runtime/channel-target-matrix.json`: ok true, violations [], leaks [], forbidden chat titles excluded.
- `runtime/user-journey-matrix.json`: ok true, 14 sections, 16 journeys, 87 steps, violations [], blockCount 0, giftsBlockCount 0, buttonsBlockCount 0.
- `runtime/product-semantic-matrix.json`: ok true, sectionCount 14, pass 4, partial 10, block 0, blockCount 0, postScopedSectionsChecked 6.
- `runtime/process-events.json`: ok true, handlersInstalled true, startup event entrypoint `clean-entrypoint-1.53.10-pr89.js`.
- `runtime/northflank-startup-log.json`: ok true, configured false fallback because Northflank env credentials are missing.

Conclusion:
- PR263 merge: PASS.
- Runtime pickup: PASS.
- Production contract: PASS.
- Diagnostic export: PASS.
- Tenant-channel binding matrix: PASS.
- Ready for manual MAX visual check: user should re-open gifts/buttons/polls/highlights post selection and verify tenant-bound channels are visible. If live user still sees zero channels, next issue is real-data migration/backfill for existing channels, not PR263 server contract itself.
