-- Amio for MAX
-- Migration: 001_init_analytics.sql
-- Purpose: create analytics, attribution, moderation and growth tables
-- Version: 14.12.2
-- Notes:
--   1) Safe for first install on PostgreSQL 14+
--   2) Uses IF NOT EXISTS where practical
--   3) Can be rerun safely for bootstrap environments

-- Amio for MAX
-- PostgreSQL schema for analytics, attribution, moderation and growth events
-- Version: 14.12.1

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

-- =========================
-- Core identities
-- =========================

create table if not exists users (
  user_id                text primary key,
  username               citext,
  first_name             text,
  last_name              text,
  language_code          text,
  photo_url              text,
  phone                  text,
  geo_lat                numeric(9,6),
  geo_lon                numeric(9,6),
  geo_accuracy           numeric(10,2),
  first_seen_at          timestamptz not null,
  last_seen_at           timestamptz not null,
  consent_contact_at     timestamptz,
  consent_geo_at         timestamptz,
  raw_profile            jsonb not null default '{}'::jsonb
);

create index if not exists users_last_seen_idx on users(last_seen_at desc);
create index if not exists users_username_idx on users(username);

create table if not exists channels (
  channel_id             text primary key,
  title                  text,
  username               citext,
  owner_user_id          text references users(user_id) on delete set null,
  plan_code              text not null default 'free',
  agency_brand_name      text,
  white_label_enabled    boolean not null default false,
  lead_magnet_enabled    boolean not null default true,
  created_at             timestamptz not null,
  updated_at             timestamptz not null,
  settings_json          jsonb not null default '{}'::jsonb,
  constraint channels_plan_code_chk check (plan_code in ('free','start','pro','ai','agency','enterprise'))
);

create index if not exists channels_owner_idx on channels(owner_user_id);
create index if not exists channels_plan_idx on channels(plan_code);

create table if not exists posts (
  post_pk                bigserial primary key,
  channel_id             text not null references channels(channel_id) on delete cascade,
  post_id                text not null,
  message_id             text,
  comment_key            text unique,
  handoff_token          text,
  original_text          text,
  source_attachments     jsonb not null default '[]'::jsonb,
  published_at           timestamptz,
  created_at             timestamptz not null,
  updated_at             timestamptz not null
);

create unique index if not exists posts_channel_post_uidx on posts(channel_id, post_id);
create index if not exists posts_comment_key_idx on posts(comment_key);
create index if not exists posts_channel_published_idx on posts(channel_id, published_at desc);

-- =========================
-- Sessions and attribution
-- =========================

create table if not exists sessions (
  session_id             uuid primary key default gen_random_uuid(),
  query_id               text,
  user_id                text references users(user_id) on delete set null,
  channel_id             text references channels(channel_id) on delete set null,
  post_id                text,
  chat_id                text,
  chat_type              text,
  source_type            text not null,
  start_payload          text,
  startapp_payload       text,
  start_param            text,
  platform               text,
  client_version         text,
  ip                     inet,
  first_touch_at         timestamptz not null,
  last_touch_at          timestamptz not null,
  is_authenticated       boolean not null default true,
  raw_init_data          jsonb not null default '{}'::jsonb
);

create index if not exists sessions_user_idx on sessions(user_id, first_touch_at desc);
create index if not exists sessions_query_idx on sessions(query_id);
create index if not exists sessions_channel_post_idx on sessions(channel_id, post_id);
create index if not exists sessions_source_idx on sessions(source_type, first_touch_at desc);

create table if not exists acquisition_touches (
  touch_id               bigserial primary key,
  session_id             uuid not null references sessions(session_id) on delete cascade,
  user_id                text references users(user_id) on delete set null,
  channel_id             text references channels(channel_id) on delete set null,
  touch_type             text not null,
  source                 text,
  medium                 text,
  campaign               text,
  content                text,
  term                   text,
  creative_id            text,
  ad_id                  text,
  placement_id           text,
  influencer_id          text,
  referral_code          text,
  entry_link_type        text,
  raw_payload            text,
  normalized_payload     jsonb not null default '{}'::jsonb,
  touched_at             timestamptz not null
);

