'use strict';

const db = require('../src/db/postgres');
const runtimeExport = require('./runtimeExportService');
const picker = require('../channel-post-picker-core');

const RUNTIME = 'PR269-LIVE-USER-POSTGRES-BINDINGS-1.1';
const DEFAULT_PATH = 'runtime/live-user-postgres-bindings.json';
const DEFAULT_TARGET_MAX_USER_IDS = Object.freeze(['17507246']);
const CHAT_RE = /(?:chat|group|supergroup|private|private_chat|direct|dialog|im|чат|группа|диалог|личн)/i;
const CHANNEL_RE = /(?:channel|канал)/i;

function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
function short(value = '', max = 180) { const text = clean(value); return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trim()}…`; }
function mask(value = '') { const id = clean(value); if (!id) return ''; return id.length <= 6 ? '***' : `${id.slice(0, 3)}…${id.slice(-3)}`; }
function uniq(values = []) { return [...new Set(values.map(clean).filter(Boolean))]; }
function parseJson(value) { if (!value) return {}; if (typeof value === 'object') return value; try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; } }
function first(...values) { for (const value of values) { const text = clean(value); if (text) return text; } return ''; }
function timestamp(value) { const t = Date.parse(clean(value)); return Number.isFinite(t) ? t : 0; }
function iso(value) { if (!value) return ''; const d = value instanceof Date ? value : new Date(value); return Number.isFinite(d.getTime()) ? d.toISOString() : clean(value); }
function targetUsers() {
  const configured = [process.env.ADMINKIT_LIVE_BINDINGS_MAX_USER_IDS, process.env.ADMINKIT_TENANT_DIAGNOSTIC_MAX_USER_IDS, process.env.ADMINKIT_DIAGNOSTIC_MAX_USER_IDS]
    .join(',')
    .split(/[\s,;]+/)
    .map(clean)
    .filter(Boolean);
  return uniq(configured.length ? configured : DEFAULT_TARGET_MAX_USER_IDS).slice(0, 10);
}
function scanText(value, out = [], seen = new Set()) {
  if (value == null || seen.has(value)) return out;
  if (typeof value !== 'object') { const text = clean(value); if (text) out.push(text); return out; }
  seen.add(value);
  if (Array.isArray(value)) { value.slice(0, 40).forEach((item) => scanText(item, out, seen)); return out; }
  for (const [key, raw] of Object.entries(value).slice(0, 80)) {
    const keyText = clean(key);
    if (/(?:type|kind|source|title|name|chat|channel|recipient|dialog|group|isChannel|isChat)/i.test(keyText)) scanText(raw, out, seen);
    else if (raw && typeof raw === 'object') scanText(raw, out, seen);
  }
  return out;
}
function deepFirst(raw = {}, keys = []) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const seen = new Set();
  function visit(value) {
    if (!value || typeof value !== 'object' || seen.has(value)) return '';
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (wanted.has(key.toLowerCase())) {
        const text = clean(child);
        if (text && text !== '[object Object]') return text;
      }
      const nested = visit(child);
      if (nested) return nested;
    }
    return '';
  }
  return visit(raw);
}
function rawTitle(raw = {}, fallback = '') {
  return first(
    raw.title,
    raw.channelTitle,
    raw.channel_title,
    raw.chatTitle,
    raw.chat_title,
    raw.name,
    raw.displayName,
    raw.display_name,
    deepFirst(raw, ['title', 'channelTitle', 'channel_title', 'chatTitle', 'chat_title', 'name']),
    fallback
  );
}
function rawDestination(raw = {}) {
  const text = scanText(raw).join(' ').toLowerCase();
  const explicitChannelId = first(raw.channelId, raw.channel_id, raw.channel && (raw.channel.id || raw.channel.channelId));
  const chatId = first(raw.chatId, raw.chat_id, raw.chat && (raw.chat.id || raw.chat.chatId));
  const type = first(raw.type, raw.chatType, raw.chat_type, raw.kind, raw.sourceType, raw.source_type, raw.destinationType, raw.destination_type, deepFirst(raw, ['type', 'chatType', 'chat_type', 'kind', 'sourceType', 'source_type', 'destinationType', 'destination_type'])).toLowerCase();
  return { text, explicitChannelId, chatId, type };
}
function classifyRecord(record = {}) {
  const raw = parseJson(record.raw || record.metadata || {});
  const title = rawTitle(raw, record.title || record.channelTitle || record.chatTitle || record.channel_id || record.chat_id);
  const titleText = clean(title).toLowerCase();
  const destination = rawDestination({ ...raw, ...record });
  const candidate = {
    ...raw,
    ...record,
    title,
    channelId: first(record.channelId, record.channel_id, raw.channelId, raw.channel_id),
    chatId: first(record.chatId, record.chat_id, raw.chatId, raw.chat_id)
  };
  if (picker.isChatLikeRecord(candidate)) return 'chat';
  if (record.source === 'push_chat_binding') return 'chat';
  if (candidate.isChat === true || candidate.isGroup === true || (CHAT_RE.test(destination.type) && !CHANNEL_RE.test(destination.type))) return 'chat';
  if (CHAT_RE.test(titleText) && !CHANNEL_RE.test(titleText)) return 'chat';
  if (CHAT_RE.test(destination.text) && !CHANNEL_RE.test(destination.text)) return 'chat';
  if (candidate.isChannel === true || CHANNEL_RE.test(destination.type) || destination.explicitChannelId) return 'channel';
  return 'unknown';
}
function safeBindingRecord(record = {}) {
  const kind = classifyRecord(record);
  const id = first(record.channelId, record.channel_id, record.chatId, record.chat_id, record.id);
  const title = rawTitle(parseJson(record.raw || record.metadata || {}), record.title || record.channelTitle || record.chatTitle || id);
  return {
    kind,
    idMasked: mask(id),
    title: short(title || (kind === 'chat' ? 'Чат без названия' : 'Канал без названия')),
    source: clean(record.source || ''),
    role: clean(record.role || ''),
    status: clean(record.status || 'active'),
    postsCount: Number(record.postsCount || 0),
    updatedAt: iso(record.updated_at || record.updatedAt || record.connected_at || record.created_at || record.createdAt)
  };
}
function dedupe(items = []) {
  const byKey = new Map();
  for (const item of items) {
    const key = `${item.kind}:${item.idMasked}:${item.title.toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev || timestamp(item.updatedAt) > timestamp(prev.updatedAt)) byKey.set(key, item);
  }
  return [...byKey.values()].sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
}
async function tableExists(tableName = '') {
  try {
    const result = await db.query('SELECT to_regclass($1) AS name', [clean(tableName)]);
    return Boolean(result.rows && result.rows[0] && result.rows[0].name);
  } catch { return false; }
}
async function queryIfTable(tableName = '', sql = '', params = []) {
  if (!(await tableExists(tableName))) return { ok: true, rows: [], missing: true };
  try { const result = await db.query(sql, params); return { ok: true, rows: result.rows || [], missing: false }; }
  catch (error) { return { ok: false, rows: [], missing: false, error: clean(error && error.message || error).slice(0, 160) }; }
}
async function adminChannelRows(maxUserId = '') {
  return queryIfTable('ak_admin_channels', `
    SELECT ac.admin_id, ac.channel_id, ac.role, ac.updated_at,
           c.title, c.raw,
           COALESCE(pc.posts_count, 0)::int AS "postsCount",
           'ak_admin_channels' AS source
      FROM ak_admin_channels ac
      LEFT JOIN ak_channels c ON c.channel_id = ac.channel_id
      LEFT JOIN (
        SELECT admin_id, channel_id, COUNT(*)::int AS posts_count
          FROM ak_posts
         WHERE admin_id = $1
         GROUP BY admin_id, channel_id
      ) pc ON pc.admin_id = ac.admin_id AND pc.channel_id = ac.channel_id
     WHERE ac.admin_id = $1
     ORDER BY ac.updated_at DESC
     LIMIT 100`, [maxUserId]);
}
async function tenantChannelRows(maxUserId = '') {
  return queryIfTable('ak_tenant_channels', `
    SELECT tc.tenant_id, tc.channel_id, tc.channel_title AS title, tc.status, tc.metadata AS raw, tc.updated_at, tc.connected_at,
           COALESCE(pc.posts_count, 0)::int AS "postsCount",
           'ak_tenant_channels' AS source
      FROM ak_tenant_users tu
      JOIN ak_tenant_channels tc ON tc.tenant_id = tu.tenant_id
      LEFT JOIN (
        SELECT admin_id, channel_id, COUNT(*)::int AS posts_count
          FROM ak_posts
         WHERE admin_id = $1
         GROUP BY admin_id, channel_id
      ) pc ON pc.channel_id = tc.channel_id
     WHERE tu.max_user_id = $1 AND COALESCE(tu.status, 'active') = 'active'
     ORDER BY tc.updated_at DESC
     LIMIT 100`, [maxUserId]);
}
async function ownedTenantChannelRows(maxUserId = '') {
  return queryIfTable('ak_tenants', `
    SELECT tc.tenant_id, tc.channel_id, tc.channel_title AS title, tc.status, tc.metadata AS raw, tc.updated_at, tc.connected_at,
           COALESCE(pc.posts_count, 0)::int AS "postsCount",
           'ak_tenant_owner_channels' AS source
      FROM ak_tenants t
      JOIN ak_tenant_channels tc ON tc.tenant_id = t.tenant_id
      LEFT JOIN (
        SELECT admin_id, channel_id, COUNT(*)::int AS posts_count
          FROM ak_posts
         WHERE admin_id = $1
         GROUP BY admin_id, channel_id
      ) pc ON pc.channel_id = tc.channel_id
     WHERE t.owner_max_user_id = $1 AND COALESCE(t.status, 'active') = 'active'
     ORDER BY tc.updated_at DESC
     LIMIT 100`, [maxUserId]);
}
async function pushChatRows(maxUserId = '') {
  return queryIfTable('adminkit_web_push_chat_bindings', `
    SELECT chat_id, channel_id, chat_title AS title, status, updated_at, created_at,
           'push_chat_binding' AS source
      FROM adminkit_web_push_chat_bindings
     WHERE max_user_id = $1 AND COALESCE(status, 'active') = 'active'
     ORDER BY updated_at DESC
     LIMIT 100`, [maxUserId]);
}
async function buildUserRow(maxUserId = '') {
  const userId = clean(maxUserId);
  const sources = await Promise.all([
    adminChannelRows(userId),
    tenantChannelRows(userId),
    ownedTenantChannelRows(userId),
    pushChatRows(userId)
  ]);
  const errors = sources.filter((item) => !item.ok).map((item) => item.error).filter(Boolean);
  const missingTables = ['ak_admin_channels', 'ak_tenant_channels', 'ak_tenants', 'adminkit_web_push_chat_bindings'].filter((_, index) => sources[index].missing);
  const allRecords = sources.flatMap((item) => item.rows || []);
  const safeRecords = dedupe(allRecords.map(safeBindingRecord));
  const channels = safeRecords.filter((item) => item.kind === 'channel');
  const chats = safeRecords.filter((item) => item.kind === 'chat');
  const unknown = safeRecords.filter((item) => item.kind === 'unknown');
  const blocks = [];
  if (!userId) blocks.push('max_user_id_missing');
  if (!db.hasDatabaseUrl()) blocks.push('postgres_not_configured');
  if (errors.length) blocks.push('postgres_query_failed');
  return {
    maxUserIdMasked: mask(userId),
    ok: blocks.length === 0,
    channels,
    chats,
    unknown,
    counts: {
      sourceRecords: allRecords.length,
      channels: channels.length,
      chats: chats.length,
      unknown: unknown.length,
      missingTables: missingTables.length
    },
    missingTables,
    errors,
    blocks
  };
}
async function buildMatrix({ users = null } = {}) {
  const ids = uniq(Array.isArray(users) && users.length ? users : targetUsers());
  const rows = [];
  for (const id of ids) rows.push(await buildUserRow(id));
  const blockCount = rows.reduce((sum, row) => sum + (row.blocks || []).length, 0);
  return {
    ok: blockCount === 0,
    generatedAt: new Date().toISOString(),
    runtime: RUNTIME,
    checkedUsers: rows.map((row) => row.maxUserIdMasked),
    rows,
    summary: {
      checkedUsersCount: rows.length,
      channelsCount: rows.reduce((sum, row) => sum + row.counts.channels, 0),
      chatsCount: rows.reduce((sum, row) => sum + row.counts.chats, 0),
      unknownCount: rows.reduce((sum, row) => sum + row.counts.unknown, 0),
      blockCount
    }
  };
}
async function exportMatrix() {
  return runtimeExport.exportJson({ path: DEFAULT_PATH, payload: () => buildMatrix(), message: 'live user postgres bindings matrix' });
}

module.exports = { RUNTIME, DEFAULT_PATH, DEFAULT_TARGET_MAX_USER_IDS, buildMatrix, buildUserRow, exportMatrix, classifyRecord, safeBindingRecord, targetUsers };