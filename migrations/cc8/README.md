# Clean Core 8.0.0 database foundation

Scope of this folder: Postgres migrations only.

This step intentionally does not change:

- bot UI;
- Telegram-style comments UI;
- post patching;
- webhook routing;
- runtime entrypoint;
- production JS logic.

## Migration

`001_clean_core_foundation.sql`

Adds the first Clean Core 8.0.0 database foundation:

- migration registry;
- tenants;
- users;
- tariffs;
- feature access;
- subscriptions;
- referrals;
- additive tenant/user columns for legacy `ak_channels` and `ak_posts`;
- comments;
- reactions;
- CTA buttons;
- gift campaigns;
- gift claims;
- polls;
- poll votes;
- archive snapshots;
- audit log;
- debug snapshots.

## Design principles

1. Postgres becomes the source of truth.
2. All user-owned data must be linked to `owner_user_id` and `tenant_id`.
3. Existing legacy tables are not dropped or destructively changed.
4. This migration is additive and safe to review before runtime integration.
5. Runtime integration will be a separate PR after this migration is approved.

## Rollback note

This migration is additive. A manual rollback can drop the newly created Clean Core tables and newly added additive columns if needed, but this PR does not include destructive rollback SQL on purpose.

Current rollback checkpoint before Clean Core work:

`a93afcedcebcb19fb6df5bcd9669a03c79dfd850`

`CC7.5.64-DIRECT-MEDIA-POST-PATCH-TRACE`
