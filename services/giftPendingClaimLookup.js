'use strict';

const store = require('../store');
const giftService = require('./giftService');
const { sendMessage } = require('./maxApi');

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

function tokenTail(value = '') {
  const token = clean(value);
  return token ? token.slice(-12) : '';
}

function currentRuntimeKeys(config = {}) {
  return [
    clean(config.runtimeId),
    clean(config.botId),
    clean(config.botUserId),
    tokenTail(config.botToken)
  ].filter(Boolean);
}

function campaignRuntimeKeys(campaign = {}) {
  return [
    clean(campaign.runtimeId),
    clean(campaign.botId),
    clean(campaign.botUserId),
    tokenTail(campaign.botToken),
    clean(campaign.botTokenTail || campaign.botTokenSuffix)
  ].filter(Boolean);
}

function campaignRuntimeMatches(campaign = {}, config = {}) {
  const saved = campaignRuntimeKeys(campaign);
  if (!saved.length) return true;
  const current = currentRuntimeKeys(config);
  if (!current.length) return false;
  return saved.some((item) => current.includes(item));
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

async function notifyAmbiguousClaims({ config = {}, userId = '' } = {}) {
  if (!config.botToken || !clean(userId)) return null;
  try {
    return await sendMessage({
      botToken: config.botToken,
      userId,
      text: 'У вас открыто несколько подарков с кодовым словом. Чтобы не выдать не тот подарок, вернитесь к нужному посту, нажмите кнопку подарка ещё раз и затем отправьте код.'
    });
  } catch {
    return null;
  }
}

async function clearAmbiguousClaims(pendingClaims = [], userId = '') {
  for (const claim of pendingClaims) {
    if (!claim?.campaignId) continue;
    store.saveGiftClaim(claim.campaignId, userId, {
      status: 'condition_input_ambiguous',
      pendingInputType: '',
      ambiguityClearedAt: Date.now()
    });
  }
}

async function processPendingGiftClaimInput({ config = {}, userId = '', userName = '', input = '' } = {}) {
  const pendingClaims = listPendingGiftClaims(userId, config);
  if (!pendingClaims.length) {
    return { handled: false, pendingCount: 0 };
  }
  if (pendingClaims.length > 1) {
    await clearAmbiguousClaims(pendingClaims, userId);
    await notifyAmbiguousClaims({ config, userId });
    return { handled: true, ambiguous: true, pendingCount: pendingClaims.length, status: 'pending_claim_ambiguous' };
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
    pendingCount: pendingClaims.length,
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