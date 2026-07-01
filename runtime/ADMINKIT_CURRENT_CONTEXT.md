# АдминКИТ — current handoff

Updated: 2026-07-01 19:12 UTC
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
- Tenant section matrix checked `real-user-1`, knownTenant true, active true, pickerChannelsCount 1, channel `Olga Style`, firstChannelPostsCount 1, blockCount 0.
- `runtime/northflank-startup-log.json` remains configured:false/ok:false because Northflank API env variables are missing. This is observability-only, not product runtime failure.

## PR267 status
PR267:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/267
- Title: `Tenant-aware section matrix`
- Branch: `codex/pr267-tenant-section-matrix`
- Base SHA: `a0278effba94c56ba33bf061d25a94a61a6f966d`
- Final head: `e58d13761ab70b3e801b12c3cf358fd319166849`
- CI: PR regression tests #594, run id `28541109876`, conclusion `success`.
- Audit PASS recorded as review COMMENT `4612171086`.
- Merge method: squash.
- Merge commit: `d142afd5ab4fb1562a8841151f7cf8d8e111656c`.
- Northflank build status: success, build `vigorous-group-4789`.

PR267 purpose and implementation:
- Add tenant-aware matrix across all client-visible sections and all post-scoped sections.
- Check current-user tenant binding, live self diagnostic, tenant channel binding, picker isolation, channels list, account root, and post-scoped choose_channel/choose_post/selected_post screens.
- Ensure user A does not see user B channel and vice versa in fixture tests.
- Ensure chat-like records do not leak into channel/post target flows.
- Export `runtime/tenant-section-matrix.json` from startup diagnostics.
- Add the new matrix to diagnostic expected files and post-merge runtime pickup gate.
- Add `scripts/test-pr267-tenant-section-matrix.js` and wire it into `npm test` and PR regression workflow.

Manual check algorithms for current live bot:
1. Tenant diagnostic first, then all post-scoped sections.
   - In private chat run `/tenant` or open `Личный кабинет → Диагностика привязки`.
   - Expect tenant found, active access, pickerChannelsCount >= 1, channel title matching `Olga Style`, no raw IDs.
   - Open Comments, Gifts, Buttons, Polls, Highlights, Editor and use `Выбрать пост`.
   - Expect only tenant channel(s), no chats/groups/private dialogs, then post picker shows `Канал: Olga Style`.
2. One-channel happy path.
   - Gifts → Выбрать пост → Olga Style → first post: expect selected post screen with `Канал: Olga Style` and `Создать подарок`.
   - Buttons → Выбрать пост → Olga Style → first post: expect `Добавить кнопку` and `Текущие кнопки` only after selected post.
   - Editor → Выбрать пост → Olga Style → first post: expect edit action only after selected post.
3. Account and Channels cross-check.
   - Main → Channels → Мои каналы: expect `Olga Style` only.
   - Main → Account: expect `Диагностика привязки` and `Мои каналы`.
   - Compare `/tenant` picker count/title with Channels and Account screens.
   - Open non-post sections Stats, Archive, Settings, Push: expect safe open without tenant leakage or debug/trace IDs.

Next required action:
- User/manual MAX check using the 3 algorithms above and report mismatches with screenshots/text.
- If mismatch appears, compare against `runtime/tenant-section-matrix.json` and create follow-up PR with exact route/user context.
