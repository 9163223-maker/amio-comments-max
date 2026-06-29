# АдминКИТ — current handoff

Updated: 2026-06-29 10:12 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## First action for any new chat or agent

Read this file first, then check the live GitHub state. After every major event, update this same file so another chat can continue without reading the whole conversation.

Major events to record here: new PR, new branch, new head SHA, CI red/green, Codex audit PASS/BLOCK, merge, deploy, runtime-status result, manual MAX result, live mismatch, and any process error that must not be repeated.

## Project

АдминКИТ is a MAX admin system: bot + web/PWA + admin functions for channel owners. Key product areas: channels, comments, gifts/lead magnets, buttons, stats, push, ad links, polls, highlights, post editor, archive, account, settings.

Product goal: every top-level section opens as a clear MAX screen, without stale flows, invisible screens, false success, or technical debug UI.

## Working rules

Assistant is the main technical executor: inspect PRs, diff, CI, logs, fix branches, repeat until green. The user must not be used as a continue button.

Use Codex Cloud only when direct tool work is impossible, for creating/updating a PR, or for audit-only after green CI. Do not use GitHub `@codex` comments for do-work, because it can desync the branch from Codex Cloud.

Every Codex prompt must explicitly include: task type, repo, PR, exact branch, base, what to click, and what not to click.

Green CI is not done. Merge is not done. Runtime readiness is not UX done. UX done only when live MAX click opens the section and traces confirm the correct path.

## Production contract

Production start path must remain:
`node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`

Active entrypoint:
`clean-entrypoint-1.53.10-pr89.js`

Diagnostics branch:
`runtime-status`

Runtime files:
- `runtime/startup-log.json`
- `runtime/root-menu-live-parity-trace.json`
- `runtime/manual-ui-walkthrough-trace.json`
- `runtime/ADMINKIT_CURRENT_CONTEXT.md`

After merge verify deployed SHA, startup path, readiness gates, root menu traces, and manual MAX UX.

## Why PR256 exists

PR254 merged and deployed with runtime contract green, but manual MAX testing still showed Gifts did not open. Fresh trace showed `gifts:home` reached webhook edge, payload resolved to `gifts:home`, handler was `bot.handleWebhook`, but result was 500. Adjacent sections returned 200. This proved a split-path architecture failure, not a payload or deploy issue.

Live wrapper chain:
`clean-entrypoint-1.53.10-pr89.js` -> `clean-bot-campaign-attribution-cc8336.js` -> `clean-bot-campaign-links-pr91.js` -> `clean-bot-channel-first-post-picker-pr90.js` -> wrapped legacy `bot.js`.

## Current task

Issue #255 / PR256: RootSectionDispatcher v2 — one live opening path for all top-level sections.

PR256:
- URL: https://github.com/9163223-maker/amio-comments-max/pull/256
- Branch: `codex/implement-rootsectiondispatcher-v2`
- Base: `main`
- Old head before Codex follow-up: `7614f3eb15b309148b0279e050fb6c51c775aa2a`
- Final PR head before merge: `703f1e8791b3e2537e0798862d3dc632f1176355`
- CI for final PR head: PR regression tests run #431 success.
- Codex Cloud audit-only result from user at 2026-06-29 10:01 UTC: PASS, no merge-blocking issue found.
- Merge result: PR256 squash merged into `main` at 2026-06-29 10:02 UTC; merge commit `ad38d310ece323d5e0adb2583b12f904043bcc91`.

PR256 goal: one dispatcher should parse callback payload, resolve canonical root route, reset competing flow state, select provider, render screen, deliver through one common path, write one trace chain, and return handled root callbacks cleanly.

## Previously found blocker

Codex review found two P2 issues on the old PR head:

1. `admin_section_comments` mapped to generic `comments:home` could lose selected `commentTargetPost`. If a post is already selected, legacy Comments navigation must show selected-post comments actions and must not force picking the same post again.

2. `admin_section_posts` mapped to generic `editor:home` could lose selected editor post. If a post is already selected, legacy Editor navigation must show selected-post editor actions, including `Изменить текст выбранного поста`, and must not force picking again.

These blockers were fixed before merge. Audit PASS confirmed no merge-blocking issue remained.

## Latest observed state — 2026-06-29 10:12 UTC

PR256 was squash merged to `main` as `ad38d310ece323d5e0adb2583b12f904043bcc91`. PR256 is closed and merged.

