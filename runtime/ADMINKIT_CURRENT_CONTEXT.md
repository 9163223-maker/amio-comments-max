# АдминКИТ — current handoff

Updated: 2026-07-02 09:09 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## First action in every new AdminKIT chat
Read this file first from branch `runtime-status`, then check current GitHub state. Continue from GitHub/runtime state, not from memory.

Update this file after major events: new PR/head SHA, CI red/green, audit PASS/BLOCK, merge, deploy/runtime-status, manual MAX result, live mismatch, or process error.

## Core rules
Do not use GitHub `@codex` comments. Do not create a new PR if the existing PR can be updated. Do not merge before final audit-only PASS/waiver. Green CI is not done. Merge is not done. Runtime readiness is not visual UX done.

Standard post-audit workflow: confirm exact head and green CI; merge only that head; verify runtime-status and production contract; produce a server-contract success table; then run/manual request MAX visual check.

Production start path must remain:
`node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`

Active entrypoint must remain:
`clean-entrypoint-1.53.10-pr89.js`

Diagnostics branch: `runtime-status`.

## Product rule
Channel/post features must use only real channels and channel posts. Chats are a separate future product area and must not appear as channel/post targets.

MAX chat/channel classification rule:
- Do not classify by title/name/channelTitle/chatTitle/regex, ID sign, participants_count, link alone, is_public, owner_id, or legacy isChannel/isChat without official source.
- Official evidence only: `Chat.type = channel|chat|dialog`, `Update.is_channel` from official update/API context, `GET /chats/{chatId}` / `GET /chats/{link}` typed response, and equivalent typed metadata saved in DB.
- `chat` and `dialog` are different MAX subtypes, but both normalize to non-channel/chat bucket for channel-vs-chat separation. `chat + dialog` evidence inside one payload must not be BLOCK.
- `channel` vs non-channel evidence conflict must become unknown/conflict and BLOCK.
- Legacy webhook payloads can store official evidence under `raw.sample.recipient.type`, `raw.sample.chat.type`, or sample `is_channel`.
- Unknown official evidence means `needs_api_resolution` and BLOCK for channel/post runtime diagnostics.

## Recent merged PRs
PR259: `c087323dcf38d1a6bbec082efe3b9bbdb496e747`.
PR260: `cc33ac39aee2817070ea8e65693553d36df103aa`.
PR261: `126d3a9d9a841b266337dceecce41d51855b6a3c`.
PR262: `bc1e3f548ea65a18644d39335cd93c0f60f42cfb`, runtime PASS.
PR263: `babac89e266044cf1cfb4e0026df913808f3a139`, runtime PASS.
PR264: `f4f32c4fd2fdd6c12d034638c74861cb5f4ee55f`, runtime PASS.
PR265: `f63d7c900b6f38af6b10ad705b6c5663be31d0af`, runtime pickup confirmed through PR266/PR267 deployment.
PR266: `a0278effba94c56ba33bf061d25a94a61a6f966d`, runtime PASS with remaining Northflank API env config observability-only BLOCK.
PR267: `d142afd5ab4fb1562a8841151f7cf8d8e111656c`, runtime PASS.
PR268: `db686772b5f24b32050e3646c69902f1cb59535a`, merged after audit PASS.
PR269: `38370010b9120ff41f744b109dc2ee10d7a50a32`, merged after audit PASS.
PR270: `383a03fc6c45d7a617836310750121162ad53e03`, merged after audit PASS.

## Live mismatch / runtime pickup status after PR270 merge
PR270 was merged at `383a03fc6c45d7a617836310750121162ad53e03` after `AUDIT: PASS` on head `10049dd3d3d0dd467db80d12576ddeef60acf0fb`.

Runtime pickup check at 2026-07-02 09:08 UTC:
- `runtime/startup-log.json` is still old: `updatedAt=2026-07-01T20:59:51.490Z`.
- `startup-log.latest.githubMainHeadSha` is still `38370010b9120ff41f744b109dc2ee10d7a50a32` (PR269 merge), not PR270 merge `383a03fc6c45d7a617836310750121162ad53e03`.
- active entrypoint in latest startup log is still `clean-entrypoint-1.53.10-pr89.js` and startup path contract is ok.
- `runtime/live-user-postgres-bindings.json` exists but is still from runtime `PR269-LIVE-USER-POSTGRES-BINDINGS-1.1`, generated at `2026-07-01T20:59:42.289Z`.
- `runtime/diagnostic-export-status.json` exists and expected files include `runtime/live-user-postgres-bindings.json`, but this is still from PR269 runtime export.

Conclusion: PR270 code is merged in GitHub main, but production/runtime-status has NOT yet picked up PR270. Do not treat PR270 runtime as verified until `startup-log.latest.githubMainHeadSha` equals `383a03fc6c45d7a617836310750121162ad53e03` and `runtime/live-user-postgres-bindings.json` runtime marker is PR270.

## Live mismatch after PR267 manual MAX check
Manual `/tenant` check for the real live user showed a mismatch:
- live user seen as admin;
- tenant not found;
- tenant channels: 0;
- access channels: 0;
- picker channels: 0;
- warning/code observed: `tenant_missing_for_active_user`.

Correction from user:
- Do not rely on `Olga Style`, `Kid Club`, `real-user-1`, or any fixture/test channel as live truth.
- `Kid Club` was OCR/context error. Ignore it.
- `АдминКИТ клуб` is only an example visible in a mixed channel/chat list, not proof of type.
- The relevant real MAX ID is `17507246`.
- The required live diagnostic must collect from production Postgres/runtime sources which channels and which chats are attached to MAX ID `17507246`, and keep channels separate from chats.
- Channel/post flows must show only real channels/posts, not chats.

