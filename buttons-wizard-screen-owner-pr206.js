'use strict';

const RUNTIME = 'PR217-BUTTONS-WIZARD-DB-BOUND-PREVIEW';
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
    const current = setupState(storeApi, uid);
    const flow = current.buttonFlow || {};
    const target = flow.targetPost || {};
    const isPreview = clean(screen && screen.id) === 'buttons_clean_add_preview';
    storeApi.setSetupState(uid, {
      buttonsWizardScreenMessageId: mid,
      buttonsActiveScreenMessageId: mid,
      buttonActiveScreenMessageId: mid,
      activeAdminFlowKind: 'button',
      buttonsWizardScreenOwnerUserId: uid,
      buttonsWizardScreenChatId: clean(chatId),
      buttonsWizardScreenRecordedAt: now(),
      buttonsWizardScreenRuntime: RUNTIME,
      buttonsWizardFreshCurrentScreen: true,
      buttonsWizardScreenId: clean(screen && screen.id),
      buttonsWizardScreenText: short(screenText(screen), 100),
      ...(isPreview ? {
        buttonsActivePreviewMessageId: mid,
        buttonsActivePreviewFlowId: clean(flow.flowId),
        buttonsActivePreviewUserId: uid,
        buttonsActivePreviewCommentKey: clean(target.commentKey),
        buttonsActivePreviewChannelId: clean(target.channelId || target.requiredChatId),
        buttonsActivePreviewPostId: clean(target.postId),
        buttonsActivePreviewAt: now(),
        buttonsActivePreviewRuntime: RUNTIME
      } : {})
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
async function closePreviousWizardScreen({ config = {}, storeApi = store, maxApi = max, userId = '', skipMessageId = '', messageId = '' } = {}) {
  const uid = clean(userId);
  if (!uid) return false;
  const state = setupState(storeApi, uid);
  const previousMessageId = clean(messageId || state.buttonsWizardScreenMessageId || state.buttonsActiveScreenMessageId || '');
  if (!previousMessageId || previousMessageId === clean(skipMessageId)) return false;
  try {
    await maxApi.editMessage({ botToken: config.botToken, messageId: previousMessageId, text: '✅ Предыдущий шаг закрыт', attachments: [], notify: false });
    storeApi.setSetupState(uid, { buttonsWizardClosedScreenMessageId: previousMessageId, buttonsWizardClosedScreenAt: now(), buttonsWizardClosedScreenRuntime: RUNTIME });
    return true;
  } catch (error) {
    try { storeApi.setSetupState(uid, { buttonsWizardCloseFailedAt: now(), buttonsWizardCloseFailedMessage: short(error && error.message || error, 180), buttonsWizardCloseFailedMessageId: previousMessageId }); } catch {}
    return false;
  }
}
async function updateButtonsWizardScreen({ config = {}, update = {}, msg = {}, userId = '', chatId = '', screen = null, storeApi = store, maxApi = max } = {}) {
  const uid = clean(userId);
  const cid = clean(chatId || chatIdFromMsg(msg));
  if (!isButtonsWizardScreen(screen)) return { ok: false, skipped: true, reason: 'not_buttons_wizard_screen' };
  if (!uid && !cid) return diagnosticScreen('missing_user_or_chat_for_fresh_wizard_screen', screen);
  const stateBeforeSend = setupState(storeApi, uid);
  const previousWizardMessageId = clean(stateBeforeSend.buttonsWizardScreenMessageId || stateBeforeSend.buttonsActiveScreenMessageId || '');
  try {
    const result = await maxApi.sendMessage({ botToken: config.botToken, userId: cid ? '' : uid, chatId: cid, text: screen.text, attachments: screen.attachments, notify: false, pr215FreshWizard: true });
    const sentId = resultMessageId(result);
    recordButtonsWizardScreen({ storeApi, userId: uid, chatId: cid, messageId: sentId, screen });
    try {
      storeApi.setSetupState(uid, {
        buttonsWizardLastRenderAt: now(),
        buttonsWizardLastRenderRuntime: RUNTIME,
        buttonsWizardLastRenderMethod: 'sendMessage',
        buttonsWizardLastRenderScreenId: clean(screen && screen.id),
        buttonsWizardLastRenderMessageId: sentId
      });
    } catch {}
    await closePreviousWizardScreen({ config, storeApi, maxApi, userId: uid, skipMessageId: sentId, messageId: previousWizardMessageId });
    return result || { message: { id: sentId, body: { mid: sentId } }, pr215FreshCurrentScreen: true };
  } catch (error) {
    try {
      storeApi.setSetupState(uid, { buttonsWizardSendFailedAt: now(), buttonsWizardSendFailedRuntime: RUNTIME, buttonsWizardSendFailedMessage: short(error && error.message || error, 180), buttonsWizardSendFailedScreenId: clean(screen && screen.id) });
    } catch {}
    return diagnosticScreen('buttons_wizard_send_failed', screen);
  }
}
function shouldSkipWizardCleanup() { return false; }
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
    ok: sends.length === 2,
    runtime: RUNTIME,
    source: SOURCE,
    step1Transport: 'sendMessage',
    step2Transport: sends[0]?.type || '',
    step3Transport: sends[1]?.type || '',
    sameMessageAcrossSteps: false,
    wizardSendMessageCount: sends.length,
    cleanupTouchedWizardMessage: edits.length > 0,
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
