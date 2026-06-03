'use strict';

const crypto = require('crypto');
const storeModule = require('../store');
const tariffs = require('./tariffConfig');
const repository = require('./clientAccessRepository');

const RUNTIME = 'CC8.3.46-PR106-ACCOUNT-ACCESS-RUNTIME';
const ADMIN_ACCESS_RUNTIME = 'CC8.3.47-PR108-ADMIN-ACTIVATION-CODES';
const ACCESS_NAMESPACE = repository.ACCESS_NAMESPACE;

function clean(value) { return String(value || '').trim(); }
function nowMs() { return Date.now(); }
function addDays(days) { return new Date(nowMs() + Math.max(0, Number(days || 0)) * 86400000).toISOString(); }
function normalizeCode(code = '') { return clean(code).toUpperCase().replace(/\s+/g, ''); }
function randomCodePart() { return crypto.randomBytes(2).toString('hex').toUpperCase(); }
function generateActivationCode() { return `AK-${randomCodePart()}-${randomCodePart()}-${randomCodePart()}`; }
function hashActivationCode(code = '') { return repository.codeHash(normalizeCode(code)); }
function maskActivationCode(codeOrHash = '') { const value = normalizeCode(codeOrHash); if (!value) return 'AK-****'; if (/^AK-/.test(value)) return `${value.slice(0, 7)}-****-${value.slice(-4)}`; return `AK-${value.slice(0, 4)}…${value.slice(-4)}`.toUpperCase(); }
function isPast(value) { const t = Date.parse(value || ''); return Number.isFinite(t) && t <= nowMs(); }

function adminIds() {
  return [process.env.ADMINKIT_ADMIN_MAX_USER_IDS, process.env.DEBUG_ADMIN_ID, process.env.ADMIN_ID]
    .join(',')
    .split(/[\s,;]+/)
    .map(clean)
    .filter(Boolean);
}
function isAdmin(maxUserId) {
  const id = clean(maxUserId);
  if (!id) return false;
  if (String(process.env.ADMINKIT_ACCESS_ADMIN_BYPASS || '1') === '0') return false;
  return adminIds().includes(id);
}
function statusLabel(status = '') {
  const map = { active: 'активен', expired: 'истёк', no_access: 'нет доступа', admin: 'админ' };
  return map[clean(status)] || clean(status || 'нет доступа');
}

function getClientByMaxUserId(maxUserId) { return repository.getClient(maxUserId); }

