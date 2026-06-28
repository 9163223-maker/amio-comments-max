# АдминКИТ current context

Updated: 2026-06-28 06:14 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## Main rule

User is not a Continue button. Once the task is clear and work is in a PR branch, the assistant must run the loop independently: inspect PR, inspect CI, read logs, fix branch, rerun CI, repeat until green, then provide a Codex Cloud audit-only prompt. Ask the user only for UI actions the assistant cannot perform, merge approval, business decisions, or manual MAX testing.

Do not send empty progress messages such as accepted/continuing/checking. Reply only with a result, an audit prompt, or a real blocker.

## Production rule

A task is not done after CI or merge. After merge always verify live runtime: package start path, active entrypoint, deployed main SHA, startup log in runtime-status, root-menu traces, manual walkthrough traces, final readiness gate, and manual MAX scenario.

Required production start path remains: node preloaded with pr178 push pairing bootstrap and clean-entrypoint-1.53.10-pr89.js. Active entrypoint remains clean-entrypoint-1.53.10-pr89.js.

Diagnostics branch: runtime-status. Main startup log: runtime/startup-log.json. Root traces: runtime/root-menu-live-parity-trace.json and runtime/manual-ui-walkthrough-trace.json.

## Product root menu

Canonical top-level sections: Channels, Comments, Gifts / lead magnets, Buttons under posts, Stats, Push notifications, Ad links, Polls, Highlights, Editor, Archive, Account, Settings.

Source of canonical menu: features/menu-v3/canonical-menu.js.

Root sections must open through one shared root-section standard. Do not fix Gifts with a separate renderer or a one-off fallback.

## Current bug and intended fix

Gifts root did not visually open in live MAX. After PR249 it was confirmed that gifts:home reaches webhook edge with correct payload and returns HTTP 200, but live production is intercepted by the clean-wrapper path before the shared root-section render and delivery chain.

Live wrapper chain: clean-entrypoint-1.53.10-pr89.js -> clean-bot-campaign-attribution-cc8336.js -> clean-bot-campaign-links-pr91.js -> clean-bot-channel-first-post-picker-pr90.js -> wrapped legacy bot.

Correct solution: gifts:home, admin_section_gifts, and gift_admin_open_menu should bridge into the shared root-section path. Stats, buttons, archive, editor/posts, and picker actions must remain on local clean handlers.

## PR history for this task

Relevant PRs: 241, 242, 243, 244, 245, 246, 247, 248, 249, 251, 252.

PR250 is the Codex Cloud issue/task name. PR251 was an earlier GitHub PR attempt and is superseded. PR252 is current.

## Current PR

PR252: Refine root-section bridging: route Gifts to legacy wrapper and tighten buttons/stats handling.
Branch: codex/github-mention-pr250-bridge-clean-wrapper-root-callbacks-t.
Base: main.
Head: 96ebcadd058e69b37f5672d3be2dce2a0e4d29dd.
State at this update: draft, mergeable, CI green on PR regression tests run 417.

Changed files: clean-bot-channel-first-post-picker-pr90.js, scripts/test-pr250-clean-wrapper-root-bridge.js, scripts/test-product-perfect-gifts-journey-pr142.js, scripts/smoke-test.js.

CI green is not enough. Next stage is Codex Cloud audit-only for PR252.

## Required audit checks

Codex audit must verify: Gifts uses shared root-section path, not a Gifts-only renderer; bridge eligibility is narrow; decoded object payload support remains; stats/buttons/archive/editor/posts remain local clean-owned paths; PR250 bridge regression is actually included in smoke/CI; softened assertions in the Gifts journey test do not hide a real regression; no production startup or canonical menu contracts changed; diagnostics are not written to main.

Important unresolved audit risk: when a user is inside an active Gifts wizard and taps a local root such as Stats or Buttons, stale gift/comment flow state must be reset before local rendering. If this is not fixed or not covered, audit should BLOCK.

## Next steps for any new chat

1. Do not ask the user to continue.
2. Check PR252 and the result of Codex audit.
3. If audit PASS: proceed toward merge, then live runtime verification.
4. If audit BLOCK: fix PR252, run CI to green, then repeat audit-only.
5. After merge, verify Northflank/runtime-status/startup traces.
6. Ask the user for manual MAX Gifts click only after runtime readiness is confirmed.
