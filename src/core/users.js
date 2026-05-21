'use strict';

const crypto = require('crypto');
const db = require('../db/postgres');
const tenants = require('./tenants');

const RUNTIME = 'CC8.0.0-CLEAN-CONTROLLED-BASE';

function clean(value) {
  return String(value || '').trim();
}

function normalizeMaxUserId(value) {
  return clean(value);
}

function buildUserIdFromMax(maxUserId) {
  const normalized = normalizeMaxUserId(maxUserId);
  if (!normalized) return '';
  return `max_${normalized}`.replace(/[^a-zA-Z0-9_:-]/g, '_');
}

function buildReferralCode(userId) {
  const normalized = clean(userId);
  if (!normalized) return '';
  return crypto.createHash('sha1').update(`adminkit:${normalized}`).digest('hex').slice(0, 10);
}

function extractDisplayName(profile = {}) {
  return clean(
    profile.displayName ||
    profile.display_name ||
    profile.name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
    profile.firstName ||
    profile.username ||
    profile.maxUserId ||
    profile.max_user_id ||
    ''
  );
}

async function ensureUserFromMaxProfile(profile = {}) {
  const maxUserId = normalizeMaxUserId(profile.maxUserId || profile.max_user_id || profile.user_id || profile.id);
  if (!maxUserId) throw new Error('max_user_id_required');
  const userId = clean(profile.userId || profile.user_id_internal || buildUserIdFromMax(maxUserId));
  const tenantId = clean(profile.tenantId || profile.tenant_id || tenants.buildTenantId(userId));
  const referralCode = clean(profile.referralCode || profile.referral_code || buildReferralCode(userId));
  await tenants.ensureTenant({ ownerUserId: userId, tenantId, name: extractDisplayName(profile), settings: {} });
  await db.query(
    `insert into ak_users(user_id, tenant_id, max_user_id, display_name, username, tariff_code, referral_code, raw_json, updated_at)
     values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now())
     on conflict(user_id) do update set
       tenant_id = excluded.tenant_id,
       max_user_id = excluded.max_user_id,
       display_name = coalesce(nullif(excluded.display_name,''), ak_users.display_name),
       username = coalesce(nullif(excluded.username,''), ak_users.username),
       tariff_code = coalesce(nullif(ak_users.tariff_code,''), excluded.tariff_code),
       referral_code = coalesce(ak_users.referral_code, excluded.referral_code),
       raw_json = ak_users.raw_json || excluded.raw_json,
       updated_at = now()`,
    [
      userId,
      tenantId,
      maxUserId,
      extractDisplayName(profile),
      clean(profile.username),
      clean(profile.tariffCode || profile.tariff_code || 'free'),
      referralCode,
      JSON.stringify(profile || {})
    ]
  );
  return getUserById(userId);
}

async function getUserById(userId) {
  const id = clean(userId);
  if (!id) return null;
  const { rows } = await db.query(
    `select user_id as "userId",
            tenant_id as "tenantId",
            max_user_id as "maxUserId",
            display_name as "displayName",
            username,
            status,
            tariff_code as "tariffCode",
            referral_code as "referralCode",
            referred_by_user_id as "referredByUserId",
            trial_started_at as "trialStartedAt",
            trial_ends_at as "trialEndsAt",
            raw_json as "raw",
            created_at as "createdAt",
            updated_at as "updatedAt"
       from ak_users
      where user_id=$1`,
    [id]
  );
  return rows[0] || null;
}

async function getUserByMaxUserId(maxUserId) {
  const id = normalizeMaxUserId(maxUserId);
  if (!id) return null;
  const { rows } = await db.query(
    `select user_id as "userId",
            tenant_id as "tenantId",
            max_user_id as "maxUserId",
            display_name as "displayName",
            username,
            status,
            tariff_code as "tariffCode",
            referral_code as "referralCode",
            referred_by_user_id as "referredByUserId",
            trial_started_at as "trialStartedAt",
            trial_ends_at as "trialEndsAt",
            raw_json as "raw",
            created_at as "createdAt",
            updated_at as "updatedAt"
       from ak_users
      where max_user_id=$1`,
    [id]
  );
  return rows[0] || null;
}

async function setUserTariff(userId, tariffCode) {
  const id = clean(userId);
  const code = clean(tariffCode || 'free');
  if (!id) throw new Error('user_id_required');
  await db.query(`update ak_users set tariff_code=$2, updated_at=now() where user_id=$1`, [id, code]);
  return getUserById(id);
}

module.exports = {
  RUNTIME,
  normalizeMaxUserId,
  buildUserIdFromMax,
  buildReferralCode,
  extractDisplayName,
  ensureUserFromMaxProfile,
  getUserById,
  getUserByMaxUserId,
  setUserTariff
};
