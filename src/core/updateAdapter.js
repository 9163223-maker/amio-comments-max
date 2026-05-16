'use strict';

function safeJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function cleanValue(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try { return decodeURIComponent(raw.replace(/\+/g, ' ')); } catch { return raw.replace(/\+/g, ' '); }
}

function extractText(update = {}) {
  return String(
    update.text ||
    update.messageText ||
    update.inputText ||
    update.query?.text ||
    update.body?.text ||
    update.message?.text ||
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

function pickValue(update = {}, payload = {}, extra = {}, key, aliases = []) {
  for (const name of [key, ...aliases]) {
    const value = extra[name] || update[name] || update.query?.[name] || update.body?.[name] || payload[name];
    const cleaned = cleanValue(value);
    if (cleaned) return cleaned;
  }
  return '';
}

function routeFromUpdate(update = {}) {
  const payload = extractPayload(update);
  if (payload.r) return String(payload.r);
  const route = cleanValue(update.route || update.query?.route || update.body?.route || '');
  if (route) return route;
  const text = cleanValue(extractText(update));
  if (!text) return 'main.home';
  if (text === '/start' || /^старт$/i.test(text) || /^меню$/i.test(text)) return 'main.home';
  return text;
}

function toContext(update = {}, extra = {}) {
  const payload = extractPayload(update);
  const text = cleanValue(extra.text || update.text || update.messageText || update.inputText || update.query?.text || update.body?.text || update.message?.text || '');
  return {
    update,
    route: extra.route || routeFromUpdate(update),
    payload,
    text,
    messageText: text,
    inputText: text,
    adminId: extra.adminId || extractAdminId(update),
    planCode: extra.planCode || update.planCode || 'free',
    postId: pickValue(update, payload, extra, 'postId', ['selectedPostId', 'id']),
    postTitle: pickValue(update, payload, extra, 'postTitle', ['title']),
    channelId: pickValue(update, payload, extra, 'channelId', ['selectedChannelId']),
    commentKey: pickValue(update, payload, extra, 'commentKey', ['selectedCommentKey']),
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
      payload: ctx.payload,
      text: ctx.text,
      postId: ctx.postId,
      postTitle: ctx.postTitle,
      channelId: ctx.channelId,
      commentKey: ctx.commentKey
    },
    screen,
    buttonTexts: (((screen.attachments || [])[0] || {}).payload || {}).buttons?.flat?.().map((b) => b.text) || []
  };
}

module.exports = { toContext, preview, routeFromUpdate, extractPayload, extractText, cleanValue };