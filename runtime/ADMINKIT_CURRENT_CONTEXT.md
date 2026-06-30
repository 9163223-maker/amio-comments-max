# АдминКИТ — current handoff

Updated: 2026-06-30 10:12 UTC
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

## Product rule
Channel/post features must use only real channels and channel posts. Chats are a separate future product area and must not appear as channel/post targets. Applies to root channel management visibility and all post-scoped flows.

Expected UX:
- one eligible channel: skip channel picker and show post list with `Канал: <title>` and `Выберите пост`;
- multiple eligible channels: show channel picker;
- zero eligible channels: show clean empty state with `Подключить канал` and `Главное меню`;
- chat-like records must never appear in channel/post pickers or `Каналы -> Мои каналы`.

## PR258 status
PR258 was merged into `main` at 2026-06-30 09:51 UTC.
- Final PR head: `a1473b23475839fdfa2a91c3c561aef2fab0d1f1`.
- CI: PR regression tests #476 success.
- Audit-only: PASS confirmed by user screenshot.
- Merge commit: `50b43a4524ed8009c48cd5c2ad710f2d027a7f66`.

PR258 fixed the previous audit BLOCK in `clean-bot-channel-first-post-picker-pr90.js` by installing a strict client-channel patch before loading the preserved legacy wrapper. It also added wrapper-level tests for post-scoped comments/stats/editor paths.

## Runtime/deploy pickup and restart finding
Runtime pickup was confirmed from `runtime/startup-log.json` after merge:
- first post-merge startup: `2026-06-30T09:51:31.206Z`, head `50b43a4524ed8009c48cd5c2ad710f2d027a7f66`;
- later startup: `2026-06-30T09:54:06.123Z`, head `86fe30ce4661d5d0c6cb82aa075c0264dd2a4d04`;
- production entrypoint remains `clean-entrypoint-1.53.10-pr89.js`;
- runtime contract remains live OK;
- startupPath remains OK.

Important new process finding: `runtime/push-dispatch-log.json` is present on `main`, and commit `86fe30ce4661d5d0c6cb82aa075c0264dd2a4d04` updates that runtime log. Runtime diagnostic writes to `main` can trigger redeploy loops or confusing main-head pickup. This must be fixed: runtime diagnostics must write only to `runtime-status` or an external log sink, never to `main`.

## Live manual mismatch — 2026-06-30 10:02 UTC
User manually opened MAX after PR258 merge. Observations:
- initial mini-app open showed MAX toast `Не удалось открыть мини-приложение`;
- main bot menu opened;
- `Каналы -> Мои каналы` showed chat-like entries including `Все свои MAX` and `Саша - сын Мамочки 🌸`.

Conclusion: PR258 is NOT fully complete. Runtime pickup is OK, but product goal is not fully achieved because root channel management still leaks chats.

## Root cause from code inspection
The PR258 matrix missed `Каналы -> Мои каналы` as a separate server-side route.

Current main code shows:
- `features/menu-v3/adapter.js` local `isConfirmedChannel()` returns true when `type` is empty, `type === 'channel'`, or `isChannel === true`.
- `channelsList(context)` filters only with this weak local predicate.
- `v3-menu-core-1539.js` hydrates channel routes through `syncChannelsForUser(userId)`, which currently returns `clientAccess.getClientChannels(userId)` raw for sync rendering, while async rendering can use `channel-post-picker-core.listUiChannelsForUser`.

This creates a false-positive server contract: startup contract says channelsList provider is shared picker, but the real sync route can still pass weakly filtered raw client access records into `channels:list`.

## Required next task
Open a new PR, because PR258 is already merged. Suggested title:
`PR259 — Channel root matrix and runtime export safety`

Required scope:
1. Fix `Каналы -> Мои каналы` so it uses the same strict eligible-channel source/predicate as post-scoped pickers.
2. Remove/replace weak `features/menu-v3/adapter.js::isConfirmedChannel()` behavior for root channel list.
3. Ensure sync and async route hydration are equivalent for channel routes.
4. Add a server-side matrix test that covers main root, channels:home, channels:list, comments/gifts/buttons/polls/highlights/editor/stats post pickers.
5. Matrix fixtures must include real channels and chat-like/ambiguous records.
6. Matrix must fail if any chat-like fixture appears in any channel/post target screen.
7. Add runtime/live diagnostic export for the matrix result.
8. Fix runtime diagnostics export so no runtime log writes to `main`; all runtime JSON exports must go to `runtime-status` or external sink only.
9. Add branch-safety tests/guards: diagnostic export must fail closed if target branch resolves to `main`.
10. Add or document Northflank startup/build log collection for crashes before Node app starts.

Do not merge PR259 without CI green and audit-only PASS.
