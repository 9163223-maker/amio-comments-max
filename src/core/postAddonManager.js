'use strict';

const db = require('../../cc5-db-core');
const accessManager = require('./accessManager');

async function ensure() {
  await db.init();
  await db.query("create table if not exists ak_post_buttons (id bigserial primary key, admin_id text not null default '', channel_id text not null default '', post_id text not null, title text not null default '', url text not null default '', sort_order integer not null default 0, is_enabled boolean not null default true, meta jsonb not null default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now())");
  await db.query("create table if not exists ak_post_lead_magnets (id bigserial primary key, admin_id text not null default '', channel_id text not null default '', post_id text not null, title text not null default '', material_type text not null default 'text', material_text text not null default '', material_url text not null default '', file_id text not null default '', file_name text not null default '', access_mode text not null default 'subscribers_current_channel', conditions jsonb not null default '{}'::jsonb, sort_order integer not null default 0, is_enabled boolean not null default true, meta jsonb not null default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now())");
  await db.query("create index if not exists ak_post_buttons_post_idx on ak_post_buttons(post_id, sort_order, id)");
  await db.query("create index if not exists ak_post_lead_magnets_post_idx on ak_post_lead_magnets(post_id, sort_order, id)");
}

function postKey(ctx = {}) {
  return String(ctx.postId || ctx.payload?.postId || ctx.selected_post_id || ctx.session?.selected_post_id || ctx.post?.id || 'debug-post');
}

function channelKey(ctx = {}) {
  return String(ctx.channelId || ctx.payload?.channelId || ctx.selected_channel_id || ctx.session?.selected_channel_id || ctx.channel?.id || '');
}

function adminKey(ctx = {}) {
  return String(ctx.adminId || ctx.admin_id || '');
}

async function listButtons(ctx = {}) {
  await ensure();
  const { rows } = await db.query('select id, title, url, sort_order, is_enabled, meta from ak_post_buttons where post_id=$1 and is_enabled=true order by sort_order asc, id asc', [postKey(ctx)]);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    text: row.title,
    url: row.url,
    sortOrder: row.sort_order,
    isEnabled: row.is_enabled,
    meta: row.meta || {}
  }));
}

async function listLeadMagnets(ctx = {}) {
  await ensure();
  const { rows } = await db.query('select id, title, material_type, material_text, material_url, file_id, file_name, access_mode, conditions, sort_order, is_enabled, meta from ak_post_lead_magnets where post_id=$1 and is_enabled=true order by sort_order asc, id asc', [postKey(ctx)]);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    name: row.title,
    type: row.material_type,
    text: row.material_text,
    url: row.material_url,
    fileId: row.file_id,
    fileName: row.file_name,
    accessMode: row.access_mode,
    conditions: row.conditions || {},
    sortOrder: row.sort_order,
    isEnabled: row.is_enabled,
    meta: row.meta || {}
  }));
}

async function limits(ctx = {}) {
  const btn = await accessManager.can(ctx, 'buttons.max_per_post');
  const lead = await accessManager.can(ctx, 'lead_magnets.max_per_post');
  return {
    planCode: btn.plan || lead.plan,
    buttonsMaxPerPost: typeof btn.value === 'number' ? btn.value : 1,
    leadMagnetsMaxPerPost: typeof lead.value === 'number' ? lead.value : 1
  };
}

async function summarizePostAddons(ctx = {}) {
  const [buttons, leadMagnets, planLimits] = await Promise.all([
    listButtons(ctx),
    listLeadMagnets(ctx),
    limits(ctx)
  ]);
  return { postKey: postKey(ctx), channelKey: channelKey(ctx), adminKey: adminKey(ctx), buttons, leadMagnets, limits: planLimits };
}

async function addButton(ctx = {}, input = {}) {
  await ensure();
  const summary = await summarizePostAddons(ctx);
  if (summary.buttons.length >= summary.limits.buttonsMaxPerPost) return { ok: false, error: 'button_limit_reached', limit: summary.limits.buttonsMaxPerPost };
  const title = String(input.title || input.text || '').trim();
  const url = String(input.url || '').trim();
  if (!title || !url) return { ok: false, error: 'title_and_url_required' };
  const { rows } = await db.query('insert into ak_post_buttons(admin_id, channel_id, post_id, title, url, sort_order, meta) values($1,$2,$3,$4,$5,$6,$7::jsonb) returning id, title, url', [adminKey(ctx), channelKey(ctx), postKey(ctx), title, url, summary.buttons.length + 1, JSON.stringify(input.meta || {})]);
  return { ok: true, button: rows[0] };
}

module.exports = { ensure, postKey, channelKey, adminKey, listButtons, listLeadMagnets, limits, summarizePostAddons, addButton };
