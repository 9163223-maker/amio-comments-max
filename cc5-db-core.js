'use strict';

const { Pool } = require('pg');

const RUNTIME = 'CC5.3';
const DATABASE_URL = String(process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_URL || '').trim();
const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: /sslmode=disable/i.test(DATABASE_URL) ? false : { rejectUnauthorized: false },
  max: 4,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 4500
}) : null;
let initPromise = null;
let lastInitError = '';

const clean = (v) => String(v || '').replace(/^post:/i, '').replace(/^ck:/i, '').replace(/^:+/, '').replace(/^['\"]+|['\"]+$/g, '').trim();
const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 90) => { const s = norm(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const defaults = () => ({ enabled: true, applyPresetCommon: true, blockLinks: false, blockInvites: true, aiEnabled: false, customBlocklist: [] });

function deep(obj, keys, seen = new Set()) {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return '';
  seen.add(obj);
  const wanted = new Set(keys.map((k) => String(k).toLowerCase()));
  for (const [k, v] of Object.entries(obj)) {
    if (wanted.has(String(k).toLowerCase())) {
      if (v && typeof v === 'object') {
        const nested = deep(v, keys, seen);
        if (nested) return nested;
      }
      const s = norm(v);
      if (s && s !== '[object Object]') return s;
    }
  }
  for (const v of Object.values(obj)) {
    const f = deep(v, keys, seen);
    if (f) return f;
  }
  return '';
}
function allValuesByKey(obj, keys, out = [], seen = new Set()) {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return out;
  seen.add(obj);
  const wanted = new Set(keys.map((k) => String(k).toLowerCase()));
  for (const [k, v] of Object.entries(obj)) {
    if (wanted.has(String(k).toLowerCase())) {
      const s = norm(v);
      if (s && s !== '[object Object]') out.push(s);
    }
    if (v && typeof v === 'object') allValuesByKey(v, keys, out, seen);
  }
  return out;
}
function parsePayload(v) {
  if (v && typeof v === 'object') return v;
  const s = norm(v);
  if (!s) return {};
  try { const p = JSON.parse(s); return p && typeof p === 'object' ? p : { action: s }; } catch { return { action: s }; }
}
function cb(update = {}) { return update.callback || update.data?.callback || update.message?.callback || update.update?.callback || null; }
function msg(update = {}) { return update.message || update.data?.message || cb(update)?.message || update.data?.callback?.message || null; }
function payload(update = {}) {
  const c = cb(update) || {};
  return parsePayload(c.payload || c.data || c.callback_data || c.value || update.payload || deep(c, ['payload', 'data', 'callback_data', 'value']) || deep(update, ['payload', 'callback_data']));
}
function action(update = {}) { const p = payload(update); return norm(p.action || p.type || p.command || p.raw || ''); }
function adminId(update = {}) {
  const c = cb(update) || {}, m = msg(update) || {};
  return norm(c.user?.user_id || c.user?.id || c.sender?.user_id || c.sender?.id || update.user?.user_id || update.user?.id || m.sender?.user_id || m.sender?.id || deep(update, ['user_id', 'userId', 'sender_id', 'from_id']));
}
function chatId(update = {}) {
  const c = cb(update) || {}, m = msg(update) || {};
  return norm(m.recipient?.chat_id || m.recipient?.id || c.message?.recipient?.chat_id || c.message?.recipient?.id || m.chat_id || m.chat?.id || deep(m, ['chat_id']) || deep(update, ['chat_id']));
}
function callbackId(update = {}) { const c = cb(update) || {}; return norm(c.callback_id || c.callbackId || c.id || deep(c, ['callback_id', 'callbackId'])); }
function messageId(update = {}) { const c = cb(update) || {}, m = msg(update) || {}; return norm(c.message?.message_id || c.message?.id || m.message_id || m.messageId || m.mid || m.id || deep(update, ['message_id', 'messageId', 'mid'])); }
function text(update = {}) { const m = msg(update) || {}; return norm(m.body?.text || m.text || m.message?.text || deep(m, ['text'])); }

async function init() {
  if (!pool) return { ok: false, error: 'database_url_missing' };
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await pool.query('select 1');
    await pool.query(`
      create table if not exists ak_admins (
        admin_id text primary key,
        display_name text,
        raw jsonb default '{}'::jsonb,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      );
      create table if not exists ak_channels (
        channel_id text primary key,
        title text,
        raw jsonb default '{}'::jsonb,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      );
      create table if not exists ak_admin_channels (
        admin_id text not null references ak_admins(admin_id) on delete cascade,
        channel_id text not null references ak_channels(channel_id) on delete cascade,
        role text default 'admin',
        created_at timestamptz default now(),
        updated_at timestamptz default now(),
        primary key(admin_id, channel_id)
      );
      create table if not exists ak_posts (
        admin_id text not null references ak_admins(admin_id) on delete cascade,
        channel_id text not null references ak_channels(channel_id) on delete cascade,
        post_id text not null,
        message_id text,
        comment_key text not null,
        title text,
        raw jsonb default '{}'::jsonb,
        created_at timestamptz default now(),
        updated_at timestamptz default now(),
        primary key(admin_id, channel_id, post_id),
        unique(admin_id, comment_key)
      );
      create table if not exists ak_moderation_rules (
        admin_id text not null,
        channel_id text not null,
        scope_type text not null check(scope_type in ('channel','post')),
        post_id text not null default '',
        enabled boolean not null default true,
        apply_preset_common boolean not null default true,
        block_links boolean not null default false,
        block_invites boolean not null default true,
        ai_enabled boolean not null default false,
        custom_blocklist jsonb not null default '[]'::jsonb,
        created_at timestamptz default now(),
        updated_at timestamptz default now(),
        primary key(admin_id, channel_id, scope_type, post_id)
      );
      create table if not exists ak_flow_state (
        admin_id text primary key,
        flow jsonb not null default '{}'::jsonb,
        updated_at timestamptz default now()
      );
      create table if not exists ak_menu_state (
        admin_id text primary key,
        message_id text,
        updated_at timestamptz default now()
      );
    `);
    lastInitError = '';
    return { ok: true };
  })().catch((error) => {
    lastInitError = error && error.message ? error.message : String(error);
    initPromise = null;
    throw error;
  });
  return initPromise;
}
async function query(sql, params = []) { await init(); return pool.query(sql, params); }

function extractChannel(update = {}, p = {}) {
  const explicit = norm(p.channelId || p.channel_id || p.channel || '');
  if (explicit) return { channelId: explicit, title: norm(p.channelTitle || p.title || explicit) };
  const vals = allValuesByKey(update, ['channel_id', 'channelId', 'chat_id']);
  const dialog = chatId(update);
  let channelId = vals.find((v) => v && v !== dialog && /^-/.test(v)) || vals.find((v) => v && v !== dialog) || '';
  const title = norm(deep(update, ['channel_title', 'channelTitle', 'chat_title', 'title', 'name']) || channelId || 'Канал');
  return { channelId, title };
}
function extractPost(update = {}, p = {}, channelId = '') {
  const explicitPostId = norm(p.postId || p.post_id || p.messageId || p.message_id || '');
  let postId = explicitPostId;
  if (!postId) {
    const msgIds = allValuesByKey(update, ['post_id', 'postId', 'message_id', 'messageId', 'mid', 'id']);
    const current = messageId(update);
    postId = msgIds.find((v) => v && v !== current) || current || '';
  }
  const commentKey = clean(p.commentKey || p.key || (channelId && postId ? `${channelId}:${postId}` : ''));
  const title = cut(p.postTitle || p.title || text(update) || deep(update, ['caption', 'originalText', 'text']) || postId || 'Пост', 120);
  return { postId, commentKey, title, messageId: messageId(update) };
}

async function upsertAdmin(adminId, raw = {}) {
  if (!adminId) return null;
  await query(`insert into ak_admins(admin_id, raw, updated_at) values($1,$2::jsonb,now()) on conflict(admin_id) do update set raw = excluded.raw, updated_at = now()`, [adminId, JSON.stringify(raw || {})]);
  return adminId;
}
async function upsertChannel(adminId, channelId, title = '', raw = {}) {
  if (!adminId || !channelId) return null;
  await upsertAdmin(adminId, raw);
  await query(`insert into ak_channels(channel_id,title,raw,updated_at) values($1,$2,$3::jsonb,now()) on conflict(channel_id) do update set title = coalesce(nullif(excluded.title,''), ak_channels.title), raw = excluded.raw, updated_at = now()`, [channelId, title || channelId, JSON.stringify(raw || {})]);
  await query(`insert into ak_admin_channels(admin_id,channel_id,updated_at) values($1,$2,now()) on conflict(admin_id,channel_id) do update set updated_at=now()`, [adminId, channelId]);
  return { adminId, channelId, title: title || channelId };
}
async function upsertPost(adminId, channelId, postId, title = '', raw = {}, messageIdValue = '') {
  if (!adminId || !channelId || !postId) return null;
  await upsertChannel(adminId, channelId, raw?.channelTitle || channelId, raw);
  const commentKey = clean(raw?.commentKey || `${channelId}:${postId}`);
  await query(`insert into ak_posts(admin_id,channel_id,post_id,message_id,comment_key,title,raw,updated_at)
    values($1,$2,$3,$4,$5,$6,$7::jsonb,now())
    on conflict(admin_id,channel_id,post_id) do update set message_id=coalesce(nullif(excluded.message_id,''),ak_posts.message_id), comment_key=excluded.comment_key, title=coalesce(nullif(excluded.title,''),ak_posts.title), raw=excluded.raw, updated_at=now()`,
    [adminId, channelId, postId, messageIdValue || '', commentKey, title || postId, JSON.stringify(raw || {})]);
  return { adminId, channelId, postId, commentKey, title: title || postId };
}
async function upsertFromUpdate(update = {}) {
  const p = payload(update);
  const a = adminId(update);
  if (!a) return null;
  await upsertAdmin(a, { touch: true });
  const ch = extractChannel(update, p);
  if (!ch.channelId) return { adminId: a };
  await upsertChannel(a, ch.channelId, ch.title, { source: 'webhook', sample: update });
  const po = extractPost(update, p, ch.channelId);
  if (po.postId && po.commentKey) {
    return upsertPost(a, ch.channelId, po.postId, po.title, { source: 'webhook', commentKey: po.commentKey, sample: update }, po.messageId);
  }
  return { adminId: a, channelId: ch.channelId };
}
async function getChannels(adminId) {
  if (!adminId) return [];
  const { rows } = await query(`select c.channel_id as "channelId", coalesce(c.title,c.channel_id) as title, ac.updated_at as "updatedAt" from ak_admin_channels ac join ak_channels c on c.channel_id=ac.channel_id where ac.admin_id=$1 order by ac.updated_at desc limit 50`, [adminId]);
  return rows;
}
async function getPosts(adminId, channelId, limit = 20) {
  if (!adminId || !channelId) return [];
  const { rows } = await query(`select post_id as "postId", comment_key as "commentKey", title, message_id as "messageId", updated_at as "updatedAt" from ak_posts where admin_id=$1 and channel_id=$2 order by updated_at desc limit $3`, [adminId, channelId, Math.max(1, Math.min(Number(limit || 20), 100))]);
  return rows;
}
async function getRules({ adminId, channelId, scopeType = 'channel', postId = '' }) {
  if (!adminId || !channelId) return defaults();
  const { rows } = await query(`select enabled, apply_preset_common as "applyPresetCommon", block_links as "blockLinks", block_invites as "blockInvites", ai_enabled as "aiEnabled", custom_blocklist as "customBlocklist", updated_at as "updatedAt" from ak_moderation_rules where admin_id=$1 and channel_id=$2 and scope_type=$3 and post_id=$4`, [adminId, channelId, scopeType, scopeType === 'post' ? String(postId || '') : '']);
  return { ...defaults(), ...(rows[0] || {}), scopeType, adminId, channelId, postId: scopeType === 'post' ? String(postId || '') : '' };
}
async function saveRules(scope, next = {}) {
  const adminId = String(scope.adminId || '').trim();
  const channelId = String(scope.channelId || '').trim();
  const scopeType = scope.scopeType === 'post' || scope.scope === 'post' ? 'post' : 'channel';
  const postId = scopeType === 'post' ? String(scope.postId || '').trim() : '';
  if (!adminId || !channelId || (scopeType === 'post' && !postId)) throw new Error('cc5_rules_scope_missing');
  await upsertChannel(adminId, channelId, scope.channelTitle || channelId, { source: 'rules' });
  const old = await getRules({ adminId, channelId, scopeType, postId });
  const rules = { ...old, ...next };
  const custom = Array.isArray(rules.customBlocklist) ? rules.customBlocklist.map((x) => norm(x).toLowerCase()).filter(Boolean) : [];
  await query(`insert into ak_moderation_rules(admin_id,channel_id,scope_type,post_id,enabled,apply_preset_common,block_links,block_invites,ai_enabled,custom_blocklist,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,now())
    on conflict(admin_id,channel_id,scope_type,post_id) do update set enabled=excluded.enabled, apply_preset_common=excluded.apply_preset_common, block_links=excluded.block_links, block_invites=excluded.block_invites, ai_enabled=excluded.ai_enabled, custom_blocklist=excluded.custom_blocklist, updated_at=now()`,
    [adminId, channelId, scopeType, postId, rules.enabled !== false, rules.applyPresetCommon !== false, !!rules.blockLinks, rules.blockInvites !== false, !!rules.aiEnabled, JSON.stringify([...new Set(custom)])]);
  return getRules({ adminId, channelId, scopeType, postId });
}
async function getFlow(adminId) { if (!adminId) return null; const { rows } = await query(`select flow from ak_flow_state where admin_id=$1`, [adminId]); return rows[0]?.flow || null; }
async function setFlow(adminId, flow) { if (!adminId) return; await query(`insert into ak_flow_state(admin_id,flow,updated_at) values($1,$2::jsonb,now()) on conflict(admin_id) do update set flow=excluded.flow, updated_at=now()`, [adminId, JSON.stringify(flow || {})]); }
async function clearFlow(adminId) { if (!adminId) return; await query(`delete from ak_flow_state where admin_id=$1`, [adminId]); }
async function getMenu(adminId) { if (!adminId) return ''; const { rows } = await query(`select message_id from ak_menu_state where admin_id=$1`, [adminId]); return rows[0]?.message_id || ''; }
async function setMenu(adminId, messageIdValue) { if (!adminId || !messageIdValue) return; await query(`insert into ak_menu_state(admin_id,message_id,updated_at) values($1,$2,now()) on conflict(admin_id) do update set message_id=excluded.message_id, updated_at=now()`, [adminId, messageIdValue]); }
async function stats() {
  const out = { dbUrlPresent: !!DATABASE_URL, reachable: false, admins: 0, channels: 0, links: 0, posts: 0, rules: 0, lastInitError };
  if (!pool) return out;
  try { await init(); } catch (error) { out.lastInitError = error && error.message ? error.message : String(error); return out; }
  out.reachable = true;
  for (const [k, table] of Object.entries({ admins: 'ak_admins', channels: 'ak_channels', links: 'ak_admin_channels', posts: 'ak_posts', rules: 'ak_moderation_rules' })) {
    try { const { rows } = await pool.query(`select count(*)::int as n from ${table}`); out[k] = rows[0]?.n || 0; }
    catch (error) { out[`${k}Error`] = error && error.message ? error.message : String(error); }
  }
  return out;
}
module.exports = { RUNTIME, pool, init, query, clean, cut, defaults, payload, action, cb, msg, adminId, chatId, callbackId, messageId, text, extractChannel, extractPost, upsertAdmin, upsertChannel, upsertPost, upsertFromUpdate, getChannels, getPosts, getRules, saveRules, getFlow, setFlow, clearFlow, getMenu, setMenu, stats };
