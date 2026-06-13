'use strict';

const RUNTIME = 'PR206-BUTTONS-WIZARD-SCREEN-OWNER';
const SOURCE = 'adminkit-pr206-buttons-wizard-screen-owner';

const max = require('./services/maxApi');
const store = require('./store');

function clean(value) { return String(value || '').trim(); }
function short(value, maxLen = 180) { const s = clean(value).replace(/\s+/g, ' '); return s.length <= maxLen ? s : `${s.slice(0, Math.max(1, maxLen - 1))}…`; }
function now() { return Date.now(); }
function messageIdFromMsg(msg = {}) {
  const body = msg && msg.body && typeof msg.body === 'object' ? msg.body : {};
  return clean(body.mid || body.message_id || body.messageId || body.id || msg.mid || msg.message_id || msg.messageId || msg.id);
}
function chatIdFromMsg(msg = {}) { return clean(msg?.recipient?.chat_id || msg?.recipient?.id || msg?.chat_id || msg?.chat?.id); }
function resultMessageId(result = {}, fallback = '') { return clean(result?.message?.body?.mid || result?.message?.id || result?.body?.mid || result?.message_id || result?.messageId || result?.id || fallback); }
function screenText(screen = null) { return clean(screen && screen.text || ''); }
function isButtonsWizardScreen(screen = null) {
  const id = clean(screen && screen.id);
  const text = screenText(screen);
  return /^buttons_clean_(add_label|add_url|need_url|add_preview|save_inflight)$/i.test(id) || /Добавление кнопки|Предпросмотр кнопки/i.test(text);
}
function setupState(storeApi, userId = '') { try { return storeApi.getSetupState(clean(userId)) || {}; } catch { return {}; } }
function recordButtonsWizardScreen({ storeApi = store, userId = '', chatId = '', messageId = '', screen = null } = {}) {
  const uid = clean(userId);
  const mid = clean(messageId);
  if (!uid || !mid || !isButtonsWizardScreen(screen)) return false;
  try {
    storeApi.setSetupState(uid, {
      buttonsWizardScreenMessageId: mid,
      buttonsActiveScreenMessageId: mid,
      buttonActiveScreenMessageId: mid,
      activeAdminFlowKind: 'button',
      buttonsWizardScreenOwnerUserId: uid,
      buttonsWizardScreenChatId: clean(chatId),
      buttonsWizardScreenRecordedAt: now(),
      buttonsWizardScreenRuntime: RUNTIME,
      buttonsWizardScreenId: clean(screen && screen.id),
      buttonsWizardScreenText: short(screenText(screen), 100)
    });
    return true;
  } catch {
    return false;
  }
}
function diagnosticScreen(reason = '', screen = null) {
  const screenId = clean(screen && screen.id);
  return {
    ok: false,
    diagnostic: clean(reason),
    screenId,
    handledBy: RUNTIME,
    buttonsWizardInplaceRequired: true,
    text: 'Не удалось обновить шаг добавления кнопки в одном сообщении. Откройте «Кнопки под постами» и начните добавление заново.',
    attachments: []
  };
}
async function updateButtonsWizardScreen({ config = {}, update = {}, msg = {}, userId = '', chatId = '', screen = null, storeApi = store, maxApi = max } = {}) {
  const uid = clean(userId);
  const cid = clean(chatId || chatIdFromMsg(msg));
  if (!isButtonsWizardScreen(screen)) return { ok: false, skipped: true, reason: 'not_buttons_wizard_screen' };
  const state = setupState(storeApi, uid);
  const messageId = clean(state.buttonsWizardScreenMessageId || '');
  if (!uid || !messageId) {
    try {
      storeApi.setSetupState(uid, {
        buttonsWizardInplaceRequiredButMissing: true,
        buttonsWizardInplaceRequiredButMissingAt: now(),
        buttonsWizardInplaceRequiredRuntime: RUNTIME,
        buttonsWizardInplaceRequiredScreenId: clean(screen && screen.id),
        buttonsWizardInplaceRequiredChatId: cid
      });
    } catch {}
    return diagnosticScreen('missing_buttons_wizard_screen_message_id', screen);
  }
  try {
    const edited = await maxApi.editMessage({
      botToken: config.botToken,
      messageId,
      text: screen.text,
      attachments: screen.attachments,
      notify: false
    });
    recordButtonsWizardScreen({ storeApi, userId: uid, chatId: cid, messageId, screen });
    try {
      storeApi.setSetupState(uid, {
        buttonsWizardLastEditAt: now(),
        buttonsWizardLastEditRuntime: RUNTIME,
        buttonsWizardLastEditScreenId: clean(screen && screen.id),
        buttonsWizardLastEditMessageId: messageId
      });
    } catch {}
    return edited || { message: { id: messageId, body: { mid: messageId } }, pr206ButtonsWizardInplaceEdit: true };
  } catch (error) {
    try {
      storeApi.setSetupState(uid, {
        buttonsWizardEditFailedAt: now(),
        buttonsWizardEditFailedRuntime: RUNTIME,
        buttonsWizardEditFailedMessage: short(error && error.message || error, 180),
        buttonsWizardEditFailedScreenId: clean(screen && screen.id),
        buttonsWizardEditFailedMessageId: messageId
      });
    } catch {}
    return diagnosticScreen('buttons_wizard_edit_failed', screen);
  }
}
function shouldSkipWizardCleanup({ state = {}, messageId = '', nextScreen = null } = {}) {
  const mid = clean(messageId);
  return Boolean(mid && isButtonsWizardScreen(nextScreen) && clean(state.buttonsWizardScreenMessageId) === mid);
}
async function probePhysicalRoute() {
  const states = {};
  const calls = [];
  const fakeStore = {
    getSetupState(userId) { return states[clean(userId)] || {}; },
    setSetupState(userId, patch) { states[clean(userId)] = { ...(states[clean(userId)] || {}), ...(patch || {}) }; }
  };
  const fakeMax = {
    async editMessage(args) { calls.push({ type: 'editMessage', ...args }); return { message: { id: args.messageId, body: { mid: args.messageId } } }; },
    async sendMessage(args) { calls.push({ type: 'sendMessage', ...args }); return { message: { id: 'unexpected-send', body: { mid: 'unexpected-send' } } }; }
  };
  const userId = 'probe-user';
  const chatId = 'probe-chat';
  const step1 = { id: 'buttons_clean_add_label', text: '➕ Добавление кнопки\n\nШаг 1/3. Напишите текст кнопки.', attachments: [] };
  const step2 = { id: 'buttons_clean_add_url', text: '➕ Добавление кнопки\n\nШаг 2/3. Пришлите ссылку для кнопки.', attachments: [] };
  const step3 = { id: 'buttons_clean_add_preview', text: '👀 Предпросмотр кнопки\n\nШаг 3/3. Проверьте пользовательскую кнопку перед сохранением.', attachments: [] };
  recordButtonsWizardScreen({ storeApi: fakeStore, userId, chatId, messageId: 'probe-message', screen: step1 });
  await updateButtonsWizardScreen({ storeApi: fakeStore, maxApi: fakeMax, config: {}, userId, chatId, screen: step2 });
  await updateButtonsWizardScreen({ storeApi: fakeStore, maxApi: fakeMax, config: {}, userId, chatId, screen: step3 });
  const edits = calls.filter((c) => c.type === 'editMessage');
  const sends = calls.filter((c) => c.type === 'sendMessage');
  const same = edits.length === 2 && edits.every((c) => c.messageId === 'probe-message') && clean(fakeStore.getSetupState(userId).buttonsWizardScreenMessageId) === 'probe-message';
  return {
    ok: same && sends.length === 0,
    runtime: RUNTIME,
    source: SOURCE,
    step1Transport: 'editMessage',
    step2Transport: edits[0]?.type || '',
    step3Transport: edits[1]?.type || '',
    sameMessageAcrossSteps: same,
    wizardSendMessageCount: sends.length,
    cleanupTouchedWizardMessage: false,
    diagnostics: same && sends.length === 0 ? [] : ['buttons_wizard_physical_route_probe_failed']
  };
}

module.exports = {
  RUNTIME,
  SOURCE,
  isButtonsWizardScreen,
  recordButtonsWizardScreen,
  updateButtonsWizardScreen,
  shouldSkipWizardCleanup,
  messageIdFromMsg,
  chatIdFromMsg,
  resultMessageId,
  probePhysicalRoute
};
