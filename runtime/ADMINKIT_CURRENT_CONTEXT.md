# АдминКИТ — current handoff

Updated: 2026-06-30 08:47 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## First action

Read this file first, then check live GitHub state. Update this file after major events: PR/head SHA, CI red/green, audit PASS/BLOCK, merge, deploy/runtime-status, manual MAX result, live mismatch, process error.

## Working rules

Assistant is the technical executor: inspect PRs, CI, logs, fixes, repeat until green. Do not use the user as a continue button.

Every Codex prompt must say NEW TASK or FOLLOW-UP, repo, PR, branch, base, and what not to do.

Do not use GitHub `@codex` comments. Do not merge before final audit-only PASS/waiver. Green CI is not done. Merge is not done. Runtime readiness is not visual UX done.

Process guardrail after PR257: even urgent hotfixes stop after green CI and require audit-only Codex PASS/BLOCK unless the user explicitly waives audit.

## Standing rule — CI diagnostics block

This is now a permanent AdminKIT process rule, not a per-task optional requirement.

All main PR regression workflows must include a universal CI diagnostics block. The diagnostics block is infrastructure and must be preserved across tasks unless replaced by an equivalent or stronger implementation.

Required behavior:
- Each regression test must run through a named wrapper, not as an anonymous command inside one huge shell block.
- The workflow must write separate logs for each test under `runtime/ci-diagnostics/`.
- On failure, it must create `FAILED_TEST.txt`, `FAILED_EXIT_CODE.txt`, `FAILED_TAIL.log`, `HEAD_SHA.txt`, and `RUN_ORDER.txt`.
- On failure, `$GITHUB_STEP_SUMMARY` must show the failed test name, exit code, head SHA, and the last relevant log lines.
- On every run, the workflow must upload artifact `adminkit-ci-diagnostics` with short retention, currently 7 days.
- The diagnostics block must stay reusable and clearly separated from product tests. Prefer a dedicated named workflow block or a future shared script such as `scripts/ci/run-admin-kit-regression-with-diagnostics.sh`.
- Do not give the normal regression workflow write permissions just for diagnostics. Default safe permission is `contents: read`.
- Do not write raw CI logs into `runtime-status` as the primary mechanism. `runtime-status` records state and decisions; CI artifacts/summary contain raw logs.
- Any future workflow refactor must keep this contract or explicitly improve it.

Reason:
The diagnostics artifact and job summary are the reliable source for exact failing assertions when normal connector logs are truncated.

## Production contract

Production start path must remain exactly:
`node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`

Active entrypoint must remain:
`clean-entrypoint-1.53.10-pr89.js`

Diagnostics branch: `runtime-status`.

Runtime files: `runtime/startup-log.json`, `runtime/root-menu-live-parity-trace.json`, `runtime/manual-ui-walkthrough-trace.json`, `runtime/ADMINKIT_CURRENT_CONTEXT.md`.

## Completed context

PR256 implemented RootSectionDispatcher v2 and was merged into `main` at 2026-06-29 10:02 UTC, merge commit `ad38d310ece323d5e0adb2583b12f904043bcc91`.

PR257 fixed the remaining Gifts root 500 by routing root Gifts through unified root rendering before `giftsFlow`. PR257 merged at 2026-06-29 10:31 UTC, merge commit `8c3b94e5e5d5389da7541cfb9a4505113fedb220`. User later provided postfactum audit PASS. Runtime pickup passed, trace showed Gifts 200, and user visually confirmed Gifts opens at 2026-06-29 13:15 UTC.

PR257 process error: assistant merged after green CI without final audit-only Codex task. Do not repeat.

## Product requirement — channels vs chats

Rules:
- Channel/post features must show only real channels and channel posts.
- Applies to comments, gifts, buttons, polls, highlights, post editor, and post-level stats.
- Chats must be a separate future product area, not mixed into channel/post pickers.
- Chat management is postponed for now.
- If one eligible channel exists, skip channel selection and show the post list with `Канал: <title>` and `Выберите пост`.
- If multiple eligible channels exist, show channel picker first.

## PR258 current state — 2026-06-30 08:47 UTC

PR258:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/258
- Title: `Separate chats from channel/post pickers and normalize root menu UX`
- Branch: `codex/separate-chats-from-channel-flows`
- Base: `main`
- Current head: `fd3a603d5a5d15b951fa0886887e64ccfd37c4d4`
- Open, not merged, mergeable true.
- CI was green on run #472 for this head before the latest audit BLOCK.

Latest audit status:
- Audit-only returned BLOCK.
- Blocker file: `clean-bot-channel-first-post-picker-pr90.js`.
- Blocker: the legacy post picker wrapper still builds channel targets from `access.getClientChannels(uid)` using only `channel.channelId || channel.id` and can leak chat-like records into comments/editor/stats post picker paths.
- Required fix: make this wrapper use the same strict eligible-channel source/predicate as PR258 shared picker and add wrapper-level tests for one/multiple/zero channel states plus chat-like exclusion. Full CI must be rerun.

Previously fixed audit BLOCK:
- PR226 stats regression coverage was restored in `scripts/test-stats-product-perfect-contract-pr226.js` with 45 assertions.
- Commit: `fd3a603d5a5d15b951fa0886887e64ccfd37c4d4`.
- Full CI passed on that head in run #472.

## Next action

Use a FOLLOW-UP Codex task on existing PR258/branch `codex/separate-chats-from-channel-flows` to fix only the latest BLOCK in `clean-bot-channel-first-post-picker-pr90.js`. Do not create a new PR. Do not merge. After Codex pushes, check CI. If green, run audit-only again.

## Completion definition

PR258 is not complete until latest audit BLOCK is fixed, CI green, audit PASS, merge, deploy/runtime pickup, and manual MAX verification that channel/post pickers show only channels and chats are not offered as post targets.
