# АдминКИТ — current handoff

Updated: 2026-06-30 18:32 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## First action in every new AdminKIT chat
Read this file first from branch `runtime-status`, then check current GitHub state. Continue from GitHub/runtime state, not from memory.

Update this file after major events: new PR/head SHA, CI red/green, audit PASS/BLOCK, merge, deploy/runtime-status, manual MAX result, live mismatch, or process error.

## Core rules
Do not use GitHub `@codex` comments. Do not create a new PR if the existing PR can be updated. Do not merge before final audit-only PASS/waiver. Green CI is not done. Merge is not done. Runtime readiness is not visual UX done.

Production start path must remain:
`node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`

Active entrypoint must remain:
`clean-entrypoint-1.53.10-pr89.js`

Diagnostics branch: `runtime-status`.

## Product rule
Channel/post features must use only real channels and channel posts. Chats are a separate future product area and must not appear as channel/post targets. This includes root channel management and all post-scoped flows.

## PR259 status
PR259 merged into `main` at 2026-06-30 15:50 UTC.
- Final head: `23c417b1ef945395cce64fcc320a69427af79645`
- CI: PR regression tests #498, success.
- Audit-only: PASS.
- Merge commit: `c087323dcf38d1a6bbec082efe3b9bbdb496e747`.

Runtime pickup for PR259 was confirmed from `runtime/startup-log.json`. No restart loop was visible. PR259 diagnostic files did not materialize in `runtime-status`, so PR260 was opened.

## PR260 status
PR260:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/260
- Title: `Runtime observable full section matrix diagnostics`
- Branch: `codex/add-runtime-diagnostics-for-adminkit-sections`
- Base: `main`
- Final head: `a70ab9116f3b9dab6b01f1cd6351f5d0e99dd222`
- CI after audit-block fix: PR regression tests #505, run id `28465897836`, conclusion `success`.
- Audit-only: PASS confirmed by user screenshot at 2026-06-30 18:18 UTC.
- Merged into `main` at 2026-06-30 18:20 UTC.
- Merge commit: `cc33ac39aee2817070ea8e65693553d36df103aa`.

PR260 goal:
- Make PR259 diagnostics observable after deploy by wiring `channel-target-matrix`, `process-events`, `northflank-startup-log`, and `full-section-matrix` through the proven startup-log runtime-status export path.
- Add detailed server-side full-section matrix for all main sections and post-scoped routes.

Audit BLOCK before PASS:
- Blocker file: `services/fullSectionMatrixService.js`.
- Reason: `buildMatrix()` did not detect chat-like fixture IDs leaking in callback payloads.
- Fix applied: derive dangerous fixture values from `channelMatrix.dangerousRecords(...)` and scan visible text/buttons and callback payload strings; add negative monkeypatch test that injects dangerous payload ID and expects matrix failure.

## PR260 post-merge runtime check — 2026-06-30 18:32 UTC
Runtime pickup confirmed:
- `runtime/startup-log.json` latest `updatedAt`: `2026-06-30T18:20:23.961Z`.
- latest `startedAt`: `2026-06-30T18:19:41.359Z`.
- latest `bootId`: `mr0z27sa-bd75e982`.
- latest `githubMainHeadSha`: `cc33ac39aee2817070ea8e65693553d36df103aa`.
- `runtimeStatusExportBranch`: `runtime-status`.
- `commitSource`: `github-main-head`.
- production entrypoint: `clean-entrypoint-1.53.10-pr89.js`.
- runtime contract live OK: true.
- startupPath OK: true.
- dataProviders OK: true.
- mismatches: []
- finalRuntimeReadinessGate OK: true.
- missing: []
- readyForManualMaxTest: true.
- `package.json` on main keeps start script unchanged: `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`.

Restart stability:
- No later startup-log update after `2026-06-30T18:20:23.961Z` was visible at 18:32 UTC.
- The log contains two records with the same `startedAt` immediately after pickup, but no later repeated restart/update is visible. Treat as no observed restart loop.

Diagnostics result:
- `runtime/full-section-matrix.json`: present in `runtime-status` and OK.
  - runtime: `PR260-FULL-SECTION-MATRIX`.
  - generatedAt: `2026-06-30T18:19:43.858Z`.
  - sectionsChecked: main, channels, comments, gifts, buttons, stats, push, ad_links, polls, highlights, editor, archive, account, settings.
  - routesChecked: 37 routes.
  - scenarios: zero_channels, one_channel, multiple_channels, dangerous_chat_records, empty_channel_without_posts, selected_channel_with_posts.
  - violations: []
  - summary: totalViolations 0, blockCount 0, warnCount 0, chatLeakCount 0, payloadIssueCount 0, technicalLeakCount 0.
- `runtime/channel-target-matrix.json`: NOT FOUND in `runtime-status`.
- `runtime/process-events.json`: NOT FOUND in `runtime-status`.
- `runtime/northflank-startup-log.json`: NOT FOUND in `runtime-status`.

Interpretation:
- Product/server matrix objective is achieved for full-section matrix and covers gifts/lead-magnets and buttons routes with no violations.
- Observability objective is only partially achieved because three expected PR260 diagnostic files still did not materialize.
- Likely cause: PR260 starts several `startupLog.exportRuntimeJson()` writes concurrently from bootstrap. The simple contents-API exporter has no retry/serialization. One export (`full-section-matrix`) succeeded; the others likely collided/failed/skipped. The errors only go to container logs and are not exported to `runtime-status`.

Codex Review P2 suggestions seen after merge:
- dangerous record IDs in leak checks: addressed by assistant fix before audit PASS.
- remaining non-blocking hardening candidates: do not filter blank labels before validation; validate missing/empty callback payloads; assert rendered root buttons before reporting sections; preserve configured runtime branch. These were not audit blockers but should be considered for PR261 if we decide to harden diagnostics further.

Current conclusion:
- Runtime pickup: PASS.
- Production contract: PASS.
- Full-section matrix: PASS.
- Gifts/lead-magnets and buttons matrix status: PASS in full-section matrix.
- Complete PR260 observability: PARTIAL/BLOCKED for missing channel-target/process-events/northflank files.

Recommended next PR:
PR261 — serialize/retry runtime diagnostic exports and harden full-section matrix P2 gaps. It should make all expected diagnostic files reliably materialize in `runtime-status`, with sequential writes/retry/backoff, and cover blank button labels/missing payload/root-button integrity.
