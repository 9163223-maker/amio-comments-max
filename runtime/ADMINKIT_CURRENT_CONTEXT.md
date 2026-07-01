# АдминКИТ — current handoff

Updated: 2026-07-01 20:45 UTC
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

## Current runtime after PR267
- `runtime/startup-log.json` updated at `2026-07-01T19:08:15.506Z`.
- `latest.githubMainHeadSha` is `d142afd5ab4fb1562a8841151f7cf8d8e111656c`.
- active entrypoint remains `clean-entrypoint-1.53.10-pr89.js`.
- production start path on main remains `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`.
- `runtimeContract.contractLiveOk` true.
- `runtimeContract.startupPath.ok` true.
- `finalRuntimeReadinessGate.ok` true.
- `finalRuntimeReadinessGate.readyForManualMaxTest` true.
- `diagnostic-export-status.json` generated at `2026-07-01T19:08:31.015Z`, ok true, expectedCount 10, okCount 10, missingFiles [].
- Expected files include `runtime/tenant-section-matrix.json`, `runtime/live-tenant-self-diagnostic-matrix.json`, and all previous matrices.
- `runtime/tenant-section-matrix.json` exists, generated at `2026-07-01T19:08:25.404Z`, ok true.
- IMPORTANT: the PR267 runtime matrices still contain fixture-derived/manual expectations such as `real-user-1` and `Olga Style`; those are now known to be invalid live expectations for the real user.
- `runtime/northflank-startup-log.json` remains configured:false/ok:false because Northflank API env variables are missing. This is observability-only, not product runtime failure.

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
- The relevant real MAX ID is `17507246`.
- The required live diagnostic must collect from production Postgres/runtime sources which channels and which chats are attached to MAX ID `17507246`, and keep channels separate from chats.
- Channel/post flows must show only real channels/posts, not chats.

## PR268 status — live user Postgres bindings diagnostic
PR268:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/268
- Title: `PR268: Live user Postgres bindings diagnostic`
- Branch: `codex/pr268-live-user-postgres-bindings`
- Base: `main`
- Base SHA at PR open: `21a835f997571b77b06492bb46d6f5f896190ea9`
- Head SHA: `1870acfd5d885ad94377a8c0db5aad9fa0b670ce`
- CI: `PR regression tests`, run `604`, run id `28545550713`, exact-head `1870acfd5d885ad94377a8c0db5aad9fa0b670ce`, conclusion `success`.
- CI artifact: `adminkit-ci-diagnostics`, artifact id `8021691530`.
- Audit-only result: `AUDIT: PASS` for exact head `1870acfd5d885ad94377a8c0db5aad9fa0b670ce`.
- Merge status: NOT MERGED yet.
- Deploy/runtime status: NOT DEPLOYED yet.

PR268 purpose and implementation:
- Add `services/liveUserPostgresBindingsService.js` to export `runtime/live-user-postgres-bindings.json`.
- Default live target is MAX ID `17507246` when env overrides are absent.
- Env overrides include `ADMINKIT_LIVE_BINDINGS_MAX_USER_IDS`, `ADMINKIT_TENANT_DIAGNOSTIC_MAX_USER_IDS`, and `ADMINKIT_DIAGNOSTIC_MAX_USER_IDS`.
- Postgres reads are parameterized with `$1` / `[maxUserId]`; do not interpolate MAX ID into SQL strings.
- Covered sources: `ak_admin_channels`, tenant-user channels, tenant-owner channels, and `adminkit_web_push_chat_bindings`.
- Runtime export separates `channels`, `chats`, and `unknown` and exposes only masked IDs plus safe fields such as title/source/role/status/posts counts/timestamps.
- `liveTenantSelfDiagnosticService` defaults watched users to live MAX ID `17507246`, not fixture-derived users.
- `tenant_missing_for_active_user` is now a violation/BLOCK, not a warning.
- `tenantSectionMatrixService` default users come from `liveTenant.watchedUsers()` and no longer hardcode Olga Style/Kid Club/manual test channel expectations.
- Startup exports and expected diagnostic files include `runtime/live-user-postgres-bindings.json`.
- Post-merge pickup gate requires `runtime/live-user-postgres-bindings.json`.
- `npm test` includes `scripts/test-pr268-live-user-postgres-bindings.js`.

Audit PASS findings:
- No merge-blocking issues found in PR268 at head `1870acfd5d885ad94377a8c0db5aad9fa0b670ce`.
- Parameterized SQL, channel/chat separation, masking of full MAX ID/raw channel IDs, and honest BLOCK behavior when Postgres is unavailable were audited.
- Existing PR265/PR267 fixture fallback cannot create false PASS for the default matrix path because watched live users exist by default.
- Package start path remains the existing active entrypoint path.
- No code changes were made by Codex audit; no branch/PR/merge was created by audit.

## Process error recorded
Process violation during PR268 preparation:
- Temporary files were accidentally created/deleted in `main` history.
- Commits recorded in main history: `61837be` create noop/tmp probe, `ad010fa` delete tmp probe, `dd856a6` create placeholder, `21a835f` delete placeholder.
- Audit confirmed `tmp-probe-noop.txt`, `placeholder.tmp`, and `x` are absent from the audited tree.
- Audit found no startup/runtime production path references those files and no evidence that the create/delete commits damaged production/runtime behavior.
- This is not a functional merge blocker for PR268, but it is a process violation and must not be repeated.
- Rule going forward: no writes to `main` except explicit merge after audit PASS/waiver.

## Next required action
1. Merge PR268 only if user explicitly approves merge after audit PASS.
2. After merge, update this file with merge commit/head.
3. Wait for Northflank deploy/runtime pickup.
4. Verify runtime-status after deploy:
   - `latest.githubMainHeadSha` equals PR268 merge commit;
   - active entrypoint remains `clean-entrypoint-1.53.10-pr89.js`;
   - production start path remains `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`;
   - `runtime/live-user-postgres-bindings.json` exists;
   - `diagnostic-export-status.json` ok and includes the new file;
   - `runtime/live-tenant-self-diagnostic-matrix.json` and `runtime/tenant-section-matrix.json` use live MAX ID `17507246`, not fixture expectations.
5. Read `runtime/live-user-postgres-bindings.json` and report to user the actual separated lists:
   - channels attached to MAX ID `17507246`;
   - chats attached to MAX ID `17507246`;
   - unknown records, if any.
6. Then run/manual request MAX check: `/tenant`, Channels, Account, and post-scoped sections Comments/Gifts/Buttons/Polls/Highlights/Editor must show only live channels and posts; chats must not appear as channel/post targets.
