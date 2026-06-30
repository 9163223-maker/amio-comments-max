# АдминКИТ — current handoff

Updated: 2026-06-30 22:10 UTC
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
Channel/post features must use only real channels and channel posts. Chats are a separate future product area and must not appear as channel/post targets.

## PR259 / PR260 / PR261
PR259 merge commit: `c087323dcf38d1a6bbec082efe3b9bbdb496e747`.
PR260 merge commit: `cc33ac39aee2817070ea8e65693553d36df103aa`.
PR261 merge commit: `126d3a9d9a841b266337dceecce41d51855b6a3c`.
PR261 runtime pickup and diagnostics passed.

## Manual MAX mismatch
After PR261, manual MAX check found gifts/lead-magnets product UX mismatch: context-free root actions, duplicate no-post copy, and dead-end empty states. PR262 addresses product-semantic contracts and gifts lifecycle gate.

## PR262 current state
PR262:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/262
- Title: `Product-semantic flow contracts and gifts lifecycle gate`
- Branch: `codex-792bhs`
- Base: `main`
- Current head: `88971d9eb82665499a6205df5cd3fb764f26996c`
- Open, not merged.
- Mergeable: true at latest check.
- CI: PR regression tests #530, run id `28478999226`, conclusion `success`.
- Audit-only: required for current head; do not merge before PASS.

Key PR262 changes:
- Adds `docs/flow-contracts/ADMINKIT_PRODUCT_FLOW_CONTRACTS.md`.
- Adds `services/productFlowContractService.js`.
- Adds `services/productSemanticMatrixService.js` and runtime export `runtime/product-semantic-matrix.json`.
- Gifts root is context-first: `Выбрать пост`, `Все подарки`, `Помощь`, `Главное меню`.
- Gifts context-free `Создать подарок`, `Текущий подарок`, `Список подарков` are hidden until meaningful context.
- Product-semantic matrix now has route coverage and is required to be green.
- No-menu-multiplication test checks reachable runtime graph from active entry files.

Audit/fix history:
- CI #515/#516/#517 fixed old gifts regression expectations.
- CI #518 passed on head `30bbb2ef4f982b9dccac74b5df56bc0ea6697552`.
- Partial audit found matrix/docs/lifecycle/no-menu gaps.
- Assistant added routeCoverage, per-section state docs, requiredLifecycle, and deeper no-menu guard.
- CI #523 false-positive on historical `main-cc6537.js`; fixed by scanning reachable runtime graph.
- CI #524 passed on head `c11cf13359ede8e4b3074e743fdef53caac5bccf`.
- Audit BLOCK at 21:57: `buildMatrix().ok` false with root-visible post/entity actions for buttons/polls/highlights and stats misclassified as whole-section post-scoped.
- Fixed: buttons/polls/highlights roots now use `Выбрать пост`; concrete post actions are hidden until selected post context. Stats removed from whole-section `POST_SCOPED` and remains dashboard-scoped. Product semantic test now asserts `buildMatrix().ok === true` and blockCount 0.
- CI #529 failed because PR245 smoke expected root `Создать опрос`; fixed test to assert root `Выбрать пост` and no context-free create.
- CI #530 passed on current head.

Next required action:
1. Run audit-only PASS/BLOCK for PR262 head `88971d9eb82665499a6205df5cd3fb764f26996c`.
2. If PASS, merge with expected head SHA.
3. After merge, verify runtime pickup and `runtime/product-semantic-matrix.json`.
