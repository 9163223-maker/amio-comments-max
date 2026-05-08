'use strict';

const schemaSql = `
create table if not exists channels (
  id text primary key,
  title text not null default '',
  linked_by_user_id text not null default '',
  linked_by_name text not null default '',
  bot_access boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists posts (
  comment_key text primary key,
  channel_id text not null references channels(id) on delete cascade,
  post_id text not null,
  message_id text not null default '',
  original_text text not null default '',
  source_attachments jsonb not null default '[]'::jsonb,
  original_link jsonb,
  original_format jsonb,
  handoff_token text not null default '',
  comments_enabled boolean not null default true,
  custom_keyboard jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(channel_id, post_id)
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  comment_key text not null references posts(comment_key) on delete cascade,
  user_id text not null default 'guest',
  user_name text not null default 'Гость',
  avatar_url text not null default '',
  text text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  reply_to_id uuid,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists comments_comment_key_created_idx on comments(comment_key, created_at);

create table if not exists comment_reactions (
  comment_id uuid not null references comments(id) on delete cascade,
  user_id text not null,
  emoji text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(comment_id, user_id, emoji)
);

create table if not exists moderation_settings (
  scope_type text not null check (scope_type in ('channel','post')),
  scope_id text not null,
  channel_id text not null default '',
  enabled boolean not null default true,
  preset_common boolean not null default true,
  block_links boolean not null default false,
  block_invites boolean not null default true,
  ai_enabled boolean not null default false,
  custom_blocklist jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(scope_type, scope_id)
);

create table if not exists moderation_logs (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null default 'channel',
  scope_id text not null default '',
  channel_id text not null default '',
  comment_key text not null default '',
  comment_id uuid,
  user_id text not null default '',
  text text not null default '',
  decision text not null default 'allowed',
  reason text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists moderation_logs_channel_created_idx on moderation_logs(channel_id, created_at desc);
create index if not exists moderation_logs_comment_key_created_idx on moderation_logs(comment_key, created_at desc);

create table if not exists cta_buttons (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null references channels(id) on delete cascade,
  comment_key text references posts(comment_key) on delete cascade,
  label text not null,
  url text not null,
  style text not null default 'primary',
  enabled boolean not null default true,
  click_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_flows (
  user_id text primary key,
  flow_type text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
`;

module.exports = { schemaSql };
