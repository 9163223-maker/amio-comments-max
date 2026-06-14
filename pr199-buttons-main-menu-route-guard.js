'use strict';

const RUNTIME = 'PR199-BUTTONS-MAIN-MENU-ROUTE-GUARD';
const SOURCE = 'adminkit-pr199-buttons-main-menu-route-guard';
let installed = false;
let installState = { ok: false, runtime: RUNTIME, source: SOURCE, installed: false };

function clean(value) { return String(value || '').trim(); }
function isWizard(text = '') { return /Добавление кнопки|Предпросмотр кнопки/i.test(clean(text)); }
function resultMid(result = {}, fallback = '') { return clean(result?.message?.body?.mid || result?.message?.id || result?.body?.mid || result?.message_id || result?.messageId || result?.id || fallback); }
function short(value, max = 160) { const s = clean(value).replace(/\s+/g, ' '); return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1))}…`; }

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
    const originalSend = max.sendMessage;
    if (typeof originalSend === 'function' && !max.__adminkitPr199ChatIdWizardSendGuard) {
      max.sendMessage = async function sendMessagePr199ChatIdGuard(args = {}) {
        const explicitUserId = clean(args.userId || '');
        const chatId = clean(args.chatId || '');
        const text = clean(args.text || '');
        const effectiveUserId = explicitUserId || (chatId && isWizard(text) ? chatId : '');
        if (!explicitUserId && effectiveUserId && isWizard(text) && !args.pr215FreshWizard) {
          const state = store.getSetupState(effectiveUserId) || {};
          const activeMessageId = clean(state.buttonsWizardScreenMessageId || state.buttonsActiveScreenMessageId || '');
          if (activeMessageId && typeof max.editMessage === 'function') {
            try {
              const edited = await max.editMessage({ botToken: args.botToken, messageId: activeMessageId, text: args.text, attachments: args.attachments, format: args.format, link: args.link, notify: false });
              store.setSetupState(effectiveUserId, { buttonsWizardScreenMessageId: activeMessageId, buttonsActiveScreenMessageId: activeMessageId, buttonActiveScreenMessageId: activeMessageId, buttonsActiveScreenAt: Date.now(),
      buttonsWizardScreenRecordedAt: Date.now(), buttonsWizardScreenOwnerUserId: effectiveUserId, buttonsWizardScreenChatId: chatId, buttonsActiveScreenRuntime: RUNTIME, activeAdminFlowKind: 'button' });
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
          if (messageId) store.setSetupState(effectiveUserId, { buttonsWizardScreenMessageId: messageId, buttonsActiveScreenMessageId: messageId, buttonActiveScreenMessageId: messageId, buttonsActiveScreenAt: Date.now(),
      buttonsWizardScreenRecordedAt: Date.now(), buttonsWizardScreenOwnerUserId: effectiveUserId, buttonsWizardScreenChatId: chatId, buttonsActiveScreenRuntime: RUNTIME, activeAdminFlowKind: 'button' });
        }
        return result;
      };
      max.__adminkitPr199ChatIdWizardSendGuard = true;
    }
    installState = { ok: true, runtime: RUNTIME, source: SOURCE, installed: true, mainMenuUsesPublicRoute: true, chatIdWizardSendGuard: true, chatIdWizardEditForwardsBotToken: true, chatIdWizardEditFallsBackToSend: true };
  } catch (error) {
    installState = { ok: false, runtime: RUNTIME, source: SOURCE, installed: false, error: clean(error && error.message || error).slice(0, 240) };
  }
  try { console.log('[pr199-buttons-main-menu-route-guard]', JSON.stringify(installState)); } catch {}
  return installState;
}

module.exports = { RUNTIME, SOURCE, install, info: () => installState };
