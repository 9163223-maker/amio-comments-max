'use strict';

const base = require('./clean-bot-campaign-links-pr91');
const store = require('./store');
const growthService = require('./services/growthService');
const campaignAttribution = require('./campaign-attribution-cc8336');
const titleResolver = require('./channel-title-resolver-cc8340');
const botAudit = require('./admin-bot-audit-trace');
const max = require('./services/maxApi');
const menu = require('./v3-menu-core-1539');
const access = require('./services/clientAccessService');
const accountScreens = require('./features/account-screens-pr106');
const adminScreens = require('./features/admin-activation-screens-pr108');
const accessGate = require('./services/accessGateService');

const RUNTIME = access.RUNTIME;

function clean(value) { return String(value || '').trim(); }
function audit(type, payload = {}) { try { botAudit.log(type, payload); } catch {} }
function find(value, predicate, depth = 6, seen = new Set()) {
  if (!value || depth < 0 || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (predicate(value)) return value;
  for (const item of (Array.isArray(value) ? value : Object.values(value))) {
    const found = find(item, predicate, depth - 1, seen);
    if (found) return found;
  }
  return null;
}
function firstValue(value, keys = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return '';
  seen.add(value);
  const wanted = new Set((Array.isArray(keys) ? keys : [keys]).map((key) => clean(key).toLowerCase()));
  for (const [key, raw] of Object.entries(value)) {
    if (wanted.has(clean(key).toLowerCase())) {
      const normalized = clean(raw);
      if (normalized && normalized !== '[object Object]') return normalized;
    }
  }
  for (const raw of Object.values(value)) {
    const found = firstValue(raw, keys, seen);
    if (found) return found;
  }
  return '';
}
function updateType(update = {}) { return clean(update.update_type || update.type || update?.data?.update_type || update?.data?.type).toLowerCase(); }
function channelIdFromUpdate(update = {}) {
  return clean(firstValue(update, ['chat_id', 'chatId', 'channel_id', 'channelId'])) || clean(find(update, (x) => x && typeof x === 'object' && (x.chat_id || x.chatId || x.channel_id || x.channelId), 7)?.chat_id || '');
}
function userIdFromUpdate(update = {}) { return clean(firstValue(update, ['user_id', 'userId', 'sender_id', 'senderId', 'from_id', 'fromId'])); }
function userNameFromUpdate(update = {}) { return clean(firstValue(update, ['first_name', 'firstName', 'username', 'name'])); }

function messageFromUpdate(update = {}) { return update?.message || update?.data?.message || update?.callback?.message || update?.data?.callback?.message || find(update, (x) => x && typeof x === 'object' && (x.body?.text || x.text) && (x.recipient || x.sender || x.message_id || x.id), 6) || null; }
function callbackFromUpdate(update = {}) { return update?.callback || update?.data?.callback || update?.message?.callback || update?.data?.message?.callback || find(update, (x) => x && typeof x === 'object' && (x.callback_id || x.callbackId || x.payload || x.callback_data || x.callbackData) && !(x.body && x.body.text), 6) || null; }
function messageText(message = {}) { return clean(message?.body?.text || message?.text || ''); }
function isSlashCommand(text = '') { return /^\/[a-z_]+(?:\s|$)/i.test(clean(text)); }
function messageId(message = {}) { return clean(message?.body?.mid || message?.body?.message_id || message?.message_id || message?.messageId || message?.id); }
function chatId(message = {}) { return clean(message?.recipient?.chat_id || message?.recipient?.id || message?.chat_id || message?.chat?.id); }
function chatType(message = {}) { return clean(message?.recipient?.chat_type || message?.recipient?.type || message?.chat_type || message?.chat?.type).toLowerCase(); }
function isChannelMessage(message = {}) { const id = chatId(message); return chatType(message) === 'channel' || /^-/.test(id); }
function callbackId(callback = {}) { return clean(callback?.callback_id || callback?.callbackId || callback?.id); }
function callbackPayload(callback = {}) { const raw = callback?.payload ?? callback?.data ?? callback?.value ?? callback?.callback_data ?? callback?.callbackData ?? ''; if (raw && typeof raw === 'object') return raw; const text = clean(raw); if (!text) return {}; try { return JSON.parse(text); } catch { return { action: text, raw: text }; } }
function senderId(update = {}, callback = null, message = null) { return clean(callback?.user?.user_id || callback?.user?.id || callback?.sender?.user_id || callback?.sender?.id || update?.user?.user_id || update?.user?.id || message?.sender?.user_id || message?.sender?.id || userIdFromUpdate(update)); }
async function sendOrEditScreen({ update = {}, callback = null, message = null, config = {}, screen, edit = false }) {
  const mid = messageId(message);
  if (edit && mid) {
    try { return await max.editMessage({ botToken: config.botToken, messageId: mid, text: screen.text, attachments: screen.attachments, notify: false }); }
    catch {}
  }
  const cid = chatId(message);
  const uid = senderId(update, callback, message);
  return max.sendMessage({ botToken: config.botToken, userId: cid ? '' : uid, chatId: cid, text: screen.text, attachments: screen.attachments, notify: false });
}
async function tryHandleAccessRuntime(req, res, config = {}) {
  const update = req.body || {};
  const callback = callbackFromUpdate(update);
  const message = messageFromUpdate(update);
  const type = updateType(update);
  if (callback) {
    const payload = callbackPayload(callback);
    const action = clean(payload.action || payload.raw);
    const uid = senderId(update, callback, message);
    if (!isChannelMessage(message)) {
      if (action === 'admin_section_main') {
        const state = access.getAccessState(uid);
        const screen = state.active || state.admin ? menu.mainScreen() : accountScreens.gateMenuForUser(uid);
        if (callbackId(callback)) await max.answerCallback({ botToken: config.botToken, callbackId: callbackId(callback) }).catch(() => null);
        await sendOrEditScreen({ update, callback, message, config, screen, edit: true });
        return res.status(200).json({ ok: true, handledBy: RUNTIME, action, screenId: screen.id, accessGate: true });
      }
      const adminScreen = adminScreens.screenForAction(action, uid, payload);
      if (adminScreen) {
        if (callbackId(callback)) await max.answerCallback({ botToken: config.botToken, callbackId: callbackId(callback) }).catch(() => null);
        await sendOrEditScreen({ update, callback, message, config, screen: adminScreen, edit: true });
        return res.status(200).json({ ok: true, handledBy: access.ADMIN_ACCESS_RUNTIME, action, screenId: adminScreen.id, adminRuntime: true });
      }
      const accountScreen = accountScreens.screenForAction(action, uid);
      if (accountScreen) {
        if (callbackId(callback)) await max.answerCallback({ botToken: config.botToken, callbackId: callbackId(callback) }).catch(() => null);
        await sendOrEditScreen({ update, callback, message, config, screen: accountScreen, edit: true });
        return res.status(200).json({ ok: true, handledBy: RUNTIME, action, screenId: accountScreen.id, accountRuntime: true });
      }
      const decision = accessGate.checkAction(uid, payload);
      if (!decision.allow) {
        const screen = accountScreens.screenForGateDecision(decision, uid);
        if (callbackId(callback)) await max.answerCallback({ botToken: config.botToken, callbackId: callbackId(callback) }).catch(() => null);
        await sendOrEditScreen({ update, callback, message, config, screen, edit: true });
        return res.status(200).json({ ok: true, handledBy: RUNTIME, action, screenId: screen.id, accessGate: true, reason: decision.reason, featureKey: decision.featureKey });
      }
    }
  }
  if (type === 'bot_started') {
    const uid = senderId(update, callback, message);
    if (uid) {
      const screen = accountScreens.gateMenuForUser(uid);
      await max.sendMessage({ botToken: config.botToken, userId: uid, text: screen.text, attachments: screen.attachments, notify: false });
      return res.status(200).json({ ok: true, handledBy: RUNTIME, action: 'bot_started_access_gate', screenId: screen.id });
    }
  }
  if (message) {
    const uid = senderId(update, callback, message);
    const text = messageText(message);
    if (/^\/?admin(?:\s|$)/i.test(text)) {
      const screen = adminScreens.adminPanel(uid);
      await sendOrEditScreen({ update, callback, message, config, screen, edit: false });
      return res.status(200).json({ ok: true, handledBy: access.ADMIN_ACCESS_RUNTIME, action: 'admin_command', screenId: screen.id, adminRuntime: true });
    }
    if (/^\/?(?:start|menu)(?:\s|$)/i.test(text)) {
      const isMenu = /^\/?menu(?:\s|$)/i.test(text);
      const state = access.getAccessState(uid);
      const screen = (isMenu && (state.active || state.admin)) ? menu.screenForPayload({ action: 'admin_section_main' }) : accountScreens.gateMenuForUser(uid);
      await sendOrEditScreen({ update, callback, message, config, screen, edit: false });
      return res.status(200).json({ ok: true, handledBy: RUNTIME, action: 'start_menu_access_gate', screenId: screen.id });
    }
    if (text && !isSlashCommand(text) && access.hasPendingActivation(uid)) {
      const result = access.activateCode({ maxUserId: uid, code: text });
      access.clearPendingActivation(uid);
      const screen = accountScreens.activationResultScreen(result, uid);
      await sendOrEditScreen({ update, callback, message, config, screen, edit: false });
      return res.status(200).json({ ok: true, handledBy: RUNTIME, action: 'activation_code_input', activated: !!result.ok, screenId: screen.id });
    }
  }
  return null;
}

async function resolveChannelTitleFromUpdate(update = {}, config = {}) {
  const channelId = channelIdFromUpdate(update);
  if (!channelId || !/^-/i.test(channelId) || !config?.botToken) return null;
  const kind = updateType(update);
  const shouldResolve = ['bot_added', 'chat_title_changed', 'message_created', 'user_added', 'user_removed'].includes(kind) || clean(firstValue(update, ['is_channel', 'isChannel'])) === 'true';
  if (!shouldResolve) return null;
  const result = await titleResolver.resolveTitle({ botToken: config.botToken, channelId, tenantUserId: userIdFromUpdate(update), tenantName: userNameFromUpdate(update) });
  audit('channel_title_resolver.checked', { updateType: kind, channelId, title: result && result.title, source: result && result.source, error: result && result.error, runtimeVersion: RUNTIME });
  return result;
}

function createCleanBot(legacy) {
  campaignAttribution.install();
  const wrapped = base.createCleanBot(legacy);
  return {
    handleWebhook: async function handleWebhookWithCampaignAttribution(req, res, config) {
      const accessResult = await tryHandleAccessRuntime(req, res, config);
      if (accessResult) return accessResult;
      try { await resolveChannelTitleFromUpdate(req.body || {}, config); }
      catch (error) { audit('channel_title_resolver.error', { error: String(error && error.message || error).slice(0, 220), runtimeVersion: RUNTIME }); }
      try { campaignAttribution.saveAudienceEventFromUpdate(store, growthService, req.body || {}, audit); }
      catch (error) { audit('campaign_attribution.error', { error: String(error && error.message || error).slice(0, 220), runtimeVersion: RUNTIME }); }
      return wrapped.handleWebhook(req, res, config);
    }
  };
}

module.exports = { RUNTIME, createCleanBot };
