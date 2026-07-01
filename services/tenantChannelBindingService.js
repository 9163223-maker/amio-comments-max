'use strict';

const store = require('../store');
const access = require('./clientAccessService');
const repository = require('./clientAccessRepository');
const runtimeExport = require('./runtimeExportService');
const picker = require('../channel-post-picker-core');

const RUNTIME = 'PR263-TENANT-CHANNEL-BINDING-CONTRACT-1.0';
const DEFAULT_PATH = 'runtime/tenant-channel-binding-matrix.json';
const diagnostics = [];

function clean(value) { return String(value || '').trim(); }
function nowIso() { return new Date().toISOString(); }
function arr(value) { return Array.isArray(value) ? value : []; }
function mask(value = '') { const id = clean(value); return id.length <= 6 ? '***' : `${id.slice(0, 3)}…${id.slice(-3)}`; }
function isChatLikeRecord(raw = {}) { return picker.isChatLikeRecord(raw) || /\b(?:chat|group|supergroup|private|direct|dialog|im)\b/i.test(clean(raw.type || raw.chatType || raw.kind || raw.sourceType)); }
function channelRecord(channelId = {}) { const id = typeof channelId === 'object' ? clean(channelId.channelId || channelId.id || channelId.chatId) : clean(channelId); return arr(store.getChannelsList()).find((ch) => clean(ch.channelId || ch.id || ch.chatId) === id) || {}; }
function recordDiagnostic(code, payload = {}) { const item = { code: clean(code), at: nowIso(), ...payload }; diagnostics.push(item); if (diagnostics.length > 200) diagnostics.shift(); return item; }
function getDiagnostics() { return diagnostics.slice(); }
function clearDiagnostics() { diagnostics.length = 0; }

function ensureTenantForUser({ maxUserId, name = '', source = 'tenant_channel_binding' } = {}) {
  const userId = clean(maxUserId);
  if (!userId) return { ok: false, reason: 'missing_initiating_user' };
  let tenant = access.getTenantByMaxUserId(userId);
  if (tenant) return { ok: true, tenant };
  const state = access.getAccessState(userId);
  const trustedActiveState = state && state.active === true && Boolean(state.tenant || state.tenantId || state.profile);
  if (!(state.admin === true || trustedActiveState)) {
    return { ok: false, reason: 'access_required_for_tenant_binding' };
  }
  tenant = repository.upsertTenantForUser({ maxUserId: userId, name, source, maxChannels: Number(state.maxChannels || 1) || 1, planId: state.planId || 'free', expiresAt: state.expiresAt || '' });
  return tenant ? { ok: true, tenant } : { ok: false, reason: 'tenant_upsert_failed' };
}

function bindChannelForInitiator({ maxUserId, channelId, channelTitle = '', source = 'unknown', botAdminProof = null, postEvidence = null, metadata = {} } = {}) {
  const userId = clean(maxUserId), cid = clean(channelId);
  if (!userId) return { ok: false, reason: 'missing_initiating_user' };
  if (!cid) return { ok: false, reason: 'missing_channel' };
  const stored = channelRecord(cid);
  const candidate = { ...stored, ...(metadata.channelRecord || {}), channelId: cid, title: channelTitle || stored.title || stored.channelTitle, type: metadata.type || stored.type || stored.chatType || stored.sourceType };
  if (isChatLikeRecord(candidate)) return { ok: false, reason: 'chat_like_record' };
  const tenantResult = ensureTenantForUser({ maxUserId: userId, name: metadata.name || '', source });
  if (!tenantResult.ok) return tenantResult;
  const tenant = tenantResult.tenant;
  const existing = repository.findChannelOwner(cid);
  if (existing && clean(existing.tenantId) !== clean(tenant.tenantId)) return { ok: false, reason: 'channel_owned_by_another_tenant', error: 'channel_owned_by_another_tenant', ownerTenantId: existing.tenantId };
  const previousMetadata = existing && typeof existing.metadata === 'object' ? existing.metadata : {};
  const at = nowIso();
  const mergedMetadata = { ...previousMetadata, ...metadata, source: clean(source), botAdminProof: botAdminProof || previousMetadata.botAdminProof || null, postEvidence: postEvidence || previousMetadata.postEvidence || null, firstSeenAt: previousMetadata.firstSeenAt || at, lastSeenAt: at, lastVerifiedAt: at };
  const result = access.bindTenantChannel({ tenantId: tenant.tenantId, channelId: cid, channelTitle: clean(channelTitle || stored.channelTitle || stored.title || cid), maxChannels: Number(tenant.maxChannels || 999) || 999, metadata: mergedMetadata });
  if (!result.ok) return { ...result, reason: result.error || result.reason || 'bind_failed' };
  store.saveChannel(cid, { ...stored, channelId: cid, title: channelTitle || stored.title || stored.channelTitle || cid, channelTitle: channelTitle || stored.channelTitle || stored.title || cid, isChannel: true, type: 'channel', linkedByUserId: userId, botAdminProof: botAdminProof || stored.botAdminProof || null });
  return { ok: true, tenant, channel: result.channel, idempotent: Boolean(existing) };
}

