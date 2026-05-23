'use strict';

const store = require('../store');
const giftService = require('./giftService');
const tenantScope = require('../tenant-scope');

const RUNTIME = 'CC8.1.5-GIFT-CONDITIONS-GATEKEEPER';

function clean(value) {
  return String(value || '').trim();
}

function getCampaignForClaim(claim = {}) {
  return store.getGiftCampaign(clean(claim.campaignId));
}

function listPendingGiftClaims(userId = '', tenantCtx = null) {
  const uid = clean(userId);
  if (!uid) return [];
  const ctx = tenantCtx || tenantScope.ensureTenantContext(uid);
  const claims = Object.values(store.store?.gifts?.claims || {})
    .filter((claim) => clean(claim.userId) === uid)
    .filter((claim) => clean(claim.status) === 'condition_input_required')
    .filter((claim) => clean(claim.pendingInputType || 'promoCode'))
    .filter((claim) => {
      const campaign = getCampaignForClaim(claim);
      if (!campaign || campaign.enabled === false) return false;
      return tenantScope.belongsToTenant(campaign, ctx);
    });
  claims.sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
  return claims;
}

function findPendingGiftClaim(userId = '', tenantCtx = null) {
  const claims = listPendingGiftClaims(userId, tenantCtx);
  return claims.length === 1 ? claims[0] : null;
}

async function processPendingGiftClaimInput({ config = {}, userId = '', userName = '', input = '', tenantCtx = null } = {}) {
  const ctx = tenantCtx || tenantScope.ensureTenantContext(userId);
  const pendingClaims = listPendingGiftClaims(userId, ctx);
  if (pendingClaims.length !== 1) {
    return { handled: false, ambiguous: pendingClaims.length > 1, pendingCount: pendingClaims.length };
  }
  const pending = pendingClaims[0];
  if (!pending?.campaignId) return { handled: false };
  const campaign = getCampaignForClaim(pending);
  if (!campaign || campaign.enabled === false || !tenantScope.belongsToTenant(campaign, ctx)) {
    return { handled: false, stale: true, campaignId: pending.campaignId };
  }
  const result = await giftService.claimGift({
    botToken: config.botToken,
    campaignId: pending.campaignId,
    userId,
    userName,
    providedCode: input
  });
  if (!result || result.status === 'campaign_not_found') {
    return { handled: false, stale: true, campaignId: pending.campaignId, status: result?.status || '' };
  }
  return {
    handled: true,
    runtimeVersion: RUNTIME,
    campaignId: pending.campaignId,
    status: result?.status || '',
    result
  };
}

module.exports = {
  RUNTIME,
  listPendingGiftClaims,
  findPendingGiftClaim,
  processPendingGiftClaimInput
};