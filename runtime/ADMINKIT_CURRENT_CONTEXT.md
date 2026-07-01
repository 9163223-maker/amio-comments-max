# АдминКИТ — current handoff

Updated: 2026-07-01 16:38 UTC
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
- Current head: `375fe00cdc1917402894bfbfd9aa1668bc122c34`
- State: open, not merged, not draft.
- Mergeable: true.
- CI: PR regression tests #575, run id `28532422052`, conclusion `success`.
- Changed files: `.github/workflows/adminkit-post-merge-runtime-check.yml`, `.github/workflows/pr-regression-tests.yml`, `package.json`, `scripts/check-post-merge-runtime-pickup.js`, `scripts/test-pr260-full-section-matrix.js`, `scripts/test-pr260-runtime-diagnostics-observable.js`, `scripts/test-pr261-reliable-runtime-diagnostics.js`, `scripts/test-pr266-northflank-runtime-observability.js`, `scripts/test-pr266-post-merge-runtime-gate.js`, `scripts/test-pr266-runtime-export-branch-safety.js`, `services/northflankStartupLogService.js`, `services/pushDispatchLogService.js`.

PR266 purpose:
- Replace placeholder Northflank startup log with real observability fetch/service payload.
- Add strict post-merge runtime pickup gate.
- Prevent runtime diagnostic export noise/writes when debug branch points to `main`.

Assistant pre-audit result:
- CI is green but PR266 is BLOCKED by review `4611108294`.
- Blocker 1: `scripts/check-post-merge-runtime-pickup.js` does not verify that `diagnostic-export-status.expectedFiles` declares all required runtime files after PR265. It does not require `runtime/live-tenant-self-diagnostic-matrix.json` (and also does not explicitly require product-semantic, tenant-channel-binding, maximal-flow). A stale PR264 diagnostic status with `missingFiles: []` and expectedCount 8 can pass diagnosticComplete if fresh enough.
- Blocker 2: `scripts/test-pr266-post-merge-runtime-gate.js` lacks fixture for the real PR265 failure mode: diagnostic status fresh/ok and missingFiles empty, but expectedFiles stale/short and no live tenant matrix.
- Blocker 3: Northflank missing config returns `ok:false` in `runtime/northflank-startup-log.json`, but PR266 does not prove diagnostic-export-status treats that semantic not-ready payload as an observability block rather than merely counting the file export as successful. If diagnostic-export-status remains file-write-only, the post-merge gate must be documented/tested as the source of truth.
- Assistant attempted direct GitHub connector patch to tighten the gate, but the update was blocked by tool safety due auth-handling code. Need Codex follow-up on existing PR266 branch.

Next required action for PR266:
1. Ask Codex to push fixes to existing branch `codex/add-northflank-runtime-observability-and-deploy-gate`; do not create new PR.
2. Required fix: in `scripts/check-post-merge-runtime-pickup.js`, define `REQUIRED_RUNTIME_FILES` including `runtime/live-tenant-self-diagnostic-matrix.json` and require every entry to be present in `diagnostic.expectedFiles` and absent from `diagnostic.missingFiles`.
3. Required fix: output `diagnostic_undeclared_required_files` and `diagnostic_missing_required_files` in `runtime-post-merge-check.json`.
4. Required fix: add tests proving stale/short diagnostic expectedFiles blocks with `likely_reason: runtime_export_failed`.
5. After new head, check CI exact head, diff, comments, then audit-only PASS/BLOCK if clean.