function createClientProfile({ maxUserId, name = '', planId = 'free', status = 'no_access', expiresAt = '', maxChannels, tenantId = '' } = {}) {
  const id = clean(maxUserId);
  if (!id) return null;
  const existing = repository.getClient(id) || {};
  const plan = tariffs.getTariff(planId || existing.planId || 'free');
  const tenant = tenantId ? repository.getTenant(tenantId) : repository.getTenantByUserId(id);
  const profile = {
    ...existing,
    maxUserId: id,
    tenantId: clean(tenantId || tenant?.tenantId || existing.tenantId || ''),
    name: clean(name || existing.name),
    planId: clean(plan.id || planId || existing.planId || 'free'),
    status: clean(status || existing.status || 'no_access'),
    expiresAt: expiresAt || existing.expiresAt || '',
    maxChannels: Number(maxChannels || existing.maxChannels || plan.maxChannels || 1),
    channels: Array.isArray(existing.channels) ? existing.channels : [],
    featureOverrides: existing.featureOverrides || {},
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  return repository.saveClient(profile);
}

function upsertActivationCode(input = {}) {
  const code = normalizeCode(input.code);
  if (!code) return null;
  const hash = repository.codeHash(code);
  const existing = repository.getActivationCodeByHash(hash) || {};
  const planId = clean(input.planId || existing.planId || 'start').toLowerCase();
  const item = {
    ...existing,
    codeHash: hash,
    codeHashPrefix: hash.slice(0, 12),
    planId,
    durationDays: Number(input.durationDays || existing.durationDays || 30),
    maxChannels: Number(input.maxChannels || existing.maxChannels || tariffs.getPlanLimits(planId).maxChannels || 1),
    expiresAt: input.expiresAt || existing.expiresAt || addDays(30),
    usedAt: input.usedAt === undefined ? (existing.usedAt || '') : input.usedAt,
    usedByMaxUserId: input.usedByMaxUserId === undefined ? (existing.usedByMaxUserId || '') : clean(input.usedByMaxUserId),
    tenantId: input.tenantId === undefined ? (existing.tenantId || '') : clean(input.tenantId),
    boundChannelId: input.boundChannelId === undefined ? (existing.boundChannelId || '') : clean(input.boundChannelId),
    singleUse: input.singleUse === undefined ? (existing.singleUse === undefined ? true : Boolean(existing.singleUse)) : Boolean(input.singleUse),
    status: clean(input.status || existing.status || 'active'),
    metadata: { ...(existing.metadata || {}), codeHashPrefix: hash.slice(0, 12) },
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  repository.saveActivationCode(item);
  repository.recordEvent({ tenantId: item.tenantId || '', eventType: 'code_created', payload: { codeHashPrefix: item.codeHashPrefix, planId: item.planId, boundChannelId: Boolean(item.boundChannelId) } });
  return { ...item, code: undefined };
}
function getActivationCode(code = '') {
  const item = repository.getActivationCodeByHash(repository.codeHash(normalizeCode(code)));
  return item ? { ...item, code: undefined } : null;
}


function createActivationCode({ planId = 'start', durationDays = 30, maxChannels, expiresAt = '', singleUse = true, boundChannelId = '', createdByMaxUserId = '', note = '' } = {}) {
  const plan = tariffs.getTariff(planId || 'start');
  const days = Math.max(1, Number(durationDays || 30));
  const limit = Math.max(1, Number(maxChannels || plan.maxChannels || 1));
  let code = '';
  let hash = '';
  for (let i = 0; i < 20; i += 1) {
    code = generateActivationCode();
    hash = hashActivationCode(code);
    if (!repository.getActivationCodeByHash(hash)) break;
    code = '';
  }
  if (!code) throw new Error('activation_code_collision');
  const item = {
    codeHash: hash,
    codeHashPrefix: hash.slice(0, 12),
    planId: plan.id,
    durationDays: days,
    maxChannels: limit,
    expiresAt: expiresAt || addDays(days),
    usedAt: '',
    usedByMaxUserId: '',
    tenantId: '',
    boundChannelId: clean(boundChannelId),
    singleUse: singleUse !== false,
    status: 'active',
    metadata: { codeHashPrefix: hash.slice(0, 12), createdByMaxUserId: clean(createdByMaxUserId), note: clean(note), safeCodeLabel: maskActivationCode(hash) },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  repository.saveActivationCode(item);
  repository.recordEvent({ tenantId: '', maxUserId: createdByMaxUserId, eventType: 'code_created', payload: { codeHashPrefix: item.codeHashPrefix, planId: item.planId, durationDays: item.durationDays, maxChannels: item.maxChannels, boundChannelId: Boolean(item.boundChannelId) } });
  return { ...repository.safeActivationCode(item), code };
}
function listActivationCodes(options = {}) { return repository.listActivationCodes(options); }
function getActivationCodeInfo(options = {}) { return repository.getActivationCodeInfo(options); }
function revokeActivationCode(options = {}) { return repository.revokeActivationCode(options); }
function listTenants(options = {}) { return repository.listTenants(options); }
function getTenantInfo(options = {}) { return repository.getTenantInfo(options); }
function listTenantChannels(tenantId = '') { return repository.listTenantChannels(tenantId).map((channel) => ({ tenantId: channel.tenantId, channelId: channel.channelId, channelTitle: channel.channelTitle, status: channel.status, connectedAt: channel.connectedAt, boundByCode: channel.boundByCode ? maskActivationCode(channel.boundByCode) : '' })); }
function listAccessEvents(options = {}) { return repository.listAccessEvents(options); }

function getAccessState(maxUserId) {
  const id = clean(maxUserId);
  if (!id) return { status: 'no_access', active: false, admin: false, profile: null, tenant: null, tenantId: '', planId: 'free', friendlyStatus: statusLabel('no_access'), runtimeVersion: RUNTIME, ...repository.publicInfo() };
  if (isAdmin(id)) {
    const plan = tariffs.getTariff('business');
    return { status: 'active', active: true, admin: true, profile: repository.getClient(id), tenant: repository.getTenantByUserId(id), tenantId: repository.getTenantByUserId(id)?.tenantId || '', planId: 'business', tariff: plan, expiresAt: '', maxChannels: plan.maxChannels, friendlyStatus: statusLabel('admin'), runtimeVersion: RUNTIME, ...repository.publicInfo() };
  }
  const tenant = repository.getTenantByUserId(id);
  const profile = repository.getClient(id);
  const accessSource = tenant || profile;
  if (!accessSource) return { status: 'no_access', active: false, admin: false, profile: null, tenant: null, tenantId: '', planId: 'free', tariff: tariffs.getTariff('free'), friendlyStatus: statusLabel('no_access'), runtimeVersion: RUNTIME, ...repository.publicInfo() };
  let status = clean(accessSource.status || 'no_access');
  if (status === 'active' && accessSource.expiresAt && isPast(accessSource.expiresAt)) {
    status = 'expired';
    repository.recordEvent({ tenantId: tenant?.tenantId || profile?.tenantId || '', maxUserId: id, eventType: 'access_expired', payload: { expiresAt: accessSource.expiresAt } });
  }
  const plan = tariffs.getTariff(accessSource.planId || 'free');
  return { status, active: status === 'active', admin: false, profile, tenant, tenantId: tenant?.tenantId || profile?.tenantId || '', planId: plan.id, tariff: plan, expiresAt: accessSource.expiresAt || '', maxChannels: Number(accessSource.maxChannels || plan.maxChannels || 1), friendlyStatus: statusLabel(status), runtimeVersion: RUNTIME, ...repository.publicInfo() };
}
function isAccessActive(maxUserId) { return getAccessState(maxUserId).active; }

function activateCode({ maxUserId, code, name = '' } = {}) {
  const userId = clean(maxUserId);
  const normalized = normalizeCode(code);
  const hash = repository.codeHash(normalized);
  if (!userId) return { ok: false, error: 'missing_user', message: 'Не удалось определить пользователя. Откройте /start ещё раз.' };
  if (!normalized) return { ok: false, error: 'missing_code', message: 'Отправьте код доступа одним сообщением.' };
  const item = repository.getActivationCodeByHash(hash);
  if (!item) { repository.recordEvent({ maxUserId: userId, eventType: 'code_used_failed', payload: { reason: 'code_not_found' } }); return { ok: false, error: 'code_not_found', message: 'Код не найден. Проверьте написание или обратитесь в поддержку.' }; }
  if (clean(item.status) === 'revoked') { repository.recordEvent({ tenantId: item.tenantId || '', maxUserId: userId, eventType: 'code_used_failed', payload: { reason: 'code_revoked', codeHashPrefix: item.codeHashPrefix } }); return { ok: false, error: 'code_revoked', message: 'Код отозван. Обратитесь в поддержку.' }; }
  if (clean(item.status) === 'used' || (item.singleUse && item.usedAt)) { repository.recordEvent({ tenantId: item.tenantId || '', maxUserId: userId, eventType: 'code_used_failed', payload: { reason: 'code_used', codeHashPrefix: item.codeHashPrefix } }); return { ok: false, error: 'code_used', message: 'Этот код уже использован.' }; }
  if (clean(item.status) === 'expired' || isPast(item.expiresAt)) {
    item.status = 'expired'; item.updatedAt = new Date().toISOString(); repository.saveActivationCode(item);
    repository.recordEvent({ tenantId: item.tenantId || '', maxUserId: userId, eventType: 'code_used_failed', payload: { reason: 'code_expired', codeHashPrefix: item.codeHashPrefix } });
    return { ok: false, error: 'code_expired', message: 'Срок действия кода истёк. Обратитесь в поддержку для продления.' };
  }
  const plan = tariffs.getTariff(item.planId || 'start');
  const existingTenant = repository.getTenantByUserId(userId);
  const tenant = repository.upsertTenantForUser({ maxUserId: userId, name, planId: plan.id, status: 'active', expiresAt: addDays(item.durationDays), maxChannels: item.maxChannels || plan.maxChannels, source: existingTenant ? 'activation_code_extend' : 'activation_code' });
  const profile = createClientProfile({ maxUserId: userId, name, tenantId: tenant.tenantId, planId: plan.id, status: 'active', expiresAt: tenant.expiresAt, maxChannels: tenant.maxChannels });
  let channelBind = null;
  if (item.boundChannelId) {
    channelBind = repository.bindTenantChannel({ tenantId: tenant.tenantId, channelId: item.boundChannelId, channelTitle: 'Канал из кода доступа', boundByCode: item.codeHashPrefix, maxChannels: tenant.maxChannels });
    if (!channelBind.ok) return { ok: false, error: channelBind.error, message: channelBind.message };
  }
  item.usedAt = new Date().toISOString();
  item.usedByMaxUserId = userId;
  item.tenantId = tenant.tenantId;
  if (item.singleUse) item.status = 'used';
  item.updatedAt = new Date().toISOString();
  repository.saveActivationCode(item);
  repository.recordEvent({ tenantId: tenant.tenantId, maxUserId: userId, eventType: 'code_activated', payload: { codeHashPrefix: item.codeHashPrefix, planId: item.planId, durationDays: item.durationDays, boundChannelId: Boolean(item.boundChannelId) } });
  return { ok: true, message: 'Доступ активирован', profile, tenant, channelBind, activationCode: { codeHashPrefix: item.codeHashPrefix, planId: item.planId, durationDays: item.durationDays, boundChannelId: item.boundChannelId || '' } };
}

function getPlanLimits(planId) { return tariffs.getPlanLimits(planId); }
function canUseFeature(maxUserId, featureKey) {
  const key = clean(featureKey);
  const state = getAccessState(maxUserId);
  if (state.admin) return { ok: true, allowed: true, reason: 'admin_bypass', message: '', state, featureKey: key };
  if (!state.active) return { ok: true, allowed: false, reason: state.status === 'expired' ? 'access_expired' : 'access_required', message: state.status === 'expired' ? 'Доступ истёк. Продлите доступ в личном кабинете.' : 'Для работы с функцией активируйте доступ.', state, featureKey: key };
  const plan = tariffs.getTariff(state.planId);
  const allowed = Boolean(plan.features?.[key]);
  return { ok: true, allowed, reason: allowed ? 'allowed' : 'feature_not_in_plan', message: allowed ? '' : 'Доступно на другом тарифе или скоро будет доступно.', state, featureKey: key, planId: plan.id };
}

function getClientChannels(maxUserId) {
  const state = getAccessState(maxUserId);
  const tenantChannels = state.tenantId ? repository.listTenantChannels(state.tenantId).map((channel) => ({ channelId: channel.channelId, title: channel.channelTitle, ...channel })) : [];
  const profile = repository.getClient(maxUserId);
  const own = Array.isArray(profile?.channels) ? profile.channels : [];
  const linked = [];
  try { for (const channel of storeModule.getChannelsList()) if (clean(channel.linkedByUserId) === clean(maxUserId) || clean(channel.ownerUserId) === clean(maxUserId)) linked.push(channel); } catch {}
  const byId = new Map();
  [...tenantChannels, ...own, ...linked].forEach((channel) => { const id = clean(channel.channelId || channel.id); if (id) byId.set(id, { ...channel, channelId: id }); });
  return [...byId.values()];
}
function listAdminVisibleChannels(maxUserId = '') {
  if (!isAdmin(maxUserId)) return getClientChannels(maxUserId);
  try {
    const channelService = require('./channelService');
    return channelService.listChannels();
  } catch { return []; }
}
function bindTenantChannel(options = {}) { return repository.bindTenantChannel(options); }
function getTenantByMaxUserId(maxUserId) { return repository.getTenantByUserId(maxUserId); }
function getTenantUsers(tenantId) { return repository.getTenantUsers(tenantId); }
function getAccessEvents(tenantId) { return repository.getAccessEvents(tenantId); }
function info() { return { runtimeVersion: RUNTIME, adminAccessRuntimeVersion: ADMIN_ACCESS_RUNTIME, ...repository.publicInfo() }; }
function sanitizedSnapshot() { return repository.sanitizedSnapshot(); }
function bootstrap() { return repository.bootstrap(); }

function setPendingActivation(maxUserId, value = true) { const id = clean(maxUserId); if (!id) return false; const pending = repository.pendingActivation(); pending[id] = value ? new Date().toISOString() : ''; if (!value) delete pending[id]; repository.persist(); return true; }
function hasPendingActivation(maxUserId) { return Boolean(repository.pendingActivation()[clean(maxUserId)]); }
function clearPendingActivation(maxUserId) { return setPendingActivation(maxUserId, false); }
function _resetForTests() { repository.resetForTests(); }

module.exports = { RUNTIME, ADMIN_ACCESS_RUNTIME, ACCESS_NAMESPACE, generateActivationCode, hashActivationCode, maskActivationCode, getClientByMaxUserId, createClientProfile, getAccessState, createActivationCode, listActivationCodes, getActivationCodeInfo, revokeActivationCode, listTenants, getTenantInfo, listTenantChannels, listAccessEvents, activateCode, isAccessActive, isAdmin, getPlanLimits, canUseFeature, getClientChannels, listAdminVisibleChannels, upsertActivationCode, getActivationCode, bindTenantChannel, getTenantByMaxUserId, getTenantUsers, getAccessEvents, setPendingActivation, hasPendingActivation, clearPendingActivation, statusLabel, info, sanitizedSnapshot, bootstrap, _resetForTests };
