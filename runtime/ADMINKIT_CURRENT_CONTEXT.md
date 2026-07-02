# АдминКИТ — current handoff

Updated: 2026-07-02 08:05 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## First action in every new AdminKIT chat
Read this file first from branch `runtime-status`, then check current GitHub state. Continue from GitHub/runtime state, not from memory.

Update this file after major events: new PR/head SHA, CI red/green, audit PASS/BLOCK, merge, deploy/runtime-status, manual MAX result, live mismatch, or process error.

## Core rules
Do not use GitHub `@codex` comments. Do not create a new PR if the existing PR can be updated. Do not merge before final audit-only PASS/waiver. Green CI is not done. Merge is not done. Runtime readiness is not visual UX done.

After a PR is initially created from a requested task: read this context, fetch PR metadata/head/base/state, check CI for exact head, inspect comments/reviews/diff, fix blockers in the same PR branch, update this context, then run audit-only PASS/BLOCK only after green CI and no known code blocker.

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
PR269: `38370010b9120ff41f744b109dc2ee10d7a50a32`, merged after audit PASS, but post-merge P2 found.

## Current production runtime before PR268/PR269/PR270 pickup
- Last confirmed runtime is still after PR267: `latest.githubMainHeadSha` was `d142afd5ab4fb1562a8841151f7cf8d8e111656c` in `runtime/startup-log.json` at `2026-07-01T19:08:15.506Z`.
- active entrypoint remained `clean-entrypoint-1.53.10-pr89.js`.
- production start path on main remained `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`.
- `runtimeContract.contractLiveOk`, `startupPath.ok`, and `finalRuntimeReadinessGate.ok` were true at last confirmed runtime.
- `runtime/northflank-startup-log.json` remained configured:false/ok:false because Northflank API env variables are missing. This is observability-only, not product runtime failure.

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

## PR268 status — merged, follow-ups required
PR268:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/268
- Head SHA: `1870acfd5d885ad94377a8c0db5aad9fa0b670ce`
- CI: `PR regression tests`, run `604`, exact-head success.
- Audit-only result: `AUDIT: PASS`.
- Merge commit: `db686772b5f24b32050e3646c69902f1cb59535a`.
- Deploy/runtime status: NOT VERIFIED yet.

Post-merge discovery after PR268:
- Codex P2 #1: title-only chat-like `ak_admin_channels` rows could be misclassified as channels.
- Codex P2 #2: `tenantSectionMatrixService` could export raw live MAX IDs in `runtime/tenant-section-matrix.json`.
- These were addressed in PR269, which is now merged.

## PR269 status — merged, but new follow-up required
PR269:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/269
- Head SHA: `6f68ce1011458ee3f82f2fb420cce8d17fa42b9d`
- CI: `PR regression tests`, run `610`, exact-head success.
- Audit-only result: `AUDIT: PASS`.
- Merge commit: `38370010b9120ff41f744b109dc2ee10d7a50a32`.
- Deploy/runtime status: NOT VERIFIED yet.

Post-merge discovery after PR269:
- PR269 Codex Review found title-regex risk: ordinary channel titles could be classified as chats.
- User corrected the architecture: do not improve regex; remove title-based classification entirely.
- PR270 now handles this as official MAX evidence-only classification.

## PR270 status — open follow-up, self-sweep clean, ready for final audit-only
PR270:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/270
- Title: `PR270: Classify bindings by official MAX evidence`
- Branch: `codex/pr270-chat-title-token-match`
- Base: `main`
- Base SHA: `38370010b9120ff41f744b109dc2ee10d7a50a32`
- Head SHA: `db2dd0f8936a2a07b5384b86fb1d6b163b562dcf`
- Changed files: 2
  - `services/liveUserPostgresBindingsService.js`
  - `scripts/test-pr268-live-user-postgres-bindings.js`
- CI: `PR regression tests`, run `632`, run id `28574715661`, exact-head `db2dd0f8936a2a07b5384b86fb1d6b163b562dcf`, conclusion `success`.
- CI artifact: `adminkit-ci-diagnostics`, artifact id `8032443320`, digest `sha256:ae651fc3189bab2604468015aef35c299df322e9ad54048061f47c2555db2eb1`.
- PR state: open, not merged, mergeable true.
- Audit: NOT RUN yet.

PR270 implementation:
- Replaced title/regex classification with official MAX evidence only.
- Removed `channel-post-picker-core` classifier dependency from `liveUserPostgresBindingsService`.
- Removed `CHAT_RE` / `CHAT_TITLE_RE` classification logic.
- Uses `Chat.type` paths across raw/metadata/API response fields.
- Uses `Update.is_channel` only with official update/API context.
- Recognizes legacy webhook official evidence under `raw.sample.recipient.type`, `raw.sample.chat.type`, `metadata.sample.*`, and sample `is_channel` fields.
- Treats `adminkit_web_push_chat_bindings` as internal typed chat source.
- Unknown official evidence becomes `needs_api_resolution` and BLOCK.
- Safe export does not expose raw MAX ID, raw channel/chat IDs, raw dedupe IDs, or internal hash keys.
- Duplicate legacy+official rows for the same raw object prefer official evidence; conflicting official evidence becomes unknown/BLOCK.

PR270 tests cover:
- chat-like title + `raw.type=channel` remains channel;
- channel-like title + `raw.type=chat` remains chat;
- title-only `Olga Style` / `АдминКИТ клуб` remains unknown;
- `Update.is_channel=true/false` evidence;
- webhook `raw.sample.recipient.type`, `raw.sample.chat.type`, and sample `is_channel` evidence;
- legacy `isChannel/isChat` without official context remains unknown;
- push chat binding remains chat;
- unknown records block with `needs_api_resolution`;
- parameterized SQL and no raw MAX/channel IDs in runtime export;
- `safeBindingRecord()` does not expose raw/internal dedupe IDs.

PR270 self-sweep after green CI:
- PR comments/reviews inspected. Old comments on old commits are addressed:
  - old regex-boundary P2 is obsolete because title-regex classification was removed;
  - P2 `raw.sample.*` official evidence is fixed and tested;
  - P1 `_rawId` safe record leak is fixed and tested.
- Changed files limited to the expected 2 files.
- Production start path and active entrypoint are not changed by PR270.
- No direct writes to `main` were made for PR270.

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
1. Run final audit-only PASS/BLOCK for PR270 at exact head `db2dd0f8936a2a07b5384b86fb1d6b163b562dcf`.
2. Merge PR270 only after audit PASS/waiver.
3. After PR270 merge, update this file with merge commit/head.
4. Wait for Northflank deploy/runtime pickup.
5. Verify runtime-status after deploy:
   - `latest.githubMainHeadSha` equals PR270 merge commit;
   - active entrypoint remains `clean-entrypoint-1.53.10-pr89.js`;
   - production start path remains `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`;
   - `runtime/live-user-postgres-bindings.json` exists;
   - `diagnostic-export-status.json` ok and includes the new file;
   - `runtime/live-tenant-self-diagnostic-matrix.json` and `runtime/tenant-section-matrix.json` use live MAX ID target safely without raw ID leakage.
6. Read `runtime/live-user-postgres-bindings.json` and report to user the actual separated lists:
   - channels attached to MAX ID `17507246`;
   - chats attached to MAX ID `17507246`;
   - unknown records, if any.
7. Then run/manual request MAX check: `/tenant`, Channels, Account, and post-scoped sections Comments/Gifts/Buttons/Polls/Highlights/Editor must show only live channels and posts; chats must not appear as channel/post targets.
