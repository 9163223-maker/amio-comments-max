'use strict';

const RUNTIME = 'ADMINKIT-CORE-TIMING-STORE-1.0';
const MAX_ITEMS = 60;
const items = [];

function safeString(value = '') {
  return String(value ?? '').trim();
}

function push(event = {}) {
  const item = {
    at: new Date().toISOString(),
    kind: safeString(event.kind || 'unknown'),
    route: safeString(event.route || ''),
    adminId: safeString(event.adminId || ''),
    deliveryMode: safeString(event.deliveryMode || ''),
    sent: event.sent === true,
    timing: event.timing && typeof event.timing === 'object' ? event.timing : {},
    gate: event.gate && typeof event.gate === 'object' ? {
      ok: event.gate.ok === true,
      reason: safeString(event.gate.reason || ''),
      sendEnabled: event.gate.sendEnabled === true,
      canaryAll: event.gate.canaryAll === true,
      allowedAdmin: event.gate.allowedAdmin === true
    } : null,
    note: safeString(event.note || '')
  };
  items.unshift(item);
  while (items.length > MAX_ITEMS) items.pop();
  return item;
}

function list(limit = 25) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 25), MAX_ITEMS));
  return items.slice(0, safeLimit);
}

function clear() {
  items.length = 0;
  return { ok: true, runtimeVersion: RUNTIME, cleared: true };
}

function selfTest() {
  return { ok: true, runtimeVersion: RUNTIME, count: items.length, maxItems: MAX_ITEMS };
}

module.exports = { RUNTIME, push, list, clear, selfTest };
