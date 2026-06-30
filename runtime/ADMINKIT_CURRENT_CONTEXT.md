# АдминКИТ — current handoff

Updated: 2026-06-30 20:18 UTC
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

PR260 runtime pickup passed. `runtime/full-section-matrix.json` appeared and was OK. Other diagnostic files initially did not appear, so PR261 was opened.

## PR261 status
PR261 merged into `main` at 2026-06-30 19:31 UTC.
- URL: https://github.com/9163223-maker/amio-comments-max/pull/261
- Title: `Reliable runtime diagnostics and expanded user journey matrix`
- Final head: `8d8729ca9496e872d546c64140c9abdf7ef48250`
- CI: PR regression tests #514, success.
- Audit-only: PASS.
- Merge commit: `126d3a9d9a841b266337dceecce41d51855b6a3c`.

PR261 runtime pickup and diagnostics passed:
- `startup-log.json` picked up merge commit `126d3a9d9a841b266337dceecce41d51855b6a3c`.
- Production entrypoint remained `clean-entrypoint-1.53.10-pr89.js`.
- Start script remained `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`.
- `runtime/full-section-matrix.json`: present, ok true.
- `runtime/channel-target-matrix.json`: present, ok true.
- `runtime/user-journey-matrix.json`: present, ok true, 14 sections, 16 journeys, 87 steps, 119 scenario coverage records, 0 violations, giftsBlockCount 0, buttonsBlockCount 0.
- `runtime/process-events.json`: present, ok true.
- `runtime/northflank-startup-log.json`: present, ok true, configured false fallback.
- `runtime/diagnostic-export-status.json`: present, ok true, missingFiles [].

## Manual MAX mismatch — gifts/lead-magnets product semantics
User manual MAX check after PR261 found a product UX mismatch in `Подарки / лид-магниты`:
- Root screen opens and shows actions: create gift, current gift, list gifts, main menu.
- Create gift leads to post selection, but when there are no saved posts the screen duplicates text and dead-ends into empty/no-post state.
- List gifts shows empty state while still returning to the same root actions.
- Current gift/list/create actions are not meaningfully connected to a selected channel/post context or a clear lead-magnet lifecycle.

Interpretation:
- This is NOT a runtime/CI failure. Runtime and matrices are green.
- This IS a product-semantic gap: the journey matrix checked technical validity (rendering, payloads, no chat leaks, navigation, scenario coverage) but did not verify that each section action is meaningful, reachable, context-bound, and has a complete product lifecycle.
- PR261 matrix PASS was therefore insufficient for product UX quality.

## Product-semantic flow contract initiative
User requested a systematic reset before more fixes:
- Define canonical product flow contracts for all client-visible sections.
- Compare actual flows with desired flows across all sections, not just gifts.
- Prevent menu multiplication/reimplementation drift. The next task must not create yet another independent menu tree.
- Enforce one canonical menu/flow source of truth and semantic tests that fail when root actions are meaningless, context-free, duplicate, or dead-end.

Observed current-code facts:
- `features/menu-v3/canonical-menu.js` is intended as the single source of truth for the client-visible production menu; legacy menu maps are reference-only.
- `features/menu-v3/adapter.js` renders visible section screens from canonical actions.
- Current adapter `postPickerContract()` says implementationStatus is `contract_only`, productionActionsMigrated false, and production post-scoped callbacks continue to use existing tenant-aware flows until picker hydration/delegation is migrated safely. This is a major reason technical matrices passed while product semantics failed.

Required next PR candidate:
PR262 — `Product-semantic flow contracts and gifts lifecycle gate`.
Must add docs/flow-contracts/ADMINKIT_PRODUCT_FLOW_CONTRACTS.md, a machine-readable semantic flow contract, semantic matrix tests, no-menu-multiplication tests, and fix gifts/lead-magnets first. The fix must be context-first and state-aware: no `Текущий подарок` without selected post/gift, no `Создать подарок` dead-end when no posts, useful zero-post state, post-bound gift card, create/edit/delete/preview lifecycle, list scope clarity.
