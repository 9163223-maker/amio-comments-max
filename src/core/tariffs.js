'use strict';

const db = require('../db/postgres');
const users = require('./users');

const RUNTIME = 'CC8.0.0-CLEAN-CONTROLLED-BASE';
const DEFAULT_TARIFF = 'free';

function clean(value) {
  return String(value || '').trim();
}

function asBoolean(value) {
  if (typeof value === 'boolean') return value;
  const text = clean(value).toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(text);
}

async function getTariff(tariffCode = DEFAULT_TARIFF) {
  const code = clean(tariffCode || DEFAULT_TARIFF);
  const { rows } = await db.query(
    `select tariff_code as "tariffCode",
            name,
            price_amount as "priceAmount",
            currency,
            billing_period as "billingPeriod",
            limits_json as "limits",
            features_json as "features",
            is_active as "isActive",
            sort_order as "sortOrder",
            created_at as "createdAt",
            updated_at as "updatedAt"
       from ak_tariffs
      where tariff_code=$1`,
    [code]
  );
  return rows[0] || null;
}

async function listTariffs() {
  const { rows } = await db.query(
    `select tariff_code as "tariffCode",
            name,
            price_amount as "priceAmount",
            currency,
            billing_period as "billingPeriod",
            limits_json as "limits",
            features_json as "features",
            is_active as "isActive",
            sort_order as "sortOrder",
            created_at as "createdAt",
            updated_at as "updatedAt"
       from ak_tariffs
      where is_active=true
      order by sort_order asc, tariff_code asc`
  );
  return rows;
}

async function getFeatureAccess(tariffCode, featureCode) {
  const tariff = clean(tariffCode || DEFAULT_TARIFF);
  const feature = clean(featureCode);
  if (!feature) return { enabled: false, limitValue: null, source: 'missing_feature_code' };
  const { rows } = await db.query(
    `select tariff_code as "tariffCode",
            feature_code as "featureCode",
            enabled,
            limit_value as "limitValue",
            meta_json as "meta"
       from ak_feature_access
      where tariff_code=$1 and feature_code=$2`,
    [tariff, feature]
  );
  if (rows[0]) return { ...rows[0], source: 'ak_feature_access' };

  const tariffRow = await getTariff(tariff);
  const featureValue = tariffRow?.features?.[feature];
  const limitValue = tariffRow?.limits?.[feature];
  if (featureValue !== undefined) {
    return { tariffCode: tariff, featureCode: feature, enabled: asBoolean(featureValue), limitValue: null, meta: {}, source: 'ak_tariffs.features_json' };
  }
  if (limitValue !== undefined) {
    return { tariffCode: tariff, featureCode: feature, enabled: true, limitValue: Number(limitValue), meta: {}, source: 'ak_tariffs.limits_json' };
  }
  return { tariffCode: tariff, featureCode: feature, enabled: false, limitValue: null, meta: {}, source: 'default_deny' };
}

async function canUseFeature(userOrUserId, featureCode) {
  const user = typeof userOrUserId === 'object'
    ? userOrUserId
    : await users.getUserById(userOrUserId);
  if (!user) return { ok: false, allowed: false, reason: 'user_not_found', featureCode: clean(featureCode) };
  if (user.status && user.status !== 'active') return { ok: true, allowed: false, reason: 'user_not_active', user, featureCode: clean(featureCode) };
  const access = await getFeatureAccess(user.tariffCode || DEFAULT_TARIFF, featureCode);
  return {
    ok: true,
    allowed: Boolean(access.enabled),
    reason: access.enabled ? 'allowed' : 'feature_not_available_on_tariff',
    user,
    tariffCode: user.tariffCode || DEFAULT_TARIFF,
    featureCode: clean(featureCode),
    limitValue: access.limitValue,
    access
  };
}

async function assertFeatureAccess(userOrUserId, featureCode) {
  const result = await canUseFeature(userOrUserId, featureCode);
  if (!result.allowed) {
    const error = new Error(result.reason || 'feature_access_denied');
    error.code = 'FEATURE_ACCESS_DENIED';
    error.details = result;
    throw error;
  }
  return result;
}

async function getUserTariffSummary(userOrUserId) {
  const user = typeof userOrUserId === 'object'
    ? userOrUserId
    : await users.getUserById(userOrUserId);
  if (!user) return null;
  const tariff = await getTariff(user.tariffCode || DEFAULT_TARIFF);
  return {
    userId: user.userId,
    tenantId: user.tenantId,
    tariffCode: user.tariffCode || DEFAULT_TARIFF,
    tariff,
    referralCode: user.referralCode,
    status: user.status
  };
}

module.exports = {
  RUNTIME,
  DEFAULT_TARIFF,
  getTariff,
  listTariffs,
  getFeatureAccess,
  canUseFeature,
  assertFeatureAccess,
  getUserTariffSummary
};
