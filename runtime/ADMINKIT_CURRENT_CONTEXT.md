# АдминКИТ — current handoff

Updated: 2026-06-30 15:51 UTC
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

Root cause: PR258 covered post-scoped pickers but missed root channel management. Root channel list used a weak local predicate, and sync channel route hydration could pass raw client access records.

## PR259 current state
PR259:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/259
- Title: `Channel root matrix and runtime export safety`
- Final head: `23c417b1ef945395cce64fcc320a69427af79645`
- CI: PR regression tests #498, run id `28456674246`, conclusion `success`.
- Audit-only: PASS confirmed by user screenshot at 2026-06-30 15:48 UTC.
- Merged into `main` at 2026-06-30 15:50 UTC.
- Merge commit: `c087323dcf38d1a6bbec082efe3b9bbdb496e747`.

What changed in PR259:
- root `channels:list` and post-scoped choose-channel routes use shared channel predicate;
- sync and async channel route hydration are filtered;
- suspicious human-title records require positive channel evidence and cannot pass on `channelId` alone;
- runtime export guard refuses `main` and limits exports to `runtime/*.json`;
- runtime push dispatch exports are routed through the guard;
- committed runtime push log is removed from PR tree;
- channel target matrix, process events, and Northflank startup scaffold services are added;
- startup bootstrap exports these diagnostics;
- PR259 tests are added and included in `npm test`.

Latest audit BLOCK fixed before merge:
- `channel-post-picker-core.js`: explicit `channelId` plus chat/group-like human title could pass.
- `services/channelTargetMatrixService.js`: matrix did not cover `*:choose_post` screens and lacked exact dangerous fixtures.
- Fix: explicit suspicious title guard, dangerous fixtures, and full choose-channel/choose-post matrix for comments/gifts/buttons/polls/highlights/editor/stats.

## Current waiting state
PR259 is merged. Required now:
1. Wait for deploy/runtime pickup.
2. Check `runtime/startup-log.json` from `runtime-status` and confirm latest runtime head is `c087323dcf38d1a6bbec082efe3b9bbdb496e747`.
3. Confirm production start path and active entrypoint unchanged.
4. Check `runtime/channel-target-matrix.json`, `runtime/process-events.json`, and `runtime/northflank-startup-log.json`.
5. Confirm no repeated startup/restart after PR259 pickup over the check window.
6. Confirm `runtime/push-dispatch-log.json` is not committed on `main` and runtime exports target `runtime-status`.
7. Then manual MAX visual check: root channel list and all post-scoped pickers show only channels, not chats.

Do not mark PR259 fully complete until runtime pickup and manual MAX visual verification pass.
