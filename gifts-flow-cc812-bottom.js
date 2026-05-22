'use strict';

const base = require('./gifts-flow-cc812-summary');
const store = require('./store');

const RUNTIME = 'CC8.1.2-GIFTS-BOTTOM-SUMMARY';
const CLEAN_GIFT_ACTIONS = base.CLEAN_GIFT_ACTIONS || [];

function clean(value) {
  return String(value || '').trim();
}

function clearActiveGiftScreen(userId = '') {
  const uid = clean(userId);
  if (!uid) return;
  try {
    store.setSetupState(uid, {
      giftActiveScreenMessageId: '',
      giftActiveScreenId: '',
      giftActiveScreenAt: 0
    });
  } catch {}
}

async function screenForPayload(menu, payload = {}, ctx = {}) {
  return base.screenForPayload(menu, payload, ctx);
}

async function handleTextInput(menu, ctx = {}) {
  clearActiveGiftScreen(ctx.userId);
  return base.handleTextInput(menu, ctx);
}

function isCleanGiftAction(action = '') {
  return base.isCleanGiftAction ? base.isCleanGiftAction(action) : CLEAN_GIFT_ACTIONS.includes(clean(action));
}

module.exports = {
  ...base,
  RUNTIME,
  CLEAN_GIFT_ACTIONS,
  isCleanGiftAction,
  screenForPayload,
  handleTextInput
};
