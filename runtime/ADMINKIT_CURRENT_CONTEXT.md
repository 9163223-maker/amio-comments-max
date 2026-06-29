# АдминКИТ — current handoff

Updated: 2026-06-29 09:08 UTC
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
- CI before follow-up: PR regression tests run #429 success.

PR256 goal: one dispatcher should parse callback payload, resolve canonical root route, reset competing flow state, select provider, render screen, deliver through one common path, write one trace chain, and return handled root callbacks cleanly.

## Current blocker

Codex review found two P2 issues:

1. `admin_section_comments` mapped to generic `comments:home` can lose selected `commentTargetPost`. If a post is already selected, legacy Comments navigation must show selected-post comments actions and must not force picking the same post again.

2. `admin_section_posts` mapped to generic `editor:home` can lose selected editor post. If a post is already selected, legacy Editor navigation must show selected-post editor actions, including `Изменить текст выбранного поста`, and must not force picking again.

Direct code editing in this chat was blocked by the tool layer when trying to edit PR256 code files. User sent Codex Cloud follow-up at about 2026-06-29 09:03 UTC in the existing PR256 task.

## Next action

Check PR256 now. Compare current head with old head `7614f3eb15b309148b0279e050fb6c51c775aa2a`.

If Codex updated PR256: inspect diff, changed files, workflow runs for new head. If CI red, read logs and fix. If CI green, verify blocker coverage and then prepare audit-only prompt.

If Codex did not update PR256: do not ask the user to continue. Try safe direct edit if possible. If blocked again, give an exact Codex Cloud follow-up for the same PR256 task and branch.

## Audit-only after green CI

Audit prompt must say: type is new audit-only task, repo `9163223-maker/amio-comments-max`, PR `#256`, branch `codex/implement-rootsectiondispatcher-v2`, base `main`, do not edit, do not push, do not create PR, do not merge.

## Completion definition

After audit PASS, merge PR256, wait deploy, verify runtime startup log and readiness gates, then manual MAX test. Task is complete only when Gifts and all top-level sections open visually in live MAX and traces confirm RootSectionDispatcher v2 path.
