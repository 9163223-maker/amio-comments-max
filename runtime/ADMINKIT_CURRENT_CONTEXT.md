# АдминКИТ — current handoff

Updated: 2026-06-30 15:05 UTC
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
- Current head: `1d2836524e9b5e5198e3d3c44f0fb5c43e66b24c`
- Open, not merged.
- Mergeable: true at latest check.
- GitHub computed merge commit candidate: `aa353c50d0709cc147238725dcee5b681279b788`.
- CI for current head: waiting/check next. No audit-only yet.

What changed since previous checkpoint:
- Assistant created a merge commit inside the PR259 branch, not into `main`.
- First parent: previous PR259 head `ef52142f6161e984c0bd1220f537e0089fde2d97`.
- Second parent: current `main` head `827e517e6e72a20026420615bbfd1ff15f7c9892`.
- This resolved the behind/diverged branch state while preserving PR259 tree and runtime-log deletion.

PR259 changes:
- root `channels:list` and post-scoped choose-channel routes use shared channel predicate;
- sync and async channel route hydration are filtered;
- runtime export guard refuses `main` and limits exports to `runtime/*.json`;
- runtime push dispatch exports are routed through the guard;
- committed runtime push log is removed;
- channel target matrix, process events, and Northflank startup scaffold services are added;
- startup bootstrap exports these diagnostics;
- PR259 tests are added and now included in `npm test`.

Assistant follow-up already applied:
- `channel-post-picker-core.isKnownChannelRecord()` was hardened so explicit `channelId` alone is no longer enough. It now needs explicit channel type, `isChannel`, trusted tenant/channel source metadata, or stored post evidence.
- PR259 matrix fixtures/tests now cover dangerous explicit-channel-id records without channel metadata.
- PR259 tests were added to `npm test` because the workflow did not call them directly.

Remaining before audit-only:
1. Check PR regression CI for head `1d2836524e9b5e5198e3d3c44f0fb5c43e66b24c`.
2. If CI red, inspect diagnostics artifact and fix in the same PR branch.
3. If CI green, prepare audit-only PASS/BLOCK prompt.

Do not merge PR259 until CI green and audit-only PASS.
