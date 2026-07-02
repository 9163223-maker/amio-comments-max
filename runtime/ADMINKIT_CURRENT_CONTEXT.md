# АдминКИТ — current handoff

Updated: 2026-07-02 17:32 UTC
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

## PR272 — merged, runtime pickup confirmed, live gate BLOCK
PR272:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/272
- Final audited head SHA: `f00ac4212ecb128b2f8dceee4c4b16ff9b11fb43`
- Merge commit: `933ca0c89a71f67c9f8e640e8775084f5d02ff4a`
- Runtime pickup: CONFIRMED. `runtime/startup-log.json` latest `githubMainHeadSha` equals `933ca0c89a71f67c9f8e640e8775084f5d02ff4a`.
- Production start path and active entrypoint contract remain OK.
- `runtime/live-official-channel-resolution.json` is OK with runtime `PR272-LIVE-OFFICIAL-CHANNEL-RESOLUTION-SCHEMA-SAFE-1.2`: resolvedChannels=4, resolvedNonChannels=3, unresolved=0, blockCount=0.
- Product improvement: official resolver bound 4 channel rows for MAX user `17507246`; chats are separated as non-channels.
- Live gate remains BLOCK because `runtime/live-tenant-self-diagnostic-matrix.json` still shows `tenant_missing_for_active_user`, `knownTenant=false`, `tenantChannelsCount=0`, while pickerChannelsCount=4.
- `runtime/tenant-section-matrix.json` likewise remains `ok:false` only because diagnostic summary says knownTenant=false; picker has the 4 official channels.

Root cause after PR272:
- `services/liveTenantSelfDiagnosticService.js` still used legacy `access.getTenantByMaxUserId(userId)` / `clientAccessRepository.getTenantByUserId()`.
- That legacy path reads old `ak_tenants.owner_max_user_id` / `ak_tenant_users`, but does not resolve clean-core `ak_users.max_user_id -> tenant_id`.
- Therefore PR272 binding can be present and picker can be correct, while old live self-diagnostic falsely blocks as missing tenant.

## Current PR273 — open, CI pending
PR273:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/273
- Title: `PR273: Clean-core tenant lookup for live diagnostics`
- Branch: `codex/pr273-live-tenant-diagnostic-clean-core-lookup`
- Base: `main`
- Base SHA: `933ca0c89a71f67c9f8e640e8775084f5d02ff4a`
- Current head SHA: `aa0cd595c864b1ad21f5e60dea9a4165e1360393`
- PR state: open, not merged, mergeable true.
- CI: pending/not yet reported when this file was updated.
- Changed files: `services/liveTenantSelfDiagnosticService.js`, `scripts/test-pr273-live-tenant-diagnostic-clean-core.js`, `package.json`.

PR273 intent:
- Fix false live diagnostic BLOCK after PR272 by adding direct schema-safe Postgres lookup to `liveTenantSelfDiagnosticService`.
- Resolve tenant through:
  - `ak_tenant_users.max_user_id -> tenant_id` when present;
  - `ak_users.max_user_id -> tenant_id` for clean-core;
  - `ak_tenants.owner_max_user_id` legacy;
  - `ak_tenants.owner_user_id` using `ak_users.user_id` resolved from MAX ID.
- Read `ak_tenant_channels` directly when legacy repository cache is empty.
- Keep IDs masked in diagnostic output.
- Add `scripts/test-pr273-live-tenant-diagnostic-clean-core.js` and include it in `npm test`.

PR273 process note:
- A temporary marker file `runtime/PR273_NOTE.tmp` was accidentally created and then deleted on the PR273 branch only. This did not touch `main`. Final compare against base shows only intended files, but branch history includes the create/delete mistake. Do not repeat.
- An attempt to force-clean branch history by resetting and reapplying the large service file via content API was blocked by the connector safety layer; branch was restored to the clean-tree head `aa0cd595...`.

## Next required action
Wait for PR273 exact-head CI for `aa0cd595c864b1ad21f5e60dea9a4165e1360393`.

If CI fails:
- inspect logs;
- fix same PR273 branch;
- update runtime-status;
- rerun CI.

If CI succeeds:
- inspect PR state/comments/diff;
- request/send audit-only prompt for PR273;
- do not merge without audit PASS.

PR273 audit focus:
- Does clean-core `ak_users(max_user_id, tenant_id)` make live self diagnostic knownTenant=true?
- Does it avoid false `tenant_missing_for_active_user` for active/admin users with clean-core tenant rows?
- Does it avoid raw MAX ID leakage in diagnostic JSON/text?
- Are SQL values parameterized and dynamic column names hardcoded/checked?
- Does it preserve production start path and active entrypoint?
- Does final diff contain only intended files despite branch process mistake?

After PR273 merge later, runtime must be checked again. Manual MAX PASS only after live matrices are green.

## Earlier context
PR271 merged and runtime pickup was confirmed at merge commit `44516658f52c6681d27cc492b16356f6768a42a2`.

## Process error recorded
Earlier PR268 preparation accidentally created/deleted temporary files in `main` history. Final tree was clean and audits found no runtime path damage, but this remains a process violation and must not be repeated.
