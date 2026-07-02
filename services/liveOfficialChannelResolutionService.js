'use strict';

const crypto = require('crypto');
const db = require('../src/db/postgres');
const runtimeExport = require('./runtimeExportService');
const maxApi = require('./maxApi');
const config = require('../config');

const RUNTIME = 'PR271-LIVE-OFFICIAL-CHANNEL-RESOLUTION-1.3';
const DEFAULT_PATH = 'runtime/live-official-channel-resolution.json';
const DEFAULT_TARGET_MAX_USER_IDS = Object.freeze(['17507246']);
const OFFICIAL_GET_CHAT_SOURCE_RE = /(?:GET[_\s/{}-]*chats[_\s/{}-]*chatId|GET\s*\/chats\/\{chatId\}|get_chats_chatid)/i;

const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const lower = (v) => clean(v).toLowerCase();
const mask = (v = '') => { const id = clean(v); return !id ? '' : id.length <= 6 ? '***' : `${id.slice(0,3)}…${id.slice(-3)}`; };
const parse = (v) => { if (!v) return {}; if (typeof v === 'object') return v; try { const p = JSON.parse(String(v)); return p && typeof p === 'object' ? p : {}; } catch { return {}; } };
const short = (v = '', n = 160) => { const s = clean(v); return s.length <= n ? s : `${s.slice(0,n-1).trim()}…`; };
const uniq = (a = []) => [...new Set(a.map(clean).filter(Boolean))];
const idLike = (v = '') => /^-?\d{6,}$/.test(clean(v));
const safeTitle = (v = '', fallback = 'Объект без названия') => { const text = clean(v); return text && !idLike(text) ? text : fallback; };
const titleOf = (chat = {}, fallback = '') => safeTitle(chat.title || chat.name || chat.channelTitle || chat.chatTitle || fallback, '');
const fallbackTenantIdFor = (id = '') => `tenant_live_${crypto.createHash('sha256').update(clean(id)).digest('hex').slice(0,12)}`;

