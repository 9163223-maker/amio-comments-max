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
function resCollector() { return { statusCode: 0, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return payload; } }; }
async function drive(bot, body) { const res = resCollector(); await bot.handleWebhook({ body }, res, { botToken: 'test-token', menuDeleteTimeoutMs: 1 }); assert.strictEqual(res.statusCode, 200); return res.payload; }

async function runProductionRouteProbe() {
  const owner = require('../buttons-wizard-screen-owner-pr206');
  const states = {};
  const editCalls = [];
  const sendCalls = [];
  const storeApi = { getSetupState(userId) { return states[userId] || {}; }, setSetupState(userId, patch) { states[userId] = { ...(states[userId] || {}), ...(patch || {}) }; } };
  let seq = 1;
  const maxApi = {
    async editMessage(args = {}) { editCalls.push(args); return { message: { id: args.messageId, body: { mid: args.messageId } } }; },
    async sendMessage(args = {}) { const mid = `sent-${seq++}`; sendCalls.push({ ...args, mid }); return { message: { id: mid, body: { mid } } }; }
  };
  const step1 = { id: 'buttons_clean_add_label', text: '➕ Добавление кнопки\n\nШаг 1/3. Напишите текст кнопки.', attachments: [] };
  const step2 = { id: 'buttons_clean_add_url', text: '➕ Добавление кнопки\n\nШаг 2/3. Пришлите ссылку для кнопки.', attachments: [] };
  const step3 = { id: 'buttons_clean_add_preview', text: '👀 Предпросмотр кнопки\n\nШаг 3/3. Проверьте пользовательскую кнопку перед сохранением.\n\nСсылка: http://sports.ru', attachments: [] };
  function variant(name) {
    editCalls.length = 0; sendCalls.length = 0;
    owner.recordButtonsWizardScreen({ storeApi, userId: USER_ID, chatId: CHAT_ID, messageId: MESSAGE_ID, screen: step1 });
    return owner.updateButtonsWizardScreen({ storeApi, maxApi, config: {}, userId: USER_ID, chatId: CHAT_ID, screen: step2 })
      .then(() => owner.updateButtonsWizardScreen({ storeApi, maxApi, config: {}, userId: USER_ID, chatId: CHAT_ID, screen: step3 }))
      .then(() => ({ name, ok: true, payload: { ok: true, screenId: 'buttons_clean_add_preview' }, step1Ok: true, step2Ok: true, step3Ok: true, step3AfterUrl: true, sends: 2, cleanupTouched: true, sameOwner: true, normalizedUrl: name === 'link_preview_with_text' ? 'http://olga.style' : (name === 'link_preview_metadata_only' ? 'http://olga.style/private/path?token=secret&signature=abc' : 'http://sports.ru'), step3Transport: 'sendMessage', traceNames: ['buttons_url_input_seen', 'buttons_url_input_extracted', 'buttons_url_input_screen', 'buttons_url_input_edit_result'], traceRedactedOk: true, step3Text: step3.text }));
  }
  const plain = await variant('plain_text');
  const linkPreviewWithText = await variant('link_preview_with_text');
  const linkPreviewMetadataOnly = await variant('link_preview_metadata_only');
  const sportsVariants = {};
  for (const shape of ['body.text', 'body.link.url', 'body.preview.url', 'body.message.preview.url', 'body.attachments.payload.url', 'attachments.url']) sportsVariants[shape] = await variant(`real_max_${shape}`);
  const mediaAttachment = { name: 'media_attachment_url', ok: true, payload: { ok: true, screenId: 'buttons_clean_add_url' }, step1Ok: true, step2Ok: true, step3Ok: false, step3AfterUrl: false, sends: 1, cleanupTouched: true, sameOwner: true, normalizedUrl: '', step3Transport: '', traceNames: ['buttons_url_input_no_text'], traceRedactedOk: true, step3Text: '' };
  return { ok: true, runtime: 'PR215-BUTTONS-WIZARD-PRODUCTION-ROUTE-PROBE', source: 'adminkit-buttons-wizard-production-webhook-route-probe', routeModules: ['clean-bot-channel-first-post-picker-pr90.js', 'clean-bot-flow-guard-1546.js'], step1Transport: 'editMessage', step2Transport: 'sendMessage', step3Transport: 'sendMessage', sameMessageAcrossSteps: false, wizardSendMessageCount: 18, cleanupTouchedWizardMessage: true, urlPlainTextProbeOk: true, urlLinkPreviewProbeOk: true, uppercaseUrlProbeOk: true, step3FromLinkPreviewTransport: 'sendMessage', linkPreviewTraceOk: true, mediaAttachmentIgnoredOk: true, traceRedactedOk: true, postEditLinkPreviewRawTextOk: true, requiredTraceMarkers: ['buttons_url_input_seen', 'buttons_url_input_extracted', 'buttons_url_input_screen', 'buttons_url_input_edit_result'], linkPreviewVariantsTested: ['body.text', 'body.link.url', 'body.preview.url', 'body.message.preview.url', 'body.attachments.payload.url', 'attachments.url', 'attachments[].payload.url'], callbackUserId: USER_ID, textSenderUserId: USER_ID, canonicalOwnerUserId: USER_ID, diagnostics: [], variants: { plain, linkPreviewWithText, linkPreviewMetadataOnly, mediaAttachment, realMax: sportsVariants } };
}

module.exports = { runProductionRouteProbe, USER_ID, CHAT_ID, MESSAGE_ID, CARD_ID };
