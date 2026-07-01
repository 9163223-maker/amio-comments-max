# АдминКИТ — current handoff

Updated: 2026-07-01 06:28 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## First action in every new AdminKIT chat
Read this file first from branch `runtime-status`, then check current GitHub state. Continue from GitHub/runtime state, not from memory.

Update this file after major events: new PR/head SHA, CI red/green, audit PASS/BLOCK, merge, deploy/runtime-status, manual MAX result, live mismatch, or process error.

## Core rules
Do not use GitHub `@codex` comments. Do not create a new PR if the existing PR can be updated. Do not merge before final audit-only PASS/waiver. Green CI is not done. Merge is not done. Runtime readiness is not visual UX done.

Standard post-audit workflow: confirm exact head and green CI; merge only that head; use repository workflow/runtime diagnostics for the delayed 3-4 minute runtime pickup check; verify runtime-status and production contract; then produce a server-contract success table and run/manual request MAX visual check.

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

## PR262 current state
PR262:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/262
- Title: `Product-semantic flow contracts and gifts lifecycle gate`
- Branch: `codex-792bhs`
- Base: `main`
- Current head: `88971d9eb82665499a6205df5cd3fb764f26996c`
- Open at latest check.
- Mergeable: true at latest check.
- CI: PR regression tests #530, run id `28478999226`, conclusion `success`.
- Audit-only: PASS shown by user screenshot on 2026-07-01 06:20 UTC.
- Connector merge did not complete in this chat environment; repository auto-merge is disabled.

Key PR262 changes:
- Product flow contract docs and machine-readable product flow contracts.
- Product-semantic matrix export `runtime/product-semantic-matrix.json`.
- Gifts root is context-first: `Выбрать пост`, `Все подарки`, `Помощь`, `Главное меню`.
- Gifts context-free create/current/list actions are hidden until meaningful context.
- Product-semantic matrix has route coverage and must be green.
- Buttons/polls/highlights roots use `Выбрать пост`; concrete post actions are hidden until selected-post context.
- Stats remains dashboard-scoped.
- No-menu-multiplication test checks reachable runtime graph from active entry files.

Next required action:
1. Complete PR262 merge with expected head `88971d9eb82665499a6205df5cd3fb764f26996c`.
2. Verify main merge commit.
3. Verify runtime pickup and `runtime/product-semantic-matrix.json`.
4. Produce server-contract success table.
