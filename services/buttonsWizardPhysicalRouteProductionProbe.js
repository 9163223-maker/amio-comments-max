'use strict';

const assert = require('assert');

const USER_ID = 'real-user-1';
const CHAT_ID = 'chat-1';
const MESSAGE_ID = 'wizard-host-msg';
const CARD_ID = 'card-pr206';

function clone(value) { try { return JSON.parse(JSON.stringify(value)); } catch { return null; } }
function wizardSendCalls(sendCalls) { return sendCalls.filter((call) => /Добавление кнопки|Предпросмотр кнопки/i.test(String(call.text || ''))); }
function closedWizardEdits(editCalls) { return editCalls.filter((call) => call.messageId === MESSAGE_ID && /Предыдущий шаг закрыт/i.test(String(call.text || ''))); }
function callbackUpdate() { return { update_type: 'message_callback', callback: { callback_id: 'cb-step-1', user_id: USER_ID, payload: JSON.stringify({ action: 'button_admin_start_add', cardId: CARD_ID }), message: { id: MESSAGE_ID, body: { mid: MESSAGE_ID, text: 'selected post card' }, recipient: { chat_id: CHAT_ID, chat_type: 'dialog' } } } }; }
function textUpdate(text) { return { update_type: 'message_created', message: { id: `user-msg-${text.length}`, body: { mid: `user-msg-${text.length}`, text }, sender: { user_id: USER_ID }, recipient: { chat_id: CHAT_ID, chat_type: 'dialog' } } }; }
function linkPreviewUpdate({ text = '', url = 'HTTP://olga.style' } = {}) { return { update_type: 'message_created', message: { id: `user-msg-link-${text.length || 'metadata'}`, body: { mid: `user-msg-link-${text.length || 'metadata'}`, text, link: { url, canonical_url: url.toLowerCase(), targetUrl: url }, preview: { url, title: 'Olga Style' }, attachments: [{ type: 'link_preview', payload: { url, canonicalUrl: url } }] }, preview: { url }, attachments: [{ type: 'link', payload: { url } }], sender: { user_id: USER_ID }, recipient: { chat_id: CHAT_ID, chat_type: 'dialog' } } }; }
function mediaAttachmentUpdate({ url = 'https://cdn.example.com/private-file.jpg?token=secret&signature=abc' } = {}) { return { update_type: 'message_created', message: { id: 'user-msg-photo-url', body: { mid: 'user-msg-photo-url', text: '', attachments: [{ type: 'photo', payload: { url } }] }, attachments: [{ type: 'file', payload: { url } }], sender: { user_id: USER_ID }, recipient: { chat_id: CHAT_ID, chat_type: 'dialog' } } }; }
function traceText(events = []) { try { return JSON.stringify(events); } catch { return ''; } }
function resCollector() { return { statusCode: 0, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return payload; } }; }
async function drive(bot, body) { const res = resCollector(); await bot.handleWebhook({ body }, res, { botToken: 'test-token', menuDeleteTimeoutMs: 1 }); assert.strictEqual(res.statusCode, 200); return res.payload; }

