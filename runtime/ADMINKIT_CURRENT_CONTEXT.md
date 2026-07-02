# АдминКИТ — current handoff

Updated: 2026-07-02 17:12 UTC
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
- Remaining product BLOCK before PR272: tenant binding failed because actual `ak_tenants` schema has `owner_user_id NOT NULL`; resolver inserted `owner_max_user_id` but not `owner_user_id`.
- `tenant-section-matrix` and live tenant diagnostic still showed tenant missing and picker included stale/incorrect rows before PR272. No manual MAX PASS yet.

## PR272 — merged, runtime pickup pending
PR272:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/272
- Title: `PR272: Service diagnostics and official channel picker`
- Branch: `codex/pr272-tenant-schema-picker-official-channel`
- Base: `main`
- Base SHA: `44516658f52c6681d27cc492b16356f6768a42a2`
- Final audited head SHA: `f00ac4212ecb128b2f8dceee4c4b16ff9b11fb43`
- CI: `PR regression tests`, run `674`, exact-head success.
- Artifact: `adminkit-ci-diagnostics`, id `8044780040`, digest `sha256:77dff833169148c6d0315d8d2c0bd81fec0cf871697a466b1583d636ca74a2dd`.
- Audit: PASS for exact head `f00ac4212ecb128b2f8dceee4c4b16ff9b11fb43`; previous P1 `Handle existing ak_users rows by max_user_id` fixed.
- Merge: DONE.
- Merge commit: `933ca0c89a71f67c9f8e640e8775084f5d02ff4a`.
- Runtime pickup: PENDING. Do not report manual MAX readiness until `runtime/startup-log.json` confirms `githubMainHeadSha=933ca0c89a71f67c9f8e640e8775084f5d02ff4a` and live matrices are checked.

PR272 implementation:
- `/akdiag <MAX_ID>` in `clean-bot-campaign-attribution-cc8336.js`, gated to service admins and masked output.
- `liveOfficialChannelResolutionService` supports owner_user_id-only clean-core schema and legacy schemas with extra columns through dynamic column checks.
- `existingUserIdForMaxUserId(maxUserId)` looks up existing `ak_users.user_id` by `max_user_id`.
- `ak_tenants.owner_user_id` uses the existing clean-core `ak_users.user_id`, not raw MAX ID, when available.
- `upsertTenantUser()` first updates an existing `ak_users` row by `max_user_id`; only if no row exists does it insert fallback, avoiding duplicate `max_user_id` conflicts.
- Tenant user bootstrap supports both `ak_tenant_users` and clean-core `ak_users` when present.
- DB-backed picker path in `cc5-db-core.getChannels()` returns only official channel rows with `c.raw->>'type'='channel'` and `c.raw->>'resolution_status'='ok'`.
- `cc5-db-core` forwarded channel/post extraction was restored from PR271 base logic; forwarded channel/post IDs must not regress.
- `cc5-db-core.upsertChannel()` calls `upsertAdmin()` before writing `ak_admin_channels`, avoiding FK violation for direct calls like verify-access/saveRules.
- Adds smoke test `scripts/test-pr272-service-diagnostic-and-official-picker.js` to npm test.

Known process note:
- During PR272 work, temp/note files were accidentally created on PR branch only and branch was force-reset back to clean commits. Compare showed only intended files. This did not touch `main`, but it is a process mistake and should not repeat.

## Next required action
Wait/check Northflank/runtime pickup for merge commit `933ca0c89a71f67c9f8e640e8775084f5d02ff4a`.

Post-merge checks:
- `runtime/startup-log.json` latest `githubMainHeadSha` must equal `933ca0c89a71f67c9f8e640e8775084f5d02ff4a`.
- Production start path remains `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`.
- Active entrypoint remains `clean-entrypoint-1.53.10-pr89.js`.
- `runtime/live-official-channel-resolution.json` runtime should update to PR272 runtime and resolve/bind official channels for MAX user `17507246`.
- `runtime/live-tenant-self-diagnostic-matrix.json` and `runtime/tenant-section-matrix.json` should no longer show tenant missing or chat rows in channel/post picker.
- `/akdiag <MAX_ID>` should be usable only by service admin and show masked IDs.
- If runtime pickup or live matrices fail, update this file with BLOCK and do not ask for manual MAX PASS.

After runtime PASS, manual MAX check should verify: `/tenant`, Channels, Account, Comments, Gifts, Buttons, Polls, Highlights, Editor show only real live channels/posts, no chats.

## Process error recorded
Earlier PR268 preparation accidentally created/deleted temporary files in `main` history. Final tree was clean and audits found no runtime path damage, but this remains a process violation and must not be repeated.
