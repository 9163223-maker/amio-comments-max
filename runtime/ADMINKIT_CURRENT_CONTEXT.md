# АдминКИТ — current handoff

Updated: 2026-07-02 17:42 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

Read this file first, then check current GitHub state.

Rules:
- Do not use GitHub `@codex` comments.
- Do not write to `main` directly.
- Do not merge without final audit-only PASS or explicit waiver.
- Green CI alone is not enough.
- Production start path must remain unchanged.
- Active entrypoint must remain `clean-entrypoint-1.53.10-pr89.js`.
- Channel/post features must show only real channel/post targets; chats are separate.

## PR272
PR272 is merged.
Merge commit: `933ca0c89a71f67c9f8e640e8775084f5d02ff4a`.
Runtime pickup is confirmed by startup-log: deployed GitHub main head equals the merge commit.
Startup contract is OK.

PR272 resolver result is good:
- live official channel resolution runtime is PR272;
- channels resolved: 4;
- non-channel records separated: 3;
- unresolved: 0;
- blocks: 0.

Remaining runtime gate after PR272:
- live tenant self diagnostic still reports missing tenant for the active live user;
- tenant section matrix is still not green;
- picker already shows the 4 official channels.

Cause:
- old live tenant diagnostic used the legacy access repository lookup only;
- it did not read the clean-core user-to-tenant database relation.

## PR273
PR273 is open.
URL: https://github.com/9163223-maker/amio-comments-max/pull/273
Title: `PR273: Clean-core tenant lookup for live diagnostics`
Branch: `codex/pr273-live-tenant-diagnostic-clean-core-lookup`
Base: `main`
Base SHA: `933ca0c89a71f67c9f8e640e8775084f5d02ff4a`
Current head SHA: `f901f4914281a16ab164b9d046d6996da7c8a11c`
State: open, not merged, mergeable true.
CI: `PR regression tests`, run `685`, exact-head success.
Artifact: `adminkit-ci-diagnostics`, id `8046844845`, digest `sha256:4ed3cec9d8e1e69420d470127d284f304a7f479a63a3c7194ab9c87e68b71f01`.
Changed files:
- `services/liveTenantSelfDiagnosticService.js`
- `scripts/test-pr273-live-tenant-diagnostic-clean-core.js`
- `package.json`

PR273 adds database-backed tenant lookup for the live diagnostic and a regression test. It does not change production start path.

Process note:
A temporary marker file was accidentally created and deleted on the PR273 branch only. It did not touch main. Final diff contains only the intended files.

## Next action
Run final audit-only PASS/BLOCK for PR273 at exact head `f901f4914281a16ab164b9d046d6996da7c8a11c`.
Do not merge until audit PASS or waiver.

Audit focus:
- diagnostic finds tenant through clean-core database relation;
- false missing-tenant result is gone when the database relation exists;
- output stays masked;
- SQL values are parameterized;
- dynamic column names are from checked allowlists;
- start path and entrypoint unchanged;
- final diff only intended files;
- picker/classification behavior outside diagnostic path unchanged.

After audit PASS: merge exact audited head, update this file, wait for runtime pickup, verify live matrices green, then manual MAX check.
