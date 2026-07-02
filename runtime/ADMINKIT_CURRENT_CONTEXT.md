# АдминКИТ — current handoff

Updated: 2026-07-02 16:16 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## First action
Read this file first from branch `runtime-status`, then check current GitHub state. Continue from GitHub/runtime state, not from memory.

## Core rules
Do not use GitHub `@codex` comments. Do not create a new PR if the existing PR can be updated. Do not merge before final audit-only PASS or explicit waiver. Green CI is not done. Merge is not done. Runtime readiness is not visual UX done.

Production start path must remain:
`node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`

Active entrypoint must remain:
`clean-entrypoint-1.53.10-pr89.js`

## Product rule
Channel/post features must use only real channels and channel posts. Chats are separate and must not appear as channel/post targets.

MAX classification rule: official evidence only. Use `Chat.type = channel|chat|dialog` and official update/API evidence. Do not classify by title/name/regex, ID sign, link, participants count, owner id, or post count alone. `chat` and `dialog` both normalize to non-channel/chat. `channel` vs non-channel conflict is BLOCK. Unknown official evidence is BLOCK for channel/post flows.

## PR271 — merged and runtime pickup confirmed
PR271:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/271
- Final audited head SHA: `0d68caec0f23490028d329f4148d3356275f97cb`
- Merge commit: `44516658f52c6681d27cc492b16356f6768a42a2`
- Runtime pickup: CONFIRMED. `runtime/startup-log.json` latest `githubMainHeadSha` equals `44516658f52c6681d27cc492b16356f6768a42a2`.
- Active entrypoint remains `clean-entrypoint-1.53.10-pr89.js`.

PR271 live result for MAX user `17507246`:
- `runtime/live-official-channel-resolution.json` exists, runtime `PR271-LIVE-OFFICIAL-CHANNEL-RESOLUTION-1.4`.
- Official resolver succeeded for type evidence: `live-user-postgres-bindings` shows official channels=4, chats=6, unknown=0, block=0.
- Remaining product BLOCK: tenant binding failed because actual `ak_tenants` schema has `owner_user_id NOT NULL`; resolver inserted `owner_max_user_id` but not `owner_user_id`.
- `tenant-section-matrix` and live tenant diagnostic still show tenant missing and picker includes stale/incorrect rows, including rows that official resolver identified as chats. No manual MAX PASS.

## Current PR272 — open, latest CI green, re-audit required
PR272:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/272
- Title: `PR272: Service diagnostics and official channel picker`
- Branch: `codex/pr272-tenant-schema-picker-official-channel`
- Base: `main`
- Base SHA: `44516658f52c6681d27cc492b16356f6768a42a2`
- Current head SHA: `f00ac4212ecb128b2f8dceee4c4b16ff9b11fb43`
- CI: `PR regression tests`, run `674`, exact-head success.
- Artifact: `adminkit-ci-diagnostics`, id `8044780040`, digest `sha256:77dff833169148c6d0315d8d2c0bd81fec0cf871697a466b1583d636ca74a2dd`.
- PR state: open, not merged, mergeable true.
- Audit: previous PASS was for old head `b3566e648fbbe344b4ba583aec422a1072d4a0ef`; NOT valid for current head.
- Changed files: `cc5-db-core.js`, `clean-bot-campaign-attribution-cc8336.js`, `services/liveOfficialChannelResolutionService.js`, `scripts/test-pr272-service-diagnostic-and-official-picker.js`, `package.json`.

Why PR272 was not merged after previous PASS:
- After the audit PASS for `b3566e648...`, a new PR review P1 appeared: existing clean-core `ak_users` rows may have `user_id != MAX_ID` with `max_user_id=MAX_ID`; inserting fallback `ak_users(user_id=MAX_ID,max_user_id=MAX_ID)` can hit the unique `max_user_id` constraint and set wrong `owner_user_id`.
- Merge was stopped according to process.

Latest PR272 fixes:
- `existingUserIdForMaxUserId(maxUserId)` looks up existing `ak_users.user_id` by `max_user_id`.
- `ak_tenants.owner_user_id` uses the existing clean-core `ak_users.user_id`, not raw MAX ID, when available.
- `upsertTenantUser()` first updates an existing `ak_users` row by `max_user_id`; only if no row exists does it insert fallback.
- This should avoid `ak_users.max_user_id` unique conflicts and preserve clean-core user identity.

PR272 existing implementation:
- `/akdiag <MAX_ID>` in `clean-bot-campaign-attribution-cc8336.js`, gated to service admins and masked output.
- `liveOfficialChannelResolutionService` supports owner_user_id-only clean-core schema and legacy schemas with extra columns through dynamic column checks.
- Tenant bootstrap dynamically checks columns before writing `owner_user_id`, `owner_max_user_id`, `plan_id`, `max_channels`, `source`, `metadata`, and `settings_json`; it must not reference missing columns.
- Tenant user bootstrap supports both `ak_tenant_users` and clean-core `ak_users` when present.
- DB-backed picker path in `cc5-db-core.getChannels()` returns only official channel rows with `c.raw->>'type'='channel'` and `c.raw->>'resolution_status'='ok'`.
- `cc5-db-core` forwarded channel/post extraction was restored from PR271 base logic; forwarded channel/post IDs must not regress.
- `cc5-db-core.upsertChannel()` calls `upsertAdmin()` before writing `ak_admin_channels`, avoiding FK violation for direct calls like verify-access/saveRules.
- Adds smoke test `scripts/test-pr272-service-diagnostic-and-official-picker.js` to npm test.

Known process note:
- During PR272 work, temp/note files were accidentally created on PR branch only and branch was force-reset back to clean commits. Compare now shows only intended files. This did not touch `main`, but it is a process mistake and should not repeat.

## Next required action
Run final audit-only PASS/BLOCK for PR272 at exact head `f00ac4212ecb128b2f8dceee4c4b16ff9b11fb43`. Do not merge until audit PASS or explicit waiver.

Audit focus for PR272:
- Previous P1 `Handle existing ak_users rows by max_user_id` is fixed.
- Existing `ak_users` row with `user_id != MAX_ID`, `max_user_id=MAX_ID` is reused for `owner_user_id` and updated by `max_user_id`, avoiding unique conflicts.
- `/akdiag <MAX_ID>` works in test group/private chat but is gated to service admins.
- `/akdiag` output masks IDs and does not leak raw IDs beyond explicit operator input.
- DB-backed channel picker cannot show official `chat`/`dialog` or unresolved rows.
- Tenant bootstrap works with owner_user_id-only clean-core schema and legacy schemas with owner_max_user_id/plan_id/max_channels/source/metadata.
- Tenant bootstrap does not reference missing columns.
- Tenant user bootstrap is safe for both `ak_tenant_users` and `ak_users`.
- Forwarded channel/post extraction remains intact.
- `upsertChannel()` creates admin row before `ak_admin_channels` FK link.
- SQL remains parameterized.
- Production start path and active entrypoint unchanged.
- No temp/note files remain in diff.

After audit PASS, merge exact head only, then wait/check runtime pickup and live matrices before reporting manual readiness.

## Process error recorded
Earlier PR268 preparation accidentally created/deleted temporary files in `main` history. Final tree was clean and audits found no runtime path damage, but this remains a process violation and must not be repeated.
