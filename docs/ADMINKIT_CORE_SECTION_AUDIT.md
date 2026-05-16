# AdminKit Core section audit

Runtime marker: `ADMINKIT-CORE-1.30-SECTION-AUDIT-FLOW-TEXT`

This document fixes the current architecture contract for the Core migration.

## Non-negotiable rules

1. Legacy tables may be inspected diagnostically only.
2. Legacy tables must not become permanent Core adapters.
3. Old patched posts must not force new compatibility layers into Core.
4. All destructive actions stay disabled until there is a dry-run preview and an explicit confirm flow.
5. Writes are allowed only through explicit Core flows and clean tables.

## Current section matrix

| Section | Current Core status | Writes | Clean storage / target | Next step |
|---|---:|---:|---|---|
| Channels | read-only | off | `ak_admin_channels`, `ak_channels` | migrate connect-channel flow into Core later |
| Comments | read-only/audit | off | `ak_posts`, `ak_admin_channels`, `ak_admin_sessions` | design clean comments data adapter, no old patched-link compatibility layer |
| Buttons | clean flow | on | `ak_post_buttons` | finish manual test: title -> URL -> save -> count = 1 |
| Lead magnets | clean flow/audit | planned | `ak_post_lead_magnets` | reuse flowEngine + text-input bridge after buttons flow is verified |
| Moderation | read-only/audit | off | `ak_moderation_rules`, `ak_posts`, `ak_admin_channels` | split channel/post scope, then add dry-run actions |
| Archive | read-only/audit | off | `ak_posts`, `ak_post_buttons`, `ak_post_lead_magnets` | design soft archive + restore preview + confirm |
| Stats | read-only/audit | off | `ak_posts`, `ak_post_buttons`, `ak_post_lead_magnets`, `ak_admin_channels` | add statsDataAdapter with limited/cached aggregations |
| Settings | read-only/audit | off | `ak_accounts`, `ak_account_admins`, `ak_admin_channels`, `ak_plan_events` | add settingsDataAdapter; writes only with audit event + confirm |

## Current manual checkpoint

The next user-side checkpoint is still the button flow:

1. Wait for redeploy.
2. Open `/debug/core?t=flowText1`.
3. Confirm `coreCallbackBridge.runtimeVersion = ADMINKIT-CORE-CALLBACK-BRIDGE-1.4-FLOW-TEXT-INPUT`.
4. Return to MAX step 2/4 and send the title again: `Выиграй приз`.
5. Expect step 3/4 URL input.
6. Send `https://example.com`.
7. Expect step 4/4 and save into Core.

## What must not be done next

- Do not enable `ADMINKIT_CORE_CANARY_ALL=1`.
- Do not patch MAX posts yet.
- Do not migrate old buttons from `ak_comment_banners_v3`.
- Do not add legacy compatibility adapters.
- Do not enable moderation/archive destructive actions.

## Next clean build after manual test

If button save works, the next build should be a clean patch pipeline:

`ak_post_buttons -> Core post patch payload -> selected MAX post update`

The patch pipeline must be isolated, canary-gated, and must not read legacy button tables as a source.
