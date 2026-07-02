# АдминКИТ — current handoff

Updated: 2026-07-02 15:05 UTC
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
- `live-official-channel-resolution` unresolved rows report `null value in column "owner_user_id" of relation "ak_tenants" violates not-null constraint`.
- `tenant-section-matrix` and live tenant diagnostic still show tenant missing and picker includes stale/incorrect rows, including rows that official resolver identified as chats. No manual MAX PASS.

## Current PR272 — open, CI green, audit needed
PR272:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/272
- Title: `PR272: Service diagnostics and official channel picker`
- Branch: `codex/pr272-tenant-schema-picker-official-channel`
- Base: `main`
- Base SHA: `44516658f52c6681d27cc492b16356f6768a42a2`
- Head SHA: `893ea7aa94efb8506c8a2d22a8e2aad7267d5d20`
- CI: `PR regression tests`, run `664`, exact-head success.
- Artifact: `adminkit-ci-diagnostics`, id `8042883260`, digest `sha256:498bfb15aac3b88da9fa535a745ca75333caa4e50024dc36c69b147861109e23`.
- PR state: open, not merged, mergeable true.
- Audit: NOT RUN yet.
- Changed files: `cc5-db-core.js`, `clean-bot-campaign-attribution-cc8336.js`, `services/liveOfficialChannelResolutionService.js`, `scripts/test-pr272-service-diagnostic-and-official-picker.js`, `package.json`.

PR272 implementation:
- `liveOfficialChannelResolutionService` now supports actual `ak_tenants.owner_user_id` schema and also checks owner columns dynamically.
- Tenant bootstrap inserts `owner_user_id` and `owner_max_user_id` when `owner_user_id` exists, avoiding the PR271 runtime NOT NULL failure.
- DB-backed picker path in `cc5-db-core.getChannels()` now returns only rows with official `c.raw->>'type'='channel'` and `c.raw->>'resolution_status'='ok'`; official chats/dialogs and unresolved records do not enter channel/post picker through this DB path.
- Adds service slash command `/akdiag <MAX_ID>` in `clean-bot-campaign-attribution-cc8336.js`.
- `/akdiag` can be used in the test group or private chat, but only by service admins from `ADMINKIT_SERVICE_DIAGNOSTIC_ADMIN_IDS` or existing admin envs.
- `/akdiag` returns selected-client tenant/picker diagnostic with masked requester and target IDs.
- Adds smoke test `scripts/test-pr272-service-diagnostic-and-official-picker.js` to npm test.

Known self-sweep note:
- During PR272 work, a temporary branch note and tmp file were accidentally created on the PR branch only, then the branch was force-reset back to clean head `893ea7aa94efb8506c8a2d22a8e2aad7267d5d20`; compare now shows only intended files. This did not touch `main`, but it is a process mistake and should not repeat.
- Self-sweep found a likely typo in `cc5-db-core.js`: `updated_at as "UpdatedAt"` should remain `updatedAt`. CI did not catch it. Fix before final audit if not already fixed.

## Next required action
Fix the `UpdatedAt` alias if still present, rerun exact-head CI, then final audit-only PASS/BLOCK for PR272. Do not merge until audit PASS or explicit waiver.

Audit focus for PR272:
- `/akdiag <MAX_ID>` works in test group/private chat but is gated to service admins.
- `/akdiag` does not leak raw IDs beyond the explicit input; outputs masked IDs.
- DB-backed channel picker cannot show official `chat`/`dialog` or unresolved rows.
- Tenant bootstrap works with `owner_user_id NOT NULL` schema and does not break schemas that also have `owner_max_user_id`.
- SQL remains parameterized.
- Production start path and active entrypoint unchanged.
- No temp/note files remain in diff.

## Process error recorded
Earlier PR268 preparation accidentally created/deleted temporary files in `main` history. Final tree was clean and audits found no runtime path damage, but this remains a process violation and must not be repeated.
