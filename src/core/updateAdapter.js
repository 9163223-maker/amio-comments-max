'use strict';

function safeJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function extractText(update = {}) {
  return String(
    update.text ||
    update.message?.text ||
    update.body?.text ||
    update.callback?.payload ||
    update.callback_query?.data ||
    update.payload ||
    ''
  ).trim();
}

function extractAdminId(update = {}) {
  return String(
    update.adminId ||
    update.userId ||
    update.sender?.user_id ||
    update.message?.sender?.user_id ||
    update.message?.from?.id ||
    update.callback_query?.from?.id ||
    'debug-admin'
  );
}

function extractPayload(update = {}) {
  const raw = update.payload || update.callback?.payload || update.callback_query?.data || update.message?.payload;
  return safeJson(raw);
}

function routeFromUpdate(update = {}) {
  const payload = extractPayload(update);
  if (payload.r) return String(payload.r);
  const text = extractText(update);
  if (!text) return 'main.home';
  if (text === '/start' || /^старт$/i.test(text) || /^меню$/i.test(text)) return 'main.home';
  return text;
}

function toContext(update = {}, extra = {}) {
  const payload = extractPayload(update);
  return {
    update,
    route: extra.route || routeFromUpdate(update),
    payload,
    adminId: extra.adminId || extractAdminId(update),
    planCode: extra.planCode || update.planCode || 'free',
    dryRun: true,
    source: 'core-update-preview'
  };
}

async function preview(update = {}, extra = {}) {
  const ctx = toContext(update, extra);
  const core = require('../../adminkit-core-runtime');
  const screen = await core.dispatch(ctx);
  return {
    ok: true,
    runtimeVersion: core.RUNTIME,
    mode: 'dry-run-no-send',
    ctx: {
      route: ctx.route,
      adminId: ctx.adminId,
      planCode: ctx.planCode,
      payload: ctx.payload
    },
    screen,
    buttonTexts: (((screen.attachments || [])[0] || {}).payload || {}).buttons?.flat?.().map((b) => b.text) || []
  };
}

module.exports = { toContext, preview, routeFromUpdate, extractPayload, extractText };
