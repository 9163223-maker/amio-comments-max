# АдминКИТ — current handoff

Updated: 2026-07-01 14:05 UTC
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
- Current head: `67e9060d2c8d0b06749f70135a00faba38559e7b`
- State: open, not merged, not draft.
- Mergeable: true.
- CI: PR regression tests #572, run id `28523344844`, conclusion `success`.

PR265 purpose:
- Add generic live tenant self-diagnostic for the current MAX user without hardcoding any user id.
- Allow the same diagnostic to work for any other user id when that user runs the diagnostic or when configured in env watch list later.
- Distinguish general server contract from a specific live user binding: current maxUserId -> tenant -> tenant channels -> client channels -> picker channels -> posts.

PR265 changes:
- Adds `services/liveTenantSelfDiagnosticService.js`.
- Adds runtime export `runtime/live-tenant-self-diagnostic-matrix.json` through `pr180-startup-log-bootstrap.js`.
- Adds private-chat command handling in `clean-bot-campaign-attribution-cc8336.js`:
  `/tenant`, `/tenant_debug`, `/tenant_diag`, `/diagnostic`, `/diag`, `диагностика`, `диагностика привязки`.
- Adds visible ordinary account button `Диагностика привязки` with action `account_tenant_diagnostic` for active/admin account users.
- `src/core/accountRuntime.js` recognizes `account_tenant_diagnostic` and routes to `liveTenantSelfDiagnostic.buildScreen({ maxUserId })` using current live user context.
- Diagnostic output masks IDs and shows current MAX id, tenant found/not found, access status, tenant/client/picker channel counts, post evidence, excluded chats, warnings and blockers.
- Adds `scripts/test-pr265-live-tenant-self-diagnostic.js` with two users and isolated channel sets.
- Wires PR265 test into `package.json` npm test.
- Adds named workflow wrapper `test-pr265-live-tenant-self-diagnostic` and node --check for the service/test.
- Restores `requestIdFromReq()` behavior to check both `req.get('x-request-id')` and `req.get('X-Request-Id')`.

PR265 fix history:
- Initial Codex follow-up attempts returned ENV_BLOCK because Codex Cloud could not fetch/push PR265 branch (`origin` missing / CONNECT tunnel failed 403).
- Assistant fixed the PR265 BLOCK directly through GitHub connector in the existing PR branch.
- CI #568 failed because canonical menu expected list did not include `Диагностика привязки`; fixed `scripts/test-canonical-menu-matrix-pr175.js`.
- CI #570 failed inside `test-pr265-live-tenant-self-diagnostic`; adjusted live diagnostic false-block handling so only evidence-backed hidden channels block, while non-evidence residue is warning.
- CI #572 passed on head `67e9060d2c8d0b06749f70135a00faba38559e7b`.

Assistant pre-audit conclusion:
- Original PR265 BLOCK appears fixed.
- Codex ENV_BLOCK is bypassed by direct GitHub updates.
- No known code blocker after CI #572.
- PR265 is ready for audit-only PASS/BLOCK on exact head `67e9060d2c8d0b06749f70135a00faba38559e7b`.

Next required action:
1. Run audit-only PASS/BLOCK for PR265 head `67e9060d2c8d0b06749f70135a00faba38559e7b`.
2. If audit PASS, merge with expected head SHA.
3. After merge, verify runtime pickup, `runtime/live-tenant-self-diagnostic-matrix.json`, diagnostic-export-status expected files, and manual private MAX command `/tenant` or visible account button.
