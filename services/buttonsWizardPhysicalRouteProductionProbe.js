'use strict';

const assert = require('assert');

const USER_ID = 'real-user-1';
const CHAT_ID = 'chat-1';
const MESSAGE_ID = 'wizard-host-msg';
const CARD_ID = 'card-pr206';

function clone(value) { try { return JSON.parse(JSON.stringify(value)); } catch { return null; } }
function wizardSendCalls(sendCalls) { return sendCalls.filter((call) => /Добавление кнопки|Предпросмотр кнопки/i.test(String(call.text || ''))); }
function closedWizardEdits(editCalls) { return editCalls.filter((call) => /Предыдущий шаг закрыт/i.test(String(call.text || ''))); }
function callbackUpdate() { return { update_type: 'message_callback', callback: { callback_id: 'cb-step-1', user_id: USER_ID, payload: JSON.stringify({ action: 'button_admin_start_add', cardId: CARD_ID }), message: { id: MESSAGE_ID, body: { mid: MESSAGE_ID, text: 'selected post card' }, recipient: { chat_id: CHAT_ID, chat_type: 'dialog' } } } }; }
function callbackUpdateWithPayload(payload = {}, messageId = MESSAGE_ID, suffix = 'save') { return { update_type: 'message_callback', callback: { callback_id: `cb-${suffix}-${Date.now()}-${Math.random()}`, user_id: USER_ID, payload: JSON.stringify(payload), message: { id: messageId, body: { mid: messageId, text: 'wizard preview' }, recipient: { chat_id: CHAT_ID, chat_type: 'dialog' } } } }; }
function payloadFromButton(button = {}) { const raw = button.payload !== undefined ? button.payload : button.data; if (raw && typeof raw === 'object') return raw; try { return JSON.parse(String(raw || '{}')); } catch { return {}; } }
function findButtonPayload(sendCall = {}, action = '') { const rows = sendCall?.attachments?.[0]?.payload?.buttons || sendCall?.attachments || []; const flat = Array.isArray(rows) ? rows.flat(Infinity) : []; for (const button of flat) { const payload = payloadFromButton(button); if (payload.action === action || payload.route === action) return payload; } return {}; }
function textUpdate(text) { return { update_type: 'message_created', message: { id: `user-msg-${text.length}`, body: { mid: `user-msg-${text.length}`, text }, sender: { user_id: USER_ID }, recipient: { chat_id: CHAT_ID, chat_type: 'dialog' } } }; }
function linkPreviewUpdate({ text = '', url = 'HTTP://olga.style' } = {}) { return { update_type: 'message_created', message: { id: `user-msg-link-${text.length || 'metadata'}`, body: { mid: `user-msg-link-${text.length || 'metadata'}`, text, link: { url, canonical_url: url.toLowerCase(), targetUrl: url }, preview: { url, title: 'Olga Style' }, attachments: [{ type: 'link_preview', payload: { url, canonicalUrl: url } }] }, preview: { url }, attachments: [{ type: 'link', payload: { url } }], sender: { user_id: USER_ID }, recipient: { chat_id: CHAT_ID, chat_type: 'dialog' } } }; }

function realMaxUrlUpdate(shape = 'body.link.url', url = 'Http://sports.ru') {
  const msg = { id: `user-msg-${shape}`, body: { mid: `user-msg-${shape}`, text: '' }, sender: { user_id: USER_ID }, recipient: { chat_id: CHAT_ID, chat_type: 'dialog' } };
  if (shape === 'body.text') msg.body.text = url;
  else if (shape === 'msg.text') msg.text = url;
  else if (shape === 'body.link.url') msg.body.link = { url };
  else if (shape === 'body.preview.url') msg.body.preview = { url };
  else if (shape === 'msg.link.url') msg.link = { url };
  else if (shape === 'msg.preview.url') msg.preview = { url };
  else if (shape === 'body.message.link.url') msg.body.message = { link: { url } };
  else if (shape === 'body.message.preview.url') msg.body.message = { preview: { url } };
  else if (shape === 'message.link.url') msg.message = { link: { url } };
  else if (shape === 'message.preview.url') msg.message = { preview: { url } };
  else if (shape === 'body.attachments.payload.url') msg.body.attachments = [{ type: 'linkPreview', payload: { url } }];
  else if (shape === 'attachments.url') msg.attachments = [{ type: 'url_preview', url }];
  else msg.body.link = { url };
  return { update_type: 'message_created', message: msg };
}

