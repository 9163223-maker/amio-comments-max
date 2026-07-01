# АдминКИТ — current handoff

Updated: 2026-07-01 06:56 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## First action in every new AdminKIT chat
Read this file first from branch `runtime-status`, then check current GitHub state. Continue from GitHub/runtime state, not from memory.

Update this file after major events: new PR/head SHA, CI red/green, audit PASS/BLOCK, merge, deploy/runtime-status, manual MAX result, live mismatch, or process error.

## Core rules
Do not use GitHub `@codex` comments. Do not create a new PR if the existing PR can be updated. Do not merge before final audit-only PASS/waiver. Green CI is not done. Merge is not done. Runtime readiness is not visual UX done.

Standard post-audit workflow: confirm exact head and green CI; merge only that head; use repository workflow/runtime diagnostics for the delayed 3-4 minute runtime pickup check when available; otherwise poll runtime-status in the same work chain, not a chat automation; verify runtime-status and production contract; produce a server-contract success table; then run/manual request MAX visual check.

Production start path must remain:
`node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`

Active entrypoint must remain:
`clean-entrypoint-1.53.10-pr89.js`

Diagnostics branch: `runtime-status`.

## Product rule
Channel/post features must use only real channels and channel posts. Chats are a separate future product area and must not appear as channel/post targets. Chats should eventually live in a separate chats section marked `скоро`; channel/post features must not use chats as targets.

## PR259 / PR260 / PR261
PR259 merge commit: `c087323dcf38d1a6bbec082efe3b9bbdb496e747`.
PR260 merge commit: `cc33ac39aee2817070ea8e65693553d36df103aa`.
PR261 merge commit: `126d3a9d9a841b266337dceecce41d51855b6a3c`.
PR261 runtime pickup and diagnostics passed.

## PR262 status
PR262:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/262
- Title: `Product-semantic flow contracts and gifts lifecycle gate`
- Final head: `88971d9eb82665499a6205df5cd3fb764f26996c`
- CI: PR regression tests #530, run id `28478999226`, conclusion `success`.
- Audit-only: PASS shown by user screenshot on 2026-07-01 06:20 UTC.
- Merge method: squash merge.
- Merged at: 2026-07-01 06:43:35 UTC.
- Main squash commit: `bc1e3f548ea65a18644d39335cd93c0f60f42cfb`.

PR262 runtime check:
- Runtime pickup PASS for main squash commit `bc1e3f548ea65a18644d39335cd93c0f60f42cfb`.
- Production contract PASS.
- Diagnostic export PASS.
- Product-semantic matrix PASS with 0 BLOCKs.

## Manual MAX mismatch after PR262 — tenant/channel binding
User visual check on 2026-07-01 06:52 UTC:
- Gifts root now correctly shows `Выбрать пост`, `Все подарки`, `Помощь`, `Главное меню`.
- Gifts zero-channel state now says to connect a channel and shows `Подключить канал`.
- However, expected channels are not visible for the user; choosing a post says there are no connected channels.

Interpretation:
- PR262 semantic root fix worked.
- New P0/P1 issue: tenant channel ownership/binding is not reliably connected to live user-owned channels.
- Current code has tenant access tables and `clientAccessService.getClientChannels(maxUserId)` merging tenant channels, profile channels, and store channels linked by `linkedByUserId` / `ownerUserId`.
- Current direct channel post ingest saves posts/channels with `linkedByUserId: senderId(msg)`, but if MAX channel post update lacks the admin sender user id, the channel can be saved without a tenant owner link.
- `recordAudienceWebhook()` currently records channel title/audience events but does not bind the channel to a tenant owner.
- `channel-post-picker-core` only shows channels from access/db scoped sources; if tenant binding is missing, channel pickers show zero channels even though the bot is admin in the channel.

Next required task:
Open PR263 for tenant channel binding contract and runtime diagnostic.
Scope:
1. Add server-side tenant binding contract/service that binds a channel to the initiating max user tenant when a user completes connect flow, forwards/syncs a channel post, or the bot receives a direct channel post with resolvable initiating admin context.
2. Keep chats separate: chat-like records must not bind as channel targets; future chats section may show chats as `скоро` only.
3. Add runtime diagnostic `runtime/tenant-channel-binding-matrix.json` showing known tenant, visible channels, DB tenant channels, store linked channels, missing bindings, suspicious chats excluded, and bot-admin proof when available.
4. Add tests proving: activation creates tenant; channel connect/forward/direct post binds tenant channel; bound channels appear in `listUiChannelsForUser`; posts appear only for bound channel; unbound chats do not appear; stale binding is marked inactive only when bot-admin proof is false or bot removed event is received.
5. Wire test into npm test and PR regression workflow.
