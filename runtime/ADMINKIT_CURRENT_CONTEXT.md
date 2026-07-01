# АдминКИТ — current handoff

Updated: 2026-07-01 07:55 UTC
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

## PR263 current state
PR263:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/263
- Title: `Tenant channel binding contract and live channel ownership diagnostics`
- Branch: `codex/add-tenant-channel-binding-service`
- Base: `main`
- Current head: `34322880e3a065232e820c9e281227243678714c`
- State: open, not merged, not draft.
- Mergeable: true.
- CI: PR regression tests #539, run id `28502260093`, conclusion `success`.

PR263 scope:
- Add tenant-channel binding service.
- Bind real channels to the initiating user's tenant only when the user state is trusted and bot-admin proof is not explicitly negative.
- Keep chats out of channel/post targets.
- Export `runtime/tenant-channel-binding-matrix.json`.
- Add regression test and wire it into npm test and PR workflow.

Audit/fix history:
1. Initial assistant BLOCK on 2026-07-01 07:15 UTC against `services/tenantChannelBindingService.js`: tenant creation was too permissive when no tenant existed.
2. Follow-up fixed trusted access checks; CI #535 passed on head `14bcfe77b553b2521e599dd2eef175933d287024`.
3. Audit BLOCK on 2026-07-01 07:48 UTC against `services/tenantChannelBindingService.js`: `bindChannelForInitiator()` did not handle explicit negative bot-admin proof. A call with `botAdminProof: { proven:false }` still proceeded to `access.bindTenantChannel(...)`, creating/refeshing an active binding instead of suspending/rejecting.
4. Assistant fixed in same PR branch:
   - `bindChannelForInitiator()` now checks `botAdminProof && botAdminProof.proven === false` before tenant creation/binding.
   - For a new/unbound channel, it returns `ok:false`, `reason:'bot_admin_required_for_tenant_binding'`, records diagnostic `bot_admin_negative_proof_for_channel_bind`, and does not create an active binding.
   - For an existing binding, it persists status `suspended` through `repository.saveTenantChannel()` and hides it from picker.
   - Test `scripts/test-pr263-tenant-channel-binding-contract.js` now covers both false-proof new channel and false-proof existing binding.
   - CI #539 passed on head `34322880e3a065232e820c9e281227243678714c`.

Assistant pre-audit conclusion:
- Previous code blockers appear fixed.
- PR263 is ready for audit-only PASS/BLOCK on exact head `34322880e3a065232e820c9e281227243678714c`.

Next required action:
1. Run audit-only PASS/BLOCK for PR263 head `34322880e3a065232e820c9e281227243678714c`.
2. If audit PASS, merge with expected head SHA.
3. After merge, verify runtime pickup and `runtime/tenant-channel-binding-matrix.json`.
