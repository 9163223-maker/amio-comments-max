# АдминКИТ — current handoff

Updated: 2026-07-01 17:03 UTC
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
PR265: merged 2026-07-01 after audit PASS. Merge commit `f63d7c900b6f38af6b10ad705b6c5663be31d0af`. Runtime pickup BLOCKED/not observed as of 15:53 UTC.

## PR265 details
PR265:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/265
- Final head: `67e9060d2c8d0b06749f70135a00faba38559e7b`
- Merge commit: `f63d7c900b6f38af6b10ad705b6c5663be31d0af`.
- CI #572 success, audit-only PASS, merged squash.
- Purpose: generic live tenant self-diagnostic for current MAX user, visible account entry, private commands, runtime export `runtime/live-tenant-self-diagnostic-matrix.json`.

Post-merge runtime status:
- package.json on main: start path unchanged: `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`.
- Northflank commit status for merge commit `f63d7c900b6f38af6b10ad705b6c5663be31d0af`: success (`deep-business-9777`).
- Rechecked at 2026-07-01 15:25 UTC: `runtime/startup-log.json` remains stale: `updatedAt` `2026-07-01T12:24:16.220Z`; latest `githubMainHeadSha` is still PR264 merge `f4f32c4fd2fdd6c12d034638c74861cb5f4ee55f`.
- Rechecked at 2026-07-01 15:25 UTC: `runtime/live-tenant-self-diagnostic-matrix.json` is still missing / 404.
- Rechecked at 2026-07-01 15:25 UTC: `runtime/diagnostic-export-status.json` is still stale at `2026-07-01T12:24:02.576Z`, expectedCount 8, and expectedFiles does not include live tenant diagnostic matrix.
- Therefore PR265 code merge succeeded, but production runtime pickup/export is still not confirmed. Treat as post-merge runtime BLOCK/live mismatch until startup-log updates to `f63d7c900b6f38af6b10ad705b6c5663be31d0af` and live tenant matrix appears.

Northflank runtime log observability finding — 2026-07-01 15:53 UTC:
- `runtime/northflank-startup-log.json` exists but is not a real Northflank runtime log. It is a placeholder payload from PR259 with `configured:false` and reason `missing NORTHFLANK_API_TOKEN,NORTHFLANK_PROJECT_ID,NORTHFLANK_SERVICE_ID`; generatedAt `2026-07-01T12:23:22.120Z`.
- `services/northflankStartupLogService.js` only exports a configured/unconfigured payload and sanitized optional fields passed via input/env. It does not actually call the Northflank API to fetch deployment/runtime logs. Even with env present, current implementation would not fetch real logs unless input/status fields are supplied by another layer.
- Therefore the project does not currently have real Northflank runtime log observability in `runtime-status`.

## PR266 current state
PR266:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/266
- Title: `Real Northflank runtime observability and post-merge deploy gate`
- Branch: `codex/add-northflank-runtime-observability-and-deploy-gate`
- Base: `main`
- Base SHA: `f63d7c900b6f38af6b10ad705b6c5663be31d0af`
- Current head: `c9337a7dc1525cefd45b9f8692493e4339aefb98`
- State: open, not merged, not draft.
- Mergeable: true.
- CI: PR regression tests #579, run id `28534255353`, status `in_progress` as of 17:03 UTC.
- Changed files: `.github/workflows/adminkit-post-merge-runtime-check.yml`, `.github/workflows/pr-regression-tests.yml`, `package.json`, `scripts/check-post-merge-runtime-pickup.js`, `scripts/test-pr260-full-section-matrix.js`, `scripts/test-pr260-runtime-diagnostics-observable.js`, `scripts/test-pr261-reliable-runtime-diagnostics.js`, `scripts/test-pr266-northflank-runtime-observability.js`, `scripts/test-pr266-post-merge-runtime-gate.js`, `scripts/test-pr266-runtime-export-branch-safety.js`, `services/northflankStartupLogService.js`, `services/pushDispatchLogService.js`.

PR266 purpose:
- Replace placeholder Northflank startup log with real observability fetch/service payload.
- Add strict post-merge runtime pickup gate.
- Prevent runtime diagnostic export noise/writes when debug branch points to `main`.

PR266 fix status:
- Initial Codex PR266 head `375fe00cdc1917402894bfbfd9aa1668bc122c34` had CI #575 success but was BLOCKED by review `4611108294`.
- BLOCK reason: post-merge gate did not require `diagnostic-export-status.expectedFiles` to declare all required runtime files, especially `runtime/live-tenant-self-diagnostic-matrix.json`; tests did not cover stale/short expectedFiles.
- Direct GitHub connector first patch was blocked by tool safety due auth-handling code.
- Assistant then updated PR266 branch directly with a safer implementation avoiding direct auth handling in `scripts/check-post-merge-runtime-pickup.js`; it uses `gh api` for GitHub contents reads.
- New head `c9337a7dc1525cefd45b9f8692493e4339aefb98` now defines `REQUIRED_RUNTIME_FILES` including `runtime/live-tenant-self-diagnostic-matrix.json`, product-semantic, tenant-channel-binding, maximal-flow, etc.
- `diagnosticComplete` now requires every required file to be present in `diagnostic.expectedFiles` and absent from `diagnostic.missingFiles`.
- `runtime-post-merge-check.json` now outputs `diagnostic_expected_files_count`, `diagnostic_undeclared_required_files`, and `diagnostic_missing_required_files`.
- `scripts/test-pr266-post-merge-runtime-gate.js` now includes a regression where expectedFiles is stale/short and omits `runtime/live-tenant-self-diagnostic-matrix.json`; it must fail with `likely_reason: runtime_export_failed`.

Next required action:
1. Wait for CI #579 on head `c9337a7dc1525cefd45b9f8692493e4339aefb98`.
2. If CI red, inspect diagnostics and fix in same PR266 branch.
3. If CI green, re-check PR266 diff/comments and run audit-only PASS/BLOCK.
4. Do not merge PR266 until audit PASS.
