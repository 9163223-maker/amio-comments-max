# АдминКИТ — current handoff

Updated: 2026-06-30 09:55 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## First action in every new AdminKIT chat
Read this file first from branch `runtime-status`, then check current GitHub state. Continue from GitHub/runtime state, not from memory.

Update this file after major events: new PR/head SHA, CI red/green, audit PASS/BLOCK, merge, deploy/runtime-status, manual MAX result, live mismatch, or process error.

## Core working rules
Assistant is the technical executor: inspect PRs, CI, logs, fixes, repeat until green. Do not use the user as a continue button.

Do not use GitHub `@codex` comments. Do not create a new PR if the existing PR can be updated. Do not merge before final audit-only PASS/waiver. Green CI is not done. Merge is not done. Runtime readiness is not visual UX done.

After PR257 process error: even urgent hotfixes stop after green CI and require audit-only Codex PASS/BLOCK unless the user explicitly waives audit.

## Production/runtime contract
Production start path must remain exactly:
`node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`

Active entrypoint must remain:
`clean-entrypoint-1.53.10-pr89.js`

Diagnostics/status branch: `runtime-status`.

Runtime files: `runtime/startup-log.json`, `runtime/root-menu-live-parity-trace.json`, `runtime/manual-ui-walkthrough-trace.json`, `runtime/ADMINKIT_CURRENT_CONTEXT.md`.

## Product context
AdminKIT is a MAX admin system: bot + web/PWA + admin flows for channel owners.

Main product rule for current work: channel/post features must use only real channels and channel posts. Chats are a separate future product area and must not appear as post targets.

Applies to comments, gifts, buttons, polls, highlights, post editor, and post-level stats.

Expected channel/post UX:
- one eligible channel: skip channel picker and show post list with `Канал: <title>` and `Выберите пост`;
- multiple eligible channels: show channel picker;
- zero eligible channels: show clean empty state with `Подключить канал` and `Главное меню`;
- chat-like records must never appear in channel/post pickers.

## Completed background
PR256 implemented RootSectionDispatcher v2 and merged into `main` at 2026-06-29 10:02 UTC, merge commit `ad38d310ece323d5e0adb2583b12f904043bcc91`.

PR257 fixed remaining Gifts root 500. PR257 merged at 2026-06-29 10:31 UTC, merge commit `8c3b94e5e5d5389da7541cfb9a4505113fedb220`. Runtime pickup passed and user visually confirmed Gifts opens. Process error: assistant merged after green CI without final audit-only Codex task; do not repeat.

## PR258 final state — 2026-06-30 09:55 UTC
PR258:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/258
- Title: `Separate chats from channel/post pickers and normalize root menu UX`
- Final PR head: `a1473b23475839fdfa2a91c3c561aef2fab0d1f1`
- CI for final head: PR regression tests run #476, run id `28434739881`, conclusion `success`.
- Audit-only: PASS, confirmed by user screenshot at 2026-06-30 09:50 UTC.
- Merged into `main` at 2026-06-30 09:51 UTC.
- Merge commit: `50b43a4524ed8009c48cd5c2ad710f2d027a7f66`.

PR258 changes:
- strict channel/chat separation in shared picker `channel-post-picker-core.js`;
- helper logic in `human-channel-title-helper.js`;
- one/multiple/zero channel UX in post-scoped flows where already wired;
- root UX cleanup;
- clean stats root;
- CI diagnostics layer in PR regression workflow;
- restored meaningful stats product regression test;
- active `clean-bot-channel-first-post-picker-pr90.js` patches `services/clientAccessService.getClientChannels` before loading preserved legacy implementation;
- patch uses shared predicates `channel-post-picker-core.isChatLikeRecord` and `channel-post-picker-core.isKnownChannelRecord`;
- previous legacy implementation preserved as `clean-bot-channel-first-post-picker-pr90-legacy.js`;
- `scripts/test-channel-chat-separation-menu-ux.js` includes wrapper-level regression coverage for one/multiple/zero channel states, stats source path, and editor/posts source path;
- PR229 manual cost marker preserved in active wrapper with `STATS_MANUAL_COST_TEXT_INPUT_CONTRACT = 'stats_manual_cost_text_input'`.

Latest BLOCK fixed:
- `clean-bot-channel-first-post-picker-pr90.js` could still show chat-like records as channels.
- Final fix on merged code: active wrapper installs strict client-channel patch using shared predicates before legacy wrapper load.

## Runtime/deploy pickup — 2026-06-30 09:55 UTC
Runtime pickup confirmed from `runtime/startup-log.json` in `runtime-status`:
- latest startup updatedAt: `2026-06-30T09:52:04.899Z`;
- latest startedAt: `2026-06-30T09:51:31.206Z`;
- latest `githubMainHeadSha`: `50b43a4524ed8009c48cd5c2ad710f2d027a7f66`;
- `githubMainHeadVerifiedByStartupLog`: true;
- `commitSource`: `github-main-head`;
- production entrypoint: `clean-entrypoint-1.53.10-pr89.js`;
- runtime contract `contractLiveOk`: true;
- startupPath activeEntrypoint: `clean-entrypoint-1.53.10-pr89.js`;
- startupPath ok: true;
- final runtime readiness gate ok: true;
- missing readiness keys: empty list;
- readyForManualMaxTest: true.

Main `package.json` on `main` confirms start script unchanged:
`node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`.

`runtime/root-menu-live-parity-trace.json` and `runtime/manual-ui-walkthrough-trace.json` are present and ok=true, but their latest traces are from 2026-06-29 before PR258 merge, so they do not count as fresh PR258 manual MAX visual verification.

## Current waiting state
Server-side completion is satisfied through runtime pickup and production contract. Remaining required step is manual MAX visual verification after PR258 merge:
- channel/post pickers show only channels;
- chats are not offered as post targets;
- one eligible channel skips channel picker and shows `Канал: <title>` / `Выберите пост`;
- multiple channels show channel picker;
- zero channels show clean empty state with `Подключить канал` and `Главное меню`.

## Completion definition
PR258 is fully complete only after manual MAX visual verification passes. Server-side readiness is complete.
