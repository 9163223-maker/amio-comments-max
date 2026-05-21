'use strict';

const db = require('../db/postgres');
const users = require('./users');

const RUNTIME = 'CC8.0.0-CLEAN-CONTROLLED-BASE';

function clean(value) {
  return String(value || '').trim();
}

function buildReferralStartPayload(referralCode) {
  const code = clean(referralCode);
  return code ? `ref_${code}` : '';
}

function buildReferralLink({ botUsername, maxDeepLinkBase = 'https://max.ru', referralCode } = {}) {
  const bot = clean(botUsername).replace(/^@/, '');
  const code = clean(referralCode);
  if (!bot || !code) return '';
  const base = clean(maxDeepLinkBase || 'https://max.ru').replace(/\/$/, '');
  return `${base}/${encodeURIComponent(bot)}?start=${encodeURIComponent(buildReferralStartPayload(code))}`;
}

async function registerReferral({ referralCode, referredUserId, status = 'registered', meta = {} } = {}) {
  const code = clean(referralCode).replace(/^ref_/, '');
  const referred = clean(referredUserId);
  if (!code || !referred) return null;
  const { rows } = await db.query(`select user_id as "userId" from ak_users where referral_code=$1 limit 1`, [code]);
  const referrerUserId = clean(rows[0]?.userId);
  if (!referrerUserId || referrerUserId === referred) return null;
  await db.query(
    `insert into ak_referrals(referrer_user_id, referred_user_id, referral_code, status, meta_json, activated_at)
     values($1,$2,$3,$4,$5::jsonb,case when $4 in ('activated','paid') then now() else null end)
     on conflict do nothing`,
    [referrerUserId, referred, code, clean(status || 'registered'), JSON.stringify(meta || {})]
  );
  return { referrerUserId, referredUserId: referred, referralCode: code, status: clean(status || 'registered') };
}

async function getReferralStats(userId) {
  const user = await users.getUserById(userId);
  if (!user) return null;
  const { rows } = await db.query(
    `select status, count(*)::int as count
       from ak_referrals
      where referrer_user_id=$1
      group by status`,
    [user.userId]
  );
  const byStatus = Object.fromEntries(rows.map((row) => [row.status, row.count]));
  return {
    userId: user.userId,
    referralCode: user.referralCode,
    registered: byStatus.registered || 0,
    activated: byStatus.activated || 0,
    paid: byStatus.paid || 0,
    byStatus
  };
}

module.exports = {
  RUNTIME,
  buildReferralStartPayload,
  buildReferralLink,
  registerReferral,
  getReferralStats
};