create index if not exists touches_user_idx on acquisition_touches(user_id, touched_at desc);
create index if not exists touches_campaign_idx on acquisition_touches(campaign, touched_at desc);
create index if not exists touches_channel_idx on acquisition_touches(channel_id, touched_at desc);
create index if not exists touches_source_medium_idx on acquisition_touches(source, medium, touched_at desc);

-- =========================
-- Event stream
-- =========================

create table if not exists events (
  event_id               uuid primary key default gen_random_uuid(),
  occurred_at            timestamptz not null,
  session_id             uuid references sessions(session_id) on delete set null,
  user_id                text references users(user_id) on delete set null,
  channel_id             text references channels(channel_id) on delete set null,
  post_id                text,
  comment_key            text,
  event_name             text not null,
  event_category         text not null,
  source                 text not null,
  platform               text,
  chat_type              text,
  properties             jsonb not null default '{}'::jsonb
);

create index if not exists events_name_time_idx on events(event_name, occurred_at desc);
create index if not exists events_user_time_idx on events(user_id, occurred_at desc);
create index if not exists events_channel_time_idx on events(channel_id, occurred_at desc);
create index if not exists events_props_gin_idx on events using gin(properties);

-- =========================
-- Comments and reactions
-- =========================

create table if not exists comments (
  comment_id             text primary key,
  comment_key            text not null,
  channel_id             text references channels(channel_id) on delete set null,
  post_id                text,
  user_id                text references users(user_id) on delete set null,
  user_name              text,
  avatar_url             text,
  parent_comment_id      text references comments(comment_id) on delete set null,
  text                   text not null,
  status                 text not null default 'published',
  created_at             timestamptz not null,
  edited_at              timestamptz,
  deleted_at             timestamptz,
  metadata               jsonb not null default '{}'::jsonb,
  constraint comments_status_chk check (status in ('published','hidden','deleted','blocked','queued','flagged'))
);

create index if not exists comments_comment_key_idx on comments(comment_key, created_at desc);
create index if not exists comments_user_idx on comments(user_id, created_at desc);
create index if not exists comments_channel_post_idx on comments(channel_id, post_id, created_at desc);

create table if not exists comment_reactions (
  reaction_id            bigserial primary key,
  comment_id             text not null references comments(comment_id) on delete cascade,
  user_id                text references users(user_id) on delete set null,
  emoji                  text not null,
  created_at             timestamptz not null
);

create unique index if not exists comment_reactions_uidx on comment_reactions(comment_id, user_id, emoji);
create index if not exists comment_reactions_comment_idx on comment_reactions(comment_id, created_at desc);

-- =========================
-- Moderation
-- =========================

create table if not exists moderation_decisions (
  decision_id            bigserial primary key,
  channel_id             text references channels(channel_id) on delete set null,
  comment_id             text references comments(comment_id) on delete set null,
  user_id                text references users(user_id) on delete set null,
  mode                   text not null,
  verdict                text not null,
  labels                 text[] not null default '{}',
  score                  numeric(8,5),
  matched_words          text[] not null default '{}',
  matched_regex          text[] not null default '{}',
  reason                 text,
  model_name             text,
  latency_ms             integer,
  created_at             timestamptz not null,
  raw_input              jsonb not null default '{}'::jsonb,
  raw_output             jsonb not null default '{}'::jsonb,
  constraint moderation_mode_chk check (mode in ('basic','ai','hybrid')),
  constraint moderation_verdict_chk check (verdict in ('allow','block','flag','queue'))
);

create index if not exists moderation_channel_time_idx on moderation_decisions(channel_id, created_at desc);
create index if not exists moderation_verdict_idx on moderation_decisions(verdict, created_at desc);
create index if not exists moderation_labels_gin_idx on moderation_decisions using gin(labels);

-- =========================
-- Tracked buttons and polls
-- =========================

create table if not exists tracked_buttons (
  button_id              text primary key,
  channel_id             text not null references channels(channel_id) on delete cascade,
  placement              text not null,
  button_text            text not null,
  target_url             text,
  target_action          text,
  is_active              boolean not null default true,
  ab_variant             text,
  created_at             timestamptz not null,
  settings_json          jsonb not null default '{}'::jsonb
);

