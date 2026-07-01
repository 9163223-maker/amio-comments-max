# АдминКИТ — current handoff

Updated: 2026-07-01 20:53 UTC
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
PR268: `db686772b5f24b32050e3646c69902f1cb59535a`, merged after audit PASS, runtime/deploy not yet verified.

## Current production runtime before PR268/PR269 pickup
- Last confirmed runtime is still after PR267: `latest.githubMainHeadSha` was `d142afd5ab4fb1562a8841151f7cf8d8e111656c` in `runtime/startup-log.json` at `2026-07-01T19:08:15.506Z`.
- active entrypoint remained `clean-entrypoint-1.53.10-pr89.js`.
- production start path on main remained `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`.
- `runtimeContract.contractLiveOk`, `startupPath.ok`, and `finalRuntimeReadinessGate.ok` were true at last confirmed runtime.
- IMPORTANT: PR267 runtime matrices still contained fixture-derived/manual expectations such as `real-user-1` and `Olga Style`; those are invalid live expectations for the real user.
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
- The relevant real MAX ID is `17507246`.
- The required live diagnostic must collect from production Postgres/runtime sources which channels and which chats are attached to MAX ID `17507246`, and keep channels separate from chats.
- Channel/post flows must show only real channels/posts, not chats.

## PR268 status — merged, but follow-up required
PR268:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/268
- Title: `PR268: Live user Postgres bindings diagnostic`
- Branch: `codex/pr268-live-user-postgres-bindings`
- Head SHA: `1870acfd5d885ad94377a8c0db5aad9fa0b670ce`
- CI: `PR regression tests`, run `604`, run id `28545550713`, exact-head `1870acfd5d885ad94377a8c0db5aad9fa0b670ce`, conclusion `success`.
- CI artifact: `adminkit-ci-diagnostics`, artifact id `8021691530`.
- Audit-only result: `AUDIT: PASS` for exact head `1870acfd5d885ad94377a8c0db5aad9fa0b670ce`.
- User approved merge after audit PASS.
- Merge method: squash.
- Merge commit: `db686772b5f24b32050e3646c69902f1cb59535a`.
- Deploy/runtime status: NOT VERIFIED yet.

PR268 implementation:
- Added `services/liveUserPostgresBindingsService.js` to export `runtime/live-user-postgres-bindings.json`.
- Default live target is MAX ID `17507246` when env overrides are absent.
- Covered sources: `ak_admin_channels`, tenant-user channels, tenant-owner channels, and `adminkit_web_push_chat_bindings`.
- Runtime export separates `channels`, `chats`, and `unknown` and exposes masked IDs/safe fields.
- `liveTenantSelfDiagnosticService` defaults watched users to live MAX ID `17507246`.
- `tenant_missing_for_active_user` is a violation/BLOCK.
- Startup exports and post-merge pickup gate require `runtime/live-user-postgres-bindings.json`.

Important post-merge discovery:
- After PR268 merge, PR268 discussion was inspected and two Codex P2 review comments were found that the audit PASS did not account for.
- P2 #1: title-only chat-like `ak_admin_channels` rows can be misclassified as channels because source/channel evidence wins over chat-like title text.
- P2 #2: `tenantSectionMatrixService` can export raw live MAX IDs in `runtime/tenant-section-matrix.json` through `checkedUsers` and row `userId` after switching default users to live target.
- Because PR268 was already merged, fixes are being handled in follow-up PR269. Do not use the PR268 runtime matrix as final live truth until PR269 is merged/deployed.

## PR269 status — open follow-up for PR268 review findings
PR269:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/269
- Title: `PR269: Fix PR268 live diagnostic review findings`
- Branch: `codex/pr269-post-merge-pr268-audit-fixes`
- Base: `main`
- Base SHA: `db686772b5f24b32050e3646c69902f1cb59535a`
- Head SHA: `6f68ce1011458ee3f82f2fb420cce8d17fa42b9d`
- Changed files: 4
- CI exact-head: pending/not started at first check; `fetch_commit_workflow_runs` returned no runs for `6f68ce1011458ee3f82f2fb420cce8d17fa42b9d` immediately after PR creation.
- Audit: NOT RUN yet.
- Merge status: NOT MERGED.

PR269 purpose:
- Fix title-only chat classification before channel evidence in `services/liveUserPostgresBindingsService.js`.
- Mask/scrub live MAX IDs from `runtime/tenant-section-matrix.json` export in `services/tenantSectionMatrixService.js`.
- Extend `scripts/test-pr268-live-user-postgres-bindings.js` with a title-only chat-like admin-channel row.
- Extend `scripts/test-pr267-tenant-section-matrix.js` to assert checked users and row user IDs are masked and raw user IDs are absent from exported matrix JSON.

## Process error recorded
Process violation during PR268 preparation:
- Temporary files were accidentally created/deleted in `main` history.
- Commits recorded in main history: `61837be` create noop/tmp probe, `ad010fa` delete tmp probe, `dd856a6` create placeholder, `21a835f` delete placeholder.
- Audit confirmed `tmp-probe-noop.txt`, `placeholder.tmp`, and `x` are absent from the audited tree.
- Audit found no startup/runtime production path references those files and no evidence that the create/delete commits damaged production/runtime behavior.
- This is not a functional blocker for PR268/PR269 code, but it is a process violation and must not be repeated.
- Rule going forward: no writes to `main` except explicit merge after audit PASS/waiver.

Additional process note:
- During PR269 branch setup, `update_ref` was accidentally repeated several times with the same SHA on the same follow-up branch. It did not change content and did not touch `main`, but it is noisy process behavior and must not be repeated.

## Next required action
1. Check PR269 CI for exact head `6f68ce1011458ee3f82f2fb420cce8d17fa42b9d`.
2. If CI is red, fix only in PR269 branch.
3. If CI is green, run final audit-only PASS/BLOCK for PR269.
4. Merge PR269 only after audit PASS/waiver.
5. After PR269 merge, update this file with merge commit/head.
6. Wait for Northflank deploy/runtime pickup.
7. Verify runtime-status after deploy:
   - `latest.githubMainHeadSha` equals PR269 merge commit;
   - active entrypoint remains `clean-entrypoint-1.53.10-pr89.js`;
   - production start path remains `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`;
   - `runtime/live-user-postgres-bindings.json` exists;
   - `diagnostic-export-status.json` ok and includes the new file;
   - `runtime/live-tenant-self-diagnostic-matrix.json` and `runtime/tenant-section-matrix.json` use live MAX ID target safely without raw ID leakage.
8. Read `runtime/live-user-postgres-bindings.json` and report to user the actual separated lists:
   - channels attached to MAX ID `17507246`;
   - chats attached to MAX ID `17507246`;
   - unknown records, if any.
9. Then run/manual request MAX check: `/tenant`, Channels, Account, and post-scoped sections Comments/Gifts/Buttons/Polls/Highlights/Editor must show only live channels and posts; chats must not appear as channel/post targets.