## PR268 / PR269 / PR270 status
PR268:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/268
- Head SHA: `1870acfd5d885ad94377a8c0db5aad9fa0b670ce`
- CI: `PR regression tests`, run `604`, exact-head success.
- Audit-only result: `AUDIT: PASS`.
- Merge commit: `db686772b5f24b32050e3646c69902f1cb59535a`.
- Deploy/runtime status: not separately verified after PR270.

PR269:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/269
- Head SHA: `6f68ce1011458ee3f82f2fb420cce8d17fa42b9d`
- CI: `PR regression tests`, run `610`, exact-head success.
- Audit-only result: `AUDIT: PASS`.
- Merge commit: `38370010b9120ff41f744b109dc2ee10d7a50a32`.
- Runtime pickup: yes, latest startup log currently reports this SHA.

PR270:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/270
- Title: `PR270: Classify bindings by official MAX evidence`
- Branch: `codex/pr270-chat-title-token-match`
- Base: `main`
- Base SHA: `38370010b9120ff41f744b109dc2ee10d7a50a32`
- Final audited head SHA: `10049dd3d3d0dd467db80d12576ddeef60acf0fb`
- CI: `PR regression tests`, run `640`, exact-head success.
- CI artifact: `adminkit-ci-diagnostics`, artifact id `8033257734`, digest `sha256:80af86818322d12a146e755516611e0e1470649bef246e6a68dbfbc18a33f7cb`.
- Audit result: `AUDIT: PASS`.
- Merge method: squash.
- Merge commit: `383a03fc6c45d7a617836310750121162ad53e03`.
- Runtime pickup: NOT VERIFIED, current startup log still PR269 SHA.

PR270 implementation:
- Replaced title/regex classification with official MAX evidence only.
- Removed `channel-post-picker-core` classifier dependency from `liveUserPostgresBindingsService`.
- Removed `CHAT_RE` / `CHAT_TITLE_RE` classification logic.
- Uses `Chat.type` paths across raw/metadata/API response fields.
- Normalizes `Chat.type=chat` and `Chat.type=dialog` to the same non-channel/chat bucket for conflict detection.
- Uses `Update.is_channel` only with official update/API context.
- Recognizes legacy webhook official evidence under `raw.sample.recipient.type`, `raw.sample.chat.type`, `metadata.sample.*`, and sample `is_channel` fields.
- Detects `channel` vs non-channel official type conflicts inside a single raw/metadata payload and returns unknown/conflict/BLOCK.
- Detects conflicting official `Update.is_channel` evidence and typed-vs-update conflict.
- Treats `adminkit_web_push_chat_bindings` as internal typed chat source.
- Unknown official evidence becomes `needs_api_resolution` and BLOCK.
- Safe export does not expose raw MAX ID, raw channel/chat IDs, raw dedupe IDs, or internal hash keys.

## Process error recorded
Process violation during PR268 preparation:
- Temporary files were accidentally created/deleted in `main` history.
- Commits recorded in main history: `61837be` create noop/tmp probe, `ad010fa` delete tmp probe, `dd856a6` create placeholder, `21a835f` delete placeholder.
- Audit confirmed `tmp-probe-noop.txt`, `placeholder.tmp`, and `x` are absent from the audited tree.
- Audit found no startup/runtime production path references those files and no evidence that the create/delete commits damaged production/runtime behavior.
- This is not a functional blocker for PR268/PR269/PR270 code, but it is a process violation and must not be repeated.
- Rule going forward: no writes to `main` except explicit merge after audit PASS/waiver.

Additional process notes:
- During PR269 branch setup, `update_ref` was accidentally repeated several times with the same SHA on the same follow-up branch. It did not change content and did not touch `main`, but it is noisy process behavior and must not be repeated.
- During PR270 setup, `create_pull_request` was accidentally called several times with a nonexistent head branch; GitHub returned 422 and no PR was created. This did not modify repo state but is noisy process behavior and must not be repeated.
- During PR270 work there were repeated CI polling/log-read calls. They did not change repo state, but should be reduced going forward.

## Next required action
1. Wait/check again for Northflank deploy/runtime pickup after PR270 merge commit `383a03fc6c45d7a617836310750121162ad53e03`.
2. Verify runtime-status after deploy:
   - `latest.githubMainHeadSha` equals `383a03fc6c45d7a617836310750121162ad53e03`;
   - active entrypoint remains `clean-entrypoint-1.53.10-pr89.js`;
   - production start path remains `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`;
   - `runtime/live-user-postgres-bindings.json` exists;
   - `diagnostic-export-status.json` ok and includes the new file;
   - `runtime/live-user-postgres-bindings.json` runtime marker is PR270, not PR269;
   - `runtime/live-tenant-self-diagnostic-matrix.json` and `runtime/tenant-section-matrix.json` use live MAX ID target safely without raw ID leakage.
3. After PR270 runtime pickup, read `runtime/live-user-postgres-bindings.json` and report to user the actual separated lists:
   - channels attached to MAX ID `17507246`;
   - chats attached to MAX ID `17507246`;
   - unknown records, if any.
4. Then run/manual request MAX check: `/tenant`, Channels, Account, and post-scoped sections Comments/Gifts/Buttons/Polls/Highlights/Editor must show only live channels and posts; chats must not appear as channel/post targets.
