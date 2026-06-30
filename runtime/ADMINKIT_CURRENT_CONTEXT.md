# АдминКИТ — current handoff

Updated: 2026-06-30 15:22 UTC
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
- Current head: `6336c017f1d919f22634060e0267605a3ce6c88e`
- Open, not merged.
- Mergeable: true at latest check.
- GitHub computed merge commit candidate: `b0e5189576a950646d172699463bf42e0b0cdd09` at latest PR info check.
- CI: PR regression tests #492, run id `28455318528`, conclusion `success`.
- Audit-only: pending. Do not merge yet.

What changed in PR259:
- root `channels:list` and post-scoped choose-channel routes use shared channel predicate;
- sync and async channel route hydration are filtered;
- runtime export guard refuses `main` and limits exports to `runtime/*.json`;
- runtime push dispatch exports are routed through the guard;
- committed runtime push log is removed from PR tree;
- channel target matrix, process events, and Northflank startup scaffold services are added;
- startup bootstrap exports these diagnostics;
- PR259 tests are added and included in `npm test`.

Assistant follow-up applied:
- Created a merge commit inside the PR259 branch, not into `main`, to bring it up to current `main` while preserving PR259 changes and runtime-log deletion.
- Hardened `channel-post-picker-core.isKnownChannelRecord()` so explicit `channelId` alone is no longer enough. A record needs explicit channel type, `isChannel`, trusted tenant/source/owner evidence, channel-like title evidence, or stored post evidence. Chat-like metadata is rejected first.
- PR259 matrix fixtures/tests cover dangerous explicit-channel-id records without channel metadata.
- PR259 tests were added to `npm test` because the workflow did not call them directly.
- Fixed CI regressions from #484, #486, #488, and #490 without weakening old regression intent.

CI red history during PR259 follow-up:
- #484: `test-channels-tenant-hydration-pr193a` failed; fixed tenant storage channel evidence.
- #486: `test-v3-channels-list-hydration-pr194` failed; fixed test stub compatibility with shared predicate.
- #488: PR229 stats shared-picker target failed; fixed stats target trust for `channel_post_picker` provider.
- #490: PR126 buttons/gifts channel picker missed empty tenant channel; fixed linked/owner channel evidence while keeping chat-like metadata blocked.
- #492: green.

Next required action:
1. Run audit-only PASS/BLOCK for PR259 head `6336c017f1d919f22634060e0267605a3ce6c88e`.
2. If audit BLOCK, fix exact blocker in existing PR259 branch.
3. If audit PASS, merge PR259 with expected head SHA.
4. After merge, verify deploy/runtime pickup and production contract.
5. Then manual MAX visual check: `Каналы -> Мои каналы` and all post-scoped pickers show only channels, not chats.

Do not merge PR259 until audit-only PASS.
