'use strict';

const db = require('../src/db/postgres');
const runtimeExport = require('./runtimeExportService');

const RUNTIME = 'PR270-LIVE-USER-POSTGRES-BINDINGS-OFFICIAL-EVIDENCE-2.0';
const DEFAULT_PATH = 'runtime/live-user-postgres-bindings.json';
const DEFAULT_TARGET_MAX_USER_IDS = Object.freeze(['17507246']);
const OFFICIAL_TYPES = new Set(['channel', 'chat', 'dialog']);
const OFFICIAL_EVIDENCE_SOURCE_RE = /(?:max_api|MAX_API|GET \/chats|get_chats|webhook|subscription|Update\.is_channel|update|official)/;

function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
function lower(value) { return clean(value).toLowerCase(); }
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
function readPath(source = {}, path = '') {
  if (!source || typeof source !== 'object') return '';
  let current = source;
  for (const part of String(path).split('.')) {
    if (!current || typeof current !== 'object' || !(part in current)) return '';
    current = current[part];
  }
  return clean(current);
}
function readBoolPath(source = {}, path = '') {
  if (!source || typeof source !== 'object') return null;
  let current = source;
  for (const part of String(path).split('.')) {
    if (!current || typeof current !== 'object' || !(part in current)) return null;
    current = current[part];
  }
  return typeof current === 'boolean' ? current : null;
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
    fallback
  );
}
function mergeEvidencePayload(record = {}) {
  const raw = parseJson(record.raw || {});
  const metadata = parseJson(record.metadata || record.meta || {});
  return { raw, metadata, combined: { ...metadata, ...raw, record } };
}
function officialSource(value = '') { return OFFICIAL_EVIDENCE_SOURCE_RE.test(clean(value)); }
function officialTypeEvidence(record = {}) {
  const { raw, metadata } = mergeEvidencePayload(record);
  const candidates = [
    ['record.type_from_api', record.type_from_api],
    ['record.max_type', record.max_type],
    ['record.chat_type', record.chat_type],
    ['raw.type', readPath(raw, 'type')],
    ['raw.chat.type', readPath(raw, 'chat.type')],
    ['raw.max.type', readPath(raw, 'max.type')],
    ['raw.maxChat.type', readPath(raw, 'maxChat.type')],
    ['raw.response.type', readPath(raw, 'response.type')],
    ['raw.chatInfo.type', readPath(raw, 'chatInfo.type')],
    ['metadata.type', readPath(metadata, 'type')],
    ['metadata.chat.type', readPath(metadata, 'chat.type')],
    ['metadata.max.type', readPath(metadata, 'max.type')],
    ['metadata.maxChat.type', readPath(metadata, 'maxChat.type')],
    ['metadata.response.type', readPath(metadata, 'response.type')],
    ['metadata.chatInfo.type', readPath(metadata, 'chatInfo.type')]
  ];
  for (const [path, value] of candidates) {
    const type = lower(value);
    if (OFFICIAL_TYPES.has(type)) return { type, path };
  }
  return null;
}
function officialIsChannelEvidence(record = {}) {
  const { raw, metadata } = mergeEvidencePayload(record);
  const sourceText = [record.evidence_source, record.evidenceSource, record.source, raw.evidence_source, raw.evidenceSource, metadata.evidence_source, metadata.evidenceSource, raw.update_type, raw.updateType, metadata.update_type, metadata.updateType].map(clean).join(' ');
  const hasOfficialContext = officialSource(sourceText) || Boolean(raw.update_type || raw.updateType || metadata.update_type || metadata.updateType);
  const candidates = [
    ['record.is_channel', typeof record.is_channel === 'boolean' ? record.is_channel : null],
    ['raw.is_channel', readBoolPath(raw, 'is_channel')],
    ['raw.isChannel', readBoolPath(raw, 'isChannel')],
    ['raw.update.is_channel', readBoolPath(raw, 'update.is_channel')],
    ['raw.update.isChannel', readBoolPath(raw, 'update.isChannel')],
    ['metadata.is_channel', readBoolPath(metadata, 'is_channel')],
    ['metadata.isChannel', readBoolPath(metadata, 'isChannel')],
    ['metadata.update.is_channel', readBoolPath(metadata, 'update.is_channel')],
    ['metadata.update.isChannel', readBoolPath(metadata, 'update.isChannel')]
  ];
  for (const [path, value] of candidates) {
    if (typeof value === 'boolean' && hasOfficialContext) return { value, path };
  }
  return null;
}
function classifyRecordDetails(record = {}) {
  if (record.source === 'push_chat_binding') {
    return { kind: 'chat', confidence: 'internal_typed_source', evidence: 'adminkit_web_push_chat_bindings', needsApiResolution: false };
  }
  const typeEvidence = officialTypeEvidence(record);
  if (typeEvidence) {
    if (typeEvidence.type === 'channel') return { kind: 'channel', confidence: 'official', evidence: `Chat.type=channel:${typeEvidence.path}`, needsApiResolution: false };
    if (typeEvidence.type === 'chat') return { kind: 'chat', maxType: 'chat', confidence: 'official', evidence: `Chat.type=chat:${typeEvidence.path}`, needsApiResolution: false };
    if (typeEvidence.type === 'dialog') return { kind: 'chat', maxType: 'dialog', confidence: 'official', evidence: `Chat.type=dialog:${typeEvidence.path}`, needsApiResolution: false };
  }
  const isChannelEvidence = officialIsChannelEvidence(record);
  if (isChannelEvidence) {
    return isChannelEvidence.value
      ? { kind: 'channel', confidence: 'official_update', evidence: `Update.is_channel=true:${isChannelEvidence.path}`, needsApiResolution: false }
      : { kind: 'chat', maxType: 'group_chat_or_dialog', confidence: 'official_update', evidence: `Update.is_channel=false:${isChannelEvidence.path}`, needsApiResolution: false };
  }
  return { kind: 'unknown', confidence: 'none', evidence: 'needs_api_resolution', needsApiResolution: true };
}
function classifyRecord(record = {}) { return classifyRecordDetails(record).kind; }
function safeBindingRecord(record = {}) {
  const classification = classifyRecordDetails(record);
  const id = first(record.channelId, record.channel_id, record.chatId, record.chat_id, record.id);
  const raw = parseJson(record.raw || record.metadata || record.meta || {});
  const title = rawTitle(raw, record.title || record.channelTitle || record.chatTitle || id);
  return {
    kind: classification.kind,
    maxType: classification.maxType || classification.kind,
    confidence: classification.confidence,
    evidence: classification.evidence,
    needsApiResolution: Boolean(classification.needsApiResolution),
    idMasked: mask(id),
    title: short(title || (classification.kind === 'chat' ? 'Чат без названия' : classification.kind === 'channel' ? 'Канал без названия' : 'Объект без названия')),
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
  if (unknown.length) blocks.push('needs_api_resolution');
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

module.exports = { RUNTIME, DEFAULT_PATH, DEFAULT_TARGET_MAX_USER_IDS, buildMatrix, buildUserRow, exportMatrix, classifyRecord, classifyRecordDetails, safeBindingRecord, targetUsers };