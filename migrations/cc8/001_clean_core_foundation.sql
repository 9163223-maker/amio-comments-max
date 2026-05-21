-- АдминКИТ Clean Core 8.0.0
-- Migration: 001_clean_core_foundation
-- Scope: Postgres foundation only.
-- No UI changes. No post patching changes. No bot/runtime JS changes.

begin;

create table if not exists ak_migrations (
  id bigserial primary key,
  migration_key text not null unique,
  description text not null default '',
  applied_at timestamptz not null default now()
);

insert into ak_migrations(migration_key, description)
values ('cc8_001_clean_core_foundation', 'Clean Core 8.0.0 user/tenant/tariff/archive database foundation')
on conflict(migration_key) do nothing;

-- 1. Tenants / users

create table if not exists ak_tenants (
  tenant_id text primary key,
  owner_user_id text not null,
  name text not null default '',
  status text not null default 'active',
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ak_users (
  user_id text primary key,
  tenant_id text not null references ak_tenants(tenant_id) on delete cascade,
  max_user_id text unique,
  display_name text not null default '',
  username text not null default '',
  status text not null default 'active',
  tariff_code text not null default 'free',
  referral_code text unique,
  referred_by_user_id text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ak_users_tenant_id on ak_users(tenant_id);
create index if not exists idx_ak_users_max_user_id on ak_users(max_user_id);
create index if not exists idx_ak_users_tariff_code on ak_users(tariff_code);

-- 2. Tariffs / feature access / subscriptions

create table if not exists ak_tariffs (
  tariff_code text primary key,
  name text not null,
  price_amount numeric(12,2) not null default 0,
  currency text not null default 'RUB',
  billing_period text not null default 'month',
  limits_json jsonb not null default '{}'::jsonb,
  features_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into ak_tariffs(tariff_code, name, sort_order, limits_json, features_json)
values
  ('free', 'Free', 10, '{"max_channels_count":1,"posts_archive_limit":20,"comments_per_month":100}'::jsonb, '{"comments_enabled":true,"photo_comments_enabled":false,"reactions_enabled":true,"replies_enabled":true,"gift_enabled":false,"cta_buttons_enabled":false,"polls_enabled":false,"archive_enabled":true,"advanced_stats_enabled":false,"moderation_enabled":false}'::jsonb),
  ('start', 'Start', 20, '{"max_channels_count":3,"posts_archive_limit":100,"comments_per_month":500}'::jsonb, '{"comments_enabled":true,"photo_comments_enabled":false,"reactions_enabled":true,"replies_enabled":true,"gift_enabled":true,"cta_buttons_enabled":true,"polls_enabled":false,"archive_enabled":true,"advanced_stats_enabled":false,"moderation_enabled":true}'::jsonb),
  ('pro', 'Pro', 30, '{"max_channels_count":10,"posts_archive_limit":1000,"comments_per_month":5000}'::jsonb, '{"comments_enabled":true,"photo_comments_enabled":true,"reactions_enabled":true,"replies_enabled":true,"gift_enabled":true,"cta_buttons_enabled":true,"polls_enabled":true,"archive_enabled":true,"advanced_stats_enabled":true,"moderation_enabled":true}'::jsonb),
  ('business', 'Business', 40, '{"max_channels_count":50,"posts_archive_limit":10000,"comments_per_month":50000}'::jsonb, '{"comments_enabled":true,"photo_comments_enabled":true,"reactions_enabled":true,"replies_enabled":true,"gift_enabled":true,"cta_buttons_enabled":true,"polls_enabled":true,"archive_enabled":true,"advanced_stats_enabled":true,"moderation_enabled":true,"export_enabled":true}'::jsonb),
  ('agency', 'Agency', 50, '{"max_channels_count":200,"posts_archive_limit":100000,"comments_per_month":250000}'::jsonb, '{"comments_enabled":true,"photo_comments_enabled":true,"reactions_enabled":true,"replies_enabled":true,"gift_enabled":true,"cta_buttons_enabled":true,"polls_enabled":true,"archive_enabled":true,"advanced_stats_enabled":true,"moderation_enabled":true,"export_enabled":true,"team_access_enabled":true}'::jsonb)
on conflict(tariff_code) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  limits_json = excluded.limits_json,
  features_json = excluded.features_json,
  updated_at = now();

create table if not exists ak_feature_access (
  tariff_code text not null references ak_tariffs(tariff_code) on delete cascade,
  feature_code text not null,
  enabled boolean not null default false,
  limit_value int,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(tariff_code, feature_code)
);

insert into ak_feature_access(tariff_code, feature_code, enabled, limit_value)
select tariff_code, key, (value)::boolean, null
from ak_tariffs, jsonb_each_text(features_json)
on conflict(tariff_code, feature_code) do update set
  enabled = excluded.enabled,
  updated_at = now();

insert into ak_feature_access(tariff_code, feature_code, enabled, limit_value)
select tariff_code, key, true, (value)::int
from ak_tariffs, jsonb_each_text(limits_json)
on conflict(tariff_code, feature_code) do update set
  enabled = excluded.enabled,
  limit_value = excluded.limit_value,
  updated_at = now();

create table if not exists ak_subscriptions (
  subscription_id bigserial primary key,
  owner_user_id text not null,
  tenant_id text not null,
  tariff_code text not null references ak_tariffs(tariff_code),
  status text not null default 'active',
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  payment_provider text not null default '',
  payment_id text not null default '',
  auto_renew boolean not null default false,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ak_subscriptions_owner on ak_subscriptions(owner_user_id, tenant_id, status);

-- 3. Referral system

create table if not exists ak_referrals (
  referral_id bigserial primary key,
  referrer_user_id text not null,
  referred_user_id text,
  referral_code text not null,
  status text not null default 'registered',
  reward_type text not null default '',
  reward_value text not null default '',
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create index if not exists idx_ak_referrals_referrer on ak_referrals(referrer_user_id, status);
create index if not exists idx_ak_referrals_code on ak_referrals(referral_code);

-- 4. Non-breaking tenant columns for existing legacy tables
-- Existing cc5 tables remain compatible. Clean Core fields are additive only.

alter table if exists ak_channels add column if not exists owner_user_id text;
alter table if exists ak_channels add column if not exists tenant_id text;
alter table if exists ak_channels add column if not exists platform text not null default 'max';
alter table if exists ak_channels add column if not exists bot_status text not null default 'unknown';
alter table if exists ak_channels add column if not exists connected_at timestamptz;
alter table if exists ak_channels add column if not exists settings_json jsonb not null default '{}'::jsonb;
alter table if exists ak_channels add column if not exists is_active boolean not null default true;
create index if not exists idx_ak_channels_owner_tenant on ak_channels(owner_user_id, tenant_id);

alter table if exists ak_posts add column if not exists owner_user_id text;
alter table if exists ak_posts add column if not exists tenant_id text;
alter table if exists ak_posts add column if not exists stable_payload text;
alter table if exists ak_posts add column if not exists handoff_token text;
alter table if exists ak_posts add column if not exists original_text text;
alter table if exists ak_posts add column if not exists original_format_json jsonb;
alter table if exists ak_posts add column if not exists original_link_json jsonb;
alter table if exists ak_posts add column if not exists source_attachments_json jsonb not null default '[]'::jsonb;
alter table if exists ak_posts add column if not exists keyboard_json jsonb not null default '{}'::jsonb;
alter table if exists ak_posts add column if not exists comments_enabled boolean not null default true;
alter table if exists ak_posts add column if not exists archived boolean not null default false;
alter table if exists ak_posts add column if not exists deleted_at timestamptz;
create index if not exists idx_ak_posts_owner_tenant on ak_posts(owner_user_id, tenant_id);
create index if not exists idx_ak_posts_comment_key on ak_posts(comment_key);
create index if not exists idx_ak_posts_archive on ak_posts(owner_user_id, tenant_id, archived);

-- 5. Comments / reactions

create table if not exists ak_comments (
  comment_id text primary key,
  owner_user_id text not null,
  tenant_id text not null,
  channel_id text not null,
  post_id text not null,
  comment_key text not null,
  user_id text not null,
  user_name text not null default '',
  text text not null default '',
  attachments_json jsonb not null default '[]'::jsonb,
  reply_to_id text,
  moderation_status text not null default 'visible',
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_ak_comments_owner_tenant on ak_comments(owner_user_id, tenant_id);
create index if not exists idx_ak_comments_thread on ak_comments(comment_key, created_at);
create index if not exists idx_ak_comments_post on ak_comments(channel_id, post_id);
create index if not exists idx_ak_comments_reply_to on ak_comments(reply_to_id);

create table if not exists ak_comment_reactions (
  reaction_id bigserial primary key,
  owner_user_id text not null,
  tenant_id text not null,
  comment_id text not null,
  comment_key text not null,
  user_id text not null,
  user_name text not null default '',
  reaction text not null,
  created_at timestamptz not null default now(),
  unique(comment_id, user_id, reaction)
);

create index if not exists idx_ak_reactions_owner_tenant on ak_comment_reactions(owner_user_id, tenant_id);
create index if not exists idx_ak_reactions_comment on ak_comment_reactions(comment_id, reaction);

-- 6. CTA buttons

create table if not exists ak_post_buttons (
  button_id bigserial primary key,
  owner_user_id text not null,
  tenant_id text not null,
  channel_id text not null,
  post_id text not null,
  comment_key text not null,
  button_text text not null,
  button_url text not null,
  row_index int not null default 0,
  button_index int not null default 0,
  is_active boolean not null default true,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ak_buttons_owner_tenant on ak_post_buttons(owner_user_id, tenant_id);
create index if not exists idx_ak_buttons_post on ak_post_buttons(channel_id, post_id, is_active);

-- 7. Gifts / lead magnets

create table if not exists ak_gift_campaigns (
  campaign_id text primary key,
  owner_user_id text not null,
  tenant_id text not null,
  channel_id text not null,
  post_id text not null,
  comment_key text not null,
  title text not null default '',
  gift_url text not null default '',
  gift_attachment_json jsonb not null default '{}'::jsonb,
  message_text text not null default '',
  require_subscription boolean not null default true,
  is_active boolean not null default true,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id, tenant_id, channel_id, post_id)
);

create index if not exists idx_ak_gifts_owner_tenant on ak_gift_campaigns(owner_user_id, tenant_id);
create index if not exists idx_ak_gifts_post on ak_gift_campaigns(channel_id, post_id, is_active);

create table if not exists ak_gift_claims (
  claim_id bigserial primary key,
  owner_user_id text not null,
  tenant_id text not null,
  campaign_id text not null,
  user_id text not null,
  user_name text not null default '',
  subscription_checked boolean not null default false,
  delivered boolean not null default false,
  delivery_error text not null default '',
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(campaign_id, user_id)
);

create index if not exists idx_ak_gift_claims_owner_tenant on ak_gift_claims(owner_user_id, tenant_id);
create index if not exists idx_ak_gift_claims_campaign on ak_gift_claims(campaign_id, delivered);

-- 8. Polls

create table if not exists ak_polls (
  poll_id text primary key,
  owner_user_id text not null,
  tenant_id text not null,
  channel_id text not null,
  post_id text not null,
  comment_key text not null,
  question text not null,
  options_json jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ak_polls_owner_tenant on ak_polls(owner_user_id, tenant_id);
create index if not exists idx_ak_polls_post on ak_polls(channel_id, post_id, is_active);

create table if not exists ak_poll_votes (
  vote_id bigserial primary key,
  owner_user_id text not null,
  tenant_id text not null,
  poll_id text not null,
  user_id text not null,
  option_id text not null,
  created_at timestamptz not null default now(),
  unique(poll_id, user_id)
);

create index if not exists idx_ak_poll_votes_owner_tenant on ak_poll_votes(owner_user_id, tenant_id);
create index if not exists idx_ak_poll_votes_poll on ak_poll_votes(poll_id, option_id);

-- 9. Archive / restore snapshots

create table if not exists ak_archive_items (
  archive_id bigserial primary key,
  owner_user_id text not null,
  tenant_id text not null,
  entity_type text not null,
  entity_id text not null,
  channel_id text not null default '',
  post_id text not null default '',
  comment_key text not null default '',
  snapshot_json jsonb not null default '{}'::jsonb,
  archive_reason text not null default '',
  archived_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by_user_id text
);

create index if not exists idx_ak_archive_owner_tenant on ak_archive_items(owner_user_id, tenant_id, archived_at desc);
create index if not exists idx_ak_archive_entity on ak_archive_items(entity_type, entity_id);
create index if not exists idx_ak_archive_post on ak_archive_items(channel_id, post_id);

-- 10. Audit log / debug snapshots

create table if not exists ak_audit_log (
  audit_id bigserial primary key,
  owner_user_id text not null,
  tenant_id text not null,
  actor_user_id text not null default '',
  action text not null,
  entity_type text not null default '',
  entity_id text not null default '',
  before_json jsonb not null default '{}'::jsonb,
  after_json jsonb not null default '{}'::jsonb,
  ip text not null default '',
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_ak_audit_owner_tenant on ak_audit_log(owner_user_id, tenant_id, created_at desc);
create index if not exists idx_ak_audit_entity on ak_audit_log(entity_type, entity_id);

create table if not exists ak_debug_snapshots (
  snapshot_id bigserial primary key,
  owner_user_id text,
  tenant_id text,
  runtime_version text not null default '',
  source_marker text not null default '',
  snapshot_kind text not null default 'debug',
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ak_debug_snapshots_created on ak_debug_snapshots(created_at desc);
create index if not exists idx_ak_debug_snapshots_owner_tenant on ak_debug_snapshots(owner_user_id, tenant_id, created_at desc);

commit;
