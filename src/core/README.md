# Clean Core 8.0.0 runtime DB core

This folder introduces the first runtime foundation for Clean Core 8.0.0.

Scope of this PR:

- Postgres runtime helper;
- tenant helpers;
- user account helpers;
- tariff and feature-access helpers;
- referral helpers;
- permission facade.

Out of scope:

- bot UI changes;
- Telegram-style comments UI;
- `bot.js` integration;
- `index.js` integration;
- post patching;
- webhook routing;
- gifts/CTA/reactions runtime rewrites.

## Modules

- `../db/postgres.js` — shared Postgres pool/query/transaction helpers.
- `tenants.js` — tenant creation and lookup.
- `users.js` — MAX user to AdminKIT user mapping.
- `tariffs.js` — tariff and feature access lookup.
- `referrals.js` — referral link/stat helpers.
- `permissions.js` — feature-access facade.

## Intended next step

After this PR is reviewed and merged, a separate PR can wire these helpers into the admin menu/start flow. That future integration must stay focused on user context only and must not touch comments UI or post patching.
