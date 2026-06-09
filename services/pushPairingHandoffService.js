'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'push-pairing-handoffs.json');
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MAX_RECORDS = 500;

function clean(value) { return String(value || '').trim(); }
function nowMs() { return Date.now(); }
function handoffHash(value) { return clean(value) ? crypto.createHash('sha256').update(clean(value)).digest('hex').slice(0, 20) : ''; }
function safeId(value) { const id = clean(value); return /^[A-Za-z0-9_-]{24,160}$/.test(id) ? id : ''; }

function readStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' && parsed.handoffs && typeof parsed.handoffs === 'object' ? parsed : { handoffs: {} };
  } catch {
    return { handoffs: {} };
  }
}

function writeStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

function prune(store, timestamp = nowMs()) {
  const entries = Object.entries(store.handoffs || {})
    .filter(([, item]) => item && Number(item.expiresAtMs) > timestamp - DEFAULT_TTL_MS)
    .sort((a, b) => Number(b[1].createdAtMs) - Number(a[1].createdAtMs))
    .slice(0, MAX_RECORDS);
  store.handoffs = Object.fromEntries(entries);
  return store;
}

function create({ pairingToken, context, ttlMs = DEFAULT_TTL_MS } = {}) {
  const token = clean(pairingToken);
  if (!token || !context || !clean(context.maxUserId) || !clean(context.chatId)) {
    const error = new Error('handoff_context_required');
    error.code = 'handoff_context_required';
    throw error;
  }
  const handoffId = crypto.randomBytes(24).toString('base64url');
  const createdAtMs = nowMs();
  const expiresAtMs = createdAtMs + Math.max(60_000, Math.min(DEFAULT_TTL_MS, Number(ttlMs) || DEFAULT_TTL_MS));
  const store = prune(readStore(), createdAtMs);
  store.handoffs[handoffHash(handoffId)] = {
    pairingToken: token,
    context: {
      maxUserId: clean(context.maxUserId),
      chatId: clean(context.chatId),
      channelId: clean(context.channelId),
      chatTitle: clean(context.chatTitle).slice(0, 120),
      expiresAt: clean(context.expiresAt)
    },
    createdAtMs,
    expiresAtMs,
    consumedAtMs: 0
  };
  writeStore(store);
  return { handoffId, expiresAt: new Date(expiresAtMs).toISOString(), context: store.handoffs[handoffHash(handoffId)].context, status: 'found' };
}

function resolve(handoffId) {
  const id = safeId(handoffId);
  if (!id) return { status: 'missing', error: 'handoff_missing' };
  const store = readStore();
  const item = store.handoffs[handoffHash(id)];
  if (!item) return { status: 'missing', error: 'handoff_missing' };
  if (Number(item.expiresAtMs) <= nowMs()) return { status: 'expired', error: 'handoff_expired' };
  return {
    status: item.consumedAtMs ? 'consumed' : 'found',
    error: item.consumedAtMs ? 'handoff_consumed' : '',
    handoffId: id,
    pairingToken: clean(item.pairingToken),
    context: item.context || {},
    expiresAt: new Date(Number(item.expiresAtMs)).toISOString(),
    consumedAt: item.consumedAtMs ? new Date(Number(item.consumedAtMs)).toISOString() : ''
  };
}

function consume(handoffId) {
  const id = safeId(handoffId);
  const current = resolve(id);
  if (!['found', 'consumed'].includes(current.status)) return current;
  const store = readStore();
  const key = handoffHash(id);
  if (store.handoffs[key] && !store.handoffs[key].consumedAtMs) {
    store.handoffs[key].consumedAtMs = nowMs();
    writeStore(prune(store));
  }
  return { ...current, status: 'consumed', error: 'handoff_consumed' };
}

module.exports = { create, resolve, consume, handoffHash, DATA_FILE, DEFAULT_TTL_MS };
