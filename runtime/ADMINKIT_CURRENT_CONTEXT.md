# АдминКИТ — current handoff

Updated: 2026-07-01 13:05 UTC
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

## PR265 current state
PR265:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/265
- Title: `Live tenant self diagnostic`
- Branch: `codex/pr265-live-tenant-self-diagnostic`
- Base: `main`
- Base SHA: `f4f32c4fd2fdd6c12d034638c74861cb5f4ee55f`
- Current head: `e34abf37c24b36f2c8ace785518deeee439d7a7f`
- State: open, not merged, not draft.
- Mergeable: true.
- CI: PR regression tests #556, run id `28519013715`, conclusion `success`.
- Review state: assistant left a COMMENT review with explicit BLOCK on 2026-07-01 13:04 UTC.

PR265 purpose:
- Add generic live tenant self-diagnostic for the current MAX user without hardcoding any user id.
- Allow the same diagnostic to work for any other user id when that user runs the diagnostic or when configured in env watch list later.
- Distinguish general server contract from a specific live user binding: current maxUserId -> tenant -> tenant channels -> client channels -> picker channels -> posts.

PR265 changes currently on head:
- Adds `services/liveTenantSelfDiagnosticService.js`.
- Adds runtime export `runtime/live-tenant-self-diagnostic-matrix.json` through `pr180-startup-log-bootstrap.js`.
- Adds private-chat command handling in `clean-bot-campaign-attribution-cc8336.js`:
  `/tenant`, `/tenant_debug`, `/tenant_diag`, `/diagnostic`, `/diag`, `диагностика`, `диагностика привязки`.
- Diagnostic output masks IDs and shows current MAX id, tenant found/not found, access status, tenant/client/picker channel counts, post evidence, excluded chats, warnings and blockers.
- Adds standalone test `scripts/test-pr265-live-tenant-self-diagnostic.js` with two users and isolated channel sets.

Assistant review BLOCK:
- Blocker files: `package.json`, `.github/workflows/pr-regression-tests.yml`, `features/account-screens-pr106.js`, `clean-bot-campaign-attribution-cc8336.js`.
- Reason: CI #556 passed, but the dedicated PR265 test is not wired into `npm test` or PR workflow, so the main regression gate did not execute it. Also, the live diagnostic currently has private commands/callback action but no ordinary visible account UI entry. There is also a small `requestIdFromReq()` fallback regression and unrelated formatting churn in active runtime files.
- Minimal required fix:
  1. Wire `scripts/test-pr265-live-tenant-self-diagnostic.js` into `package.json` `npm test`.
  2. Add a named PR regression workflow wrapper for this test.
  3. Add visible account button `Диагностика привязки` -> `account_tenant_diagnostic` for the current live `maxUserId`; keep private commands too.
  4. Update account runtime/contracts/tests if needed.
  5. Restore `requestIdFromReq()` to preserve both header lookups and minimize unrelated formatting churn.
  6. Re-run CI on new head.

Tooling note:
- ChatGPT GitHub update_file repeatedly blocked direct `package.json` and test-hook updates in this session. A Codex follow-up on the existing PR265 branch may be the fastest fix route.

Next required action:
1. Fix PR265 BLOCK in the existing branch.
2. Re-run CI.
3. Only after green CI and no known code blockers, run audit-only PASS/BLOCK on exact head.
4. Do not merge PR265 yet.
