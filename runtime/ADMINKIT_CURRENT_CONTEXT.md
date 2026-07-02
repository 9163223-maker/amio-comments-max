# АдминКИТ — current handoff

Updated: 2026-07-02 14:38 UTC
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

## PR271 — merged, runtime pickup pending
PR271:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/271
- Title: `PR271 official resolution`
- Final audited head SHA: `0d68caec0f23490028d329f4148d3356275f97cb`
- Previous blocked heads: `0e76ab521c55744226663a2f422da355c9c51872`, `5f965c2764a0480fe6a4eea3e4c766fe05333a7e`
- Base SHA: `383a03fc6c45d7a617836310750121162ad53e03`
- CI: `PR regression tests`, run `652`, exact-head success
- Artifact: `adminkit-ci-diagnostics`, id `8037756050`, digest `sha256:2467579fa17251f2152f1683f743bec2cdd6ad7b7fc6a457c83006c03b8e5519`
- Audit result: `AUDIT: PASS`
- Merge method: squash
- Merge commit: `44516658f52c6681d27cc492b16356f6768a42a2`
- Runtime pickup checks at 2026-07-02 14:34-14:38 UTC: NOT PICKED UP YET
- Current runtime/startup log still reports PR270 merge `383a03fc6c45d7a617836310750121162ad53e03`
- `runtime/live-official-channel-resolution.json` is not present yet

PR271 implementation:
- Adds live official resolver before downstream live matrices.
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

## Next required action
Wait/check for runtime pickup of PR271 merge commit `44516658f52c6681d27cc492b16356f6768a42a2`.
After pickup verify:
- `runtime/startup-log.json` latest `githubMainHeadSha` equals `44516658f52c6681d27cc492b16356f6768a42a2`;
- active entrypoint remains `clean-entrypoint-1.53.10-pr89.js`;
- `runtime/live-official-channel-resolution.json` exists and runtime marker is PR271;
- `diagnostic-export-status.json` includes live official resolution and is ok;
- downstream `live-tenant-self-diagnostic-matrix`, `tenant-section-matrix`, and `live-user-postgres-bindings` reflect post-resolution state;
- report actual channels/chats/unknown for MAX user `17507246`.

Do not give manual MAX PASS until PR271 runtime pickup and post-resolution matrices are checked.

## Process error recorded
Earlier PR268 preparation accidentally created/deleted temporary files in `main` history. Final tree was clean and audits found no runtime path damage, but this remains a process violation and must not be repeated.
