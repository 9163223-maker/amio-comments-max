'use strict';

const store = require('../store');
const db = require('../src/db/postgres');
const access = require('./clientAccessService');
const repository = require('./clientAccessRepository');
const picker = require('../channel-post-picker-core');
const runtimeExport = require('./runtimeExportService');
const menu = require('../v3-menu-core-1539');

const RUNTIME = 'PR273-LIVE-TENANT-SELF-DIAGNOSTIC-CLEAN-CORE-1.0';
const DEFAULT_PATH = 'runtime/live-tenant-self-diagnostic-matrix.json';
const DEFAULT_LIVE_MAX_USER_IDS = Object.freeze(['17507246']);

function clean(v) { return String(v || '').trim(); }
function mask(v = '') { const s = clean(v); return !s ? '—' : (s.length <= 6 ? '***' : `${s.slice(0, 3)}…${s.slice(-3)}`); }
function unique(values = []) { return [...new Set(values.map(clean).filter(Boolean))]; }
function title(ch = {}, i = 0) { return clean(ch.channelTitle || ch.title || ch.name || ch.channelId) || `Канал ${i + 1}`; }
function chatLike(ch = {}) { return picker.isChatLikeRecord(ch) || /(?:chat|group|private|dialog|supergroup|чат|группа)/i.test(clean(ch.type || ch.chatType || ch.kind || ch.title)); }
function safeChannel(ch = {}, i = 0) { return { channelIdMasked: mask(ch.channelId || ch.id || ch.chatId), title: title(ch, i), status: clean(ch.status || 'active') }; }
function postsFor(channelId = '') { try { return picker.listUiPostsForChannel('', channelId); } catch { return []; } }
function watchedUsers() { const configured = unique([process.env.ADMINKIT_LIVE_BINDINGS_MAX_USER_IDS, process.env.ADMINKIT_TENANT_DIAGNOSTIC_MAX_USER_IDS, process.env.ADMINKIT_DIAGNOSTIC_MAX_USER_IDS].join(',').split(/[\s,;]+/)); return configured.length ? configured : DEFAULT_LIVE_MAX_USER_IDS.slice(); }
function knownUsers() {
  const n = repository.ns();
  return unique([...Object.values(n.tenantUsers || {}).map((x) => x.maxUserId), ...Object.values(n.tenants || {}).map((x) => x.ownerMaxUserId), ...Object.values(n.clients || {}).map((x) => x.maxUserId), ...store.getPostsList().map((x) => x.linkedByUserId || x.ownerUserId), ...store.getChannelsList().map((x) => x.linkedByUserId || x.ownerUserId)]).slice(0, 50);
}

