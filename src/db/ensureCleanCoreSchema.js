'use strict';

const db = require('./postgres');

const RUNTIME = 'CC8.0.2-ACCOUNT-DB-CONFIG';
let ensured = false;
let lastResult = { ok: false, skipped: true, reason: 'not_started' };

async function ensureCleanCoreSchema() {
  if (ensured) return lastResult;
  if (!db.hasDatabaseUrl()) {
    lastResult = { ok: false, skipped: true, reason: 'database_env_missing', runtimeVersion: RUNTIME };
    return lastResult;
  }
  try {
    await db.query(`create table if not exists ak_tenants (
      tenant_id text primary key,
      owner_user_id text not null,
      name text not null default '',
      status text not null default 'active',
      settings_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
    await db.query(`create table if not exists ak_users (
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
    )`);
    await db.query(`create table if not exists ak_tariffs (
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
    )`);
    await db.query(`create table if not exists ak_feature_access (
      tariff_code text not null references ak_tariffs(tariff_code) on delete cascade,
      feature_code text not null,
      enabled boolean not null default false,
      limit_value int,
      meta_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(tariff_code, feature_code)
    )`);
    await db.query(`create table if not exists ak_referrals (
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
    )`);
    await db.query(`insert into ak_tariffs(tariff_code, name, sort_order, limits_json, features_json)
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
        updated_at = now()`);
    await db.query(`insert into ak_feature_access(tariff_code, feature_code, enabled, limit_value)
      select tariff_code, key, (value)::boolean, null
      from ak_tariffs, jsonb_each_text(features_json)
      on conflict(tariff_code, feature_code) do update set enabled = excluded.enabled, updated_at = now()`);
    await db.query(`insert into ak_feature_access(tariff_code, feature_code, enabled, limit_value)
      select tariff_code, key, true, (value)::int
      from ak_tariffs, jsonb_each_text(limits_json)
      on conflict(tariff_code, feature_code) do update set enabled = excluded.enabled, limit_value = excluded.limit_value, updated_at = now()`);
    ensured = true;
    lastResult = { ok: true, runtimeVersion: RUNTIME };
    return lastResult;
  } catch (error) {
    lastResult = { ok: false, runtimeVersion: RUNTIME, error: error?.message || String(error) };
    return lastResult;
  }
}

function info() {
  return { ...lastResult, ensured, runtimeVersion: RUNTIME, hasDatabaseConfig: db.hasDatabaseUrl() };
}

module.exports = { RUNTIME, ensureCleanCoreSchema, info };
