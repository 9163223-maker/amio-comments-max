'use strict';

const store = require('../store');

const RUNTIME = 'CC8.1.5-GIFT-CONDITIONS-GATEKEEPER';

function clean(value) {
  return String(value || '').trim();
}

function findPendingGiftClaim(userId = '') {
  const uid = clean(userId);
  if (!uid) return null;
  const claims = Object.values(store.store?.gifts?.claims || {})
    .filter((claim) => clean(claim.userId) === uid)
    .filter((claim) => clean(claim.status) === 'condition_input_required')
    .filter((claim) => clean(claim.pendingInputType || 'promoCode'));
  claims.sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
  return claims[0] || null;
}

module.exports = {
  RUNTIME,
  findPendingGiftClaim
};
