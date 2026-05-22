'use strict';

const store = require('./store');
const RUNTIME = 'CC8.1.0-CLEAN-GIFTS-BUTTONS-TENANT-FOUNDATION';
const TENANT_KEYS = new Set(['tenantKey', 'ownerUserId', 'tenantInitializedAt', 'tenantRuntimeVersion', 'canReadLegacyUnscoped', 'updatedAt']);

function clean(value) { return String(value || '').trim(); }
function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
function idPart(value) { return clean(value).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80); }
function defaultTenantKey(userId = '') {
  const envKey = clean(process.env.ADMINKIT_TENANT_KEY || process.env.TENANT_KEY || '');
  if (envKey) return envKey;
  const uid = idPart(userId);
  return uid ? `tenant_${uid}` : 'tenant_empty';
}
function hadLegacyUserState(current = {}) {
  if (!current || typeof current !== 'object') return false;
  return Object.keys(current).some((key) => !TENANT_KEYS.has(key));
}
function ensureTenantContext(userId = '', patch = {}) {
  const uid = clean(userId);
  const current = uid ? (safe(() => store.getSetupState(uid), null) || {}) : {};
  const tenantKey = clean(patch.tenantKey || current.tenantKey || defaultTenantKey(uid));
  const ownerUserId = clean(patch.ownerUserId || current.ownerUserId || uid);
  const canReadLegacyUnscoped = Boolean(
    patch.canReadLegacyUnscoped ||
    current.canReadLegacyUnscoped ||
    (!current.tenantInitializedAt && hadLegacyUserState(current))
  );
  const ctx = { tenantKey, ownerUserId, userId: uid, createdByUserId: clean(patch.createdByUserId || uid), updatedByUserId: clean(patch.updatedByUserId || uid), canReadLegacyUnscoped };
  const needsWrite = Boolean(uid && (
    clean(current.tenantKey) !== tenantKey ||
    clean(current.ownerUserId) !== ownerUserId ||
    Boolean(current.canReadLegacyUnscoped) !== canReadLegacyUnscoped ||
    !current.tenantInitializedAt ||
    clean(current.tenantRuntimeVersion) !== RUNTIME
  ));
  if (needsWrite) safe(() => store.setSetupState(uid, { tenantKey, ownerUserId, canReadLegacyUnscoped, tenantInitializedAt: current.tenantInitializedAt || Date.now(), tenantRuntimeVersion: RUNTIME }), null);
  return ctx;
}
function stampRecord(record = {}, ctx = {}, existing = null) {
  const source = record && typeof record === 'object' ? record : {};
  const prev = existing && typeof existing === 'object' ? existing : {};
  return { ...source, tenantKey: clean(source.tenantKey || prev.tenantKey || ctx.tenantKey || defaultTenantKey(ctx.userId)), ownerUserId: clean(source.ownerUserId || prev.ownerUserId || ctx.ownerUserId || ctx.userId), createdByUserId: clean(source.createdByUserId || prev.createdByUserId || ctx.createdByUserId || ctx.userId), updatedByUserId: clean(ctx.updatedByUserId || ctx.userId || source.updatedByUserId || prev.updatedByUserId), createdAt: Number(source.createdAt || prev.createdAt || Date.now()) || Date.now(), updatedAt: Date.now() };
}
function canReadUnscopedLegacy(ctx = {}) {
  if (ctx.canReadLegacyUnscoped === true) return true;
  if (clean(process.env.ADMINKIT_ALLOW_UNSCOPED_LEGACY) === '1') return true;
  const legacyOwner = clean(process.env.ADMINKIT_LEGACY_OWNER_USER_ID || process.env.ADMIN_USER_ID || '');
  return Boolean(legacyOwner && legacyOwner === clean(ctx.ownerUserId || ctx.userId));
}
function recordOwnerCandidates(record = {}) {
  return [
    record.ownerUserId,
    record.linkedByUserId,
    record.createdByUserId,
    record.updatedByUserId,
    record.userId
  ].map(clean).filter(Boolean);
}
function belongsToTenant(record = {}, ctx = {}) {
  if (!record || typeof record !== 'object') return false;
  const tenantKey = clean(record.tenantKey);
  if (tenantKey) return tenantKey === clean(ctx.tenantKey);
  const ctxOwners = [ctx.ownerUserId, ctx.userId].map(clean).filter(Boolean);
  const recordOwners = recordOwnerCandidates(record);
  if (recordOwners.length) return ctxOwners.some((owner) => recordOwners.includes(owner));
  return canReadUnscopedLegacy(ctx);
}
function filterTenantRecords(records = [], ctx = {}) { return (Array.isArray(records) ? records : []).filter((item) => belongsToTenant(item, ctx)); }
function patchStoredGiftCampaign(campaign = {}, ctx = {}) {
  const id = clean(campaign.id || campaign.campaignId);
  if (!id) return campaign;
  if (!store.store.gifts) store.store.gifts = { campaigns: {}, claims: {}, settings: {} };
  if (!store.store.gifts.campaigns) store.store.gifts.campaigns = {};
  const stamped = stampRecord({ ...(store.store.gifts.campaigns[id] || {}), ...campaign }, ctx, store.store.gifts.campaigns[id]);
  store.store.gifts.campaigns[id] = stamped;
  safe(() => store.saveStore(store.store), null);
  return stamped;
}
function listTenantGiftCampaigns(ctx = {}) { return filterTenantRecords(safe(() => store.listGiftCampaigns(), []) || [], ctx); }
function findTenantGiftCampaignForPost(target = {}, ctx = {}) {
  const channelId = clean(target.channelId), postId = clean(target.postId), commentKey = clean(target.commentKey);
  return listTenantGiftCampaigns(ctx).find((campaign) => {
    if (!campaign || campaign.enabled === false) return false;
    if (commentKey && clean(campaign.commentKey) === commentKey) return true;
    const postIds = Array.isArray(campaign.postIds) ? campaign.postIds.map(clean) : [];
    const channelIds = [campaign.channelId, campaign.requiredChatId].map(clean).filter(Boolean);
    return Boolean(postId && postIds.includes(postId) && (!channelId || !channelIds.length || channelIds.includes(channelId)));
  }) || null;
}
module.exports = { clean, ensureTenantContext, defaultTenantKey, stampRecord, canReadUnscopedLegacy, belongsToTenant, filterTenantRecords, patchStoredGiftCampaign, listTenantGiftCampaigns, findTenantGiftCampaignForPost };
