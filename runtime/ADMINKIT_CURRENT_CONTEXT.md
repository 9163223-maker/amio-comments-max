# АдминКИТ — current handoff

Updated: 2026-06-30 15:58 UTC
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
- PR URL: https://github.com/9163223-maker/amio-comments-max/pull/259
- Final head: `23c417b1ef945395cce64fcc320a69427af79645`
- CI: PR regression tests #498, run id `28456674246`, success.
- Audit-only: PASS confirmed by user screenshot.
- Merge commit: `c087323dcf38d1a6bbec082efe3b9bbdb496e747`.

PR259 changed root channel filtering, post-scoped channel filtering, suspicious channel-title guards, runtime export safety, removal of committed runtime push log, and added PR259 matrix/export tests.

## Runtime pickup check
Runtime pickup confirmed from `runtime/startup-log.json`:
- latest `startedAt`: `2026-06-30T15:49:37.365Z`;
- latest `bootId`: `mr0tpdvh-bd82533d`;
- latest `githubMainHeadSha`: `c087323dcf38d1a6bbec082efe3b9bbdb496e747`;
- startup log updatedAt: `2026-06-30T15:50:27.372Z`;
- production entrypoint: `clean-entrypoint-1.53.10-pr89.js`;
- runtime contract live OK: true;
- startupPath OK: true;
- final runtime readiness gate OK: true;
- readyForManualMaxTest: true.

Repeated restart check:
- Re-check after waiting window showed the same latest bootId and same startup updatedAt.
- No newer startup/restart is visible in `runtime-status` after PR259 pickup.

Runtime export safety:
- `runtime/push-dispatch-log.json` is not present on `main` after merge.
- Main `package.json` start script remains unchanged.

Diagnostics gap:
- `runtime/channel-target-matrix.json` not found in `runtime-status` after pickup.
- `runtime/process-events.json` not found in `runtime-status` after pickup.
- `runtime/northflank-startup-log.json` not found in `runtime-status` after pickup.

## Current status
Server/runtime pickup and production contract are OK. No restart loop is visible. The new PR259 diagnostic files did not materialize in `runtime-status`, so observability is only partially achieved.

Remaining required actions:
1. Manual MAX visual check: root channel list and all post-scoped pickers show only channels, not chats.
2. Consider a small follow-up PR260 to make the new PR259 diagnostics export observable through the same proven path as startup-log.
