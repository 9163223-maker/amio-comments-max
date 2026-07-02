# АдминКИТ — current handoff

Updated: 2026-07-02 11:52 UTC
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

## PR270 runtime result
PR270 merged and runtime pickup confirmed at merge commit `383a03fc6c45d7a617836310750121162ad53e03`.

After PR270 live diagnostics for MAX user `17507246` showed product BLOCK:
- officially confirmed channels: 0
- typed push chats: 6
- unknown post-bearing admin-channel rows: 4
- tenant missing for active admin user
- channel/post picker channels: 0

`Чат без названия` happened because PR270 stopped using numeric raw IDs as title fallback. Some stored push-chat titles were empty or numeric-only.

## Current PR271 — open, fixed after two audit BLOCKs, CI green, re-audit needed
PR271:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/271
- Title: `PR271 official resolution`
- Branch: `codex/pr271-official-channel-resolution`
- Base: `main`
- Base SHA: `383a03fc6c45d7a617836310750121162ad53e03`
- Current head SHA: `0d68caec0f23490028d329f4148d3356275f97cb`
- Previous blocked heads: `0e76ab521c55744226663a2f422da355c9c51872`, `5f965c2764a0480fe6a4eea3e4c766fe05333a7e`
- Changed files: `services/liveOfficialChannelResolutionService.js`, `pr180-startup-log-bootstrap.js`
- CI: `PR regression tests`, run `652`, exact-head success
- Artifact: `adminkit-ci-diagnostics`, id `8037756050`, digest `sha256:2467579fa17251f2152f1683f743bec2cdd6ad7b7fc6a457c83006c03b8e5519`
- PR state: open, not merged, mergeable true
- Audit: previous `AUDIT: BLOCK`; re-audit NOT RUN yet at current head

Previous audit BLOCK at `0e76ab5`:
- stale/raw type evidence could bypass official GET chat resolve;
- runtime export could leak raw IDs via title;
- raw channel ID could be written as title fallback;
- thrown API failures were not persisted as resolution failure evidence.

Previous audit BLOCK at `5f965c2`:
- runtime export could leak raw channel/chat IDs through unredacted MAX API error messages;
- `ak_channels.raw.resolution_error` could persist raw ID-bearing API error text;
- channel ownership check ignored non-active owner rows;
- upsert could no-op on another-tenant conflict while reporting success.

Additional PR review blockers found and fixed:
- reuse an existing tenant before fallback tenant creation;
- do not reassign channels owned by another tenant;
- bind already verified official channels before reporting success;
- export diagnostic status only after chained live diagnostics finish;
- defer live resolution until access tables are bootstrapped / make binding table-safe.

Current PR271 implementation:
- `officialType()` requires trusted GET chat evidence with `resolution_status=ok`; stale/raw type without trusted source triggers fresh API resolution.
- Titles are sanitized; numeric-only raw IDs are not exported or written as display titles.
- `redactText()` removes raw IDs from `/chats/{id}` and long numeric tokens before runtime/DB error export.
- API failures are persisted to `ak_channels.raw` as redacted `api_resolution_failed` evidence and remain BLOCK.
- Existing tenant is reused via `ak_tenant_users` or owner tenant before fallback deterministic tenant id.
- Existing channel owner is checked without active-status filter; resolver refuses any different owner.
- Tenant-channel upsert uses `RETURNING tenant_id`; if no row is written, resolver returns BLOCK instead of false success.
- Already verified official channels go through tenant/channel binding before success.
- Chats/dialogs are never bound as channels.
- Startup ordering: official resolver, then live tenant self diagnostic, then tenant section matrix, then live user bindings. Diagnostic export status is queued after this chain.

Known note: dedicated PR271 test file could not be added because GitHub tool blocked file creation. Existing full CI suite is green, but audit must inspect runtime integration carefully.

## Next required action
Run final audit-only PASS/BLOCK for PR271 at exact head `0d68caec0f23490028d329f4148d3356275f97cb`. Do not merge until audit PASS or explicit waiver.

Audit focus:
- no title guessing;
- stale/raw type cannot bypass official GET chat resolution;
- SQL parameterized;
- no raw ID leakage in runtime export/title/error fallback;
- chats/dialogs never bound as channels;
- unresolved API/type failures block honestly and persist redacted failure evidence;
- existing tenant is reused;
- channel ownership is not stolen, including inactive/different-owner rows;
- upsert no-op cannot report success;
- already verified channels are bound;
- diagnostic status export is after chained live diagnostics;
- startup path and entrypoint unchanged.

## Process error recorded
Earlier PR268 preparation accidentally created/deleted temporary files in `main` history. Final tree was clean and audits found no runtime path damage, but this remains a process violation and must not be repeated.
