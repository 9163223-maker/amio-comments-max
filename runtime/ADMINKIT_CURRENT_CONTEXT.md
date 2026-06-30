# АдминКИТ — current handoff

Updated: 2026-06-30 21:10 UTC
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
- Current head: `060c3a5b3b282bf6d0383d12f10aa8d96eb76cc5`
- Open, not merged.
- Mergeable: true at latest check.
- Last green CI before partial audit follow-up: PR regression tests #518 on head `30bbb2ef4f982b9dccac74b5df56bc0ea6697552`.
- After audit follow-up fixes, CI for new head is pending.
- Audit-only: previous result was NOT final PASS; it was `PARTIAL PASS` with limitations, so merge is blocked unless user gives explicit waiver.

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

Assistant follow-up fixes after initial CI red:
1. CI #515 failed in `scripts/test-comments-ux-gifts-reset-pr176.js`; fixed old gifts root assertion.
2. CI #516 failed in `scripts/test-canonical-menu-matrix-pr175.js`; fixed expected gifts root actions.
3. CI #517 failed in `scripts/test-product-perfect-gifts-journey-pr142.js`; allowed `Выбрать пост` as clean root context gate.
4. CI #518 passed on head `30bbb2ef4f982b9dccac74b5df56bc0ea6697552`.

Partial audit result provided by user at 2026-06-30 21:03 UTC:
- Audit mode was respected.
- Important limitation: local checkout was not requested head and remote verification failed due network/proxy 403.
- Verdict was `PARTIAL PASS with product-semantic gaps exposed`, not final PASS.
- Gifts P0 root/context blockers were considered fixed.
- Gaps:
  1. product-semantic matrix primarily compared root screens, not full `choose_channel`/`choose_post`/`post` route behavior for every post-scoped section;
  2. docs had common/global state definitions but not per-section state matrix;
  3. productReady true with incomplete global lifecycle caused matrix BLOCKs for main/channels/push/account;
  4. no-menu-multiplication guard was shallow/pattern-limited.

Assistant follow-up fixes after partial audit:
- `services/productFlowContractService.js`: added `requiredLifecycle`, explicit state defaults for post-scoped sections, and richer per-section states.
- `services/productSemanticMatrixService.js`: expanded matrix beyond roots; now renders route coverage for all post-scoped sections: root, zero_channels, multiple_channels, zero_posts, selected_post; gifts also covers `gifts:all` account scope. Adds `routeCoverage` and `postScopedSectionsChecked`.
- `scripts/test-pr262-product-semantic-matrix.js`: now asserts all post-scoped sections have root/zero_channels/multiple_channels/zero_posts/selected_post coverage and no irrelevant productReady lifecycle BLOCK.
- `scripts/test-pr262-no-menu-multiplication.js`: deepened scan across JS files outside scripts/runtime/node_modules; only canonical-menu may declare `clientVisible: true`; active sources must not import legacy menu maps.
- `docs/flow-contracts/ADMINKIT_PRODUCT_FLOW_CONTRACTS.md`: added per-section state matrix and required semantic matrix coverage section.

Next required action:
1. Wait for CI on head `060c3a5b3b282bf6d0383d12f10aa8d96eb76cc5`.
2. If CI red, inspect diagnostics artifact and fix in same PR262 branch.
3. If CI green, rerun audit-only PASS/BLOCK against latest head.
4. Do not merge until final audit-only PASS or explicit user waiver.
