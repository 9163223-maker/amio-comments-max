# АдминКИТ — current handoff

Updated: 2026-07-01 06:49 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## First action in every new AdminKIT chat
Read this file first from branch `runtime-status`, then check current GitHub state. Continue from GitHub/runtime state, not from memory.

Update this file after major events: new PR/head SHA, CI red/green, audit PASS/BLOCK, merge, deploy/runtime-status, manual MAX result, live mismatch, or process error.

## Core rules
Do not use GitHub `@codex` comments. Do not create a new PR if the existing PR can be updated. Do not merge before final audit-only PASS/waiver. Green CI is not done. Merge is not done. Runtime readiness is not visual UX done.

Standard post-audit workflow: confirm exact head and green CI; merge only that head; use repository workflow/runtime diagnostics for the delayed 3-4 minute runtime pickup check when available; otherwise poll runtime-status in the same work chain, not a chat automation; verify runtime-status and production contract; produce a server-contract success table; then run/manual request MAX visual check.

Production start path must remain:
`node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`

Active entrypoint must remain:
`clean-entrypoint-1.53.10-pr89.js`

Diagnostics branch: `runtime-status`.

## Product rule
Channel/post features must use only real channels and channel posts. Chats are a separate future product area and must not appear as channel/post targets.

## PR259 / PR260 / PR261
PR259 merge commit: `c087323dcf38d1a6bbec082efe3b9bbdb496e747`.
PR260 merge commit: `cc33ac39aee2817070ea8e65693553d36df103aa`.
PR261 merge commit: `126d3a9d9a841b266337dceecce41d51855b6a3c`.
PR261 runtime pickup and diagnostics passed.

## PR262 status
PR262:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/262
- Title: `Product-semantic flow contracts and gifts lifecycle gate`
- Branch: `codex-792bhs`
- Base: `main`
- Final head: `88971d9eb82665499a6205df5cd3fb764f26996c`
- CI: PR regression tests #530, run id `28478999226`, conclusion `success`.
- Audit-only: PASS shown by user screenshot on 2026-07-01 06:20 UTC.
- Merge method: squash merge.
- Merged at: 2026-07-01 06:43:35 UTC.
- Main squash commit: `bc1e3f548ea65a18644d39335cd93c0f60f42cfb`.

Key PR262 changes:
- Product flow contract docs and machine-readable product flow contracts.
- Product-semantic matrix export `runtime/product-semantic-matrix.json`.
- Gifts root is context-first: `Выбрать пост`, `Все подарки`, `Помощь`, `Главное меню`.
- Gifts context-free create/current/list actions are hidden until meaningful context.
- Product-semantic matrix has route coverage and must be green.
- Buttons/polls/highlights roots use `Выбрать пост`; concrete post actions are hidden until selected-post context.
- Stats remains dashboard-scoped.
- No-menu-multiplication test checks reachable runtime graph from active entry files.

## PR262 post-merge runtime check — 2026-07-01 06:49 UTC
Runtime pickup confirmed from `runtime/startup-log.json`:
- updatedAt: `2026-07-01T06:44:49.200Z`
- latest startedAt: `2026-07-01T06:44:12.902Z`
- latest bootId: `mr1pnipm-0922367d`
- latest githubMainHeadSha: `bc1e3f548ea65a18644d39335cd93c0f60f42cfb`
- entrypoint: `clean-entrypoint-1.53.10-pr89.js`
- runtimeContract.contractLiveOk: true
- startupPath.ok: true
- dataProviders.ok: true
- finalRuntimeReadinessGate.ok: true
- finalRuntimeReadinessGate.missing: []
- readyForManualMaxTest: true

Production package on main:
- main: `clean-entrypoint-1.53.10-pr89.js`
- start: `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`

Diagnostic files:
- `runtime/full-section-matrix.json`: ok true, 37 routes, violations [], blockCount 0.
- `runtime/channel-target-matrix.json`: ok true, violations [], leaks [].
- `runtime/user-journey-matrix.json`: ok true, 14 sections, 16 journeys, 87 steps, violations [], blockCount 0, giftsBlockCount 0, buttonsBlockCount 0.
- `runtime/product-semantic-matrix.json`: ok true, sectionCount 14, pass 4, partial 10, block 0, blockCount 0, warnCount 20, postScopedSectionsChecked 6.
- `runtime/process-events.json`: ok true, handlersInstalled true, startup event entrypoint `clean-entrypoint-1.53.10-pr89.js`.
- `runtime/northflank-startup-log.json`: ok true, configured false fallback because Northflank env credentials are missing.
- `runtime/diagnostic-export-status.json`: ok true, expectedCount 6, okCount 6, failedCount 0, missingCount 0, missingFiles [].

Conclusion:
- PR262 merge: PASS.
- Runtime pickup: PASS.
- Production contract: PASS.
- Diagnostic export: PASS.
- Product-semantic matrix: PASS, with honest PARTIAL classifications for incomplete product sections and 0 BLOCKs.
- Ready for manual MAX visual check of gifts root/no-post/list/post-selected states and buttons/polls/highlights gated roots.
