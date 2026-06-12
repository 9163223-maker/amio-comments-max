'use strict';

const RUNTIME = 'PR199-BUTTONS-WIZARD-INPLACE-SAVE-FALLBACK';
const SOURCE = 'adminkit-pr199-buttons-wizard-inplace-save-fallback';

let installed = false;
let installState = { ok: false, runtime: RUNTIME, source: SOURCE, installed: false };

function clean(value) { return String(value || '').trim(); }
function short(value, max = 120) { const s = clean(value).replace(/\s+/g, ' '); return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1))}…`; }
function isButtonsWizardText(text = '') { return /^(➕\s*)?Добавление кнопки|^(👀\s*)?Предпросмотр кнопки/i.test(clean(text)); }
function isReadyPreviewScreen(screen = null) { return clean(screen && screen.id) === 'buttons_clean_add_preview'; }
function isButtonFlowReady(flow = null) { const draft = flow && flow.draft || {}; return Boolean(flow && Number(flow.stepIndex || 0) >= 2 && clean(draft.text) && clean(draft.url) && flow.targetPost && clean(flow.targetPost.commentKey)); }
function clonePlain(value) { try { return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : null; } catch { return null; } }
function setup(store, userId = '') { try { return store.getSetupState(clean(userId)) || {}; } catch { return {}; } }
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
  if (isButtonFlowReady(state.buttonFlow)) return true;
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
    const originalHandleTextInput = buttons.handleTextInput;
    const originalScreenForPayload = buttons.screenForPayload;

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
              const edited = await max.editMessage({
                botToken: args.botToken,
                messageId: previousMessageId,
                text: args.text,
                attachments: args.attachments,
                format: args.format,
                link: args.link,
                notify: false
              });
              try {
                store.setSetupState(userId, {
                  buttonsActiveScreenMessageId: previousMessageId,
                  buttonsActiveScreenAt: Date.now(),
                  buttonsInplaceEditRuntime: RUNTIME,
                  buttonsInplaceEditText: short(text, 80)
                });
              } catch {}
              return edited || { message: { id: previousMessageId, body: { mid: previousMessageId } }, pr199InplaceEdit: true };
            } catch (error) {
              try {
                store.setSetupState(userId, {
                  buttonsInplaceEditFailedAt: Date.now(),
                  buttonsInplaceEditFailedRuntime: RUNTIME,
                  buttonsInplaceEditFailedMessage: short(error && error.message || error, 160)
                });
              } catch {}
            }
          }
        }
        return originalSendMessage.apply(this, arguments);
      };
      max.__adminkitPr199ButtonsWizardPatched = true;
    }

    if (typeof originalHandleTextInput === 'function' && !buttons.__adminkitPr199HandlePatched) {
      buttons.handleTextInput = async function handleTextInputPr199(menu, ctx = {}) {
        const screen = await originalHandleTextInput.apply(this, arguments);
        if (isReadyPreviewScreen(screen)) {
          const state = setup(store, ctx.userId);
          rememberPendingPreview(store, ctx.userId, state.buttonFlow);
        }
        return screen;
      };
      buttons.__adminkitPr199HandlePatched = true;
    }

    if (typeof originalScreenForPayload === 'function' && !buttons.__adminkitPr199ScreenPatched) {
      buttons.screenForPayload = async function screenForPayloadPr199(menu, payload = {}, ctx = {}) {
        const action = clean(payload && payload.action || '');
        if (action === 'button_admin_save') restorePendingPreview(store, ctx.userId);
        const screen = await originalScreenForPayload.apply(this, arguments);
        if (action === 'button_admin_save') {
          const text = clean(screen && screen.text || '');
          if (/Кнопка сохранена/i.test(text)) clearPendingPreview(store, ctx.userId);
        }
        return screen;
      };
      buttons.__adminkitPr199ScreenPatched = true;
    }

    installState = { ok: true, runtime: RUNTIME, source: SOURCE, installed: true, maxSendPatched: true, buttonsHandlePatched: true, buttonsSavePatched: true, installOrder: 'after-persistent-store-bootstrap' };
  } catch (error) {
    installState = { ok: false, runtime: RUNTIME, source: SOURCE, installed: false, error: short(error && error.message || error, 240) };
  }
  try { console.log('[pr199-buttons-wizard]', JSON.stringify(installState)); } catch {}
  return installState;
}

module.exports = { RUNTIME, SOURCE, install, info: () => installState, isButtonsWizardText, isButtonFlowReady };
