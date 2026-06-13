'use strict';

const RUNTIME = 'PR202-BUTTONS-REAL-SHOW-PATH-INPLACE';
const SOURCE = 'adminkit-pr202-buttons-real-show-path-inplace';

let installed = false;
let installState = { ok: false, runtime: RUNTIME, source: SOURCE, installed: false };

function clean(value) { return String(value || '').trim(); }
function short(value, max = 160) { const s = clean(value).replace(/\s+/g, ' '); return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1))}…`; }
function isButtonsWizardText(text = '') {
  const s = clean(text);
  return /^(?:[+＋➕]\s*)?Добавление кнопки/i.test(s) || /^(?:[👀]\s*)?Предпросмотр кнопки/i.test(s);
}
function setup(store, userId = '') { try { return store.getSetupState(clean(userId)) || {}; } catch { return {}; } }
function resultMessageId(result = {}, fallback = '') { return clean(result?.message?.body?.mid || result?.message?.id || result?.body?.mid || result?.message_id || result?.messageId || result?.id || fallback); }
function rememberButtonScreen(store, userId = '', messageId = '', text = '') {
  const uid = clean(userId);
  const mid = clean(messageId);
  if (!uid || !mid || !isButtonsWizardText(text)) return false;
  try {
    store.setSetupState(uid, {
      buttonsActiveScreenMessageId: mid,
      buttonsActiveScreenAt: Date.now(),
      buttonsActiveScreenRuntime: RUNTIME,
      buttonsActiveScreenText: short(text, 80),
      buttonsWizardRealShowPathLastDecision: 'remember_active_screen',
      activeAdminFlowKind: 'button'
    });
    return true;
  } catch {
    return false;
  }
}
function trace(timing, type = '', details = {}) {
  try { if (timing && typeof timing.log === 'function') timing.log(type, { runtime: RUNTIME, ...details }); } catch {}
}

function install() {
  if (installed) return installState;
  installed = true;
  try {
    const max = require('./services/maxApi');
    const store = require('./store');
    const timing = require('./v3-ui-timing-cc8');
    if (!max || typeof max.sendMessage !== 'function') throw new Error('max.sendMessage unavailable');
    if (max.__adminkitPr202RealShowPathPatched) {
      installState = { ok: true, runtime: RUNTIME, source: SOURCE, installed: true, already: true, buttonsWizardRealShowPathInplace: true, buttonsWizardTraceCoversShowPath: true };
      return installState;
    }
    const originalSendMessage = max.sendMessage;
    max.sendMessage = async function sendMessagePr202RealShowPath(args = {}) {
      const userId = clean(args.userId || '');
      const chatId = clean(args.chatId || '');
      const text = clean(args.text || '');
      const isWizard = isButtonsWizardText(text);
      if (userId && !chatId && isWizard) {
        const state = setup(store, userId);
        const previousMessageId = clean(state.buttonsActiveScreenMessageId || '');
        trace(timing, 'buttons_wizard_real_show_path_decision', {
          decision: previousMessageId ? 'edit_existing' : 'send_new_no_active_message',
          userId: timing && timing.mask ? timing.mask(userId) : '[masked]',
          messageId: timing && timing.mask ? timing.mask(previousMessageId) : '[masked]',
          text: short(text, 120),
          activeAdminFlowKind: clean(state.activeAdminFlowKind || ''),
          hasButtonFlow: Boolean(state.buttonFlow)
        });
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
            rememberButtonScreen(store, userId, previousMessageId, text);
            try {
              store.setSetupState(userId, {
                buttonsWizardRealShowPathEditedAt: Date.now(),
                buttonsWizardRealShowPathRuntime: RUNTIME,
                buttonsWizardRealShowPathLastDecision: 'edit_existing',
                buttonsWizardRealShowPathLastText: short(text, 120),
                buttonsWizardRealShowPathLastMessageId: previousMessageId
              });
            } catch {}
            trace(timing, 'buttons_wizard_real_show_path_edit_success', {
              decision: 'edit_existing',
              userId: timing && timing.mask ? timing.mask(userId) : '[masked]',
              messageId: timing && timing.mask ? timing.mask(previousMessageId) : '[masked]',
              text: short(text, 120)
            });
            return edited || { message: { id: previousMessageId, body: { mid: previousMessageId } }, pr202RealShowPathInplaceEdit: true };
          } catch (error) {
            const message = short(error && error.message || error, 180);
            try {
              store.setSetupState(userId, {
                buttonsWizardRealShowPathEditFailedAt: Date.now(),
                buttonsWizardRealShowPathRuntime: RUNTIME,
                buttonsWizardRealShowPathLastDecision: 'fallback_send_after_edit_failed',
                buttonsWizardRealShowPathEditFailedMessage: message,
                buttonsWizardRealShowPathFailedMessageId: previousMessageId
              });
            } catch {}
            trace(timing, 'buttons_wizard_real_show_path_edit_failed', {
              decision: 'fallback_send_after_edit_failed',
              userId: timing && timing.mask ? timing.mask(userId) : '[masked]',
              messageId: timing && timing.mask ? timing.mask(previousMessageId) : '[masked]',
              error: message
            });
          }
        }
      }
      const result = await originalSendMessage.apply(this, arguments);
      if (userId && !chatId && isWizard) {
        const sentId = resultMessageId(result);
        rememberButtonScreen(store, userId, sentId, text);
        try {
          store.setSetupState(userId, {
            buttonsWizardRealShowPathSentAt: Date.now(),
            buttonsWizardRealShowPathRuntime: RUNTIME,
            buttonsWizardRealShowPathLastDecision: 'send_new',
            buttonsWizardRealShowPathLastText: short(text, 120),
            buttonsWizardRealShowPathLastMessageId: sentId
          });
        } catch {}
        trace(timing, 'buttons_wizard_real_show_path_send_new', {
          decision: 'send_new',
          userId: timing && timing.mask ? timing.mask(userId) : '[masked]',
          messageId: timing && timing.mask ? timing.mask(sentId) : '[masked]',
          text: short(text, 120)
        });
      }
      return result;
    };
    max.__adminkitPr202RealShowPathPatched = true;
    installState = {
      ok: true,
      runtime: RUNTIME,
      source: SOURCE,
      installed: true,
      buttonsWizardRealShowPathInplace: true,
      buttonsWizardTraceCoversShowPath: true,
      plusSignWizardTextSupported: true,
      patchesMaxSendMessageAfterPr199: true
    };
  } catch (error) {
    installState = { ok: false, runtime: RUNTIME, source: SOURCE, installed: false, error: short(error && error.message || error, 240) };
  }
  try { console.log('[pr202-buttons-real-show-path]', JSON.stringify(installState)); } catch {}
  return installState;
}

module.exports = { RUNTIME, SOURCE, install, info: () => installState, isButtonsWizardText };