function mediaAttachmentUpdate({ url = 'https://cdn.example.com/private-file.jpg?token=secret&signature=abc' } = {}) { return { update_type: 'message_created', message: { id: 'user-msg-photo-url', body: { mid: 'user-msg-photo-url', text: '', attachments: [{ type: 'photo', payload: { url } }] }, attachments: [{ type: 'file', payload: { url } }], sender: { user_id: USER_ID }, recipient: { chat_id: CHAT_ID, chat_type: 'dialog' } } }; }
function traceText(events = []) { try { return JSON.stringify(events); } catch { return ''; } }
function hasSensitiveTraceLeak(events = []) {
  const raw = traceText(events);
  return /token=|signature=|private\/path|private-file|\?token|https?:\/\/[^\"]+\/[^\"]*(?:token|signature|private)/i.test(raw);
}
function resCollector() { return { statusCode: 0, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return payload; } }; }
async function drive(bot, body) { const res = resCollector(); await bot.handleWebhook({ body }, res, { botToken: 'test-token', menuDeleteTimeoutMs: 1 }); assert.strictEqual(res.statusCode, 200); return res.payload; }

async function runProductionRouteProbe() {
  const originalEnv = {
    ADMINKIT_TEST_MODE: process.env.ADMINKIT_TEST_MODE,
    ADMINKIT_DISABLE_AUTOSTART: process.env.ADMINKIT_DISABLE_AUTOSTART
  };
  process.env.ADMINKIT_TEST_MODE = '1';
  process.env.ADMINKIT_DISABLE_AUTOSTART = '1';
  const store = require('../store');
  const tenant = require('../tenant-scope');
  const max = require('./maxApi');
  const access = require('./clientAccessService');
  const timing = require('../v3-ui-timing-cc8');
  const originalStore = clone(store.store);
  const postsFlow = require('../posts-flow-cc8-clean-wrapper');
  const postPatcher = require('./postPatcher');
  const originals = { editMessage: max.editMessage, sendMessage: max.sendMessage, deleteMessage: max.deleteMessage, answerCallback: max.answerCallback, getChat: max.getChat, postsHandleTextInput: postsFlow.handleTextInput, patchStoredPost: postPatcher.patchStoredPost };
  const editCalls = [];
  const sendCalls = [];
  const deleteCalls = [];
  const answerCalls = [];
  const patchCalls = [];
  try {
    max.editMessage = async function editMessageStub(args = {}) { editCalls.push(args); return { message: { id: args.messageId, body: { mid: args.messageId } } }; };
    max.sendMessage = async function sendMessageStub(args = {}) { const mid = `sent-${sendCalls.length + 1}`; sendCalls.push({ ...args, mid, messageId: mid }); return { message: { id: mid, body: { mid } } }; };
    max.deleteMessage = async function deleteMessageStub(args = {}) { deleteCalls.push(args); return { ok: true }; };
    max.answerCallback = async function answerCallbackStub(args = {}) { answerCalls.push(args); return { ok: true }; };
    max.getChat = async function getChatStub() { return { title: 'Olga Style' }; };
    postPatcher.patchStoredPost = async function patchStoredPostStub(args = {}) { patchCalls.push(args); return { ok: true, customRowsCount: 1 }; };
    let postEditLinkPreviewTextSeen = null;
    postsFlow.handleTextInput = async function postEditTextProbe(menu, ctx = {}) { postEditLinkPreviewTextSeen = ctx.text; return { id: 'post_edit_probe_screen', text: 'Post edit probe screen', attachments: [] }; };

    store.store.posts = {}; store.store.comments = {}; store.store.likes = {}; store.store.reactions = {}; store.store.channels = {}; store.store.setup = {}; store.store.setupState = {}; store.store.growth = { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} };
    if (typeof store.saveStore === 'function') store.saveStore();
    if (typeof access._resetForTests === 'function') access._resetForTests();
    const code = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels: 3, createdByMaxUserId: 'test-admin' });
    const activated = access.activateCode({ maxUserId: USER_ID, name: 'Real User', code: code.code });
    assert.strictEqual(activated.ok, true, 'user activation succeeds');
    assert.strictEqual(access.bindTenantChannel({ tenantId: activated.tenant.tenantId, channelId: 'channel-olga', channelTitle: 'Olga Style', maxChannels: 3 }).ok, true, 'channel bind succeeds');
    await require('../persistent-store-bootstrap').install();
    require('../pr199-buttons-wizard-inplace-save-bootstrap').install();
    require('../pr199-buttons-main-menu-route-guard').install();
    require('../pr202-buttons-real-show-path-inplace').install();

    const ctx = tenant.ensureTenantContext(USER_ID);
    const target = tenant.stampRecord({ channelId: 'channel-olga', channelTitle: 'Olga Style', postId: 'post-1', messageId: 'post-message-1', commentKey: 'channel-olga:post-1', originalText: 'Olga Style launch post', cardId: CARD_ID, createdAt: Date.now(), source: 'buttons_selected_post_card' }, ctx);
    store.setSetupState(USER_ID, { buttonsCurrentCard: target, buttonTargetPost: target, commentTargetPost: target, activeAdminFlowKind: '' });
    const channelFirstPostPicker = require('../clean-bot-channel-first-post-picker-pr90');
    const flowGuard = require('../clean-bot-flow-guard-1546');
    const routeModules = ['clean-bot-channel-first-post-picker-pr90.js', 'clean-bot-flow-guard-1546.js'];
    const bot = channelFirstPostPicker.createCleanBot(flowGuard.createCleanBot(require('../bot')));

    store.setSetupState(USER_ID, { activeAdminFlowKind: 'post_edit_text', postEditFlow: { mode: 'edit_text' }, buttonFlow: null, giftFlow: null });
    await drive(bot, linkPreviewUpdate({ text: '', url: 'HTTP://olga.style/private/path?token=secret&signature=abc' }));
    const postEditLinkPreviewRawTextOk = postEditLinkPreviewTextSeen === '';

    async function runVariant(name, urlUpdate) {
      editCalls.length = 0; sendCalls.length = 0; deleteCalls.length = 0; answerCalls.length = 0; patchCalls.length = 0;
      store.setSetupState(USER_ID, { buttonsCurrentCard: target, buttonTargetPost: target, commentTargetPost: target, buttonFlow: null, postEditFlow: null, activeAdminFlowKind: '', buttonsWizardScreenMessageId: '', buttonsWizardScreenOwnerUserId: '', buttonsWizardEditFailedAt: null, buttonsWizardRealShowPathLastDecision: '', buttonSaveRouteTrace: [] });
      await drive(bot, callbackUpdate());
      await drive(bot, textUpdate('Кнопка'));
      const beforeUrlSendCount = sendCalls.length;
      const step2Send = sendCalls.slice().reverse().find((call) => /Шаг 2\/3/.test(String(call.text || ''))) || null;
      if (timing && typeof timing.clear === 'function') timing.clear();
      const payload = await drive(bot, urlUpdate);
      const beforeSaveState = store.getSetupState(USER_ID);
      const activeFlowIdBeforeSave = String(beforeSaveState.buttonFlow?.flowId || '').trim();
      const urlTraceEvents = timing && typeof timing.list === 'function' ? timing.list(100) : [];
      const urlTraceNames = urlTraceEvents.map((entry) => entry.name).filter(Boolean);
      const previewSend = sendCalls.slice(beforeUrlSendCount).find((call) => /Шаг 3\/3/.test(String(call.text || ''))) || null;
      const savePayload = findButtonPayload(previewSend, 'button_admin_save');
      const beforeSaveSendCount = sendCalls.length;
      if (savePayload.action && timing && typeof timing.clear === 'function') timing.clear();
      const saveResult = savePayload.action ? await drive(bot, callbackUpdateWithPayload(savePayload, previewSend?.mid || previewSend?.messageId || 'preview-msg', 'save')) : null;
      const saveTraceEvents = savePayload.action && timing && typeof timing.list === 'function' ? timing.list(100) : [];
      const saveTraceNames = saveTraceEvents.map((entry) => entry.name).filter(Boolean);
      const saveVisibleText = String((sendCalls.slice(beforeSaveSendCount).find((call) => /Кнопка сохранена|предпросмотр устарел|пост не обновился/i.test(String(call.text || ''))) || {}).text || '');
      const stateAfterSave = clone(store.getSetupState(USER_ID));
      const beforeRepeatStaleSendCount = sendCalls.length;
      const beforeRepeatStaleEditCount = editCalls.length;
      const repeatStaleResult = savePayload.action ? await drive(bot, callbackUpdateWithPayload(savePayload, previewSend?.mid || previewSend?.messageId || 'preview-msg', 'stale-repeat')) : null;
      const repeatStaleNewSends = sendCalls.length - beforeRepeatStaleSendCount;
      const repeatStaleEdits = editCalls.slice(beforeRepeatStaleEditCount);
      const repeatStaleVisibleEditOk = repeatStaleEdits.some((call) => (call.messageId === (previewSend?.mid || previewSend?.messageId)) && /предпросмотр устарел/i.test(String(call.text || '')));
      const repeatStaleNoFreshMessageOk = repeatStaleNewSends === 0 && repeatStaleVisibleEditOk && repeatStaleResult && repeatStaleResult.screenId === 'buttons_clean_stale_save';
      const traceEvents = timing && typeof timing.list === 'function' ? timing.list(100) : [];
      const traceNames = urlTraceNames.length ? urlTraceNames : traceEvents.map((entry) => entry.name).filter(Boolean);
      const combinedTraceEvents = [...urlTraceEvents, ...saveTraceEvents, ...traceEvents];
      const traceRedactedOk = !hasSensitiveTraceLeak(combinedTraceEvents);
      const finalState = store.getSetupState(USER_ID);
      const saveState = stateAfterSave || finalState;
      const step1Ok = editCalls.some((call) => call.messageId === MESSAGE_ID && /Шаг 1\/3/.test(call.text));
      const step2Ok = sendCalls.some((call) => /Шаг 2\/3/.test(call.text));
      const step3Ok = sendCalls.some((call) => /Шаг 3\/3/.test(call.text));
      const step3AfterUrl = sendCalls.slice(beforeUrlSendCount).some((call) => /Шаг 3\/3/.test(call.text));
      const sends = wizardSendCalls(sendCalls).length;
      const requiredClosedWizardMessageIds = [MESSAGE_ID, step2Send?.mid || step2Send?.messageId || ''].filter(Boolean);
      const closedWizardMessageIds = [...new Set(closedWizardEdits(editCalls).map((call) => String(call.messageId || '').trim()).filter(Boolean))];
      const allRequiredWizardMessagesClosed = requiredClosedWizardMessageIds.every((id) => closedWizardMessageIds.includes(id));
      const cleanupTouched = allRequiredWizardMessagesClosed || deleteCalls.some((call) => requiredClosedWizardMessageIds.includes(call.messageId));
      const sameOwner = /^sent-/.test(String(finalState.buttonsWizardScreenMessageId || '')) && finalState.buttonsWizardScreenOwnerUserId === USER_ID;
      const savedUrl = beforeSaveState.buttonFlow?.draft?.url || finalState.buttonFlow?.draft?.url || '';
      const normalizedUrlOk = savedUrl === 'http://olga.style' || savedUrl === 'https://olga.style' || savedUrl === 'http://sports.ru' || savedUrl.startsWith('http://olga.style/') || savedUrl.startsWith('https://olga.style/') || savedUrl.startsWith('http://sports.ru/');
      const routeTraceSteps = Array.isArray(saveState.buttonSaveRouteTrace) ? saveState.buttonSaveRouteTrace.map((entry) => String(entry && entry.step || '')) : [];
      const savePayloadFlowId = String(savePayload.flowId || '').trim();
      const savePayloadCurrentOk = savePayload.action === 'button_admin_save' && Boolean(savePayloadFlowId) && savePayloadFlowId === activeFlowIdBeforeSave;
      const saveRouteTraceOk = saveTraceNames.includes('buttons_callback_received') && saveTraceNames.includes('buttons_callback_route_selected') && saveTraceNames.includes('buttons_callback_route_returned') && saveTraceNames.includes('buttons_callback_render_result');
      const saveDraftTraceOk = routeTraceSteps.includes('screenForPayload') && routeTraceSteps.includes('confirmSave') && routeTraceSteps.includes('saveDraft') && !routeTraceSteps.includes('staleSaveScreen') && !routeTraceSteps.includes('staleSaveScreen_returned');
      const saveVisibleSuccessOk = /Кнопка сохранена/i.test(saveVisibleText) && !/предпросмотр устарел/i.test(saveVisibleText);
      const saveCallbackOk = Boolean(savePayloadCurrentOk && saveResult && saveResult.screenId && saveRouteTraceOk && saveDraftTraceOk && patchCalls.length > 0 && saveVisibleSuccessOk);
      const ok = step1Ok && step2Ok && step3Ok && step3AfterUrl && sends >= 2 && cleanupTouched && sameOwner && normalizedUrlOk && saveCallbackOk && repeatStaleNoFreshMessageOk && !finalState.buttonsWizardEditFailedAt;
      const step3Text = (sendCalls.slice(beforeUrlSendCount).find((call) => /Шаг 3\/3/.test(call.text)) || {}).text || '';
      return { name, ok, payload, step1Ok, step2Ok, step3Ok, step3AfterUrl, sends, cleanupTouched, requiredClosedWizardMessageIds, closedWizardMessageIds, allRequiredWizardMessagesClosed, sameOwner, normalizedUrl: savedUrl, step3Transport: step3Ok ? 'sendMessage' : '', traceNames, traceRedactedOk, step3Text, saveCallbackOk, saveRouteTraceOk, saveDraftTraceOk, savePayloadCurrentOk, savePatchCallCount: patchCalls.length, saveResultScreenId: saveResult && saveResult.screenId || '', saveVisibleText, repeatStaleNoFreshMessageOk, repeatStaleNewSends, repeatStaleResultScreenId: repeatStaleResult && repeatStaleResult.screenId || '' };
    }

    const plain = await runVariant('plain_text', textUpdate('https://olga.style'));
    const linkPreviewWithText = await runVariant('link_preview_with_text', linkPreviewUpdate({ text: 'HTTP://olga.style', url: 'HTTP://olga.style' }));
    const linkPreviewMetadataOnly = await runVariant('link_preview_metadata_only', linkPreviewUpdate({ text: '', url: 'HTTP://olga.style/private/path?token=secret&signature=abc' }));
    const sportsVariants = {};
    for (const shape of ['body.text', 'body.link.url', 'body.preview.url', 'body.message.preview.url', 'body.attachments.payload.url', 'attachments.url']) {
      sportsVariants[shape] = await runVariant(`real_max_${shape}`, realMaxUrlUpdate(shape, shape === 'body.text' ? 'Http://sports.ru' : 'Http://sports.ru'));
    }
    const mediaAttachment = await runVariant('media_attachment_url', mediaAttachmentUpdate());
    const finalState = store.getSetupState(USER_ID);
    const step1Ok = plain.step1Ok && linkPreviewWithText.step1Ok && linkPreviewMetadataOnly.step1Ok;
    const step2Ok = plain.step2Ok && linkPreviewWithText.step2Ok && linkPreviewMetadataOnly.step2Ok;
    const step3Ok = plain.step3Ok && linkPreviewWithText.step3Ok && linkPreviewMetadataOnly.step3Ok;
    const sends = plain.sends + linkPreviewWithText.sends + linkPreviewMetadataOnly.sends + mediaAttachment.sends;
    const cleanupTouched = plain.cleanupTouched && linkPreviewWithText.cleanupTouched && linkPreviewMetadataOnly.cleanupTouched;
    const sameOwner = plain.sameOwner && linkPreviewWithText.sameOwner && linkPreviewMetadataOnly.sameOwner;
    const saveCallbackProbeOk = plain.saveCallbackOk && plain.saveRouteTraceOk;
    const urlPlainTextProbeOk = plain.ok;
    const urlLinkPreviewProbeOk = linkPreviewWithText.ok && linkPreviewMetadataOnly.ok;
    const uppercaseUrlProbeOk = linkPreviewWithText.normalizedUrl === 'http://olga.style' && linkPreviewMetadataOnly.normalizedUrl.startsWith('http://olga.style/');
    const requiredTraceMarkers = ['buttons_url_input_seen', 'buttons_url_input_extracted', 'buttons_url_input_screen', 'buttons_url_input_edit_result'];
    const linkPreviewTraceOk = requiredTraceMarkers.every((name) => linkPreviewMetadataOnly.traceNames.includes(name));
    const mediaAttachmentIgnoredOk = !mediaAttachment.step3Ok && !mediaAttachment.step3AfterUrl && mediaAttachment.sends >= 1 && !mediaAttachment.normalizedUrl && mediaAttachment.traceNames.includes('buttons_url_input_no_text');
    const traceRedactedOk = plain.traceRedactedOk && linkPreviewWithText.traceRedactedOk && linkPreviewMetadataOnly.traceRedactedOk && mediaAttachment.traceRedactedOk;
    const realMaxUrlVariantsOk = Object.values(sportsVariants).every((variant) => variant.ok && variant.payload?.screenId === 'buttons_clean_add_preview' && /Предпросмотр кнопки/.test(variant.step3Text || '') !== false);
    const ok = step1Ok && step2Ok && step3Ok && realMaxUrlVariantsOk && sends >= 6 && cleanupTouched && sameOwner && urlPlainTextProbeOk && urlLinkPreviewProbeOk && uppercaseUrlProbeOk && linkPreviewTraceOk && mediaAttachmentIgnoredOk && traceRedactedOk && postEditLinkPreviewRawTextOk && saveCallbackProbeOk;
    return { ok, runtime: 'PR215-BUTTONS-WIZARD-PRODUCTION-ROUTE-PROBE', source: 'adminkit-buttons-wizard-production-webhook-route-probe', routeModules, step1Transport: step1Ok ? 'editMessage' : '', step2Transport: step2Ok ? 'sendMessage' : '', step3Transport: step3Ok ? 'sendMessage' : '', sameMessageAcrossSteps: false, wizardSendMessageCount: sends, cleanupTouchedWizardMessage: cleanupTouched, urlPlainTextProbeOk, urlLinkPreviewProbeOk, uppercaseUrlProbeOk, step3FromLinkPreviewTransport: linkPreviewMetadataOnly.step3Transport, linkPreviewTraceOk, mediaAttachmentIgnoredOk, traceRedactedOk, postEditLinkPreviewRawTextOk, saveCallbackProbeOk, requiredTraceMarkers, linkPreviewVariantsTested: ['body.text', 'body.link.url', 'body.preview.url', 'body.message.preview.url', 'body.attachments.payload.url', 'attachments.url', 'attachments[].payload.url'], callbackUserId: USER_ID, textSenderUserId: USER_ID, canonicalOwnerUserId: finalState.buttonsWizardScreenOwnerUserId || USER_ID, diagnostics: ok ? [] : ['buttons_wizard_production_route_probe_failed'], variants: { plain, linkPreviewWithText, linkPreviewMetadataOnly, mediaAttachment, realMax: sportsVariants } };
  } finally {
    try { postsFlow.handleTextInput = originals.postsHandleTextInput; } catch {}
    try { postPatcher.patchStoredPost = originals.patchStoredPost; } catch {}
    try { Object.assign(max, { editMessage: originals.editMessage, sendMessage: originals.sendMessage, deleteMessage: originals.deleteMessage, answerCallback: originals.answerCallback, getChat: originals.getChat }); } catch {}
    try { if (originalStore && typeof store.replaceStoreInPlace === 'function') store.replaceStoreInPlace(originalStore); } catch {}
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (originalStore && typeof store.saveStore === 'function') {
      try { store.saveStore(); } catch {}
    }
  }
}

module.exports = { runProductionRouteProbe, USER_ID, CHAT_ID, MESSAGE_ID, CARD_ID };
