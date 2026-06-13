'use strict';

const RUNTIME = 'PR199-BUTTONS-MAIN-MENU-ROUTE-GUARD';
const SOURCE = 'adminkit-pr199-buttons-main-menu-route-guard';
let installed = false;
let installState = { ok: false, runtime: RUNTIME, source: SOURCE, installed: false };

function clean(value) { return String(value || '').trim(); }
function isWizard(text = '') { return /Добавление кнопки|Предпросмотр кнопки/i.test(clean(text)); }
function resultMid(result = {}, fallback = '') { return clean(result?.message?.body?.mid || result?.message?.id || result?.body?.mid || result?.message_id || result?.messageId || result?.id || fallback); }
function short(value, max = 160) { const s = clean(value).replace(/\s+/g, ' '); return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1))}…`; }
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
function message(update = {}) { return update?.message || update?.data?.message || update?.callback?.message || update?.data?.callback?.message || find(update, (x) => x && typeof x === 'object' && (x.recipient || x.chat || x.chat_id || x.message_id || x.id) && (x.body || x.text || x.callback), 5) || null; }
function callback(update = {}) { return update?.callback || update?.data?.callback || update?.message?.callback || update?.data?.message?.callback || find(update, (x) => x && typeof x === 'object' && (x.callback_id || x.callbackId || x.payload || x.callback_data || x.callbackData), 6) || null; }
function chatIdOf(msg = {}) { return clean(msg?.recipient?.chat_id || msg?.recipient?.id || msg?.chat_id || msg?.chat?.id); }
function senderId(msg = {}) { return clean(msg?.sender?.user_id || msg?.sender?.id || msg?.user_id || msg?.userId); }
function userFrom(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return clean(obj.user_id || obj.userId || obj.sender_id || obj.senderId || obj.from_id || obj.fromId || obj.id || userFrom(obj.user) || userFrom(obj.sender) || userFrom(obj.from) || userFrom(obj.author));
}
function contextStack() {
  if (!global.__ADMINKIT_PR199_BUTTON_WIZARD_CONTEXT_STACK__) global.__ADMINKIT_PR199_BUTTON_WIZARD_CONTEXT_STACK__ = [];
  return global.__ADMINKIT_PR199_BUTTON_WIZARD_CONTEXT_STACK__;
}
function currentContext() { const stack = contextStack(); return stack.length ? stack[stack.length - 1] : null; }
function extractContext(update = {}) {
  const msg = message(update) || {};
  const cb = callback(update) || null;
  return {
    userId: userFrom(cb) || userFrom(update) || senderId(msg) || userFrom(find(update, (x) => x && typeof x === 'object' && (x.user_id || x.userId || x.sender_id || x.senderId || x.from_id || x.fromId), 7)),
    chatId: chatIdOf(msg)
  };
}
function rememberButtonActive(store, ids = {}, messageId = '', text = '', decision = '') {
  const mid = clean(messageId);
  if (!mid || !isWizard(text)) return false;
  const keys = [ids.userId, ids.chatId].map(clean).filter(Boolean).filter((value, index, list) => list.indexOf(value) === index);
  let ok = false;
  for (const key of keys) {
    try {
      store.setSetupState(key, {
        buttonsActiveScreenMessageId: mid,
        buttonsActiveScreenAt: Date.now(),
        buttonsActiveScreenRuntime: RUNTIME,
        buttonsActiveScreenText: short(text, 80),
        buttonsWizardRealContextLastDecision: decision,
        activeAdminFlowKind: 'button'
      });
      ok = true;
    } catch {}
  }
  return ok;
}
function patchCleanFlowContext(store) {
  try {
    const cleanGuard = require('./clean-bot-flow-guard-1546');
    if (!cleanGuard || typeof cleanGuard.createCleanBot !== 'function' || cleanGuard.__adminkitPr199ButtonContextWrapped) return false;
    const originalCreate = cleanGuard.createCleanBot;
    cleanGuard.createCleanBot = function createCleanBotPr199ButtonContext(legacy) {
      const bot = originalCreate.call(this, legacy);
      if (!bot || typeof bot.handleWebhook !== 'function') return bot;
      return {
        ...bot,
        handleWebhook: async function handleWebhookPr199ButtonContext(req, res, config) {
          const ctx = extractContext(req && req.body || {});
          const stack = contextStack();
          stack.push(ctx);
          try {
            return await bot.handleWebhook(req, res, config);
          } finally {
            stack.pop();
          }
        }
      };
    };
    cleanGuard.__adminkitPr199ButtonContextWrapped = true;
    return true;
  } catch {
    return false;
  }
}

function install() {
  if (installed) return installState;
  installed = true;
  try {
    const buttons = require('./buttons-flow-cc8-clean');
    const max = require('./services/maxApi');
    const store = require('./store');
    const original = buttons.isCleanButtonAction;
    if (typeof original === 'function' && !buttons.__adminkitPr199MainMenuRouteGuard) {
      buttons.isCleanButtonAction = function isCleanButtonActionPr199MainMenuGuard(action = '') {
        if (clean(action) === 'admin_section_main') return false;
        return original.call(this, action);
      };
      buttons.__adminkitPr199MainMenuRouteGuard = true;
    }
    const contextWrapperInstalled = patchCleanFlowContext(store);
    const originalEdit = max.editMessage;
    if (typeof originalEdit === 'function' && !max.__adminkitPr199ButtonContextEditGuard) {
      max.editMessage = async function editMessagePr199ButtonContext(args = {}) {
        const result = await originalEdit.call(this, args);
        const ctx = currentContext();
        if (ctx && isWizard(args.text)) {
          rememberButtonActive(store, ctx, args.messageId, args.text, 'edit_message_context');
        }
        return result;
      };
      max.__adminkitPr199ButtonContextEditGuard = true;
    }
    const originalSend = max.sendMessage;
    if (typeof originalSend === 'function' && !max.__adminkitPr199ChatIdWizardSendGuard) {
      max.sendMessage = async function sendMessagePr199ChatIdGuard(args = {}) {
        const explicitUserId = clean(args.userId || '');
        const chatId = clean(args.chatId || '');
        const text = clean(args.text || '');
        const ctx = currentContext();
        const contextUserId = clean(ctx && ctx.userId || '');
        const effectiveUserId = explicitUserId || (isWizard(text) && contextUserId) || (chatId && isWizard(text) ? chatId : '');
        if (!explicitUserId && effectiveUserId && isWizard(text)) {
          const state = store.getSetupState(effectiveUserId) || {};
          const activeMessageId = clean(state.buttonsActiveScreenMessageId || '');
          if (activeMessageId && typeof max.editMessage === 'function') {
            try {
              const edited = await max.editMessage({ botToken: args.botToken, messageId: activeMessageId, text: args.text, attachments: args.attachments, format: args.format, link: args.link, notify: false });
              rememberButtonActive(store, { userId: effectiveUserId, chatId }, activeMessageId, text, 'chat_or_context_inplace_edit');
              return edited || { message: { id: activeMessageId, body: { mid: activeMessageId } }, pr199ChatIdInplaceEdit: true };
            } catch (error) {
              try {
                store.setSetupState(effectiveUserId, { buttonsChatIdInplaceEditFailedAt: Date.now(), buttonsChatIdInplaceEditFailedRuntime: RUNTIME, buttonsChatIdInplaceEditFailedMessage: short(error && error.message || error) });
              } catch {}
            }
          }
        }
        const result = await originalSend.call(this, args);
        if (!explicitUserId && effectiveUserId && isWizard(text)) {
          const messageId = resultMid(result);
          rememberButtonActive(store, { userId: effectiveUserId, chatId }, messageId, text, 'send_new');
        }
        return result;
      };
      max.__adminkitPr199ChatIdWizardSendGuard = true;
    }
    installState = { ok: true, runtime: RUNTIME, source: SOURCE, installed: true, mainMenuUsesPublicRoute: true, chatIdWizardSendGuard: true, chatIdWizardEditForwardsBotToken: true, chatIdWizardEditFallsBackToSend: true, buttonWizardContextWrapper: contextWrapperInstalled, buttonWizardContextEditGuard: true, buttonWizardContextUserIdForChatIdSend: true };
  } catch (error) {
    installState = { ok: false, runtime: RUNTIME, source: SOURCE, installed: false, error: clean(error && error.message || error).slice(0, 240) };
  }
  try { console.log('[pr199-buttons-main-menu-route-guard]', JSON.stringify(installState)); } catch {}
  return installState;
}

module.exports = { RUNTIME, SOURCE, install, info: () => installState };
