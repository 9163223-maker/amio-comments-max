# Clean Core 8.0.0 user context bridge

This step wires the Clean Core user/tenant/tariff foundation into the private admin webhook path.

## Scope

This bridge only attempts to create or refresh user context before the existing bot flow handles private admin updates.

It intentionally does not change:

- Telegram-style comments UI;
- post patching;
- direct channel post detection;
- public channel callback handling;
- gifts runtime logic;
- CTA runtime logic;
- reactions runtime logic;
- mini-app UI.

## Runtime behavior

For private admin messages/callbacks only:

1. Extract MAX user profile from webhook update.
2. If Postgres is configured, call Clean Core helpers to ensure:
   - `ak_tenants` row;
   - `ak_users` row;
   - referral code;
   - tariff/access context.
3. Attach result to `req.adminkitUserContext`.
4. Delegate to the existing flow guard unchanged.

If `DATABASE_URL` is missing or the Clean Core tables are not ready, the bridge skips/fails silently and does not block the existing bot.

## Files

- `src/core/webhookContext.js` — extraction and context creation helper.
- `clean-bot-flow-guard-1544.js` — thin bridge wrapper around the existing `clean-bot-flow-guard-1545`.

## Next step

After this PR is verified, a separate PR can display basic account/tariff/referral information in a new `Личный кабинет` section.