Runtime pickup is now confirmed by `runtime/startup-log.json` in `runtime-status`: latest startup log updated at `2026-06-29T10:03:47.818Z`, started at `2026-06-29T10:02:57.216Z`, and reports `githubMainHeadSha: ad38d310ece323d5e0adb2583b12f904043bcc91`.

Startup path is green in runtime contract: `entrypointExpected: clean-entrypoint-1.53.10-pr89.js`, `activeEntrypoint: clean-entrypoint-1.53.10-pr89.js`, `startupLogBootstrapRequired: true`, `expressRoutesInstalledByEntrypoint: true`, `cleanBotInstalledByEntrypoint: true`, `ok: true`.

Final runtime readiness gate is green: `finalRuntimeReadinessGate.ok: true`, `githubMainHeadVerifiedByStartupLog: true`, `missing: []`, `readyForManualMaxTest: true`.

Post-merge source check: `package.json` on `main` still has `main: clean-entrypoint-1.53.10-pr89.js` and start script exactly `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js`.

Post-merge workflow check for merge commit `ad38d310ece323d5e0adb2583b12f904043bcc91`: no pull-request-triggered workflow runs returned by `fetch_commit_workflow_runs`. This is not necessarily a failure; PR head CI #431 was green before merge and runtime contract is now green after deploy.

Trace status after runtime pickup: `runtime/root-menu-live-parity-trace.json` and `runtime/manual-ui-walkthrough-trace.json` are still old/stale, updated around `2026-06-29T08:55Z`. They still contain pre-PR256 Gifts failure (`gifts:home` lastResultKind `response_sent_500`). These files need fresh manual MAX clicks to verify PR256 live UX.

Before merge diff inspection: `LEGACY_ROOT_ACTION_ROUTES` maps `admin_section_comments` to canonical `comments:home` and `admin_section_posts` to canonical `editor:home`; `LEGACY_ROOT_RENDER_ACTIONS` preserves render actions for `admin_section_comments` and `admin_section_posts` alongside `gift_admin_open_menu`.

`renderRootSectionScreen` handles `admin_section_comments` by using `getCommentTargetPost(userId)` and rendering selected comments actions when `commentKey` exists; otherwise comments home. It handles `admin_section_posts` by using `postTargetPost || commentTargetPost` and rendering selected editor root with `Изменить текст выбранного поста` when `commentKey` exists; otherwise editor home.

`applyRootSectionAdminState` clears competing transient flows/screen ids (`giftFlow`, `buttonFlow`, `commentAdminFlow`, `postEditFlow`, active screen ids, `activeAdminFlowKind`) but does not clear selected target state, so selected post context is preserved for Comments/Editor roots.

Regression coverage was extended in `scripts/test-pr248-root-section-opening-standard.js`: selected `commentTargetPost`/`postTargetPost` is seeded, `admin_section_comments` asserts selected comments actions (`Проверить комментарии`, `Список комментариев`, `Фото в комментариях`, `Реакции и ответы`, `Настройки кнопки комментариев`) and no forced repick text; `admin_section_posts` asserts `Изменить текст выбранного поста` and no forced repick text; both assert canonical route traces (`comments:home` / `editor:home`) through RootSectionDispatcher v2.

## Next action

Runtime pickup and readiness are confirmed, but manual MAX UX is still required. Do not count runtime readiness as UX done.

Next agent should ask/run manual MAX root section UX verification:
1. Click Gifts / `gifts:home` from the live MAX admin menu and confirm it opens visually, no 500.
2. Click all top-level sections: main, channels, comments, gifts, buttons, stats, push, ad_links, polls, highlights, editor, archive, account, settings.
3. Re-check `runtime/root-menu-live-parity-trace.json` and `runtime/manual-ui-walkthrough-trace.json` after clicks. They must be fresh after `2026-06-29T10:03Z` and show successful responses, especially `gifts:home` `response_sent_200` or equivalent delivered success.
4. Confirm traces show RootSectionDispatcher v2 path/provider/owner where applicable.

If fresh manual traces still show Gifts 500 or generic selected-state loss for Comments/Editor, treat as live blocker and fix/redeploy.

## Completion definition

After audit PASS, merge, deploy/runtime pickup, task is still not complete until manual MAX verification passes. Task is complete only when Gifts and all top-level sections open visually in live MAX and traces confirm RootSectionDispatcher v2 path.