function markChannelBotAdminState({ channelId, botIsAdmin, source = 'unknown', metadata = {} } = {}) {
  const cid = clean(channelId);
  if (!cid) return { ok: false, reason: 'missing_channel' };
  const existing = repository.findChannelOwner(cid);
  const at = nowIso();
  const stored = channelRecord(cid);
  store.saveChannel(cid, { ...stored, channelId: cid, botIsAdmin: botIsAdmin === true, botAdminStateSource: source, botAdminLastVerifiedAt: at, ...(metadata.channelTitle ? { title: metadata.channelTitle, channelTitle: metadata.channelTitle } : {}) });
  if (!existing) return { ok: true, bound: false };
  const item = { ...existing, status: botIsAdmin === false ? 'suspended' : 'active', metadata: { ...(existing.metadata || {}), ...metadata, source, botIsAdmin: botIsAdmin === true, lastVerifiedAt: at, suspendedAt: botIsAdmin === false ? at : existing.metadata?.suspendedAt || '' }, updatedAt: at };
  repository.saveTenantChannel(item);
  return { ok: true, bound: true, channel: item };
}

async function buildTenantChannelBindingMatrix({ maxUserId = '' } = {}) {
  const checkedUsers = clean(maxUserId) ? [clean(maxUserId)] : Array.from(new Set([...Object.values(repository.ns().tenantUsers || {}).map((u) => clean(u.maxUserId)), ...Object.values(repository.ns().tenants || {}).map((t) => clean(t.ownerMaxUserId)), ...arr(store.getPostsList()).map((p) => clean(p.linkedByUserId || p.ownerUserId))].filter(Boolean)));
  const rows = [];
  const violations = [];
  const warnings = [];
  for (const userId of checkedUsers) {
    const tenant = access.getTenantByMaxUserId(userId);
    const tenantChannels = tenant ? repository.listTenantChannels(tenant.tenantId) : [];
    const visiblePicker = await picker.listUiChannelsForUser(userId, {});
    const storeLinked = arr(store.getChannelsList()).filter((ch) => clean(ch.linkedByUserId || ch.ownerUserId) === userId && !isChatLikeRecord(ch));
    const postEvidence = arr(store.getPostsList()).filter((p) => clean(p.linkedByUserId || p.ownerUserId) === userId && clean(p.channelId));
    const visibleIds = new Set(visiblePicker.map((c) => clean(c.channelId)));
    const boundIds = new Set(tenantChannels.map((c) => clean(c.channelId)));
    const inactiveIds = new Set(Object.values(repository.ns().tenantChannels || {}).filter((ch) => clean(ch.status || 'active') !== 'active').map((ch) => clean(ch.channelId)));
    const evidenceIds = new Set([...storeLinked.map((c) => clean(c.channelId)), ...postEvidence.map((p) => clean(p.channelId))].filter((id) => clean(id) && !inactiveIds.has(clean(id))));
    const missingBindings = [...evidenceIds].filter((id) => tenant && !boundIds.has(id) && !visibleIds.has(id));
    missingBindings.forEach((id) => violations.push({ code: 'post_evidence_channel_missing_binding', userId, channelIdMasked: mask(id) }));
    const chatRecordsExcluded = arr(store.getChannelsList()).filter((ch) => isChatLikeRecord(ch));
    tenantChannels.filter((ch) => isChatLikeRecord(ch)).forEach((ch) => violations.push({ code: 'chat_like_record_active_in_tenant_channels', userId, channelIdMasked: mask(ch.channelId) }));
    postEvidence.forEach((p) => { if (inactiveIds.has(clean(p.channelId))) return; if (tenant && !picker.listUiPostsForChannel(userId, p.channelId).length && !boundIds.has(clean(p.channelId))) violations.push({ code: 'post_hidden_by_missing_binding', userId, channelIdMasked: mask(p.channelId) }); });
    getDiagnostics().filter((d) => d.code === 'missing_initiating_user_for_channel_bind').forEach((d) => warnings.push(d));
    rows.push({ maxUserId: userId, knownTenant: Boolean(tenant), tenantIdMasked: mask(tenant?.tenantId || ''), tenantChannelsCount: tenantChannels.length, visiblePickerChannelsCount: visiblePicker.length, dbTenantChannelsCount: tenantChannels.length, storeLinkedChannelsCount: storeLinked.length, postEvidenceChannelsCount: postEvidence.length, missingBindings, conflictingBindings: [], inactiveBotAdminBindings: tenant ? Object.values(repository.ns().tenantChannels).filter((ch) => clean(ch.tenantId) === clean(tenant.tenantId) && clean(ch.status) !== 'active').map((ch) => clean(ch.channelId)) : [], chatRecordsExcluded: chatRecordsExcluded.length, botAdminProofMissing: tenantChannels.filter((ch) => !ch.metadata?.botAdminProof).map((ch) => clean(ch.channelId)) });
  }
  return { ok: violations.length === 0, generatedAt: nowIso(), runtime: RUNTIME, checkedUsers, rows, knownTenant: rows.some((r) => r.knownTenant), tenantIdMasked: rows[0]?.tenantIdMasked || '', tenantChannelsCount: rows.reduce((n, r) => n + r.tenantChannelsCount, 0), visiblePickerChannelsCount: rows.reduce((n, r) => n + r.visiblePickerChannelsCount, 0), dbTenantChannelsCount: rows.reduce((n, r) => n + r.dbTenantChannelsCount, 0), storeLinkedChannelsCount: rows.reduce((n, r) => n + r.storeLinkedChannelsCount, 0), postEvidenceChannelsCount: rows.reduce((n, r) => n + r.postEvidenceChannelsCount, 0), missingBindings: rows.flatMap((r) => r.missingBindings), conflictingBindings: [], inactiveBotAdminBindings: rows.flatMap((r) => r.inactiveBotAdminBindings), chatRecordsExcluded: rows.reduce((n, r) => n + r.chatRecordsExcluded, 0), botAdminProofMissing: rows.flatMap((r) => r.botAdminProofMissing), violations, warnings, summary: { blockCount: violations.length, warnCount: warnings.length, missingBindingsCount: rows.reduce((n, r) => n + r.missingBindings.length, 0), visibleChannelsCount: rows.reduce((n, r) => n + r.visiblePickerChannelsCount, 0), chatExcludedCount: rows.reduce((n, r) => n + r.chatRecordsExcluded, 0) } };
}

async function exportMatrix() { return runtimeExport.exportJson({ path: DEFAULT_PATH, payload: () => buildTenantChannelBindingMatrix(), message: 'tenant channel binding matrix' }); }

module.exports = { RUNTIME, DEFAULT_PATH, bindChannelForInitiator, ensureTenantForUser, markChannelBotAdminState, buildTenantChannelBindingMatrix, exportMatrix, recordDiagnostic, getDiagnostics, clearDiagnostics, isChatLikeRecord };
