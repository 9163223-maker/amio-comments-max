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
Channel/post features must use only real channels and channel posts. Chats are a separate future product area and must not appear as channel/post targets. This includes root channel management and all post-scoped flows.

## PR259 status
PR259 merged into `main` at 2026-06-30 15:50 UTC. Merge commit: `c087323dcf38d1a6bbec082efe3b9bbdb496e747`.

## PR260 status
PR260 merged into `main` at 2026-06-30 18:20 UTC. Merge commit: `cc33ac39aee2817070ea8e65693553d36df103aa`.

## PR261 status
PR261 merged into `main` at 2026-06-30 19:31 UTC. Merge commit: `126d3a9d9a841b266337dceecce41d51855b6a3c`.

PR261 runtime pickup and diagnostics passed: full-section, channel-target, user-journey, process-events, northflank fallback, and diagnostic-export-status were present and green.

## Manual MAX mismatch — gifts/lead-magnets product semantics
User manual MAX check after PR261 found a product UX mismatch in `Подарки / лид-магниты`:
- Root screen opened and showed context-free actions: create gift, current gift, list gifts, main menu.
- Create gift led to post selection, but no-post state duplicated text and dead-ended.
- List gifts showed empty state while returning to the same root actions.
- Current/list/create actions were not meaningfully connected to selected channel/post/gift context.

Interpretation:
- This was NOT runtime/CI failure. Runtime and matrices were green.
- This WAS a product-semantic gap: matrices checked technical validity but did not verify product usefulness and lifecycle semantics.

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
- Audit-only: previous results were not final PASS. New audit-only is required for current head.

PR262 purpose:
- Add human-readable product flow contracts for all client-visible sections.
- Add machine-readable product flow contracts.
- Add product-semantic matrix actual vs expected.
- Add no-menu-multiplication tests.
- Fix gifts/lead-magnets first so root is context-first and state-aware.

PR262 changes before partial audit:
- Added `docs/flow-contracts/ADMINKIT_PRODUCT_FLOW_CONTRACTS.md`.
- Added `services/productFlowContractService.js`.
- Added `services/productSemanticMatrixService.js` and runtime export `runtime/product-semantic-matrix.json`.
- Updated `features/menu-v3/canonical-menu.js` gifts actions: root now uses `Выбрать пост`, `Все подарки`; context-free `Создать подарок`, `Текущий подарок`, ambiguous `Список подарков` are hidden until meaningful context.
- Updated `features/menu-v3/adapter.js` gifts root, zero-channel, zero-post, selected-post no-gift, and account-scoped all-gifts screen.
- Updated `bot.js` gifts fallback/root keyboard to semantic root buttons.
- Added/updated PR262 tests and updated older gifts/menu regression tests to the new semantic contract.

Assistant follow-up fixes:
1. CI #515 failed in `scripts/test-comments-ux-gifts-reset-pr176.js`; fixed old gifts root assertion.
2. CI #516 failed in `scripts/test-canonical-menu-matrix-pr175.js`; fixed expected gifts root actions.
3. CI #517 failed in `scripts/test-product-perfect-gifts-journey-pr142.js`; allowed `Выбрать пост` as clean root context gate.
4. CI #518 passed on head `30bbb2ef4f982b9dccac74b5df56bc0ea6697552`.
5. Partial audit at 21:03 found matrix/doc/lifecycle/no-menu gaps; assistant added routeCoverage, per-section state docs, requiredLifecycle, and deeper reachable-runtime no-menu guard.
6. CI #523 failed due false-positive scan of historical `main-cc6537.js`; fixed no-menu test to inspect reachable runtime graph.
7. CI #524 passed on head `c11cf13359ede8e4b3074e743fdef53caac5bccf`.
8. Audit at 21:57 BLOCKED `services/productSemanticMatrixService.js`: `buildMatrix().ok` false with root-visible post/entity-scoped actions for buttons, polls, highlights, plus stats classified as post-scoped but not gated.
9. Assistant fixed code:
   - `features/menu-v3/canonical-menu.js`: buttons/polls/highlights roots now show `Выбрать пост` as context gate; concrete actions `Добавить кнопку`, `Текущие кнопки`, `Создать опрос`, `Поставить метку`, `Снять метку` are hidden until selected-post context.
   - `services/productFlowContractService.js`: buttons/polls/highlights contracts now allow root `Выбрать пост` and forbid concrete post actions at root; stats removed from whole-section `POST_SCOPED` list and remains dashboard-scoped.
   - `services/productSemanticMatrixService.js`: matrix uses `contracts.POST_SCOPED`, not `requiredContext.includes('post')`, so stats dashboard is not incorrectly blocked.
   - `scripts/test-pr262-product-semantic-matrix.js`: now asserts `buildMatrix().ok === true`, blockCount 0, gated roots for buttons/polls/highlights, stats not whole-section post-scoped.
   - `scripts/test-canonical-menu-matrix-pr175.js`: updated expected root actions for buttons/polls/highlights.
   - `scripts/test-pr245-root-section-opening-contract.js`: updated polls smoke to assert `Выбрать пост` root gate and forbid context-free `Создать опрос` root action while preserving results flow check.
10. CI #529 failed because PR245 still expected root `Создать опрос`; fixed PR245 smoke.
11. CI #530 passed on current head `88971d9eb82665499a6205df5cd3fb764f26996c`.

Next required action:
1. Run audit-only PASS/BLOCK for PR262 head `88971d9eb82665499a6205df5cd3fb764f26996c`.
2. If audit BLOCK, fix exact blocker in existing PR262 branch.
3. If audit PASS, merge with expected head SHA.
4. After merge, verify runtime pickup and `runtime/product-semantic-matrix.json` in runtime-status.
5. Manual MAX visual check gifts root/no-post/list/post-selected states and post-scoped roots buttons/polls/highlights.
