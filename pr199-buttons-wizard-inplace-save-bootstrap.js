'use strict';

const RUNTIME = 'PR199-BUTTONS-WIZARD-INPLACE-SAVE-FALLBACK';
const SOURCE = 'adminkit-pr199-buttons-wizard-inplace-save-fallback';
const PENDING_EDIT_TTL_MS = 5000;

let installed = false;
let installState = { ok: false, runtime: RUNTIME, source: SOURCE, installed: false };
const pendingWizardEdits = [];

function clean(value) { return String(value || '').trim(); }
function short(value, max = 120) { const s = clean(value).replace(/\s+/g, ' '); return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1))}…`; }
function isButtonsWizardText(text = '') { return /^(➕\s*)?Добавление кнопки|^(👀\s*)?Предпросмотр кнопки/i.test(clean(text)); }
function isButtonsWizardScreen(screen = null) { return isButtonsWizardText(screen && screen.text); }
function isReadyPreviewScreen(screen = null) { return clean(screen && screen.id) === 'buttons_clean_add_preview'; }
function isCancelOrExitAction(action = '') { return ['button_admin_cancel', 'button_admin_preview_back', 'admin_section_main', 'admin_section_buttons'].includes(clean(action)); }
function isButtonFlowReady(flow = null) { const draft = flow && flow.draft || {}; return Boolean(flow && Number(flow.stepIndex || 0) >= 2 && clean(draft.text) && clean(draft.url) && flow.targetPost && clean(flow.targetPost.commentKey)); }
function clonePlain(value) { try { return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : null; } catch { return null; } }
function setup(store, userId = '') { try { return store.getSetupState(clean(userId)) || {}; } catch { return {}; } }
function resultMessageId(result = {}, fallback = '') { return clean(result?.message?.body?.mid || result?.message?.id || result?.body?.mid || result?.message_id || result?.messageId || result?.id || fallback); }
function updateMessageId(update = {}) {
  const msg = update?.message || update?.data?.message || update?.callback?.message || update?.data?.callback?.message || update?.data?.message?.callback?.message || {};
  const body = msg && msg.body && typeof msg.body === 'object' ? msg.body : {};
  return clean(body.mid || body.message_id || body.messageId || body.id || msg.mid || msg.message_id || msg.messageId || msg.id);
}
function rememberButtonScreen(store, userId = '', messageId = '', text = '') {
  const uid = clean(userId);
  const mid = clean(messageId);
  if (!uid || !mid) return false;
  try {
    store.setSetupState(uid, {
      buttonsActiveScreenMessageId: mid,
      buttonsActiveScreenAt: Date.now(),
      buttonsActiveScreenRuntime: RUNTIME,
      buttonsActiveScreenText: short(text, 80),
      activeAdminFlowKind: 'button'
    });
    return true;
  } catch {
    return false;
  }
}
function rememberPendingWizardEdit(userId = '', screen = null, update = null) {
  const uid = clean(userId);
  const messageId = updateMessageId(update || {});
  if (!uid || !messageId || !isButtonsWizardScreen(screen)) return false;
  const text = short(screen.text, 80);
  const now = Date.now();
  pendingWizardEdits.push({ userId: uid, messageId, text, at: now });
  while (pendingWizardEdits.length > 20) pendingWizardEdits.shift();
  return true;
}
function consumePendingWizardEdit(text = '', messageId = '') {
  const now = Date.now();
  const sig = short(text, 80);
  const mid = clean(messageId);
  if (!mid) return null;
  for (let i = pendingWizardEdits.length - 1; i >= 0; i -= 1) {
    const item = pendingWizardEdits[i];
    if (!item || now - Number(item.at || 0) > PENDING_EDIT_TTL_MS) {
      pendingWizardEdits.splice(i, 1);
      continue;
    }
    if (clean(item.messageId) === mid && item.text === sig) {
      pendingWizardEdits.splice(i, 1);
      return item;
    }
  }
  return null;
}
function rememberPendingPreview(store, userId = '', flow = null) {
  const uid = clean(userId);
  if (!uid || !isButtonFlowReady(flow)) return false;
  try {
    store.setSetupState(uid, {
      buttonsPendingPreview: clonePlain(flow),
      buttonsPendingPreviewAt: Date.now(),
      buttonsPendingPreviewRuntime: RUNTIME,
      activeAdminFlowKind: 'button'
    });
    return true;
  } catch {
    return false;
  }
}
function restorePendingPreview(store, userId = '') {
  const uid = clean(userId);
  if (!uid) return false;
  const state = setup(store, uid);
  if (state.buttonFlow) return isButtonFlowReady(state.buttonFlow);
  if (!isButtonFlowReady(state.buttonsPendingPreview)) return false;
  try {
    store.setSetupState(uid, {
      buttonFlow: clonePlain(state.buttonsPendingPreview),
      activeAdminFlowKind: 'button',
      buttonsPendingPreviewRestoredAt: Date.now(),
      buttonsPendingPreviewRestoredRuntime: RUNTIME
    });
    return true;
  } catch {
    return false;
  }
}
function clearPendingPreview(store, userId = '') {
  const uid = clean(userId);
  if (!uid) return false;
  try {
    store.setSetupState(uid, {
      buttonsPendingPreview: null,
      buttonsPendingPreviewAt: 0,
      buttonsPendingPreviewClearedAt: Date.now(),
      buttonsPendingPreviewClearedRuntime: RUNTIME
    });
    return true;
  } catch {
    return false;
  }
}

function install() {
  if (installed) return installState;
  installed = true;
  try {
    const max = require('./services/maxApi');
    const store = require('./store');
    const buttons = require('./buttons-flow-cc8-clean');
    const originalSendMessage = max.sendMessage;
    const originalEditMessage = max.editMessage;
    const originalHandleTextInput = buttons.handleTextInput;
    const originalScreenForPayload = buttons.screenForPayload;
    const originalIsCleanButtonAction = buttons.isCleanButtonAction;

    if (typeof originalEditMessage === 'function' && !max.__adminkitPr199ButtonsWizardEditPatched) {
      max.editMessage = async function editMessagePr199(args = {}) {
        const text = clean(args.text || '');
        const mid = clean(args.messageId || '');
        const pending = isButtonsWizardText(text) ? consumePendingWizardEdit(text, mid) : null;
        const result = await originalEditMessage.apply(this, arguments);
        const resultMid = clean(args.messageId || resultMessageId(result));
        if (pending && resultMid) rememberButtonScreen(store, pending.userId, resultMid, text);
        return result;
      };
      max.__adminkitPr199ButtonsWizardEditPatched = true;
    }

    if (typeof originalSendMessage === 'function' && !max.__adminkitPr199ButtonsWizardPatched) {
      max.sendMessage = async function sendMessagePr199(args = {}) {
        const userId = clean(args.userId || '');
        const chatId = clean(args.chatId || '');
        const text = clean(args.text || '');
        if (userId && !chatId && isButtonsWizardText(text)) {
          const state = setup(store, userId);
          const previousMessageId = clean(state.buttonsActiveScreenMessageId || '');
          if (previousMessageId) {
            try {
              const edited = await max.editMessage({ botToken: args.botToken, messageId: previousMessageId, text: args.text, attachments: args.attachments, format: args.format, link: args.link, notify: false });
              rememberButtonScreen(store, userId, previousMessageId, text);
              return edited || { message: { id: previousMessageId, body: { mid: previousMessageId } }, pr199InplaceEdit: true };
            } catch (error) {
              try { store.setSetupState(userId, { buttonsInplaceEditFailedAt: Date.now(), buttonsInplaceEditFailedRuntime: RUNTIME, buttonsInplaceEditFailedMessage: short(error && error.message || error, 160) }); } catch {}
            }
          }
        }
        const result = await originalSendMessage.apply(this, arguments);
        if (userId && !chatId && isButtonsWizardText(text)) rememberButtonScreen(store, userId, resultMessageId(result), text);
        return result;
      };
      max.__adminkitPr199ButtonsWizardPatched = true;
    }

    if (typeof originalIsCleanButtonAction === 'function' && !buttons.__adminkitPr199ActionPatched) {
      buttons.isCleanButtonAction = function isCleanButtonActionPr199(action = '') {
        return originalIsCleanButtonAction.apply(this, arguments) || clean(action) === 'admin_section_main';
      };
      buttons.__adminkitPr199ActionPatched = true;
    }

    if (typeof originalHandleTextInput === 'function' && !buttons.__adminkitPr199HandlePatched) {
      buttons.handleTextInput = async function handleTextInputPr199(menu, ctx = {}) {
        const screen = await originalHandleTextInput.apply(this, arguments);
        if (isReadyPreviewScreen(screen)) {
          const state = setup(store, ctx.userId);
          rememberPendingPreview(store, ctx.userId, state.buttonFlow);
        }
        rememberPendingWizardEdit(ctx.userId, screen, ctx.update);
        return screen;
      };
      buttons.__adminkitPr199HandlePatched = true;
    }

    if (typeof originalScreenForPayload === 'function' && !buttons.__adminkitPr199ScreenPatched) {
      buttons.screenForPayload = async function screenForPayloadPr199(menu, payload = {}, ctx = {}) {
        const action = clean(payload && payload.action || '');
        if (isCancelOrExitAction(action)) clearPendingPreview(store, ctx.userId);
        if (action === 'button_admin_save') restorePendingPreview(store, ctx.userId);
        const screen = await originalScreenForPayload.apply(this, arguments);
        if (action === 'button_admin_save') {
          const text = clean(screen && screen.text || '');
          if (/Кнопка сохранена/i.test(text)) clearPendingPreview(store, ctx.userId);
        }
        if (isCancelOrExitAction(action)) clearPendingPreview(store, ctx.userId);
        rememberPendingWizardEdit(ctx.userId, screen, ctx.update);
        return screen;
      };
      buttons.__adminkitPr199ScreenPatched = true;
    }

    installState = { ok: true, runtime: RUNTIME, source: SOURCE, installed: true, maxSendPatched: true, maxEditPatched: true, buttonsHandlePatched: true, buttonsSavePatched: true, buttonsCancelClearsPendingPreview: true, buttonsPreviewBackClearsPendingPreview: true, buttonsRecordsActiveScreenOnEdit: true, buttonsPendingEditMessageScoped: true, installOrder: 'after-persistent-store-bootstrap' };
  } catch (error) {
    installState = { ok: false, runtime: RUNTIME, source: SOURCE, installed: false, error: short(error && error.message || error, 240) };
  }
  try { console.log('[pr199-buttons-wizard]', JSON.stringify(installState)); } catch {}
  return installState;
}

module.exports = { RUNTIME, SOURCE, install, info: () => installState, isButtonsWizardText, isButtonFlowReady, isCancelOrExitAction, rememberButtonScreen, restorePendingPreview, updateMessageId };
