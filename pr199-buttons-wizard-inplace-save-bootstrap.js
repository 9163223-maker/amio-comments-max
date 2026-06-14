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
  const callback = update?.callback || update?.data?.callback || update?.message?.callback || update?.data?.message?.callback || {};
  const msg = update?.message || update?.data?.message || callback.message || {};
  const body = msg && msg.body && typeof msg.body === 'object' ? msg.body : {};
  const cbBody = callback.message && callback.message.body && typeof callback.message.body === 'object' ? callback.message.body : {};
  return clean(body.mid || body.message_id || body.messageId || body.id || msg.mid || msg.message_id || msg.messageId || msg.id || cbBody.mid || cbBody.message_id || cbBody.messageId || cbBody.id || callback.message_id || callback.messageId || callback.mid || callback.id);
}
function rememberButtonScreen(store, userId = '', messageId = '', text = '') {
  const uid = clean(userId);
  const mid = clean(messageId);
  if (!uid || !mid) return false;
  try {
    store.setSetupState(uid, {
      buttonsWizardScreenMessageId: mid,
      buttonsActiveScreenMessageId: mid,
      buttonsActiveScreenAt: Date.now(),
      buttonsWizardScreenRecordedAt: Date.now(),
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
function saveInFlight(state = null) { return Boolean(Number(state && state.buttonsPendingPreviewSaveInFlightAt || 0)); }
function saveInFlightScreen() { return { id: 'buttons_clean_save_inflight', text: 'Сохранение кнопки уже выполняется. Подождите результат.', attachments: [] }; }
function clearSaveInFlightPatch() { return { buttonsPendingPreviewSaveInFlightAt: 0, buttonsPendingPreviewSaveInFlightRuntime: '', buttonsPendingPreviewSaveInFlightToken: '' }; }
function beginButtonSave(store, userId = '') {
  const uid = clean(userId);
  if (!uid) return { ok: false, reason: 'missing_user' };
  const state = setup(store, uid);
  if (saveInFlight(state)) return { ok: false, duplicate: true, reason: 'save_in_flight' };
  const now = Date.now();
  const token = `${now}:${Math.random().toString(36).slice(2, 10)}`;
  const basePatch = {
    activeAdminFlowKind: 'button',
    buttonsPendingPreview: null,
    buttonsPendingPreviewAt: 0,
    buttonsPendingPreviewConsumedAt: state.buttonsPendingPreview ? now : Number(state.buttonsPendingPreviewConsumedAt || 0),
    buttonsPendingPreviewConsumedRuntime: state.buttonsPendingPreview ? RUNTIME : clean(state.buttonsPendingPreviewConsumedRuntime || ''),
    buttonsPendingPreviewSaveInFlightAt: now,
    buttonsPendingPreviewSaveInFlightRuntime: RUNTIME,
    buttonsPendingPreviewSaveInFlightToken: token
  };
  if (isButtonFlowReady(state.buttonFlow)) {
    try {
      store.setSetupState(uid, basePatch);
      return { ok: true, restored: false, token };
    } catch (error) {
      return { ok: false, reason: 'store_error', error };
    }
  }
  if (!isButtonFlowReady(state.buttonsPendingPreview)) return { ok: false, reason: 'no_ready_draft' };
  try {
    store.setSetupState(uid, {
      ...basePatch,
      buttonFlow: clonePlain(state.buttonsPendingPreview),
      buttonsPendingPreviewRestoredAt: now,
      buttonsPendingPreviewRestoredRuntime: RUNTIME
    });
    return { ok: true, restored: true, token };
  } catch (error) {
    return { ok: false, reason: 'store_error', error };
  }
}
function finishButtonSave(store, userId = '', token = '', screen = null, error = null) {
  const uid = clean(userId);
  if (!uid) return false;
  try {
    const state = setup(store, uid);
    const patch = {
      ...clearSaveInFlightPatch(),
      buttonsPendingPreviewSaveFinishedAt: Date.now(),
      buttonsPendingPreviewSaveFinishedRuntime: RUNTIME,
      buttonsPendingPreviewSaveFinishedText: short(screen && screen.text || '', 120)
    };
    if (token && clean(state.buttonsPendingPreviewSaveInFlightToken) !== clean(token)) return false;
    if (error) patch.buttonsPendingPreviewSaveFinishedError = short(error && error.message || error, 160);
    store.setSetupState(uid, patch);
    return true;
  } catch {
    return false;
  }
}
function restorePendingPreview(store, userId = '') {
  return Boolean(beginButtonSave(store, userId).ok);
}
function clearPendingPreview(store, userId = '') {
  const uid = clean(userId);
  if (!uid) return false;
  try {
    store.setSetupState(uid, {
      buttonsPendingPreview: null,
      buttonsPendingPreviewAt: 0,
      buttonsPendingPreviewClearedAt: Date.now(),
      buttonsPendingPreviewClearedRuntime: RUNTIME,
      ...clearSaveInFlightPatch()
    });
    return true;
  } catch {
    return false;
  }
}
function patchSetupState(store) {
  if (!store || typeof store.setSetupState !== 'function' || store.__adminkitPr199SetupStatePatched) return false;
  const original = store.setSetupState;
  store.setSetupState = function setSetupStatePr199(userId, patch = {}) {
    let next = patch;
    try {
      if (patch && typeof patch === 'object' && !Array.isArray(patch) && !Object.prototype.hasOwnProperty.call(patch, 'buttonsPendingPreview')) {
        const clearsFlow = Object.prototype.hasOwnProperty.call(patch, 'buttonFlow') && !patch.buttonFlow;
        const leavesButton = Object.prototype.hasOwnProperty.call(patch, 'activeAdminFlowKind') && clean(patch.activeAdminFlowKind) !== 'button';
        const current = setup(store, userId);
        if ((clearsFlow || leavesButton) && current && (current.buttonsPendingPreview || saveInFlight(current))) {
          next = { ...patch, buttonsPendingPreview: null, buttonsPendingPreviewAt: 0, buttonsPendingPreviewClearedAt: Date.now(), buttonsPendingPreviewClearedRuntime: RUNTIME, ...clearSaveInFlightPatch() };
        }
      }
    } catch {}
    return original.call(this, userId, next);
  };
  store.__adminkitPr199SetupStatePatched = true;
  return true;
}

function install() {
  if (installed) return installState;
  installed = true;
  try {
    const max = require('./services/maxApi');
    const store = require('./store');
    const buttons = require('./buttons-flow-cc8-clean');
    const setupStatePatched = patchSetupState(store);
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
        if (userId && !chatId && isButtonsWizardText(text) && !args.pr215FreshWizard) {
          const state = setup(store, userId);
          const previousMessageId = clean(state.buttonsWizardScreenMessageId || state.buttonsActiveScreenMessageId || '');
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
        let saveToken = '';
        if (isCancelOrExitAction(action)) clearPendingPreview(store, ctx.userId);
        if (action === 'button_admin_save') {
          const saveStart = beginButtonSave(store, ctx.userId);
          if (saveStart.duplicate) {
            const duplicateScreen = saveInFlightScreen();
            rememberPendingWizardEdit(ctx.userId, duplicateScreen, ctx.update);
            return duplicateScreen;
          }
          if (saveStart.ok) saveToken = saveStart.token || '';
        }
        let screen;
        try {
          screen = await originalScreenForPayload.apply(this, arguments);
        } catch (error) {
          if (action === 'button_admin_save' && saveToken) finishButtonSave(store, ctx.userId, saveToken, null, error);
          throw error;
        }
        if (action === 'button_admin_save' && saveToken) finishButtonSave(store, ctx.userId, saveToken, screen);
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

    installState = { ok: true, runtime: RUNTIME, source: SOURCE, installed: true, maxSendPatched: true, maxEditPatched: true, buttonsHandlePatched: true, buttonsSavePatched: true, buttonsCancelClearsPendingPreview: true, buttonsPreviewBackClearsPendingPreview: true, buttonsRecordsActiveScreenOnEdit: true, buttonsPendingEditMessageScoped: true, buttonsPendingPreviewConsumedBeforeSave: true, buttonsDuplicateSaveGuarded: true, buttonsSaveGuardClearedOnExit: true, callbackFlatMessageIdSupported: true, buttonsPendingPreviewClearedOnFlowClear: setupStatePatched, installOrder: 'after-persistent-store-bootstrap' };
  } catch (error) {
    installState = { ok: false, runtime: RUNTIME, source: SOURCE, installed: false, error: short(error && error.message || error, 240) };
  }
  try { console.log('[pr199-buttons-wizard]', JSON.stringify(installState)); } catch {}
  return installState;
}

module.exports = { RUNTIME, SOURCE, install, info: () => installState, isButtonsWizardText, isButtonFlowReady, isCancelOrExitAction, rememberButtonScreen, restorePendingPreview, updateMessageId, patchSetupState, beginButtonSave, finishButtonSave, clearPendingPreview };