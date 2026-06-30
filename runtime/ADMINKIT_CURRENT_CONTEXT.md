# АдминКИТ — current handoff

Updated: 2026-06-30 15:43 UTC
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

## PR258 status
PR258 merged at 2026-06-30 09:51 UTC, merge commit `50b43a4524ed8009c48cd5c2ad710f2d027a7f66`. CI green and audit-only PASS. Runtime pickup passed, but manual MAX check found a live mismatch: root `Каналы -> Мои каналы` still showed chat-like entries.

Root cause: PR258 covered post-scoped pickers but missed root channel management. `features/menu-v3/adapter.js::channelsList()` used a weak local predicate, and sync channel route hydration could pass raw client access records.

## PR259 current state
PR259:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/259
- Title: `Channel root matrix and runtime export safety`
- Branch: `codex/fix-channel-matrix-and-runtime-export-safety`
- Base: `main`
- Current head: `23c417b1ef945395cce64fcc320a69427af79645`
- Open, not merged.
- Mergeable: true at latest check.
- CI: PR regression tests #498, run id `28456674246`, conclusion `success`.
- Latest audit-only: BLOCK, then fixed by assistant. Re-audit required. Do not merge yet.

What changed in PR259:
- root `channels:list` and post-scoped choose-channel routes use shared channel predicate;
- sync and async channel route hydration are filtered;
- runtime export guard refuses `main` and limits exports to `runtime/*.json`;
- runtime push dispatch exports are routed through the guard;
- committed runtime push log is removed from PR tree;
- channel target matrix, process events, and Northflank startup scaffold services are added;
- startup bootstrap exports these diagnostics;
- PR259 tests are added and included in `npm test`.

Assistant follow-up applied before first audit:
- Created a merge commit inside the PR259 branch, not into `main`, to bring it up to current `main` while preserving PR259 changes and runtime-log deletion.
- Hardened channel predicate and fixed CI regressions from #484, #486, #488, and #490 without weakening old regression intent.
- CI #492 was green.

Audit BLOCK at 2026-06-30 15:34 UTC:
- `channel-post-picker-core.js`: dangerous ambiguous records with explicit `channelId` plus known chat/group-like human titles could still be accepted because the explicit-channelId path was not guarded explicitly enough.
- Repro from audit: `adapter.render('channels:list', { channels: [{ channelId: 'danger-1', title: 'Все свои MAX' }] })` rendered `Все свои MAX` in visible text/payload.
- `services/channelTargetMatrixService.js`: PR259 matrix was not meaningful enough because it only rendered `channels:list` and `*:choose_channel`; it did not cover any `*:choose_post` screen with posts for comments/gifts/buttons/polls/highlights/editor/stats, and fixtures did not include exact dangerous `channelId + human chat/group title` cases required by audit.

Assistant fixed the BLOCK in current head `23c417b1ef945395cce64fcc320a69427af79645`:
- Added explicit `hasSuspiciousChatHumanTitle()` guard in `channel-post-picker-core.js`.
- Added `hasPositiveChannelEvidence()` and made suspicious human-title records require positive channel evidence: explicit channel type, `isChannel`, tenant/bound/owner/source evidence, or stored post evidence.
- Added exact matrix fixtures: `{ channelId: 'danger-1', title: 'Все свои MAX' }` and `{ channelId: 'danger-2', title: 'Саша - сын Мамочки 🌸' }`.
- Expanded matrix to render and assert both `*:choose_channel` and `*:choose_post` with posts for comments/gifts/buttons/polls/highlights/editor/stats.
- Updated `scripts/test-pr259-channel-target-matrix.js` accordingly.
- CI #498 passed green on the new head.

Next required action:
1. Run audit-only PASS/BLOCK for PR259 head `23c417b1ef945395cce64fcc320a69427af79645`.
2. If audit BLOCK, fix exact blocker in existing PR259 branch.
3. If audit PASS, merge PR259 with expected head SHA.
4. After merge, verify deploy/runtime pickup and production contract.
5. Then manual MAX visual check: `Каналы -> Мои каналы` and all post-scoped pickers show only channels, not chats.

Do not merge PR259 until audit-only PASS.
