'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USED_FILE = path.join(DATA_DIR, 'push-pairing-used.json');
const PURPOSE = 'push_pairing';
const DEVICE_PURPOSE = 'push_device_proof';
const DEFAULT_TTL_MINUTES = 60;
const DEFAULT_DEVICE_TTL_DAYS = 365;

function clean(value) {
  return String(value || '').trim();
}

function secret() {
  return clean(process.env.PUSH_PAIRING_SECRET);
}

function requireSecret() {
  const value = secret();
  if (!value) {
    const error = new Error('push_pairing_secret_required');
    error.code = 'push_pairing_secret_required';
    throw error;
  }
  return value;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function decodeBase64url(input) {
  return Buffer.from(String(input || ''), 'base64url').toString('utf8');
}

function sign(encodedPayload) {
  return crypto.createHmac('sha256', requireSecret()).update(encodedPayload).digest('base64url');
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function readUsedStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(USED_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : { used: {} };
  } catch {
    return { used: {} };
  }
}

function writeUsedStore(payload) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${USED_FILE}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, USED_FILE);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function nonceHash(nonce) {
  return crypto.createHash('sha256').update(String(nonce || '')).digest('hex').slice(0, 16);
}

function createPairingToken({ maxUserId, chatId, channelId, chatTitle, issuedByAdminId, ttlMinutes } = {}) {
  requireSecret();
  const safeMaxUserId = clean(maxUserId);
  const safeChatId = clean(chatId);
  if (!safeMaxUserId || !safeChatId) {
    const error = new Error('push_pairing_identity_required');
    error.code = 'push_pairing_identity_required';
    throw error;
  }
  const ttl = Math.max(1, Math.min(24 * 60, Number(ttlMinutes || DEFAULT_TTL_MINUTES) || DEFAULT_TTL_MINUTES));
  const payload = {
    purpose: PURPOSE,
    maxUserId: safeMaxUserId,
    chatId: safeChatId,
    channelId: clean(channelId),
    chatTitle: clean(chatTitle).slice(0, 120),
    issuedByAdminId: clean(issuedByAdminId),
    expiresAt: new Date(Date.now() + ttl * 60 * 1000).toISOString(),
    nonce: crypto.randomBytes(18).toString('base64url')
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function verifyPairingToken(token, options = {}) {
  requireSecret();
  const raw = clean(token);
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    const error = new Error('invalid_push_pairing_token');
    error.code = 'invalid_push_pairing_token';
    throw error;
  }
  const expected = sign(parts[0]);
  if (!timingSafeEqualText(parts[1], expected)) {
    const error = new Error('invalid_push_pairing_signature');
    error.code = 'invalid_push_pairing_signature';
    throw error;
  }
  let payload;
  try {
    payload = JSON.parse(decodeBase64url(parts[0]));
  } catch {
    const error = new Error('invalid_push_pairing_payload');
    error.code = 'invalid_push_pairing_payload';
    throw error;
  }
  if (!payload || payload.purpose !== PURPOSE) {
    const error = new Error('invalid_push_pairing_purpose');
    error.code = 'invalid_push_pairing_purpose';
    throw error;
  }
  if (!clean(payload.maxUserId) || !clean(payload.chatId) || !clean(payload.nonce)) {
    const error = new Error('invalid_push_pairing_identity');
    error.code = 'invalid_push_pairing_identity';
    throw error;
  }
  const expiresAtMs = Date.parse(payload.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    const error = new Error('push_pairing_token_expired');
    error.code = 'push_pairing_token_expired';
    throw error;
  }
  if (!options.allowUsed) {
    const store = readUsedStore();
    if (store.used && store.used[tokenHash(raw)]) {
      const error = new Error('push_pairing_token_used');
      error.code = 'push_pairing_token_used';
      throw error;
    }
  }
  return {
    purpose: PURPOSE,
    maxUserId: clean(payload.maxUserId),
    chatId: clean(payload.chatId),
    channelId: clean(payload.channelId),
    chatTitle: clean(payload.chatTitle).slice(0, 120),
    issuedByAdminId: clean(payload.issuedByAdminId),
    expiresAt: new Date(expiresAtMs).toISOString(),
    nonce: clean(payload.nonce),
    nonceHash: nonceHash(payload.nonce)
  };
}

function consumePairingToken(token) {
  const payload = verifyPairingToken(token);
  const store = readUsedStore();
  const used = store.used && typeof store.used === 'object' ? store.used : {};
  used[tokenHash(token)] = { usedAt: new Date().toISOString(), expiresAt: payload.expiresAt, nonceHash: payload.nonceHash };
  writeUsedStore({ used });
  return payload;
}


function createDeviceProof({ deviceId, endpointHash, ttlDays } = {}) {
  requireSecret();
  const safeDeviceId = clean(deviceId);
  const safeEndpointHash = clean(endpointHash);
  if (!safeDeviceId || !/^[a-f0-9]{32,128}$/i.test(safeEndpointHash)) {
    const error = new Error('push_device_proof_identity_required');
    error.code = 'push_device_proof_identity_required';
    throw error;
  }
  const days = Math.max(1, Math.min(730, Number(ttlDays || DEFAULT_DEVICE_TTL_DAYS) || DEFAULT_DEVICE_TTL_DAYS));
  const payload = {
    purpose: DEVICE_PURPOSE,
    deviceId: safeDeviceId,
    endpointHash: safeEndpointHash,
    expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function verifyDeviceProof(token) {
  requireSecret();
  const raw = clean(token);
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1] || !timingSafeEqualText(parts[1], sign(parts[0]))) {
    const error = new Error('invalid_push_device_proof');
    error.code = 'invalid_push_device_proof';
    throw error;
  }
  let payload;
  try { payload = JSON.parse(decodeBase64url(parts[0])); } catch {
    const error = new Error('invalid_push_device_proof_payload');
    error.code = 'invalid_push_device_proof_payload';
    throw error;
  }
  const expiresAtMs = Date.parse(payload && payload.expiresAt);
  if (!payload || payload.purpose !== DEVICE_PURPOSE || !clean(payload.deviceId) || !/^[a-f0-9]{32,128}$/i.test(clean(payload.endpointHash))) {
    const error = new Error('invalid_push_device_proof_identity');
    error.code = 'invalid_push_device_proof_identity';
    throw error;
  }
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    const error = new Error('push_device_proof_expired');
    error.code = 'push_device_proof_expired';
    throw error;
  }
  return { purpose: DEVICE_PURPOSE, deviceId: clean(payload.deviceId), endpointHash: clean(payload.endpointHash), expiresAt: new Date(expiresAtMs).toISOString() };
}

function safeTokenId(tokenOrPayload) {
  if (typeof tokenOrPayload === 'string') {
    try { return verifyPairingToken(tokenOrPayload, { allowUsed: true }).nonceHash; } catch { return tokenHash(tokenOrPayload).slice(0, 16); }
  }
  return nonceHash(tokenOrPayload && tokenOrPayload.nonce);
}

module.exports = {
  PURPOSE,
  DEVICE_PURPOSE,
  createPairingToken,
  createDeviceProof,
  verifyDeviceProof,
  verifyPairingToken,
  consumePairingToken,
  safeTokenId,
  tokenHash
};
