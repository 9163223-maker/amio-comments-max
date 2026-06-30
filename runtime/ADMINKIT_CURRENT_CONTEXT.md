# АдминКИТ — current handoff

Updated: 2026-06-30 00:25 UTC
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
GitHub keeps full job logs, but the ChatGPT GitHub connector may only expose early setup/checkout lines. The diagnostics artifact and job summary are the reliable source for exact failing assertions.

Current implementation:
PR258 branch `codex/separate-chats-from-channel-flows` added this diagnostics layer to `.github/workflows/pr-regression-tests.yml` at commit `9b0c40e74f252c7cc56f70cfa2396fa45076f0a3`.

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

User reported that post-scoped sections such as Buttons -> Add button ask to select a channel but include chats. Selecting a chat shows chat messages, not channel posts; buttons cannot attach to those messages in the current model.

Rules:
- Channel/post features must show only real channels and channel posts.
- Applies to comments, gifts, buttons, polls, highlights, post editor, and post-level stats.
- Chats must be a separate future product area, not mixed into channel/post pickers.
- Chat management is postponed for now.
- If one eligible channel exists, skip channel selection and show the post list with `Канал: <title>` and `Выберите пост`.
- If multiple eligible channels exist, show channel picker first.

## PR258 current state — 2026-06-30 00:25 UTC

PR258:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/258
- Title: `Separate chats from channel/post pickers and normalize root menu UX`
- Branch: `codex/separate-chats-from-channel-flows`
- Base: `main`
- Current observed head after diagnostics/test fix: `b968039f14ffc2dbb64102fbfeb8b3e3dd5eccfc`
- Open, not merged, mergeable true.
- CI status: run #470 started after PR177 test alignment; result pending at this context update.

Recent PR258 events:
- Diagnostics layer added to `.github/workflows/pr-regression-tests.yml`, commit `9b0c40e74f252c7cc56f70cfa2396fa45076f0a3`.
- The first diagnostics run produced artifact `adminkit-ci-diagnostics` and identified exact failing test `test-channels-push-ux-pr177`.
- Cause: old PR177 test still expected Channels root action `Инструкция`; PR258 intentionally merges/removes that duplicate and keeps `Помощь`.
- Fixed PR177 test to expect Channels root labels `Подключить канал`, `Мои каналы`, `Помощь`, `Главное меню`, commit `b968039f14ffc2dbb64102fbfeb8b3e3dd5eccfc`.

Earlier autonomous fixes on PR258:
- Fixed recursive channel evidence check in `channel-post-picker-core.js`.
- Preserved raw chatId-only state in `human-channel-title-helper.js`.
- Allowed channel-typed chatId records while rejecting chat-like records in `channel-post-picker-core.js`.
- Cleaned root UX: removed duplicate Channels instruction/help, hid duplicate Settings help business action, shortened ad_links/highlights labels, added generic root descriptions, and made stats root compact.
- Added or used `scripts/test-channel-chat-separation-menu-ux.js`.
- Updated older regression tests to match PR258 clean stats root.

Audit/follow-up risks:
- `scripts/test-stats-product-perfect-contract-pr226.js` was narrowed during red-CI work. Review this carefully; restore useful PR226 stats metric coverage if possible without reintroducing obsolete root expectations.
- Re-check `services/statsTargetsService.js`, `channel-post-picker-core.js`, `human-channel-title-helper.js`, `buttons-flow-cc8-clean.js`, `clean-bot-channel-first-post-picker-pr90.js`, and `stats-flow-cc8.js` for remaining channel/chat leakage.
- Pay special attention to channel visibility helpers that still may use unfiltered `clientAccessService.getClientChannels()` or compatibility paths like channelId/id/chatId.

## Next action

Check PR258 run #470. If CI fails, use the new `adminkit-ci-diagnostics` artifact and `$GITHUB_STEP_SUMMARY` to fix the exact failing test/assertion. Do not use Codex unless the diagnostics still leaves a large/unclear blocker.

After PR258 CI is green, provide audit-only task. Do not merge before audit PASS/waiver.

## Completion definition

PR258 is not complete until green CI, audit PASS, merge, deploy/runtime pickup, and manual MAX verification that channel/post pickers show only channels and chats are not offered as post targets.
