# Analytics kit for Amio under MAX

Version: 14.12.2

This kit adds a ready-to-use analytics bootstrap set to the current build:

- `schema.sql` — full PostgreSQL schema
- `event-map.json` — event catalog and field map
- `migrations/001_init_analytics.sql` — first migration for a clean database
- `seed-event-examples.json` — safe synthetic examples for QA and demo dashboards

## Recommended stack

- PostgreSQL 14+
- UTC timestamps in storage
- JSONB for raw MAX payloads and flexible event properties

## Quick start

### 1) Create a database

Use your normal PostgreSQL provisioning flow.

### 2) Apply the migration

```bash
psql "$DATABASE_URL" -f migrations/001_init_analytics.sql
```

Or, if you prefer a direct bootstrap during local setup:

```bash
psql "$DATABASE_URL" -f schema.sql
```

Use one or the other for the initial install. For production, the migration file is preferred.

### 3) Keep event ingestion simple

At minimum, write these events:

- `bot_started`
- `miniapp_opened`
- `comments_opened`
- `comment_created`
- `tracked_button_clicked`
- `lead_magnet_clicked`
- `channel_connect_completed`
- `upgrade_completed`
- `moderation_blocked`

That is enough for:

- source attribution
- comment funnel
- lead magnet CTR
- free → pro conversion
- moderation performance

## Payload strategy

For marketing attribution, encode source metadata in `start` and `startapp` payloads.

Compact example:

```text
s=maxch;m=post;c=launch_april;t=cr03;p=114;i=wylsa;r=free
```

Verbose example:

```text
src=max_channel;med=post;cmp=launch_april;cnt=creative_03;plc=post_114;inf=wylsa;ref=free_comments
```

Suggested normalized fields:

- source
- medium
- campaign
- content
- term
- creative_id
- ad_id
- placement_id
- influencer_id
- referral_code

## Core tables and purpose

### `users`
MAX user profile snapshot and consent-based contact/geo data.

### `sessions`
Session layer for mini app and bot entries. Best place to attach `query_id`, `start_param`, `platform`, `client_version`.

### `acquisition_touches`
Attribution table. Stores first-touch and session-touch marketing source data.

### `events`
Main append-only event stream for dashboards and funnels.

### `comments` / `comment_reactions`
Comment content and engagement.

### `moderation_decisions`
Basic / AI / hybrid moderation outcomes, labels and latency.

### `tracked_buttons` / `tracked_button_clicks`
CTR, unique clicks and placement analytics for under-post buttons, comment-screen CTAs and lead magnets.

### `polls` / `poll_options` / `poll_votes`
Poll analytics.

### `conversions`
Business outcomes: leads, upgrades, migration sales, demo bookings.

### `channel_daily_metrics`
Ready aggregate table for fast dashboards.

## Example metrics you can show in Amio dashboard

- opens of comments screen
- comments per post
- unique commenters
- reaction count
- tracked button CTR
- best performing placement
- source → comment conversion
- source → channel connect conversion
- free → pro conversion
- blocked spam count
- flagged toxicity count
- migration leads and paid migrations

## Suggested first dashboards

### Growth dashboard
- unique visitors
- comments opened
- comments created
- tracked button clicks
- lead magnet CTR
- channel connects
- upgrades

### Moderation dashboard
- checked comments
- blocked comments
- flagged comments
- average moderation latency
- labels distribution

### Acquisition dashboard
- source / medium / campaign table
- first-touch conversions
- last-touch conversions
- best creative
- best placement

## Using the seed examples

`seed-event-examples.json` contains synthetic samples for:

- bot start
- mini app open
- comment creation
- tracked button impression and click
- moderation allow/block
- poll vote
- lead magnet click
- channel connect
- upgrade payment
- migration payment

Typical use cases:

- QA validation of ingestion contracts
- demo dashboards for sales
- local fixtures for frontend work

## Implementation notes for the current Amio build

1. Write a session as early as possible on mini app open.
2. Parse `start` / `startapp` once and store both raw and normalized versions.
3. Keep raw MAX payloads in JSONB for audit/debug.
4. Use the `events` table as the source of truth for behavior analytics.
5. Use daily aggregates only for dashboards, not as the source of truth.

## Minimal ingestion order

Recommended backend flow:

1. Upsert `users`
2. Upsert/create `sessions`
3. Insert `acquisition_touches` if a payload is present
4. Insert the domain record (`comments`, `tracked_button_clicks`, `conversions`, etc.)
5. Insert `events`
6. Refresh daily aggregates asynchronously

## Safe production defaults

- store all timestamps in UTC
- keep personally sensitive data opt-in only
- avoid using IP as a primary identity key
- keep raw payloads for debugging but not for rendering directly to users

## Files added in this kit

- `migrations/001_init_analytics.sql`
- `seed-event-examples.json`
- `README-analytics.md`
