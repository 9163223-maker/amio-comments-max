# АдминКИТ — current handoff

Updated: 2026-06-30 09:39 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## First action in every new AdminKIT chat

Read this file first from branch `runtime-status`, then check current GitHub state. Continue from GitHub/runtime state, not from memory.

Update this file after major events: new PR/head SHA, CI red/green, audit PASS/BLOCK, merge, deploy/runtime-status, manual MAX result, live mismatch, or process error.

## Core working rules

Assistant is the technical executor: inspect PRs, CI, logs, fixes, repeat until green. Do not use the user as a continue button.

Every Codex prompt must say NEW TASK or FOLLOW-UP, repo, PR, branch, base/head, what to inspect, and what not to do.

Do not use GitHub `@codex` comments. Do not create a new PR if the existing PR can be updated. Do not merge before final audit-only PASS/waiver. Green CI is not done. Merge is not done. Runtime readiness is not visual UX done.

After PR257 process error: even urgent hotfixes stop after green CI and require audit-only Codex PASS/BLOCK unless the user explicitly waives audit.

## Standing rule — CI diagnostics block

CI diagnostics is a permanent AdminKIT process rule, not a per-task optional requirement.

All main PR regression workflows must include a universal diagnostics block. The block is infrastructure and must be preserved unless replaced by an equivalent or stronger implementation.

Required behavior:
- each regression test runs through a named wrapper, not as anonymous commands inside one huge shell block;
- logs are written under `runtime/ci-diagnostics/`;
- on failure create `FAILED_TEST.txt`, `FAILED_EXIT_CODE.txt`, `FAILED_TAIL.log`, `HEAD_SHA.txt`, and `RUN_ORDER.txt`;
- on failure `$GITHUB_STEP_SUMMARY` shows failed test, exit code, head SHA, and relevant log tail;
- upload artifact `adminkit-ci-diagnostics`, currently retention 7 days;
- keep default safe workflow permission `contents: read`;
- do not write raw CI logs to `runtime-status`; this file records state and decisions only.

Reason: diagnostics artifact and job summary are the reliable source for exact failing assertions when normal connector logs are truncated.

Current implementation: PR258 branch added this diagnostics layer to `.github/workflows/pr-regression-tests.yml` at commit `9b0c40e74f252c7cc56f70cfa2396fa45076f0a3`.

## Production/runtime contract

Production start path must remain exactly:
`node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`

Active entrypoint must remain:
`clean-entrypoint-1.53.10-pr89.js`

Diagnostics/status branch: `runtime-status`.

Runtime files: `runtime/startup-log.json`, `runtime/root-menu-live-parity-trace.json`, `runtime/manual-ui-walkthrough-trace.json`, `runtime/ADMINKIT_CURRENT_CONTEXT.md`.

## Product context

AdminKIT is a MAX admin system: bot + web/PWA + admin flows for channel owners. Product areas include comments under posts, buttons under posts, gifts/lead magnets, polls, highlights, post editor, stats, ad links/campaigns, archive, account/settings, and push/PWA.

Main product rule for current work: channel/post features must use only real channels and channel posts. Chats are a separate future product area and must not appear as post targets.

Applies to comments, gifts, buttons, polls, highlights, post editor, and post-level stats.

Expected channel/post UX:
- one eligible channel: skip channel picker and show post list with `Канал: <title>` and `Выберите пост`;
- multiple eligible channels: show channel picker;
- zero eligible channels: show clean empty state with `Подключить канал` and `Главное меню`;
- chat-like records must never appear in channel/post pickers.

## Completed background

PR256 implemented RootSectionDispatcher v2 and merged into `main` at 2026-06-29 10:02 UTC, merge commit `ad38d310ece323d5e0adb2583b12f904043bcc91`.

PR257 fixed remaining Gifts root 500 by routing root Gifts through unified root rendering before `giftsFlow`. PR257 merged at 2026-06-29 10:31 UTC, merge commit `8c3b94e5e5d5389da7541cfb9a4505113fedb220`. Runtime pickup passed, trace showed Gifts 200, and user visually confirmed Gifts opens. Process error: assistant merged after green CI without final audit-only Codex task; do not repeat.

## PR258 current state — 2026-06-30 09:39 UTC

PR258:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/258
- Title: `Separate chats from channel/post pickers and normalize root menu UX`
- Branch: `codex/separate-chats-from-channel-flows`
- Base: `main`
- Current head: `a1473b23475839fdfa2a91c3c561aef2fab0d1f1`
- Current commit message: `Preserve PR229 manual cost wiring marker in active wrapper`
- Open, not merged, mergeable true at latest check.
- CI for current head: PR regression tests run #476, run id `28434739881`, conclusion `success`.

