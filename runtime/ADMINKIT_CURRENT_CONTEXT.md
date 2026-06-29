# АдминКИТ — current handoff

Updated: 2026-06-29 21:59 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## First action

Read this file first, then check live GitHub state. Update this file after major events: PR/head SHA, CI red/green, audit PASS/BLOCK, merge, deploy/runtime-status, manual MAX result, live mismatch, process error.

## Working rules

Assistant is the technical executor: inspect PRs, CI, logs, fixes, repeat until green. Do not use the user as a continue button.

Every Codex prompt must say NEW TASK or FOLLOW-UP, repo, PR, branch, base, and what not to do.

Do not use GitHub `@codex` comments. Do not merge before final audit-only PASS/waiver. Green CI is not done. Merge is not done. Runtime readiness is not visual UX done.

Process guardrail after PR257: even urgent hotfixes stop after green CI and require audit-only Codex PASS/BLOCK unless the user explicitly waives audit.

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

## PR258 current state — 2026-06-29 21:59 UTC

PR258:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/258
- Title: `Separate chats from channel/post pickers and normalize root menu UX`
- Branch: `codex/separate-chats-from-channel-flows`
- Base: `main`
- Current head at handoff: `5d08f1db615837c2180c1d206b7307cb3c145cc6`
- Open, not merged, mergeable true.
- CI is RED. Latest observed run: `PR regression tests` run #466, run id `28405288186`, job `84166244907`, failed in `Run AdminKIT regression tests`.

Assistant made multiple autonomous fixes on PR258:
- Fixed recursive channel evidence check in `channel-post-picker-core.js`.
- Preserved raw chatId-only state in `human-channel-title-helper.js`.
- Allowed channel-typed chatId records while rejecting chat-like records in `channel-post-picker-core.js`.
- Cleaned root UX: removed duplicate Channels instruction/help, hid duplicate Settings help business action, shortened ad_links/highlights labels, added generic root descriptions, and made stats root compact.
- Added or used `scripts/test-channel-chat-separation-menu-ux.js`.
- Updated older regression tests to match PR258 clean stats root.

Known issue: GitHub connector log access only returns early setup/checkout output and not the failing assertion near the end. After multiple red runs, further fixes from this chat became speculative.

Audit/follow-up risks:
- `scripts/test-stats-product-perfect-contract-pr226.js` was narrowed and currently delegates to `scripts/test-channel-chat-separation-menu-ux.js`. Review this carefully; restore useful PR226 stats metric coverage if possible without reintroducing obsolete root expectations.
- Re-check `services/statsTargetsService.js`, `channel-post-picker-core.js`, `human-channel-title-helper.js`, `buttons-flow-cc8-clean.js`, `clean-bot-channel-first-post-picker-pr90.js`, and `stats-flow-cc8.js` for remaining channel/chat leakage.
- Pay special attention to channel visibility helpers that still may use unfiltered `clientAccessService.getClientChannels()` or compatibility paths like channelId/id/chatId.

## Next action

Use a FOLLOW-UP task in Codex Cloud on existing PR258/branch `codex/separate-chats-from-channel-flows`, not a new task. Codex should run the full suite, see the exact failing assertion, fix it, push to the same branch, and stop after green CI. No merge.

After PR258 CI is green, provide audit-only task. Do not merge before audit PASS/waiver.

## Completion definition

PR258 is not complete: CI red. Completion requires green CI, audit PASS, merge, deploy/runtime pickup, and manual MAX verification that channel/post pickers show only channels and chats are not offered as post targets.
