'use strict';

const core = require('./index');
const cleanCoreSchema = require('../db/ensureCleanCoreSchema');

const RUNTIME = 'CC8.0.2-ACCOUNT-DB-CONFIG';

function clean(value) {
  return String(value || '').trim();
}

function findDeep(value, predicate, depth = 7, seen = new Set()) {
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

function hasCallbackShape(item = {}) {
  return Boolean(item && typeof item === 'object' && (
    item.callback_id || item.callbackId || item.payload || item.callback_data || item.callbackData || item.data
  ));
}

function hasMessageShape(item = {}) {
  return Boolean(item && typeof item === 'object' && (
    item.body?.text || item.text || item.message?.text || item.recipient || item.sender || item.message_id || item.messageId
  ));
}

function getMessage(update = {}) {
  return update?.message ||
    update?.data?.message ||
    update?.callback?.message ||
    update?.data?.callback?.message ||
    findDeep(update, hasMessageShape, 7) ||
    null;
}

function getCallback(update = {}) {
  return update?.callback ||
    update?.data?.callback ||
    update?.message?.callback ||
    update?.data?.message?.callback ||
    findDeep(update, hasCallbackShape, 7) ||
    null;
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

function pickUserLikeObject(update = {}) {
  return findDeep(update, (item) => item && typeof item === 'object' && (
    item.user_id || item.userId || item.userID || item.sender_id || item.senderId || item.from_id || item.fromId || item.uid || item.id
  ), 8) || {};
}

function extractUserProfile(update = {}) {
  const callback = getCallback(update) || {};
  const message = getMessage(update) || {};
  const deepUser = pickUserLikeObject(update);
  const userSource = callback.user || callback.sender || callback.from || update.user || update.sender || update.from || message.sender || message.from || message.user || message.recipient || update.recipient || deepUser || {};
  const maxUserId = clean(
    userSource.user_id ||
    userSource.userId ||
    userSource.userID ||
    userSource.sender_id ||
    userSource.senderId ||
    userSource.from_id ||
    userSource.fromId ||
    userSource.uid ||
    userSource.id ||
    callback.user_id ||
    callback.userId ||
    callback.sender_id ||
    callback.senderId ||
    callback.from_id ||
    callback.fromId ||
    update.user_id ||
    update.userId ||
    update.sender_id ||
    update.senderId ||
    update.from_id ||
    update.fromId ||
    message.sender?.user_id ||
    message.sender?.userId ||
    message.sender?.id ||
    message.from?.user_id ||
    message.from?.userId ||
    message.from?.id ||
    message.user?.user_id ||
    message.user?.userId ||
    message.user?.id ||
    message.recipient?.user_id ||
    message.recipient?.userId ||
    update.recipient?.user_id ||
    update.recipient?.userId ||
    message.user_id ||
    message.userId ||
    ''
  );
  if (!maxUserId) return null;
  return {
    maxUserId,
    displayName: clean(userSource.displayName || userSource.display_name || userSource.name || [userSource.first_name, userSource.last_name].filter(Boolean).join(' ') || userSource.firstName || userSource.username || ''),
    username: clean(userSource.username || userSource.login || ''),
    first_name: clean(userSource.first_name || userSource.firstName || ''),
    last_name: clean(userSource.last_name || userSource.lastName || ''),
    rawKind: callback.user || callback.sender || callback.user_id || callback.userId ? 'callback' : 'message'
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
    const schema = await cleanCoreSchema.ensureCleanCoreSchema();
    if (!schema.ok) {
      return { ok: false, reason: 'clean_core_schema_failed', schema, profile, durationMs: Date.now() - startedAt };
    }
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
      schema,
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    if (options.throwOnError) throw error;
    return {
      ok: false,
      reason: 'user_context_failed',
      error: error?.message || String(error),
      profile,
      schema: cleanCoreSchema.info(),
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
