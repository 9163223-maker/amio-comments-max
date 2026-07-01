# АдминКИТ — current handoff

Updated: 2026-07-01 07:16 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## First action in every new AdminKIT chat
Read this file first from branch `runtime-status`, then check current GitHub state. Continue from GitHub/runtime state, not from memory.

Update this file after major events: new PR/head SHA, CI red/green, audit PASS/BLOCK, merge, deploy/runtime-status, manual MAX result, live mismatch, or process error.

## Core rules
Do not use GitHub `@codex` comments. Do not create a new PR if the existing PR can be updated. Do not merge before final audit-only PASS/waiver. Green CI is not done. Merge is not done. Runtime readiness is not visual UX done.

After a PR is initially created from a requested task:
1. Read this runtime context first.
2. Fetch PR metadata: URL, branch, base, head SHA, mergeable, draft/open state.
3. Check CI for exact head SHA.
4. Inspect PR comments/reviews/review threads.
5. Inspect changed files/diff for code blockers before audit.
6. If code blocker is found, fix in same PR branch or leave a BLOCK review/comment; do not open another PR.
7. Update this runtime context with PR/head/CI/BLOCK/PASS state.
8. Only after code review and green CI, run audit-only PASS/BLOCK against exact head.
9. Do not merge until final audit-only PASS or explicit waiver.

Standard post-audit workflow: confirm exact head and green CI; merge only that head; use repository workflow/runtime diagnostics for delayed 3-4 minute runtime pickup check when available; otherwise poll runtime-status in the same work chain, not a chat automation; verify runtime-status and production contract; produce a server-contract success table; then run/manual request MAX visual check.

Production start path must remain:
`node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`

Active entrypoint must remain:
`clean-entrypoint-1.53.10-pr89.js`

Diagnostics branch: `runtime-status`.

## Product rule
Channel/post features must use only real channels and channel posts. Chats are a separate future product area and must not appear as channel/post targets. Chats should eventually live in a separate chats section marked `скоро`; channel/post features must not use chats as targets.

## PR259 / PR260 / PR261 / PR262
PR259 merge commit: `c087323dcf38d1a6bbec082efe3b9bbdb496e747`.
PR260 merge commit: `cc33ac39aee2817070ea8e65693553d36df103aa`.
PR261 merge commit: `126d3a9d9a841b266337dceecce41d51855b6a3c`.
PR262 squash commit: `bc1e3f548ea65a18644d39335cd93c0f60f42cfb`.
PR262 runtime pickup, production contract, diagnostic export, and product-semantic matrix passed.

## Manual MAX mismatch after PR262 — tenant/channel binding
User visual check on 2026-07-01 06:52 UTC:
- Gifts root correctly shows `Выбрать пост`, `Все подарки`, `Помощь`, `Главное меню`.
- Gifts zero-channel state correctly says to connect a channel and shows `Подключить канал`.
- However, expected channels are not visible for the user; choosing a post says there are no connected channels.

Interpretation:
- PR262 semantic root fix worked.
- New P0/P1 issue: tenant channel ownership/binding is not reliably connected to live user-owned channels.

## PR263 current state
PR263:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/263
- Title: `Tenant channel binding contract and live channel ownership diagnostics`
- Branch: `codex/add-tenant-channel-binding-service`
- Base: `main`
- Base SHA: `bc1e3f548ea65a18644d39335cd93c0f60f42cfb`
- Current head: `bc351f402fe138eedbda3e31797410a0f8ee2977`
- State: open, not merged, not draft.
- Mergeable: true.
- CI: PR regression tests #533, run id `28500114938`, conclusion `success`.
- PR comments/reviews/review threads: no prior comments/reviews when checked.

PR263 intended scope:
- Add `services/tenantChannelBindingService.js`.
- Bind real channels to initiating user's tenant when safe.
- Keep chats out of channel/post targets.
- Export `runtime/tenant-channel-binding-matrix.json`.
- Add `scripts/test-pr263-tenant-channel-binding-contract.js` and wire to npm test / PR workflow.

Initial assistant review BLOCK on 2026-07-01 07:15 UTC:
- GitHub would not allow formal `REQUEST_CHANGES` because the PR belongs to the same owner; assistant left a review COMMENT with explicit `BLOCK`.
- Blocker file: `services/tenantChannelBindingService.js`.
- Reason: `ensureTenantForUser()` creates/upserts an active tenant for any arbitrary `maxUserId` when no tenant exists. `bindChannelForInitiator()` calls it for direct-channel ingest whenever `options.linkedByUserId` is present. A forged/stale/incorrect `linkedByUserId` can create an active tenant with `maxChannels:999` and bind a channel without proving active access, admin bypass, activation code ownership, or an existing tenant/profile.
- Minimal fix required:
  1. `ensureTenantForUser()` must return `ok:false` / `access_required_for_tenant_binding` when no tenant exists and the user is not active/admin/trusted.
  2. Only create/upsert tenant if `access.getAccessState(maxUserId)` proves admin or active access/profile, or if a tightly scoped trusted activation/connect context is provided and tested.
  3. `bindChannelForInitiator()` must not bind for a no-access arbitrary user.
  4. Test must assert no-access arbitrary user cannot create tenant/bind channel.
  5. Test should use real activation flow (`createActivationCode()` + `activateCode()`) for the normal active-user fixture.
- Secondary hardening: `markChannelBotAdminState()` mutates `repository.ns().tenantChannels` and calls `persist()` directly; confirm bot-admin status changes are persisted to Postgres, not only in-memory/store fallback. If not, add repository helper that schedules DB upsert for tenant channel status changes.

Next required action:
1. Fix BLOCK in existing PR263 branch.
2. Re-run CI on new head.
3. Run audit-only only after green CI and no known code blockers.