async function runProductionRouteProbe() {
  process.env.ADMINKIT_TEST_MODE = '1';
  process.env.ADMINKIT_DISABLE_AUTOSTART = '1';
  const store = require('../store');
  const tenant = require('../tenant-scope');
  const max = require('./maxApi');
  const access = require('./clientAccessService');
  const timing = require('../v3-ui-timing-cc8');
  const originalStore = clone(store.store);
  const postsFlow = require('../posts-flow-cc8-clean-wrapper');
  const originals = { editMessage: max.editMessage, sendMessage: max.sendMessage, deleteMessage: max.deleteMessage, answerCallback: max.answerCallback, getChat: max.getChat, postsHandleTextInput: postsFlow.handleTextInput };
  const editCalls = [];
  const sendCalls = [];
  const deleteCalls = [];
  const answerCalls = [];
  try {
    max.editMessage = async function editMessageStub(args = {}) { editCalls.push(args); return { message: { id: args.messageId, body: { mid: args.messageId } } }; };
    max.sendMessage = async function sendMessageStub(args = {}) { sendCalls.push(args); return { message: { id: `sent-${sendCalls.length}`, body: { mid: `sent-${sendCalls.length}` } } }; };
    max.deleteMessage = async function deleteMessageStub(args = {}) { deleteCalls.push(args); return { ok: true }; };
    max.answerCallback = async function answerCallbackStub(args = {}) { answerCalls.push(args); return { ok: true }; };
    max.getChat = async function getChatStub() { return { title: 'Olga Style' }; };
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
      editCalls.length = 0; sendCalls.length = 0; deleteCalls.length = 0; answerCalls.length = 0;
      store.setSetupState(USER_ID, { buttonsCurrentCard: target, buttonTargetPost: target, commentTargetPost: target, buttonFlow: null, activeAdminFlowKind: '', buttonsWizardScreenMessageId: '', buttonsWizardScreenOwnerUserId: '', buttonsWizardEditFailedAt: null, buttonsWizardRealShowPathLastDecision: '' });
      await drive(bot, callbackUpdate());
      await drive(bot, textUpdate('Кнопка'));
      const beforeUrlEditCount = editCalls.length;
      if (timing && typeof timing.clear === 'function') timing.clear();
      const payload = await drive(bot, urlUpdate);
      const traceEvents = timing && typeof timing.list === 'function' ? timing.list(100) : [];
      const traceNames = traceEvents.map((entry) => entry.name).filter(Boolean);
      const traceJson = traceText(traceEvents);
      const traceRedactedOk = !/token=|signature=|private\/path|private-file|\?token|https?:\/\/[^\"]+\//i.test(traceJson);
      const finalState = store.getSetupState(USER_ID);
      const step1Ok = editCalls.some((call) => call.messageId === MESSAGE_ID && /Шаг 1\/3/.test(call.text));
      const step2Ok = editCalls.some((call) => call.messageId === MESSAGE_ID && /Шаг 2\/3/.test(call.text));
      const step3Ok = editCalls.some((call) => call.messageId === MESSAGE_ID && /Шаг 3\/3/.test(call.text));
      const step3AfterUrl = editCalls.slice(beforeUrlEditCount).some((call) => call.messageId === MESSAGE_ID && /Шаг 3\/3/.test(call.text));
      const sends = wizardSendCalls(sendCalls).length;
      const cleanupTouched = closedWizardEdits(editCalls).length > 0 || deleteCalls.some((call) => call.messageId === MESSAGE_ID);
      const sameOwner = finalState.buttonsWizardScreenMessageId === MESSAGE_ID && finalState.buttonsWizardScreenOwnerUserId === USER_ID;
      const savedUrl = finalState.buttonFlow?.draft?.url || '';
      const normalizedUrlOk = savedUrl === 'http://olga.style' || savedUrl === 'https://olga.style' || savedUrl.startsWith('http://olga.style/') || savedUrl.startsWith('https://olga.style/');
      const ok = step1Ok && step2Ok && step3Ok && step3AfterUrl && sends === 0 && !cleanupTouched && sameOwner && normalizedUrlOk && finalState.buttonsWizardRealShowPathLastDecision !== 'send_new' && finalState.buttonsWizardRealShowPathLastDecision !== 'fallback_send_after_edit_failed' && !finalState.buttonsWizardEditFailedAt;
      return { name, ok, payload, step1Ok, step2Ok, step3Ok, step3AfterUrl, sends, cleanupTouched, sameOwner, normalizedUrl: savedUrl, step3Transport: step3Ok ? 'editMessage' : '', traceNames, traceRedactedOk };
    }

    const plain = await runVariant('plain_text', textUpdate('https://olga.style'));
    const linkPreviewWithText = await runVariant('link_preview_with_text', linkPreviewUpdate({ text: 'HTTP://olga.style', url: 'HTTP://olga.style' }));
    const linkPreviewMetadataOnly = await runVariant('link_preview_metadata_only', linkPreviewUpdate({ text: '', url: 'HTTP://olga.style/private/path?token=secret&signature=abc' }));
    const mediaAttachment = await runVariant('media_attachment_url', mediaAttachmentUpdate());
    const finalState = store.getSetupState(USER_ID);
    const step1Ok = plain.step1Ok && linkPreviewWithText.step1Ok && linkPreviewMetadataOnly.step1Ok;
    const step2Ok = plain.step2Ok && linkPreviewWithText.step2Ok && linkPreviewMetadataOnly.step2Ok;
    const step3Ok = plain.step3Ok && linkPreviewWithText.step3Ok && linkPreviewMetadataOnly.step3Ok;
    const sends = plain.sends + linkPreviewWithText.sends + linkPreviewMetadataOnly.sends + mediaAttachment.sends;
    const cleanupTouched = plain.cleanupTouched || linkPreviewWithText.cleanupTouched || linkPreviewMetadataOnly.cleanupTouched;
    const sameOwner = plain.sameOwner && linkPreviewWithText.sameOwner && linkPreviewMetadataOnly.sameOwner;
    const urlPlainTextProbeOk = plain.ok;
    const urlLinkPreviewProbeOk = linkPreviewWithText.ok && linkPreviewMetadataOnly.ok;
    const uppercaseUrlProbeOk = linkPreviewWithText.normalizedUrl === 'http://olga.style' && linkPreviewMetadataOnly.normalizedUrl.startsWith('http://olga.style/');
    const requiredTraceMarkers = ['buttons_url_input_seen', 'buttons_url_input_extracted', 'buttons_url_input_screen', 'buttons_url_input_edit_result'];
    const linkPreviewTraceOk = requiredTraceMarkers.every((name) => linkPreviewMetadataOnly.traceNames.includes(name));
    const mediaAttachmentIgnoredOk = !mediaAttachment.step3Ok && !mediaAttachment.step3AfterUrl && mediaAttachment.sends === 0 && !mediaAttachment.normalizedUrl && mediaAttachment.traceNames.includes('buttons_url_input_no_text');
    const traceRedactedOk = plain.traceRedactedOk && linkPreviewWithText.traceRedactedOk && linkPreviewMetadataOnly.traceRedactedOk && mediaAttachment.traceRedactedOk;
    const ok = step1Ok && step2Ok && step3Ok && sends === 0 && !cleanupTouched && sameOwner && urlPlainTextProbeOk && urlLinkPreviewProbeOk && uppercaseUrlProbeOk && linkPreviewTraceOk && mediaAttachmentIgnoredOk && traceRedactedOk && postEditLinkPreviewRawTextOk;
    return { ok, runtime: 'PR206-BUTTONS-WIZARD-PRODUCTION-ROUTE-PROBE', source: 'adminkit-buttons-wizard-production-webhook-route-probe', routeModules, step1Transport: step1Ok ? 'editMessage' : '', step2Transport: step2Ok ? 'editMessage' : '', step3Transport: step3Ok ? 'editMessage' : '', sameMessageAcrossSteps: step1Ok && step2Ok && step3Ok, wizardSendMessageCount: sends, cleanupTouchedWizardMessage: cleanupTouched, urlPlainTextProbeOk, urlLinkPreviewProbeOk, uppercaseUrlProbeOk, step3FromLinkPreviewTransport: linkPreviewMetadataOnly.step3Transport, linkPreviewTraceOk, mediaAttachmentIgnoredOk, traceRedactedOk, postEditLinkPreviewRawTextOk, requiredTraceMarkers, linkPreviewVariantsTested: ['body.text', 'body.link.url', 'body.preview.url', 'attachments[].payload.url'], callbackUserId: USER_ID, textSenderUserId: USER_ID, canonicalOwnerUserId: finalState.buttonsWizardScreenOwnerUserId || USER_ID, diagnostics: ok ? [] : ['buttons_wizard_production_route_probe_failed'], variants: { plain, linkPreviewWithText, linkPreviewMetadataOnly, mediaAttachment } };
  } finally {
    postsFlow.handleTextInput = originals.postsHandleTextInput;
    Object.assign(max, { editMessage: originals.editMessage, sendMessage: originals.sendMessage, deleteMessage: originals.deleteMessage, answerCallback: originals.answerCallback, getChat: originals.getChat });
    if (originalStore) {
      store.store = originalStore;
      if (typeof store.saveStore === 'function') store.saveStore();
    }
  }
}

module.exports = { runProductionRouteProbe, USER_ID, CHAT_ID, MESSAGE_ID, CARD_ID };
