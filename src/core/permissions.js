'use strict';

const users = require('./users');
const tariffs = require('./tariffs');

const RUNTIME = 'CC8.0.0-CLEAN-CONTROLLED-BASE';

function clean(value) {
  return String(value || '').trim();
}

async function getCurrentUserFromMaxProfile(profile = {}) {
  return users.ensureUserFromMaxProfile(profile);
}

async function getAccessContext(profileOrUser = {}) {
  const user = profileOrUser.userId
    ? profileOrUser
    : await getCurrentUserFromMaxProfile(profileOrUser);
  const tariffSummary = await tariffs.getUserTariffSummary(user);
  return {
    runtimeVersion: RUNTIME,
    user,
    tenantId: user?.tenantId || '',
    ownerUserId: user?.userId || '',
    tariffCode: user?.tariffCode || tariffs.DEFAULT_TARIFF,
    tariff: tariffSummary?.tariff || null,
    referralCode: user?.referralCode || ''
  };
}

async function canUse(profileOrUser, featureCode) {
  const feature = clean(featureCode);
  if (!feature) return { ok: false, allowed: false, reason: 'feature_code_missing' };
  const user = profileOrUser?.userId ? profileOrUser : await getCurrentUserFromMaxProfile(profileOrUser || {});
  return tariffs.canUseFeature(user, feature);
}

async function assertCanUse(profileOrUser, featureCode) {
  const result = await canUse(profileOrUser, featureCode);
  if (!result.allowed) {
    const error = new Error(result.reason || 'feature_access_denied');
    error.code = 'FEATURE_ACCESS_DENIED';
    error.details = result;
    throw error;
  }
  return result;
}

function featureDeniedText({ featureCode, tariffCode, requiredTariff = '' } = {}) {
  const feature = clean(featureCode) || 'feature';
  const tariff = clean(tariffCode) || 'free';
  const required = clean(requiredTariff);
  return required
    ? `Feature ${feature} is not available on ${tariff}. Required tariff: ${required}.`
    : `Feature ${feature} is not available on current tariff ${tariff}.`;
}

module.exports = {
  RUNTIME,
  getCurrentUserFromMaxProfile,
  getAccessContext,
  canUse,
  assertCanUse,
  featureDeniedText
};
