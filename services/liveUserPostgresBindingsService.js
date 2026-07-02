'use strict';

const db = require('../src/db/postgres');
const runtimeExport = require('./runtimeExportService');

const RUNTIME = 'PR270-LIVE-USER-POSTGRES-BINDINGS-OFFICIAL-EVIDENCE-2.2';
const DEFAULT_PATH = 'runtime/live-user-postgres-bindings.json';
const DEFAULT_TARGET_MAX_USER_IDS = Object.freeze(['17507246']);
const TYPES = new Set(['channel', 'chat', 'dialog']);
const OFFICIAL_SOURCE_RE = /(?:max_api|official|webhook|subscription|get_chats|Update\.is_channel)/i;

const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const lower = (v) => clean(v).toLowerCase();
const mask = (v = '') => { const id = clean(v); return !id ? '' : id.length <= 6 ? '***' : `${id.slice(0, 3)}…${id.slice(-3)}`; };
const uniq = (arr = []) => [...new Set(arr.map(clean).filter(Boolean))];
const parseJson = (v) => { if (!v) return {}; if (typeof v === 'object') return v; try { const p = JSON.parse(String(v)); return p && typeof p === 'object' ? p : {}; } catch { return {}; } };
const first = (...values) => values.map(clean).find(Boolean) || '';
const time = (v) => { const t = Date.parse(clean(v)); return Number.isFinite(t) ? t : 0; };
const iso = (v) => { if (!v) return ''; const d = v instanceof Date ? v : new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : clean(v); };
const short = (v = '', max = 180) => { const t = clean(v); return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1)).trim()}…`; };

function targetUsers() {
  const configured = [process.env.ADMINKIT_LIVE_BINDINGS_MAX_USER_IDS, process.env.ADMINKIT_TENANT_DIAGNOSTIC_MAX_USER_IDS, process.env.ADMINKIT_DIAGNOSTIC_MAX_USER_IDS]
    .join(',')
    .split(/[\s,;]+/)
    .map(clean)
    .filter(Boolean);
  return uniq(configured.length ? configured : DEFAULT_TARGET_MAX_USER_IDS).slice(0, 10);
}
function pathValue(obj = {}, path = '') {
  let cur = obj;
  for (const part of String(path).split('.')) {
    if (!cur || typeof cur !== 'object' || !(part in cur)) return '';
    cur = cur[part];
  }
  return clean(cur);
}
function pathBool(obj = {}, path = '') {
  let cur = obj;
  for (const part of String(path).split('.')) {
    if (!cur || typeof cur !== 'object' || !(part in cur)) return null;
    cur = cur[part];
  }
  return typeof cur === 'boolean' ? cur : null;
}
function payload(record = {}) { return { raw: parseJson(record.raw || {}), meta: parseJson(record.metadata || record.meta || {}) }; }
function titleFrom(raw = {}, fallback = '') { return first(raw.title, raw.channelTitle, raw.channel_title, raw.chatTitle, raw.chat_title, raw.name, raw.displayName, raw.display_name, fallback); }
function typeEvidence(record = {}) {
  const { raw, meta } = payload(record);
  const candidates = [
    ['record.type_from_api', record.type_from_api], ['record.max_type', record.max_type], ['record.chat_type', record.chat_type],
    ['raw.type', pathValue(raw, 'type')], ['raw.chat.type', pathValue(raw, 'chat.type')], ['raw.max.type', pathValue(raw, 'max.type')], ['raw.maxChat.type', pathValue(raw, 'maxChat.type')], ['raw.response.type', pathValue(raw, 'response.type')], ['raw.chatInfo.type', pathValue(raw, 'chatInfo.type')],
    ['metadata.type', pathValue(meta, 'type')], ['metadata.chat.type', pathValue(meta, 'chat.type')], ['metadata.max.type', pathValue(meta, 'max.type')], ['metadata.maxChat.type', pathValue(meta, 'maxChat.type')], ['metadata.response.type', pathValue(meta, 'response.type')], ['metadata.chatInfo.type', pathValue(meta, 'chatInfo.type')]
  ];
  for (const [where, value] of candidates) {
    const type = lower(value);
    if (TYPES.has(type)) return { type, where };
  }
  return null;
}
function isChannelEvidence(record = {}) {
  const { raw, meta } = payload(record);
  const sourceText = [record.evidence_source, record.evidenceSource, raw.evidence_source, raw.evidenceSource, meta.evidence_source, meta.evidenceSource, raw.update_type, raw.updateType, meta.update_type, meta.updateType].map(clean).join(' ');
  const official = OFFICIAL_SOURCE_RE.test(sourceText) || Boolean(raw.update_type || raw.updateType || meta.update_type || meta.updateType);
  if (!official) return null;
  const candidates = [
    ['record.is_channel', typeof record.is_channel === 'boolean' ? record.is_channel : null],
    ['raw.is_channel', pathBool(raw, 'is_channel')], ['raw.isChannel', pathBool(raw, 'isChannel')], ['raw.update.is_channel', pathBool(raw, 'update.is_channel')], ['raw.update.isChannel', pathBool(raw, 'update.isChannel')],
    ['metadata.is_channel', pathBool(meta, 'is_channel')], ['metadata.isChannel', pathBool(meta, 'isChannel')], ['metadata.update.is_channel', pathBool(meta, 'update.is_channel')], ['metadata.update.isChannel', pathBool(meta, 'update.isChannel')]
  ];
  for (const [where, value] of candidates) if (typeof value === 'boolean') return { value, where };
  return null;
}
function classifyRecordDetails(record = {}) {
  if (record.source === 'push_chat_binding') return { kind: 'chat', confidence: 'internal_typed_source', evidence: 'adminkit_web_push_chat_bindings', needsApiResolution: false };
  const typed = typeEvidence(record);
  if (typed?.type === 'channel') return { kind: 'channel', confidence: 'official', evidence: `Chat.type=channel:${typed.where}`, needsApiResolution: false };
  if (typed?.type === 'chat') return { kind: 'chat', maxType: 'chat', confidence: 'official', evidence: `Chat.type=chat:${typed.where}`, needsApiResolution: false };
  if (typed?.type === 'dialog') return { kind: 'chat', maxType: 'dialog', confidence: 'official', evidence: `Chat.type=dialog:${typed.where}`, needsApiResolution: false };
  const update = isChannelEvidence(record);
  if (update?.value === true) return { kind: 'channel', confidence: 'official_update', evidence: `Update.is_channel=true:${update.where}`, needsApiResolution: false };
  if (update?.value === false) return { kind: 'chat', maxType: 'group_chat_or_dialog', confidence: 'official_update', evidence: `Update.is_channel=false:${update.where}`, needsApiResolution: false };
  return { kind: 'unknown', confidence: 'none', evidence: 'needs_api_resolution', needsApiResolution: true };
}
function classifyRecord(record = {}) { return classifyRecordDetails(record).kind; }
function recordId(record = {}) { return first(record.channelId, record.channel_id, record.chatId, record.chat_id, record.id); }
function safeBindingRecord(record = {}) {
  const c = classifyRecordDetails(record);
  const id = recordId(record);
  const raw = parseJson(record.raw || record.metadata || record.meta || {});
  return {
    kind: c.kind,
    maxType: c.maxType || c.kind,
    confidence: c.confidence,
    evidence: c.evidence,
    needsApiResolution: Boolean(c.needsApiResolution),
    idMasked: mask(id),
    title: short(titleFrom(raw, record.title || record.channelTitle || record.chatTitle || id) || (c.kind === 'channel' ? 'Канал без названия' : c.kind === 'chat' ? 'Чат без названия' : 'Объект без названия')),
    source: clean(record.source || ''),
    role: clean(record.role || ''),
    status: clean(record.status || 'active'),
    postsCount: Number(record.postsCount || 0),
    updatedAt: iso(record.updated_at || record.updatedAt || record.connected_at || record.created_at || record.createdAt)
  };
}
function rank(item = {}) { return item.kind === 'unknown' ? 0 : item.confidence === 'internal_typed_source' ? 1 : item.confidence === 'official_update' ? 2 : item.confidence === 'official' ? 3 : 0; }
function dedupe(records = []) {
  const groups = new Map();
  for (const record of records) {
    const safe = safeBindingRecord(record);
    const key = mask(recordId(record)) || `record:${safe.source}:${safe.kind}:${safe.title.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(safe);
  }
  const out = [];
  for (const group of groups.values()) {
    const officialKinds = new Set(group.filter((item) => item.kind !== 'unknown' && /^official/.test(clean(item.confidence))).map((item) => item.kind));
    if (officialKinds.size > 1) {
      const latest = [...group].sort((a, b) => time(b.updatedAt) - time(a.updatedAt))[0] || group[0];
      out.push({ ...latest, kind: 'unknown', maxType: 'conflict', confidence: 'conflict', evidence: 'conflicting_official_evidence', needsApiResolution: true, source: uniq(group.map((item) => item.source)).join(', ') });
      continue;
    }
    out.push([...group].sort((a, b) => rank(b) - rank(a) || time(b.updatedAt) - time(a.updatedAt))[0]);
  }
  return out.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
}
async function tableExists(tableName = '') {
  try { const result = await db.query('SELECT to_regclass($1) AS name', [clean(tableName)]); return Boolean(result.rows?.[0]?.name); }
  catch { return false; }
}
async function queryIfTable(tableName = '', sql = '', params = []) {
  if (!(await tableExists(tableName))) return { ok: true, rows: [], missing: true };
  try { const result = await db.query(sql, params); return { ok: true, rows: result.rows || [], missing: false }; }
  catch (error) { return { ok: false, rows: [], missing: false, error: clean(error && error.message || error).slice(0, 160) }; }
}
async function adminChannelRows(maxUserId = '') { return queryIfTable('ak_admin_channels', `SELECT ac.admin_id, ac.channel_id, ac.role, ac.updated_at, c.title, c.raw, COALESCE(pc.posts_count, 0)::int AS "postsCount", 'ak_admin_channels' AS source FROM ak_admin_channels ac LEFT JOIN ak_channels c ON c.channel_id = ac.channel_id LEFT JOIN (SELECT admin_id, channel_id, COUNT(*)::int AS posts_count FROM ak_posts WHERE admin_id = $1 GROUP BY admin_id, channel_id) pc ON pc.admin_id = ac.admin_id AND pc.channel_id = ac.channel_id WHERE ac.admin_id = $1 ORDER BY ac.updated_at DESC LIMIT 100`, [maxUserId]); }
async function tenantChannelRows(maxUserId = '') { return queryIfTable('ak_tenant_channels', `SELECT tc.tenant_id, tc.channel_id, tc.channel_title AS title, tc.status, tc.metadata AS raw, tc.updated_at, tc.connected_at, COALESCE(pc.posts_count, 0)::int AS "postsCount", 'ak_tenant_channels' AS source FROM ak_tenant_users tu JOIN ak_tenant_channels tc ON tc.tenant_id = tu.tenant_id LEFT JOIN (SELECT admin_id, channel_id, COUNT(*)::int AS posts_count FROM ak_posts WHERE admin_id = $1 GROUP BY admin_id, channel_id) pc ON pc.channel_id = tc.channel_id WHERE tu.max_user_id = $1 AND COALESCE(tu.status, 'active') = 'active' ORDER BY tc.updated_at DESC LIMIT 100`, [maxUserId]); }
async function ownedTenantChannelRows(maxUserId = '') { return queryIfTable('ak_tenants', `SELECT tc.tenant_id, tc.channel_id, tc.channel_title AS title, tc.status, tc.metadata AS raw, tc.updated_at, tc.connected_at, COALESCE(pc.posts_count, 0)::int AS "postsCount", 'ak_tenant_owner_channels' AS source FROM ak_tenants t JOIN ak_tenant_channels tc ON tc.tenant_id = t.tenant_id LEFT JOIN (SELECT admin_id, channel_id, COUNT(*)::int AS posts_count FROM ak_posts WHERE admin_id = $1 GROUP BY admin_id, channel_id) pc ON pc.channel_id = tc.channel_id WHERE t.owner_max_user_id = $1 AND COALESCE(t.status, 'active') = 'active' ORDER BY tc.updated_at DESC LIMIT 100`, [maxUserId]); }
async function pushChatRows(maxUserId = '') { return queryIfTable('adminkit_web_push_chat_bindings', `SELECT chat_id, channel_id, chat_title AS title, status, updated_at, created_at, 'push_chat_binding' AS source FROM adminkit_web_push_chat_bindings WHERE max_user_id = $1 AND COALESCE(status, 'active') = 'active' ORDER BY updated_at DESC LIMIT 100`, [maxUserId]); }
async function buildUserRow(maxUserId = '') {
  const userId = clean(maxUserId);
  const sources = await Promise.all([adminChannelRows(userId), tenantChannelRows(userId), ownedTenantChannelRows(userId), pushChatRows(userId)]);
  const errors = sources.filter((item) => !item.ok).map((item) => item.error).filter(Boolean);
  const missingTables = ['ak_admin_channels', 'ak_tenant_channels', 'ak_tenants', 'adminkit_web_push_chat_bindings'].filter((_, index) => sources[index].missing);
  const rawRecords = sources.flatMap((item) => item.rows || []);
  const safeRecords = dedupe(rawRecords);
  const channels = safeRecords.filter((item) => item.kind === 'channel');
  const chats = safeRecords.filter((item) => item.kind === 'chat');
  const unknown = safeRecords.filter((item) => item.kind === 'unknown');
  const blocks = [];
  if (!userId) blocks.push('max_user_id_missing');
  if (!db.hasDatabaseUrl()) blocks.push('postgres_not_configured');
  if (errors.length) blocks.push('postgres_query_failed');
  if (unknown.length) blocks.push('needs_api_resolution');
  return { maxUserIdMasked: mask(userId), ok: blocks.length === 0, channels, chats, unknown, counts: { sourceRecords: rawRecords.length, channels: channels.length, chats: chats.length, unknown: unknown.length, missingTables: missingTables.length }, missingTables, errors, blocks };
}
async function buildMatrix({ users = null } = {}) {
  const ids = uniq(Array.isArray(users) && users.length ? users : targetUsers());
  const rows = [];
  for (const id of ids) rows.push(await buildUserRow(id));
  const blockCount = rows.reduce((sum, row) => sum + (row.blocks || []).length, 0);
  return { ok: blockCount === 0, generatedAt: new Date().toISOString(), runtime: RUNTIME, checkedUsers: rows.map((row) => row.maxUserIdMasked), rows, summary: { checkedUsersCount: rows.length, channelsCount: rows.reduce((sum, row) => sum + row.counts.channels, 0), chatsCount: rows.reduce((sum, row) => sum + row.counts.chats, 0), unknownCount: rows.reduce((sum, row) => sum + row.counts.unknown, 0), blockCount } };
}
async function exportMatrix() { return runtimeExport.exportJson({ path: DEFAULT_PATH, payload: () => buildMatrix(), message: 'live user postgres bindings matrix' }); }

module.exports = { RUNTIME, DEFAULT_PATH, DEFAULT_TARGET_MAX_USER_IDS, buildMatrix, buildUserRow, exportMatrix, classifyRecord, classifyRecordDetails, safeBindingRecord, targetUsers };