create index if not exists tracked_buttons_channel_idx on tracked_buttons(channel_id, placement);
create index if not exists tracked_buttons_active_idx on tracked_buttons(channel_id, is_active);

create table if not exists tracked_button_clicks (
  click_id               bigserial primary key,
  button_id              text not null references tracked_buttons(button_id) on delete cascade,
  session_id             uuid references sessions(session_id) on delete set null,
  user_id                text references users(user_id) on delete set null,
  channel_id             text references channels(channel_id) on delete set null,
  post_id                text,
  placement              text,
  target_url             text,
  is_unique_for_session  boolean not null default false,
  is_unique_for_user     boolean not null default false,
  clicked_at             timestamptz not null,
  properties             jsonb not null default '{}'::jsonb
);

create index if not exists button_clicks_button_time_idx on tracked_button_clicks(button_id, clicked_at desc);
create index if not exists button_clicks_channel_time_idx on tracked_button_clicks(channel_id, clicked_at desc);

create table if not exists polls (
  poll_id                text primary key,
  channel_id             text not null references channels(channel_id) on delete cascade,
  post_id                text,
  title                  text not null,
  placement              text not null,
  is_multiple            boolean not null default false,
  status                 text not null default 'active',
  created_at             timestamptz not null,
  settings_json          jsonb not null default '{}'::jsonb,
  constraint polls_status_chk check (status in ('draft','active','closed','archived'))
);

create table if not exists poll_options (
  option_id              text primary key,
  poll_id                text not null references polls(poll_id) on delete cascade,
  option_text            text not null,
  sort_order             integer not null
);

create table if not exists poll_votes (
  vote_id                bigserial primary key,
  poll_id                text not null references polls(poll_id) on delete cascade,
  option_id              text not null references poll_options(option_id) on delete cascade,
  session_id             uuid references sessions(session_id) on delete set null,
  user_id                text references users(user_id) on delete set null,
  voted_at               timestamptz not null
);

create unique index if not exists poll_votes_uidx on poll_votes(poll_id, user_id, option_id);
create index if not exists poll_votes_poll_time_idx on poll_votes(poll_id, voted_at desc);

-- =========================
-- Conversions and reporting
-- =========================

create table if not exists conversions (
  conversion_id          bigserial primary key,
  session_id             uuid references sessions(session_id) on delete set null,
  user_id                text references users(user_id) on delete set null,
  channel_id             text references channels(channel_id) on delete set null,
  conversion_type        text not null,
  value_amount           numeric(12,2),
  currency               text,
  status                 text not null default 'created',
  attributed_source      text,
  attributed_campaign    text,
  attributed_content     text,
  attributed_touch_id    bigint references acquisition_touches(touch_id) on delete set null,
  created_at             timestamptz not null,
  properties             jsonb not null default '{}'::jsonb
);

create index if not exists conversions_type_time_idx on conversions(conversion_type, created_at desc);
create index if not exists conversions_channel_idx on conversions(channel_id, created_at desc);

create table if not exists channel_daily_metrics (
  metric_date            date not null,
  channel_id             text not null references channels(channel_id) on delete cascade,
  post_count             integer not null default 0,
  comments_count         integer not null default 0,
  commenters_uniq        integer not null default 0,
  reactions_count        integer not null default 0,
  poll_votes_count       integer not null default 0,
  button_clicks_count    integer not null default 0,
  unique_visitors        integer not null default 0,
  blocked_comments_count integer not null default 0,
  flagged_comments_count integer not null default 0,
  leads_count            integer not null default 0,
  upgrades_count         integer not null default 0,
  migration_starts_count integer not null default 0,
  primary key (metric_date, channel_id)
);

create table if not exists channel_public_snapshots (
  snapshot_id            bigserial primary key,
  channel_id             text not null references channels(channel_id) on delete cascade,
  source_name            text not null,
  subscribers_count      integer,
  views_count            integer,
  err_percent            numeric(8,3),
  ad_posts_count         integer,
  snapshot_at            timestamptz not null,
  raw_payload            jsonb not null default '{}'::jsonb
);

create index if not exists public_snapshots_channel_time_idx on channel_public_snapshots(channel_id, snapshot_at desc);

commit;