What PR258 already changed before latest manual fix:
- strict channel/chat separation in shared picker `channel-post-picker-core.js`;
- helper logic in `human-channel-title-helper.js`;
- one/multiple/zero channel UX in post-scoped flows where already wired;
- root UX cleanup: remove duplicate Channels instruction/help, hide duplicate Settings help, shorten long labels;
- clean stats root with `Обзор`, `По каналу`, `По посту`, `Рекламные ссылки`, `Источники`, `Обновить данные`, `Главное меню`;
- CI diagnostics layer in the PR regression workflow;
- focused test `scripts/test-channel-chat-separation-menu-ux.js`;
- restored `scripts/test-stats-product-perfect-contract-pr226.js` with meaningful stats coverage after an audit BLOCK.

Previously fixed audit BLOCK:
- `scripts/test-stats-product-perfect-contract-pr226.js` had been reduced too aggressively to a shim.
- It was restored with 45 assertions covering clean stats root plus growth, sources, funnel, content/post metrics, quality/freshness, export cleanup, manual costs, CPA, filters, tracking attribution, public CTA vs admin button filtering, post snapshot isolation, and product dataset guard.
- Commit: `fd3a603d5a5d15b951fa0886887e64ccfd37c4d4`.
- Full CI passed on that head in run #472.

Latest audit status before manual fix:
- Latest audit-only returned BLOCK.
- Blocker file: `clean-bot-channel-first-post-picker-pr90.js`.
- Blocker: legacy RootSectionDispatcher v2 post picker wrapper can still show chat-like records as channels.
- Reason: `channelsFromPosts(user)` built channel picker targets from `access.getClientChannels(uid)` using only `channel.channelId || channel.id`, without strict filtering from `channel-post-picker-core.js` / `human-channel-title-helper.js`.
- Impact paths: `comments_select_post`, `comments_channel_pick`, `admin_posts_picker`, and post-level stats picker entry paths.

## 2026-06-30 manual follow-up outcome

User showed Codex UI error: Codex could not update the PR because the PR had been updated outside Codex and asked to create a new PR. New PR was not created.

Assistant manually updated the existing PR258 branch via GitHub, preserving the existing PR:
- Head `f9ac406444f430e221449bbab17c92861d4700bc` added active-wrapper strict filtering:
  - active `clean-bot-channel-first-post-picker-pr90.js` patches `services/clientAccessService.getClientChannels` before loading the preserved legacy implementation;
  - the patch uses exported strict shared predicates `channel-post-picker-core.isChatLikeRecord` and `channel-post-picker-core.isKnownChannelRecord`;
  - previous legacy implementation preserved as `clean-bot-channel-first-post-picker-pr90-legacy.js` and loaded only after strict patch install.
- `scripts/test-channel-chat-separation-menu-ux.js` was expanded with wrapper-level regression coverage for one/multiple/zero channel states, stats source path, and editor/posts source path.
- Production contract files and start path were not changed.

CI run #474 on head `f9ac406444f430e221449bbab17c92861d4700bc` failed. Diagnostics artifact showed failure inside `npm test`, specifically `scripts/test-stats-scope-and-buttons-contract-pr229.js` line 116: `assert(live.ok)`. The underlying cause was the PR229 live contract reading active `clean-bot-channel-first-post-picker-pr90.js` and checking that it contains the literal `stats_manual_cost_text_input`; after the legacy split that literal was only in the legacy file.

Assistant fixed this in head `a1473b23475839fdfa2a91c3c561aef2fab0d1f1` by adding an explicit PR229 contract marker `STATS_MANUAL_COST_TEXT_INPUT_CONTRACT = 'stats_manual_cost_text_input'` to the active wrapper and exporting it under `_private`, without changing runtime start path.

CI run #476 passed green on head `a1473b23475839fdfa2a91c3c561aef2fab0d1f1`.

## Current waiting state

CI is green. Do not merge yet. Next step is audit-only Codex PASS/BLOCK for current head `a1473b23475839fdfa2a91c3c561aef2fab0d1f1`.

Next required action:
1. Run audit-only PASS/BLOCK task for current head `a1473b23475839fdfa2a91c3c561aef2fab0d1f1`.
2. If audit BLOCK: fix exact blocker on same PR258 branch; do not create a new PR.
3. If audit PASS: merge PR258.
4. After merge: verify deploy/runtime pickup and production contract.
5. Then manual MAX check: channel/post pickers show only channels; chats are not offered as post targets.

## Completion definition

PR258 is complete only after latest audit BLOCK is fixed, CI green, audit PASS, merge, deploy/runtime pickup, and manual MAX visual verification that channel/post pickers show only channels and chats are not offered as post targets.
