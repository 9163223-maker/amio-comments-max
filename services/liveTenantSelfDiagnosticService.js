'use strict';

const store = require('../store');
const access = require('./clientAccessService');
const repository = require('./clientAccessRepository');
const picker = require('../channel-post-picker-core');
const runtimeExport = require('./runtimeExportService');
const menu = require('../v3-menu-core-1539');

const RUNTIME = 'PR265-LIVE-TENANT-SELF-DIAGNOSTIC-1.1-PR268-LIVE-USER';
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

async function buildSelfDiagnostic({ maxUserId = '', label = 'self' } = {}) {
  const userId = clean(maxUserId);
  const state = access.getAccessState(userId);
  const tenant = access.getTenantByMaxUserId(userId);
  const tenantId = clean(tenant?.tenantId || state.tenantId || '');
  const tenantChannels = tenantId ? repository.listTenantChannels(tenantId) : [];
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
  return { ok: !violations.length, runtime: RUNTIME, generatedAt: new Date().toISOString(), label, maxUserIdMasked: mask(userId), tenantIdMasked: mask(tenantId), state: { status: state.status, active: state.active === true, admin: state.admin === true, planId: state.planId || 'free', friendlyStatus: state.friendlyStatus || state.status || 'нет доступа' }, channels: { tenant: tenantChannels.map(safeChannel), client: clientChannels.map(safeChannel), picker: channels, storeLinked: storeLinked.map(safeChannel) }, postEvidence: postEvidence.slice(0, 20).map((p) => ({ channelIdMasked: mask(p.channelId), postIdMasked: mask(p.postId), title: clean(p.title || p.originalText).slice(0, 80) })), missingBindings: missingBindings.map(mask), hiddenFromPicker: hiddenFromPicker.map(mask), chatRecordsExcluded: chatsExcluded, botAdminProofMissing, violations, warnings, summary, verdict: violations.length ? 'BLOCK' : (warnings.length ? 'WARN' : 'PASS') };
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

module.exports = { RUNTIME, DEFAULT_PATH, DEFAULT_LIVE_MAX_USER_IDS, buildSelfDiagnostic, buildScreen, buildScreenSync, buildMatrix, exportMatrix, mask, watchedUsers, knownUsers };
