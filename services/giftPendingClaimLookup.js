'use strict';

const store = require('../store');
const giftService = require('./giftService');

const RUNTIME = 'CC8.1.5-GIFT-CONDITIONS-GATEKEEPER';

function clean(value) {
  return String(value || '').trim();
}

function getCampaignForClaim(claim = {}) {
  return store.getGiftCampaign(clean(claim.campaignId));
}

function hasPendingInputType(claim = {}) {
  return clean(claim.pendingInputType) === 'promoCode';
}

function campaignRuntimeMatches(campaign = {}, config = {}) {
  const current = clean(config.runtimeId || config.botId || config.botUserId);
  const saved = clean(campaign.runtimeId || campaign.botId || campaign.botUserId);
  if (!saved) return true;
  return Boolean(current && current === saved);
}

function listPendingGiftClaims(userId = '', config = {}) {
  const uid = clean(userId);
  if (!uid) return [];
  const claims = Object.values(store.store?.gifts?.claims || {})
    .filter((claim) => clean(claim.userId) === uid)
    .filter((claim) => clean(claim.status) === 'condition_input_required')
    .filter(hasPendingInputType)
    .filter((claim) => {
      const campaign = getCampaignForClaim(claim);
      if (!campaign || campaign.enabled === false) return false;
      return campaignRuntimeMatches(campaign, config);
    });
  claims.sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
  return claims;
}

function findPendingGiftClaim(userId = '', config = {}) {
  const claims = listPendingGiftClaims(userId, config);
  return claims.length === 1 ? claims[0] : null;
}

async function processPendingGiftClaimInput({ config = {}, userId = '', userName = '', input = '' } = {}) {
  const pendingClaims = listPendingGiftClaims(userId, config);
  if (pendingClaims.length > 1) {
    return { handled: true, ambiguous: true, pendingCount: pendingClaims.length, status: 'pending_claim_ambiguous' };
  }
  if (pendingClaims.length !== 1) {
    return { handled: false, pendingCount: pendingClaims.length };
  }
  const pending = pendingClaims[0];
  if (!pending?.campaignId) return { handled: false };
  const campaign = getCampaignForClaim(pending);
  if (!campaign || campaign.enabled === false || !campaignRuntimeMatches(campaign, config)) {
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
  campaignRuntimeMatches,
  listPendingGiftClaims,
  findPendingGiftClaim,
  processPendingGiftClaimInput
};