'use strict';

const store = require('../store');
const giftService = require('./giftService');

const RUNTIME = 'CC8.1.5-GIFT-CONDITIONS-GATEKEEPER';

function clean(value) {
  return String(value || '').trim();
}

function listPendingGiftClaims(userId = '') {
  const uid = clean(userId);
  if (!uid) return [];
  const claims = Object.values(store.store?.gifts?.claims || {})
    .filter((claim) => clean(claim.userId) === uid)
    .filter((claim) => clean(claim.status) === 'condition_input_required')
    .filter((claim) => clean(claim.pendingInputType || 'promoCode'));
  claims.sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
  return claims;
}

function findPendingGiftClaim(userId = '') {
  const claims = listPendingGiftClaims(userId);
  return claims.length === 1 ? claims[0] : null;
}

async function processPendingGiftClaimInput({ config = {}, userId = '', userName = '', input = '' } = {}) {
  const pendingClaims = listPendingGiftClaims(userId);
  if (pendingClaims.length !== 1) {
    return { handled: false, ambiguous: pendingClaims.length > 1, pendingCount: pendingClaims.length };
  }
  const pending = pendingClaims[0];
  if (!pending?.campaignId) return { handled: false };
  const result = await giftService.claimGift({
    botToken: config.botToken,
    campaignId: pending.campaignId,
    userId,
    userName,
    providedCode: input
  });
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