async function tableExists(name) { try { const r = await db.query('SELECT to_regclass($1) AS name', [clean(name)]); return Boolean(r.rows?.[0]?.name); } catch { return false; } }
async function columnExists(tableName, columnName) { try { const r = await db.query('SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2 LIMIT 1', [clean(tableName), clean(columnName)]); return Boolean(r.rows?.[0]); } catch { return false; } }
async function columns(tableName, names = []) { const pairs = await Promise.all(names.map(async (name) => [name, await columnExists(tableName, name)])); return Object.fromEntries(pairs); }
function orderByUpdated(c = {}) { return c.updated_at ? ' ORDER BY updated_at DESC NULLS LAST' : ''; }
function activeWhere(c = {}, alias = '') { const p = alias ? `${alias}.` : ''; return c.status ? ` AND COALESCE(${p}status,'active')='active'` : ''; }
async function dbUserIdForMaxUserId(maxUserId = '') {
  const id = clean(maxUserId);
  if (!id || !db.hasDatabaseUrl() || !(await tableExists('ak_users'))) return id;
  const c = await columns('ak_users', ['user_id', 'max_user_id', 'status', 'updated_at']);
  if (!c.user_id || !c.max_user_id) return id;
  const r = await db.query(`SELECT user_id FROM ak_users WHERE max_user_id=$1${activeWhere(c)}${orderByUpdated(c)} LIMIT 1`, [id]);
  return clean(r.rows?.[0]?.user_id) || id;
}
async function tenantIdFromAkTenantUsers(maxUserId = '') {
  const id = clean(maxUserId);
  if (!id || !(await tableExists('ak_tenant_users'))) return '';
  const c = await columns('ak_tenant_users', ['tenant_id', 'max_user_id', 'status', 'updated_at']);
  if (!c.tenant_id || !c.max_user_id) return '';
  const r = await db.query(`SELECT tenant_id FROM ak_tenant_users WHERE max_user_id=$1 AND COALESCE(tenant_id,'')<>''${activeWhere(c)}${orderByUpdated(c)} LIMIT 1`, [id]);
  return clean(r.rows?.[0]?.tenant_id);
}
async function tenantIdFromAkUsers(maxUserId = '') {
  const id = clean(maxUserId);
  if (!id || !(await tableExists('ak_users'))) return '';
  const c = await columns('ak_users', ['tenant_id', 'max_user_id', 'status', 'updated_at']);
  if (!c.tenant_id || !c.max_user_id) return '';
  const r = await db.query(`SELECT tenant_id FROM ak_users WHERE max_user_id=$1 AND COALESCE(tenant_id,'')<>''${activeWhere(c)}${orderByUpdated(c)} LIMIT 1`, [id]);
  return clean(r.rows?.[0]?.tenant_id);
}
async function tenantIdFromAkTenants(maxUserId = '') {
  const id = clean(maxUserId);
  if (!id || !(await tableExists('ak_tenants'))) return '';
  const c = await columns('ak_tenants', ['tenant_id', 'owner_max_user_id', 'owner_user_id', 'status', 'updated_at']);
  if (c.tenant_id && c.owner_max_user_id) {
    const r = await db.query(`SELECT tenant_id FROM ak_tenants WHERE owner_max_user_id=$1 AND COALESCE(tenant_id,'')<>''${activeWhere(c)}${orderByUpdated(c)} LIMIT 1`, [id]);
    if (clean(r.rows?.[0]?.tenant_id)) return clean(r.rows[0].tenant_id);
  }
  if (c.tenant_id && c.owner_user_id) {
    const ownerUserId = await dbUserIdForMaxUserId(id);
    const r = await db.query(`SELECT tenant_id FROM ak_tenants WHERE owner_user_id=$1 AND COALESCE(tenant_id,'')<>''${activeWhere(c)}${orderByUpdated(c)} LIMIT 1`, [ownerUserId]);
    if (clean(r.rows?.[0]?.tenant_id)) return clean(r.rows[0].tenant_id);
  }
  return '';
}
async function dbTenantRow(tenantId = '', maxUserId = '') {
  const tid = clean(tenantId);
  const fallback = { tenantId: tid, ownerMaxUserId: clean(maxUserId), status: 'active', planId: 'business', maxChannels: 100, metadata: { source: 'db_tenant_snapshot_fallback' } };
  if (!tid || !(await tableExists('ak_tenants'))) return tid ? fallback : null;
  const c = await columns('ak_tenants', ['tenant_id', 'owner_max_user_id', 'owner_user_id', 'status', 'plan_id', 'max_channels', 'metadata', 'settings_json', 'created_at', 'updated_at']);
  if (!c.tenant_id) return fallback;
  const select = ['tenant_id'];
  ['owner_max_user_id', 'owner_user_id', 'status', 'plan_id', 'max_channels', 'metadata', 'settings_json', 'created_at', 'updated_at'].forEach((col) => { if (c[col]) select.push(col); });
  const r = await db.query(`SELECT ${select.join(',')} FROM ak_tenants WHERE tenant_id=$1 LIMIT 1`, [tid]);
  const row = r.rows?.[0] || {};
  return {
    tenantId: clean(row.tenant_id || tid),
    ownerMaxUserId: clean(row.owner_max_user_id || maxUserId),
    ownerUserId: clean(row.owner_user_id || ''),
    status: clean(row.status || 'active'),
    planId: clean(row.plan_id || 'business'),
    maxChannels: Number(row.max_channels || 100),
    metadata: row.metadata || row.settings_json || {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ''
  };
}
async function dbTenantChannels(tenantId = '') {
  const tid = clean(tenantId);
  if (!tid || !(await tableExists('ak_tenant_channels'))) return [];
  const c = await columns('ak_tenant_channels', ['tenant_id', 'channel_id', 'channel_title', 'status', 'metadata', 'connected_at', 'updated_at']);
  if (!c.tenant_id || !c.channel_id) return [];
  const select = ['tenant_id', 'channel_id'];
  ['channel_title', 'status', 'metadata', 'connected_at', 'updated_at'].forEach((col) => { if (c[col]) select.push(col); });
  const r = await db.query(`SELECT ${select.join(',')} FROM ak_tenant_channels WHERE tenant_id=$1${activeWhere(c)}${orderByUpdated(c)} LIMIT 100`, [tid]);
  return (r.rows || []).map((row) => ({ tenantId: clean(row.tenant_id || tid), channelId: clean(row.channel_id), channelTitle: clean(row.channel_title || ''), status: clean(row.status || 'active'), metadata: row.metadata || {}, connectedAt: row.connected_at ? new Date(row.connected_at).toISOString() : '', updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '' })).filter((row) => row.channelId);
}
async function dbTenantSnapshot(maxUserId = '') {
  const id = clean(maxUserId);
  if (!id || !db.hasDatabaseUrl()) return null;
  const tenantId = await tenantIdFromAkTenantUsers(id) || await tenantIdFromAkUsers(id) || await tenantIdFromAkTenants(id);
  if (!tenantId) return null;
  const tenant = await dbTenantRow(tenantId, id);
  const tenantChannels = await dbTenantChannels(tenantId);
  return { tenant, tenantChannels, source: 'postgres_clean_core_lookup' };
}

async function buildSelfDiagnostic({ maxUserId = '', label = 'self' } = {}) {
  const userId = clean(maxUserId);
  const state = access.getAccessState(userId);
  const dbSnapshot = await dbTenantSnapshot(userId);
  const tenant = access.getTenantByMaxUserId(userId) || dbSnapshot?.tenant || null;
  const tenantId = clean(tenant?.tenantId || state.tenantId || dbSnapshot?.tenant?.tenantId || '');
  const repositoryTenantChannels = tenantId ? repository.listTenantChannels(tenantId) : [];
  const tenantChannels = repositoryTenantChannels.length ? repositoryTenantChannels : (dbSnapshot?.tenantChannels || []);
  const clientChannels = userId ? access.getClientChannels(userId) : [];
  const pickerChannels = userId ? await picker.listUiChannelsForUser(userId, {}) : [];
  const storeChannels = store.getChannelsList();
  const storeLinked = storeChannels.filter((ch) => clean(ch.linkedByUserId || ch.ownerUserId) === userId && !chatLike(ch));
  const chatsExcluded = storeChannels.filter(chatLike).length;
  const postEvidence = store.getPostsList().filter((p) => clean(p.linkedByUserId || p.ownerUserId) === userId && clean(p.channelId));
  const tenantIds = new Set(tenantChannels.map((ch) => clean(ch.channelId)));
  const clientIds = new Set(clientChannels.map((ch) => clean(ch.channelId || ch.id)));
  const pickerIds = new Set(pickerChannels.map((ch) => clean(ch.channelId || ch.id)));
  const evidenceIds = unique([...storeLinked.map((ch) => ch.channelId), ...postEvidence.map((p) => p.channelId)]);
  const missingBindings = evidenceIds.filter((id) => tenantId && !tenantIds.has(id) && !clientIds.has(id) && !pickerIds.has(id));
  const hiddenFromPicker = evidenceIds.filter((id) => id && (tenantIds.has(id) || clientIds.has(id)) && !pickerIds.has(id));
  const extraHiddenFromPicker = [...new Set([...tenantIds, ...clientIds])].filter((id) => id && !pickerIds.has(id) && !evidenceIds.includes(id));
  const violations = [];
  const warnings = [];
  if (!userId) violations.push({ code: 'max_user_id_missing' });
  if (!tenant && !(state.active || state.admin)) violations.push({ code: 'tenant_missing_for_live_user' });
  if (!tenant && (state.active || state.admin)) violations.push({ code: 'tenant_missing_for_active_user' });
  if (missingBindings.length) violations.push({ code: 'evidence_missing_tenant_binding', channelIdMasked: missingBindings.map(mask) });
  if (hiddenFromPicker.length) violations.push({ code: 'evidence_channel_hidden_from_picker', channelIdMasked: hiddenFromPicker.map(mask) });
  if (extraHiddenFromPicker.length) warnings.push({ code: 'non_evidence_channel_hidden_from_picker', channelIdMasked: extraHiddenFromPicker.map(mask) });
  if (tenant && !pickerChannels.length) warnings.push({ code: 'tenant_has_zero_picker_channels' });
  const botAdminProofMissing = tenantChannels.filter((ch) => !ch.metadata?.botAdminProof).map(safeChannel);
  if (botAdminProofMissing.length) warnings.push({ code: 'bot_admin_proof_missing', count: botAdminProofMissing.length });
  const summary = { knownTenant: Boolean(tenant), active: state.active === true || state.admin === true, admin: state.admin === true, tenantChannelsCount: tenantChannels.length, clientChannelsCount: clientChannels.length, pickerChannelsCount: pickerChannels.length, storeLinkedChannelsCount: storeLinked.length, postEvidenceChannelsCount: unique(postEvidence.map((p) => p.channelId)).length, chatExcludedCount: chatsExcluded, missingBindingsCount: missingBindings.length, hiddenFromPickerCount: hiddenFromPicker.length, blockCount: violations.length, warnCount: warnings.length };
  const channels = pickerChannels.map((ch, i) => ({ ...safeChannel(ch, i), postsCount: postsFor(ch.channelId || ch.id).length }));
  return { ok: !violations.length, runtime: RUNTIME, generatedAt: new Date().toISOString(), label, maxUserIdMasked: mask(userId), tenantIdMasked: mask(tenantId), state: { status: state.status, active: state.active === true, admin: state.admin === true, planId: state.planId || tenant?.planId || 'free', friendlyStatus: state.friendlyStatus || state.status || 'нет доступа' }, channels: { tenant: tenantChannels.map(safeChannel), client: clientChannels.map(safeChannel), picker: channels, storeLinked: storeLinked.map(safeChannel) }, postEvidence: postEvidence.slice(0, 20).map((p) => ({ channelIdMasked: mask(p.channelId), postIdMasked: mask(p.postId), title: clean(p.title || p.originalText).slice(0, 80) })), missingBindings: missingBindings.map(mask), hiddenFromPicker: hiddenFromPicker.map(mask), chatRecordsExcluded: chatsExcluded, botAdminProofMissing, violations, warnings, summary, verdict: violations.length ? 'BLOCK' : (warnings.length ? 'WARN' : 'PASS') };
}

function screenLines(d = {}) {
  const s = d.summary || {};
  const out = ['🧭 Диагностика привязки', '', `Ваш MAX ID: ${d.maxUserIdMasked || '—'}`, `Tenant: ${s.knownTenant ? 'найден' : 'не найден'} (${d.tenantIdMasked || '—'})`, `Доступ: ${d.state?.friendlyStatus || d.state?.status || '—'}`, '', `Каналы tenant: ${s.tenantChannelsCount || 0}`, `Каналы в доступе: ${s.clientChannelsCount || 0}`, `Каналы в picker: ${s.pickerChannelsCount || 0}`, `Посты-свидетельства: ${s.postEvidenceChannelsCount || 0}`, `Чаты исключены: ${s.chatExcludedCount || 0}`, '', `Итог: ${d.verdict || '—'}`];
  if ((d.channels?.picker || []).length) { out.push('', 'В picker сейчас:'); d.channels.picker.slice(0, 8).forEach((ch, i) => out.push(`${i + 1}. ${ch.title} — ${ch.postsCount || 0} пост(ов)`)); }
  const problems = (d.violations || []).length ? d.violations : (d.warnings || []);
  if (problems.length) { out.push('', (d.violations || []).length ? 'Что мешает:' : 'Предупреждения:'); problems.slice(0, 6).forEach((x) => out.push(`• ${x.code}`)); } else out.push('', 'Серверная связка для этого пользователя выглядит рабочей.');
  out.push('', 'ID показаны сокращённо. Проверяется текущий пользователь, без hardcode.');
  return out;
}
async function buildScreen({ maxUserId = '' } = {}) { const d = await buildSelfDiagnostic({ maxUserId, label: 'live_self' }); return { id: 'account_tenant_diagnostic', text: screenLines(d).join('\n'), attachments: menu.keyboard([[menu.button('Обновить диагностику', 'account_tenant_diagnostic')], [menu.button('Мои каналы', 'account_channels')], [menu.button('Подключить канал', 'admin_section_channels')], [menu.button('Главное меню', 'admin_section_main')]]) }; }
function buildScreenSync(maxUserId = '') { return { id: 'account_tenant_diagnostic', text: ['🧭 Диагностика привязки', '', `Ваш MAX ID: ${mask(maxUserId)}`, 'Нажмите «Обновить диагностику», чтобы получить live-проверку по текущему пользователю.'].join('\n'), attachments: menu.keyboard([[menu.button('Обновить диагностику', 'account_tenant_diagnostic')], [menu.button('Мои каналы', 'account_channels')], [menu.button('Главное меню', 'admin_section_main')]]) }; }
async function buildMatrix({ users = null } = {}) { const ids = unique(Array.isArray(users) && users.length ? users : watchedUsers()); const checked = ids.length ? ids : knownUsers(); const rows = []; for (const id of checked) rows.push(await buildSelfDiagnostic({ maxUserId: id, label: 'watch' })); const blockCount = rows.reduce((n, r) => n + (r.summary?.blockCount || 0), 0); const warnCount = rows.reduce((n, r) => n + (r.summary?.warnCount || 0), 0); return { ok: blockCount === 0, generatedAt: new Date().toISOString(), runtime: RUNTIME, configuredUsers: ids.map(mask), checkedUsers: checked.map(mask), rows, summary: { checkedCount: rows.length, blockCount, warnCount, missingTenantCount: rows.filter((r) => !r.summary?.knownTenant).length, zeroPickerChannelsCount: rows.filter((r) => r.summary?.pickerChannelsCount === 0).length } }; }
async function exportMatrix() { return runtimeExport.exportJson({ path: DEFAULT_PATH, payload: () => buildMatrix(), message: 'live tenant self diagnostic matrix' }); }

module.exports = { RUNTIME, DEFAULT_PATH, DEFAULT_LIVE_MAX_USER_IDS, buildSelfDiagnostic, buildScreen, buildScreenSync, buildMatrix, exportMatrix, mask, watchedUsers, knownUsers, dbTenantSnapshot, dbUserIdForMaxUserId };