function targetUsers() {
  const env = uniq([process.env.ADMINKIT_LIVE_BINDINGS_MAX_USER_IDS, process.env.ADMINKIT_TENANT_DIAGNOSTIC_MAX_USER_IDS, process.env.ADMINKIT_DIAGNOSTIC_MAX_USER_IDS].join(',').split(/[\s,;]+/));
  return env.length ? env.slice(0,10) : [...DEFAULT_TARGET_MAX_USER_IDS];
}
function trustedOfficialSource(raw = {}) {
  const source = clean(raw.evidence_source || raw.evidenceSource || raw.source || raw.resolution_source || raw.resolutionSource);
  const status = lower(raw.resolution_status || raw.resolutionStatus || raw.max?.resolution_status || raw.max?.resolutionStatus);
  return OFFICIAL_GET_CHAT_SOURCE_RE.test(source) && status === 'ok';
}
function officialType(raw = {}, { requireTrusted = true } = {}) {
  const source = parse(raw);
  if (requireTrusted && !trustedOfficialSource(source)) return '';
  const vals = [source.type, source.chat?.type, source.max?.type, source.maxChat?.type, source.response?.type, source.chatInfo?.type, source.sample?.recipient?.type, source.sample?.chat?.type].map(lower).filter(Boolean);
  const kinds = new Set(vals.map((t) => t === 'channel' ? 'channel' : (t === 'chat' || t === 'dialog') ? 'chat' : '').filter(Boolean));
  if (kinds.size > 1) return 'conflict';
  return kinds.has('channel') ? 'channel' : kinds.has('chat') ? 'chat' : '';
}
async function tableExists(name) {
  try { const r = await db.query('SELECT to_regclass($1) AS name', [clean(name)]); return Boolean(r.rows?.[0]?.name); } catch { return false; }
}
async function adminRows(userId) {
  if (!(await tableExists('ak_admin_channels'))) return [];
  const r = await db.query(`SELECT ac.admin_id, ac.channel_id, ac.updated_at, c.title, c.raw, COALESCE(pc.posts_count,0)::int AS posts_count FROM ak_admin_channels ac LEFT JOIN ak_channels c ON c.channel_id=ac.channel_id LEFT JOIN (SELECT admin_id, channel_id, COUNT(*)::int AS posts_count FROM ak_posts WHERE admin_id=$1 GROUP BY admin_id, channel_id) pc ON pc.admin_id=ac.admin_id AND pc.channel_id=ac.channel_id WHERE ac.admin_id=$1 ORDER BY COALESCE(pc.posts_count,0) DESC, ac.updated_at DESC LIMIT 80`, [clean(userId)]);
  return r.rows || [];
}
async function pushRows(userId) {
  if (!(await tableExists('adminkit_web_push_chat_bindings'))) return [];
  const r = await db.query(`SELECT chat_id, chat_title FROM adminkit_web_push_chat_bindings WHERE max_user_id=$1 AND COALESCE(status,'active')='active' ORDER BY updated_at DESC LIMIT 80`, [clean(userId)]);
  return r.rows || [];
}
async function existingTenantIdForUser(userId) {
  const id = clean(userId);
  if (await tableExists('ak_tenant_users')) {
    const linked = await db.query(`SELECT tu.tenant_id FROM ak_tenant_users tu JOIN ak_tenants t ON t.tenant_id=tu.tenant_id WHERE tu.max_user_id=$1 AND COALESCE(tu.status,'active')='active' AND COALESCE(t.status,'active')='active' ORDER BY tu.updated_at DESC NULLS LAST LIMIT 1`, [id]);
    if (clean(linked.rows?.[0]?.tenant_id)) return clean(linked.rows[0].tenant_id);
  }
  if (await tableExists('ak_tenants')) {
    const owned = await db.query(`SELECT tenant_id FROM ak_tenants WHERE owner_max_user_id=$1 AND COALESCE(status,'active')='active' ORDER BY updated_at DESC NULLS LAST LIMIT 1`, [id]);
    if (clean(owned.rows?.[0]?.tenant_id)) return clean(owned.rows[0].tenant_id);
  }
  return fallbackTenantIdFor(id);
}
async function existingChannelOwner(channelId) {
  if (!(await tableExists('ak_tenant_channels'))) return '';
  const result = await db.query(`SELECT tenant_id FROM ak_tenant_channels WHERE channel_id=$1 AND COALESCE(status,'active')='active' LIMIT 1`, [clean(channelId)]);
  return clean(result.rows?.[0]?.tenant_id);
}
function officialRaw(oldRaw, chat, status = '') {
  const type = lower(chat?.type);
  return { ...parse(oldRaw), type, max: chat || {}, evidence_source: 'GET_chats_chatId', resolution_status: status || (type ? 'ok' : 'type_missing'), resolved_at: new Date().toISOString() };
}
async function saveOfficialChannelRaw(channelId, oldRaw, title, chat) {
  const type = lower(chat?.type);
  const displayTitle = titleOf(chat, title) || safeTitle(title, type === 'channel' ? 'Канал без названия' : 'Чат без названия');
  await db.query(`INSERT INTO ak_channels(channel_id,title,raw,updated_at) VALUES($1,$2,$3::jsonb,NOW()) ON CONFLICT(channel_id) DO UPDATE SET title=COALESCE(NULLIF(EXCLUDED.title,''),ak_channels.title),raw=ak_channels.raw || EXCLUDED.raw,updated_at=NOW()`, [clean(channelId), displayTitle, JSON.stringify(officialRaw(oldRaw, chat))]);
}
async function saveResolutionFailure(channelId, oldRaw, title, error) {
  if (!clean(channelId)) return;
  const raw = { ...parse(oldRaw), evidence_source: 'GET_chats_chatId', resolution_status: 'api_resolution_failed', resolution_error: short(error), resolved_at: new Date().toISOString() };
  await db.query(`INSERT INTO ak_channels(channel_id,title,raw,updated_at) VALUES($1,$2,$3::jsonb,NOW()) ON CONFLICT(channel_id) DO UPDATE SET title=COALESCE(NULLIF(EXCLUDED.title,''),ak_channels.title),raw=ak_channels.raw || EXCLUDED.raw,updated_at=NOW()`, [clean(channelId), safeTitle(title, 'Объект без названия'), JSON.stringify(raw)]);
}
async function bindTenantChannel(userId, channelId, title, chat) {
  const tenantId = await existingTenantIdForUser(userId);
  const ownerTenantId = await existingChannelOwner(channelId);
  if (ownerTenantId && ownerTenantId !== tenantId) return { ok: false, error: 'channel_owned_by_another_tenant', tenantId };
  const meta = { type: lower(chat?.type), max: chat || {}, evidence_source: 'GET_chats_chatId', source: 'pr271_official_channel_resolution', resolved_at: new Date().toISOString() };
  await db.query(`INSERT INTO ak_tenants(tenant_id,owner_max_user_id,status,plan_id,max_channels,source,metadata,created_at,updated_at) VALUES($1,$2,'active','business',100,'pr271_live_admin_bootstrap',$3::jsonb,NOW(),NOW()) ON CONFLICT(tenant_id) DO UPDATE SET owner_max_user_id=COALESCE(NULLIF(ak_tenants.owner_max_user_id,''),EXCLUDED.owner_max_user_id),status='active',max_channels=GREATEST(ak_tenants.max_channels,100),metadata=ak_tenants.metadata || EXCLUDED.metadata,updated_at=NOW()`, [tenantId, clean(userId), JSON.stringify({ source: 'pr271_live_admin_bootstrap', maxUserIdMasked: mask(userId) })]);
  await db.query(`INSERT INTO ak_tenant_users(tenant_id,max_user_id,role,status,created_at,updated_at) VALUES($1,$2,'owner','active',NOW(),NOW()) ON CONFLICT(tenant_id,max_user_id) DO UPDATE SET role=EXCLUDED.role,status='active',updated_at=NOW()`, [tenantId, clean(userId)]);
  await db.query(`INSERT INTO ak_tenant_channels(tenant_id,channel_id,channel_title,status,connected_at,bound_by_code,metadata,updated_at) VALUES($1,$2,$3,'active','now'::timestamptz,'',$4::jsonb,NOW()) ON CONFLICT(channel_id) DO UPDATE SET channel_title=COALESCE(NULLIF(EXCLUDED.channel_title,''),ak_tenant_channels.channel_title),status='active',metadata=ak_tenant_channels.metadata || EXCLUDED.metadata,updated_at=NOW() WHERE ak_tenant_channels.tenant_id=EXCLUDED.tenant_id`, [tenantId, clean(channelId), safeTitle(title, 'Канал без названия'), JSON.stringify(meta)]);
  return { ok: true, tenantId };
}
async function resolveAdminRow(userId, row, botToken) {
  const channelId = clean(row.channel_id);
  const raw = parse(row.raw);
  const before = officialType(raw);
  const item = { idMasked: mask(channelId), title: short(safeTitle(row.title, 'Объект без названия')), postsCount: Number(row.posts_count || 0), beforeType: before || 'missing', resolvedType: '', action: '', ok: false, error: '' };
  if (!channelId) return { ...item, action: 'missing_id', error: 'missing_channel_id' };
  if (before === 'channel') {
    const bind = await bindTenantChannel(userId, channelId, row.title || '', raw.max || raw);
    if (!bind.ok) return { ...item, resolvedType: 'channel', action: bind.error, error: bind.error };
    return { ...item, ok: true, resolvedType: 'channel', action: 'already_verified_channel_bound', tenantIdMasked: mask(bind.tenantId) };
  }
  if (before === 'chat') return { ...item, ok: true, resolvedType: 'chat', action: 'already_verified_non_channel' };
  try {
    const chat = await maxApi.getChat({ botToken, chatId: channelId, timeoutMs: Number(process.env.ADMINKIT_PR271_GET_CHAT_TIMEOUT_MS || 1600) || 1600 });
    const type = lower(chat?.type);
    const title = titleOf(chat, row.title || '');
    await saveOfficialChannelRaw(channelId, raw, title, chat);
    if (type === 'channel') {
      const bind = await bindTenantChannel(userId, channelId, title || row.title || '', chat);
      if (!bind.ok) return { ...item, resolvedType: type, title: short(safeTitle(title || row.title, 'Канал без названия')), action: bind.error, error: bind.error };
      return { ...item, ok: true, resolvedType: type, title: short(safeTitle(title || row.title, 'Канал без названия')), action: 'official_channel_bound', tenantIdMasked: mask(bind.tenantId) };
    }
    if (type === 'chat' || type === 'dialog') return { ...item, ok: true, resolvedType: type, title: short(safeTitle(title || row.title, 'Чат без названия')), action: 'official_non_channel_saved' };
    return { ...item, resolvedType: 'missing', action: 'api_type_missing', error: 'max_chat_type_missing' };
  } catch (e) {
    const message = e?.message || e;
    try { await saveResolutionFailure(channelId, raw, row.title || '', message); } catch {}
    return { ...item, action: 'api_resolution_failed', error: short(message) };
  }
}
async function refreshPushTitle(row, botToken) {
  const chatId = clean(row.chat_id), current = clean(row.chat_title);
  if (!chatId || (current && !idLike(current))) return { idMasked: mask(chatId), ok: true, action: 'already_titled', title: short(safeTitle(current, 'Чат без названия')) };
  try {
    const chat = await maxApi.getChat({ botToken, chatId, timeoutMs: Number(process.env.ADMINKIT_PR271_GET_CHAT_TIMEOUT_MS || 1600) || 1600 });
    const title = titleOf(chat, '');
    if (!title) return { idMasked: mask(chatId), ok: false, action: 'title_missing' };
    await db.query(`UPDATE adminkit_web_push_chat_bindings SET chat_title=$2,updated_at=NOW() WHERE chat_id=$1 AND (chat_title='' OR chat_title IS NULL OR chat_title ~ '^-?[0-9]{6,}$')`, [chatId, title]);
    return { idMasked: mask(chatId), ok: true, action: 'title_refreshed', title: short(title) };
  } catch (e) { return { idMasked: mask(chatId), ok: false, action: 'title_resolution_failed', error: short(e?.message || e) }; }
}
async function buildMatrix({ users = null, resolve = true } = {}) {
  const ids = uniq(Array.isArray(users) && users.length ? users : targetUsers());
  const botToken = clean(config.botToken || process.env.BOT_TOKEN || process.env.MAX_BOT_TOKEN);
  const rows = [];
  for (const userId of ids) {
    const row = { maxUserIdMasked: mask(userId), ok: false, botTokenConfigured: Boolean(botToken), resolvedChannels: [], resolvedNonChannels: [], unresolved: [], pushTitles: [], blocks: [] };
    if (!db.hasDatabaseUrl()) row.blocks.push('postgres_not_configured');
    if (!botToken) row.blocks.push('bot_token_missing');
    if (resolve && db.hasDatabaseUrl() && botToken) {
      for (const r of await adminRows(userId)) {
        const item = await resolveAdminRow(userId, r, botToken);
        if (item.ok && item.resolvedType === 'channel') row.resolvedChannels.push(item);
        else if (item.ok && (item.resolvedType === 'chat' || item.resolvedType === 'dialog')) row.resolvedNonChannels.push(item);
        else row.unresolved.push(item);
      }
      for (const r of await pushRows(userId)) row.pushTitles.push(await refreshPushTitle(r, botToken));
    }
    if (row.unresolved.length) row.blocks.push('official_resolution_incomplete');
    row.ok = row.blocks.length === 0;
    rows.push(row);
  }
  const blockCount = rows.reduce((s, r) => s + r.blocks.length, 0);
  return { ok: blockCount === 0, generatedAt: new Date().toISOString(), runtime: RUNTIME, checkedUsers: rows.map((r) => r.maxUserIdMasked), rows, summary: { checkedUsersCount: rows.length, resolvedChannelsCount: rows.reduce((s, r) => s + r.resolvedChannels.length, 0), resolvedNonChannelsCount: rows.reduce((s, r) => s + r.resolvedNonChannels.length, 0), unresolvedCount: rows.reduce((s, r) => s + r.unresolved.length, 0), pushTitlesResolvedCount: rows.reduce((s, r) => s + r.pushTitles.filter((p) => p.action === 'title_refreshed').length, 0), blockCount } };
}
async function exportMatrix() { return runtimeExport.exportJson({ path: DEFAULT_PATH, payload: () => buildMatrix({ resolve: true }), message: 'live official channel resolution' }); }
module.exports = { RUNTIME, DEFAULT_PATH, DEFAULT_TARGET_MAX_USER_IDS, buildMatrix, exportMatrix, officialType, fallbackTenantIdFor, titleOf, safeTitle, trustedOfficialSource };
