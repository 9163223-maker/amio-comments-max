'use strict';

const core = require('./index');

const RUNTIME = 'CC8.0.0-CLEAN-CONTROLLED-BASE';

function clean(value) {
  return String(value || '').trim();
}

function findDeep(value, predicate, depth = 6, seen = new Set()) {
  if (!value || depth < 0) return null;
  if (typeof value !== 'object') return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (predicate(value)) return value;
  const values = Array.isArray(value) ? value : Object.values(value);
  for (const item of values) {
    const found = findDeep(item, predicate, depth - 1, seen);
    if (found) return found;
  }
  return null;
}

function getMessage(update = {}) {
  return update?.message || update?.data?.message || update?.callback?.message || update?.data?.callback?.message || null;
}

function getCallback(update = {}) {
  return update?.callback || update?.data?.callback || update?.message?.callback || update?.data?.message?.callback || null;
}

function getText(message = {}) {
  return clean(message?.body?.text || message?.text || message?.message?.text || '');
}

function parseStartReferral(text = '') {
  const raw = clean(text);
  const match = raw.match(/^\/?start\s+(.+)$/i);
  if (!match) return '';
  const payload = clean(match[1]);
  if (!payload) return '';
  return payload.replace(/^ref_/, '');
}

function extractUserProfile(update = {}) {
  const callback = getCallback(update) || {};
  const message = getMessage(update) || {};
  const deepUser = findDeep(update, (item) => item && typeof item === 'object' && (item.user_id || item.userId || item.id) && (item.first_name || item.name || item.username), 7) || {};
  const userSource = callback.user || callback.sender || update.user || update.sender || message.sender || message.from || deepUser || {};
  const maxUserId = clean(
    userSource.user_id ||
    userSource.userId ||
    userSource.id ||
    callback.user_id ||
    callback.userId ||
    update.user_id ||
    update.userId ||
    message.sender?.user_id ||
    message.sender?.id ||
    message.user_id ||
    ''
  );
  if (!maxUserId) return null;
  return {
    maxUserId,
    displayName: clean(userSource.displayName || userSource.display_name || userSource.name || [userSource.first_name, userSource.last_name].filter(Boolean).join(' ') || userSource.firstName || ''),
    username: clean(userSource.username || userSource.login || ''),
    first_name: clean(userSource.first_name || userSource.firstName || ''),
    last_name: clean(userSource.last_name || userSource.lastName || ''),
    rawKind: callback.user || callback.sender ? 'callback' : 'message'
  };
}

async function ensureWebhookUserContext(update = {}, options = {}) {
  const startedAt = Date.now();
  const profile = extractUserProfile(update);
  if (!profile?.maxUserId) {
    return { ok: false, skipped: true, reason: 'max_user_id_missing', durationMs: Date.now() - startedAt };
  }
  if (!core.postgres.hasDatabaseUrl()) {
    return { ok: false, skipped: true, reason: 'database_url_missing', profile, durationMs: Date.now() - startedAt };
  }
  try {
    const user = await core.users.ensureUserFromMaxProfile(profile);
    const text = getText(getMessage(update) || {});
    const referralCode = parseStartReferral(text);
    let referral = null;
    if (referralCode) {
      referral = await core.referrals.registerReferral({
        referralCode,
        referredUserId: user.userId,
        status: 'registered',
        meta: { source: 'start_payload' }
      });
    }
    const access = await core.permissions.getAccessContext(user);
    return {
      ok: true,
      runtimeVersion: RUNTIME,
      user,
      access,
      referral,
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    if (options.throwOnError) throw error;
    return {
      ok: false,
      reason: 'user_context_failed',
      error: error?.message || String(error),
      profile,
      durationMs: Date.now() - startedAt
    };
  }
}

module.exports = {
  RUNTIME,
  getMessage,
  getCallback,
  getText,
  parseStartReferral,
  extractUserProfile,
  ensureWebhookUserContext
};
