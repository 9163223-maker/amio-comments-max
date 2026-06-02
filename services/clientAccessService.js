'use strict';

const storeModule = require('../store');
const tariffs = require('./tariffConfig');

const RUNTIME = 'CC8.3.46-PR106-ACCOUNT-ACCESS-RUNTIME';
const ACCESS_NAMESPACE = 'clientAccess';

function clean(value) { return String(value || '').trim(); }
function nowMs() { return Date.now(); }
function iso(value) { const d = value ? new Date(value) : new Date(); return Number.isNaN(d.getTime()) ? '' : d.toISOString(); }
function addDays(days) { return new Date(nowMs() + Math.max(0, Number(days || 0)) * 86400000).toISOString(); }
function normalizeCode(code = '') { return clean(code).toUpperCase().replace(/\s+/g, ''); }

function namespace() {
  const root = storeModule.store;
  if (!root[ACCESS_NAMESPACE] || typeof root[ACCESS_NAMESPACE] !== 'object') root[ACCESS_NAMESPACE] = {};
  const ns = root[ACCESS_NAMESPACE];
  if (!ns.clients || typeof ns.clients !== 'object') ns.clients = {};
  if (!ns.activationCodes || typeof ns.activationCodes !== 'object') ns.activationCodes = {};
  if (!ns.channelsByUser || typeof ns.channelsByUser !== 'object') ns.channelsByUser = {};
  if (!ns.pendingActivation || typeof ns.pendingActivation !== 'object') ns.pendingActivation = {};
  return ns;
}

function persist() { storeModule.saveStore(storeModule.store); }

function adminIds() {
  return String(process.env.ADMINKIT_ADMIN_MAX_USER_IDS || process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || '17507246')
    .split(/[\s,;]+/).map(clean).filter(Boolean);
}

function isAdmin(maxUserId) {
  const id = clean(maxUserId);
  if (!id) return false;
  if (String(process.env.ADMINKIT_ACCESS_ADMIN_BYPASS || '1') === '0') return false;
  return adminIds().includes(id);
}

function getClientByMaxUserId(maxUserId) {
  const id = clean(maxUserId);
  if (!id) return null;
  return namespace().clients[id] || null;
}

