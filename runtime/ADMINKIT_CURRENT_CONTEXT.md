# АдминКИТ — current handoff

Updated: 2026-06-29 10:05 UTC
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
- Merge result: PR256 squash merged into `main` at 2026-06-29 10:04 UTC; merge commit `ad38d310ece323d5e0adb2583b12f904043bcc91`.

PR256 goal: one dispatcher should parse callback payload, resolve canonical root route, reset competing flow state, select provider, render screen, deliver through one common path, write one trace chain, and return handled root callbacks cleanly.

## Previously found blocker

Codex review found two P2 issues on the old PR head:

1. `admin_section_comments` mapped to generic `comments:home` could lose selected `commentTargetPost`. If a post is already selected, legacy Comments navigation must show selected-post comments actions and must not force picking the same post again.

2. `admin_section_posts` mapped to generic `editor:home` could lose selected editor post. If a post is already selected, legacy Editor navigation must show selected-post editor actions, including `Изменить текст выбранного поста`, and must not force picking again.

These blockers were fixed before merge. Audit PASS confirmed no merge-blocking issue remained.

## Latest observed state — 2026-06-29 10:05 UTC

PR256 branch was updated after the Codex Cloud follow-up. PR head changed from `7614f3eb15b309148b0279e050fb6c51c775aa2a` to `703f1e8791b3e2537e0798862d3dc632f1176355`, then PR256 was squash merged to `main` as `ad38d310ece323d5e0adb2583b12f904043bcc91`.

GitHub Actions for final PR head `703f1e8791b3e2537e0798862d3dc632f1176355`: workflow `PR regression tests` run #431 completed with conclusion `success`; job `AdminKIT regression tests` completed with conclusion `success`.

Diff inspection before merge: `LEGACY_ROOT_ACTION_ROUTES` maps `admin_section_comments` to canonical `comments:home` and `admin_section_posts` to canonical `editor:home`; `LEGACY_ROOT_RENDER_ACTIONS` preserves render actions for `admin_section_comments` and `admin_section_posts` alongside `gift_admin_open_menu`.

`renderRootSectionScreen` handles `admin_section_comments` by using `getCommentTargetPost(userId)` and rendering selected comments actions when `commentKey` exists; otherwise comments home. It handles `admin_section_posts` by using `postTargetPost || commentTargetPost` and rendering selected editor root with `Изменить текст выбранного поста` when `commentKey` exists; otherwise editor home.

`applyRootSectionAdminState` clears competing transient flows/screen ids (`giftFlow`, `buttonFlow`, `commentAdminFlow`, `postEditFlow`, active screen ids, `activeAdminFlowKind`) but does not clear selected target state, so selected post context is preserved for Comments/Editor roots.

Regression coverage was extended in `scripts/test-pr248-root-section-opening-standard.js`: selected `commentTargetPost`/`postTargetPost` is seeded, `admin_section_comments` asserts selected comments actions (`Проверить комментарии`, `Список комментариев`, `Фото в комментариях`, `Реакции и ответы`, `Настройки кнопки комментариев`) and no forced repick text; `admin_section_posts` asserts `Изменить текст выбранного поста` and no forced repick text; both assert canonical route traces (`comments:home` / `editor:home`) through RootSectionDispatcher v2.

## Next action

Post-merge/deploy verification is still required. Do not count merge as done.

Next agent should:
1. Check whether deployment has picked up merge commit `ad38d310ece323d5e0adb2583b12f904043bcc91`.
2. Verify production start path still exactly equals `node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js` and active entrypoint is `clean-entrypoint-1.53.10-pr89.js`.
3. Verify runtime/startup-log.json and readiness gates.
4. Verify `runtime/root-menu-live-parity-trace.json` / manual trace after live clicks.
5. Run manual MAX root section UX test. Task is complete only when Gifts and all top-level sections open visually in live MAX and traces confirm RootSectionDispatcher v2 path.

If deploy/runtime shows old SHA or old startup path: treat as live mismatch and do not mark done.

## Completion definition

After audit PASS and merge, task is still not complete until deploy/runtime/manual MAX verification passes. Task is complete only when Gifts and all top-level sections open visually in live MAX and traces confirm RootSectionDispatcher v2 path.