function createClientProfile({ maxUserId, name = '', planId = 'free', status = 'no_access', expiresAt = '', maxChannels } = {}) {
  const id = clean(maxUserId);
  if (!id) return null;
  const ns = namespace();
  const existing = ns.clients[id] || {};
  const plan = tariffs.getTariff(planId || existing.planId || 'free');
  const profile = {
    ...existing,
    maxUserId: id,
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
  ns.clients[id] = profile;
  persist();
  return profile;
}

function upsertActivationCode(input = {}) {
  const code = normalizeCode(input.code);
  if (!code) return null;
  const ns = namespace();
  const existing = ns.activationCodes[code] || {};
  const item = {
    ...existing,
    code,
    planId: clean(input.planId || existing.planId || 'start').toLowerCase(),
    durationDays: Number(input.durationDays || existing.durationDays || 30),
    maxChannels: Number(input.maxChannels || existing.maxChannels || tariffs.getPlanLimits(input.planId || existing.planId || 'start').maxChannels || 1),
    expiresAt: input.expiresAt || existing.expiresAt || addDays(30),
    usedAt: input.usedAt === undefined ? (existing.usedAt || '') : input.usedAt,
    usedByMaxUserId: input.usedByMaxUserId === undefined ? (existing.usedByMaxUserId || '') : clean(input.usedByMaxUserId),
    boundChannelId: input.boundChannelId === undefined ? (existing.boundChannelId || '') : clean(input.boundChannelId),
    singleUse: input.singleUse === undefined ? (existing.singleUse === undefined ? true : Boolean(existing.singleUse)) : Boolean(input.singleUse),
    status: clean(input.status || existing.status || 'active'),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  ns.activationCodes[code] = item;
  persist();
  return item;
}

function getActivationCode(code = '') { return namespace().activationCodes[normalizeCode(code)] || null; }
function isPast(value) { const t = Date.parse(value || ''); return Number.isFinite(t) && t <= nowMs(); }

function statusLabel(status = '') {
  const map = { active: 'активен', expired: 'истёк', no_access: 'нет доступа', admin: 'админ' };
  return map[clean(status)] || clean(status || 'нет доступа');
}

function getAccessState(maxUserId) {
  const id = clean(maxUserId);
  if (!id) return { status: 'no_access', active: false, admin: false, profile: null, planId: 'free', friendlyStatus: statusLabel('no_access'), runtimeVersion: RUNTIME };
  if (isAdmin(id)) {
    const plan = tariffs.getTariff('business');
    return { status: 'active', active: true, admin: true, profile: getClientByMaxUserId(id), planId: 'business', tariff: plan, expiresAt: '', maxChannels: plan.maxChannels, friendlyStatus: statusLabel('admin'), runtimeVersion: RUNTIME };
  }
  const profile = getClientByMaxUserId(id);
  if (!profile) return { status: 'no_access', active: false, admin: false, profile: null, planId: 'free', tariff: tariffs.getTariff('free'), friendlyStatus: statusLabel('no_access'), runtimeVersion: RUNTIME };
  let status = clean(profile.status || 'no_access');
  if (status === 'active' && profile.expiresAt && isPast(profile.expiresAt)) status = 'expired';
  const plan = tariffs.getTariff(profile.planId || 'free');
  return { status, active: status === 'active', admin: false, profile, planId: plan.id, tariff: plan, expiresAt: profile.expiresAt || '', maxChannels: Number(profile.maxChannels || plan.maxChannels || 1), friendlyStatus: statusLabel(status), runtimeVersion: RUNTIME };
}

function isAccessActive(maxUserId) { return getAccessState(maxUserId).active; }

function activateCode({ maxUserId, code, name = '' } = {}) {
  const userId = clean(maxUserId);
  const normalized = normalizeCode(code);
  if (!userId) return { ok: false, error: 'missing_user', message: 'Не удалось определить пользователя. Откройте /start ещё раз.' };
  if (!normalized) return { ok: false, error: 'missing_code', message: 'Отправьте код доступа одним сообщением.' };
  const ns = namespace();
  const item = ns.activationCodes[normalized];
  if (!item) return { ok: false, error: 'code_not_found', message: 'Код не найден. Проверьте написание или обратитесь в поддержку.' };
  if (clean(item.status) === 'revoked') return { ok: false, error: 'code_revoked', message: 'Код отозван. Обратитесь в поддержку.' };
  if (clean(item.status) === 'used' || (item.singleUse && item.usedAt)) return { ok: false, error: 'code_used', message: 'Этот код уже использован.' };
  if (clean(item.status) === 'expired' || isPast(item.expiresAt)) {
    item.status = 'expired'; item.updatedAt = new Date().toISOString(); persist();
    return { ok: false, error: 'code_expired', message: 'Срок действия кода истёк. Обратитесь в поддержку для продления.' };
  }
  const plan = tariffs.getTariff(item.planId || 'start');
  const profile = createClientProfile({ maxUserId: userId, name, planId: plan.id, status: 'active', expiresAt: addDays(item.durationDays), maxChannels: item.maxChannels || plan.maxChannels });
  if (item.boundChannelId) {
    const current = Array.isArray(profile.channels) ? profile.channels : [];
    if (!current.some((channel) => clean(channel.channelId) === clean(item.boundChannelId))) {
      current.push({ channelId: clean(item.boundChannelId), title: 'Канал из кода доступа', boundByCode: normalized, addedAt: new Date().toISOString() });
      profile.channels = current;
    }
  }
  item.usedAt = new Date().toISOString();
  item.usedByMaxUserId = userId;
  if (item.singleUse) item.status = 'used';
  item.updatedAt = new Date().toISOString();
  ns.clients[userId] = profile;
  persist();
  return { ok: true, message: 'Доступ активирован', profile, activationCode: { code: normalized, planId: item.planId, durationDays: item.durationDays, boundChannelId: item.boundChannelId || '' } };
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
  const profile = getClientByMaxUserId(maxUserId);
  const own = Array.isArray(profile?.channels) ? profile.channels : [];
  const linked = [];
  try {
    for (const channel of storeModule.getChannelsList()) {
      if (clean(channel.linkedByUserId) === clean(maxUserId) || clean(channel.ownerUserId) === clean(maxUserId)) linked.push(channel);
    }
  } catch {}
  const byId = new Map();
  [...own, ...linked].forEach((channel) => { const id = clean(channel.channelId || channel.id); if (id) byId.set(id, { ...channel, channelId: id }); });
  return [...byId.values()];
}

function setPendingActivation(maxUserId, value = true) { const id = clean(maxUserId); if (!id) return false; namespace().pendingActivation[id] = value ? new Date().toISOString() : ''; if (!value) delete namespace().pendingActivation[id]; persist(); return true; }
function hasPendingActivation(maxUserId) { return Boolean(namespace().pendingActivation[clean(maxUserId)]); }
function clearPendingActivation(maxUserId) { return setPendingActivation(maxUserId, false); }

function _resetForTests() { const root = storeModule.store; root[ACCESS_NAMESPACE] = { clients: {}, activationCodes: {}, channelsByUser: {}, pendingActivation: {} }; persist(); }

module.exports = { RUNTIME, ACCESS_NAMESPACE, getClientByMaxUserId, createClientProfile, getAccessState, activateCode, isAccessActive, isAdmin, getPlanLimits, canUseFeature, getClientChannels, upsertActivationCode, getActivationCode, setPendingActivation, hasPendingActivation, clearPendingActivation, statusLabel, _resetForTests };
