'use strict';

// CC7.4.9 Archive Lite direct menu layer.
// Fixes CC7.4.8 marker collision: loader marker and layer marker are now separated.
// Adds Archive / Restore to the visible /start main menu and handles archive callbacks directly.

const RUNTIME = 'CC7.4.9-ARCHIVE-DIRECT-MENU';
const MARKER = '__ADMINKIT_CC7_4_9_ARCHIVE_DIRECT_MENU_LAYER__';

function safeJson(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
}

function truncateText(value = '', maxLength = 64) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function buildPayload(action, extra = {}) {
  return JSON.stringify({ action, ...extra });
}

function getMessage(update) {
  return update?.message || update?.data?.message || update?.callback?.message || update?.data?.callback?.message || null;
}

function getCallback(update) {
  return update?.callback || update?.data?.callback || update?.message?.callback || null;
}

function getMessageId(message) {
  const body = message?.body || {};
  return String(body?.mid || body?.message_id || message?.message_id || message?.id || '').trim();
}

function getMessageText(message) {
  return String(message?.body?.text || message?.text || message?.message?.text || '').trim();
}

function getSenderUserId(message) {
  return String(
    message?.sender?.user_id ||
    message?.sender?.id ||
    message?.user_id ||
    message?.from?.id ||
    ''
  ).trim();
}

function getRecipientChatId(message) {
  return String(
    message?.recipient?.chat_id ||
    message?.recipient?.id ||
    message?.chat_id ||
    message?.chat?.id ||
    ''
  ).trim();
}

function parseCallbackPayload(callback = {}) {
  const raw = String(callback?.payload || callback?.data || callback?.value || callback?.callback_data || '').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { raw }; }
}

function isInlineKeyboard(att = null) {
  return String(att?.type || '').trim() === 'inline_keyboard' && att?.payload && Array.isArray(att.payload.buttons);
}

function keyboardHasButton(buttons = [], textPart = '') {
  const needle = String(textPart || '').toLowerCase();
  return (Array.isArray(buttons) ? buttons : []).some((row) => (Array.isArray(row) ? row : []).some((btn) => String(btn?.text || '').toLowerCase().includes(needle)));
}

function injectArchiveButton(attachments) {
  if (!Array.isArray(attachments)) return attachments;
  let changed = false;
  const next = attachments.map((att) => {
    if (!isInlineKeyboard(att)) return att;
    const buttons = safeJson(att.payload.buttons) || [];
    const looksLikeMainMenu = keyboardHasButton(buttons, 'Комментарии') && (keyboardHasButton(buttons, 'Каналы') || keyboardHasButton(buttons, 'Подарки'));
    if (!looksLikeMainMenu || keyboardHasButton(buttons, 'Архив')) return att;
    buttons.push([{ type: 'callback', text: '🗄️ Архив / восстановление', payload: buildPayload('admin_section_archive') }]);
    changed = true;
    return { ...att, payload: { ...(att.payload || {}), buttons } };
  });
  return changed ? next : attachments;
}

function patchMaxApiMenus() {
  const maxApi = require('./services/maxApi');
  if (maxApi.__adminkitArchiveDirectMenuPatched) return;
  const originalSendMessage = maxApi.sendMessage;
  const originalEditMessage = maxApi.editMessage;
  if (typeof originalSendMessage === 'function') {
    maxApi.sendMessage = async function adminkitArchiveDirectSendMessage(args = {}) {
      if (Array.isArray(args?.attachments)) args = { ...args, attachments: injectArchiveButton(args.attachments) };
      return originalSendMessage.call(this, args);
    };
  }
  if (typeof originalEditMessage === 'function') {
    maxApi.editMessage = async function adminkitArchiveDirectEditMessage(args = {}) {
      if (Array.isArray(args?.attachments)) args = { ...args, attachments: injectArchiveButton(args.attachments) };
      return originalEditMessage.call(this, args);
    };
  }
  maxApi.__adminkitArchiveDirectMenuPatched = true;
}

function buildMainMenuText() {
  return [
    '🐋 АдминКИТ',
    '',
    'Главное меню.',
    'Настройки и выбранные посты берутся только из Postgres.'
  ].join('\n');
}

function buildMainMenuKeyboard() {
  return [{ type: 'inline_keyboard', payload: { buttons: [
    [
      { type: 'callback', text: '📺 Каналы', payload: buildPayload('admin_section_channels') },
      { type: 'callback', text: '💬 Комментарии', payload: buildPayload('admin_section_comments') }
    ],
    [
      { type: 'callback', text: '🎁 Подарки', payload: buildPayload('admin_section_gifts') },
      { type: 'callback', text: '⚪ Кнопки', payload: buildPayload('admin_section_buttons') }
    ],
    [
      { type: 'callback', text: '🛡️ Модерация', payload: buildPayload('admin_section_moderation') },
      { type: 'callback', text: '📊 Статистика', payload: buildPayload('admin_section_stats') }
    ],
    [{ type: 'callback', text: '🗄️ Архив / восстановление', payload: buildPayload('admin_section_archive') }]
  ] } }];
}

async function sendMainMenu({ config, message, edit = false }) {
  const { editMessage, sendMessage } = require('./services/maxApi');
  const text = buildMainMenuText();
  const attachments = buildMainMenuKeyboard();
  const messageId = getMessageId(message);
  if (edit && messageId) {
    try {
      return await editMessage({ botToken: config.botToken, messageId, text, attachments, notify: false });
    } catch {}
  }
  const chatId = getRecipientChatId(message);
  const userId = getSenderUserId(message);
  return sendMessage({ botToken: config.botToken, ...(chatId ? { chatId } : { userId }), text, attachments, notify: false });
}

function postPreview(post = {}, fallback = 'Пост без текста') {
  return truncateText(post?.originalText || post?.title || post?.postId || fallback, 80);
}

function getStoredPostsForArchive(channelId = '') {
  const { getPostsList } = require('./store');
  const ch = String(channelId || '').trim();
  const seen = new Set();
  return getPostsList()
    .filter((post) => post?.commentKey && post?.postId)
    .filter((post) => !ch || String(post.channelId || '').trim() === ch)
    .filter((post) => {
      const key = `${String(post.channelId || '').trim()}:${String(post.postId || '').trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(b?.createdAt || b?.patchedAt || 0) - Number(a?.createdAt || a?.patchedAt || 0));
}

function archiveFooterRows() {
  return [
    [{ type: 'callback', text: '🗄️ В начало архива', payload: buildPayload('admin_section_archive') }],
    [{ type: 'callback', text: '🏠 Главное меню', payload: buildPayload('admin_section_main') }]
  ];
}

function buildArchiveMainText() {
  const count = getStoredPostsForArchive().length;
  return [
    '🗄️ Архив и восстановление',
    '',
    'Lite-уровень уже доступен: бот хранит snapshot постов, которые проходили через АдминКИТ.',
    `Постов в базе: ${count}`,
    '',
    'Что можно сейчас:',
    '• посмотреть сохранённые посты;',
    '• открыть карточку snapshot;',
    '• попробовать перепубликовать текст и доступные MAX-вложения;',
    '',
    'PRO-уровень будет хранить медиа в нашем отдельном хранилище.',
    'Будет доступно в Pro версии.'
  ].join('\n');
}

function buildArchiveMainKeyboard() {
  return [{ type: 'inline_keyboard', payload: { buttons: [
    [{ type: 'callback', text: '📚 Посты в базе Lite', payload: buildPayload('archive_lite_list', { page: 0 }) }],
    [{ type: 'callback', text: '♻️ Восстановить из snapshot', payload: buildPayload('archive_lite_list', { page: 0, mode: 'restore' }) }],
    [{ type: 'callback', text: '⭐ PRO: медиа-архив', payload: buildPayload('archive_pro_info') }],
    [{ type: 'callback', text: '🏠 Главное меню', payload: buildPayload('admin_section_main') }]
  ] } }];
}

function buildArchiveListText(page = 0) {
  const posts = getStoredPostsForArchive();
  const perPage = 8;
  const start = Math.max(0, Number(page || 0)) * perPage;
  const slice = posts.slice(start, start + perPage);
  if (!slice.length) return ['📚 Посты в базе Lite', '', 'Пока нет сохранённых постов.', 'Пост появляется здесь после того, как АдминКИТ увидел его и сохранил snapshot.'].join('\n');
  return ['📚 Посты в базе Lite', '', ...slice.map((post, index) => `${start + index + 1}. ${postPreview(post)}`)].join('\n');
}

function buildArchiveListKeyboard(page = 0, mode = '') {
  const posts = getStoredPostsForArchive();
  const perPage = 8;
  const safePage = Math.max(0, Number(page || 0));
  const start = safePage * perPage;
  const slice = posts.slice(start, start + perPage);
  const rows = slice.map((post, index) => [{
    type: 'callback',
    text: truncateText(`${start + index + 1}. ${postPreview(post)}`, 56),
    payload: buildPayload('archive_post_card', { commentKey: String(post.commentKey || ''), mode })
  }]);
  const nav = [];
  if (safePage > 0) nav.push({ type: 'callback', text: '⬅️ Назад', payload: buildPayload('archive_lite_list', { page: safePage - 1, mode }) });
  if (start + perPage < posts.length) nav.push({ type: 'callback', text: 'Вперёд ➡️', payload: buildPayload('archive_lite_list', { page: safePage + 1, mode }) });
  if (nav.length) rows.push(nav);
  rows.push(...archiveFooterRows());
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}

function buildPostCardText(post = {}) {
  const attachments = Array.isArray(post?.sourceAttachments) ? post.sourceAttachments : [];
  const buttons = Array.isArray(post?.customKeyboard?.rows) ? post.customKeyboard.rows.length : 0;
  return [
    '🧾 Snapshot поста',
    '',
    `Канал: ${post.channelTitle || post.channelId || 'не указан'}`,
    `Post ID: ${post.postId || 'не указан'}`,
    `Комментариев: ${require('./store').getComments(post.commentKey || '').length}`,
    `Медиа-вложений в snapshot: ${attachments.length}`,
    `CTA-рядов: ${buttons}`,
    '',
    'Текст:',
    truncateText(post.originalText || post.title || 'Пост без текста', 900),
    '',
    'Lite-восстановление попробует перепубликовать текст и MAX-вложения из snapshot. Если MAX больше не принимает старые media-token, медиа может не восстановиться.'
  ].join('\n');
}

function buildPostCardKeyboard(commentKey = '') {
  return [{ type: 'inline_keyboard', payload: { buttons: [
    [{ type: 'callback', text: '♻️ Перепубликовать Lite', payload: buildPayload('archive_republish_lite', { commentKey }) }],
    [{ type: 'callback', text: '⭐ PRO-медиа бэкап', payload: buildPayload('archive_pro_info') }],
    ...archiveFooterRows()
  ] } }];
}

function buildProInfoText() {
  return [
    '⭐ PRO: медиа-архив',
    '',
    'Будет доступно в Pro версии.',
    '',
    'Что даст PRO:',
    '• сохранение медиа в отдельное хранилище АдминКИТ;',
    '• восстановление поста даже если старый MAX media-token устарел;',
    '• история версий поста;',
    '• восстановление текста, ссылок, медиа, CTA-кнопок и подарков одним нажатием.',
    '',
    'В текущем Lite-режиме мы сохраняем snapshot текста, ссылок, форматирования и служебные данные вложений MAX.'
  ].join('\n');
}

async function editCallbackMessage({ config, message, text, attachments }) {
  const { editMessage, sendMessage } = require('./services/maxApi');
  const messageId = getMessageId(message);
  if (messageId) {
    try { return await editMessage({ botToken: config.botToken, messageId, text, attachments, notify: false }); } catch {}
  }
  const chatId = getRecipientChatId(message);
  const userId = getSenderUserId(message);
  return sendMessage({ botToken: config.botToken, ...(chatId ? { chatId } : { userId }), text, attachments, notify: false });
}

async function republishLitePost({ config, commentKey }) {
  const { getPost } = require('./store');
  const { sendMessage } = require('./services/maxApi');
  const post = getPost(commentKey);
  if (!post?.channelId) return { ok: false, error: 'post_or_channel_missing' };
  const attachments = Array.isArray(post.sourceAttachments) ? safeJson(post.sourceAttachments) || [] : [];
  const text = String(post.originalText || post.title || '').trim() || 'Восстановленный пост';
  const payload = { botToken: config.botToken, chatId: String(post.channelId), text, attachments, notify: false };
  if (post.originalLink && typeof post.originalLink === 'object') payload.link = safeJson(post.originalLink);
  if (post.originalFormat !== undefined && post.originalFormat !== null) payload.format = post.originalFormat;
  return sendMessage(payload);
}

async function handleArchiveOrMainCallback(update, config) {
  const callback = getCallback(update);
  const message = getMessage(update);
  const payload = parseCallbackPayload(callback);
  const action = String(payload.action || '').trim();
  if (!action || !/^(admin_section_main|admin_section_archive|archive_)/i.test(action)) return null;
  const { answerCallback } = require('./services/maxApi');
  try { if (callback?.callback_id || callback?.id) await answerCallback({ botToken: config.botToken, callbackId: callback.callback_id || callback.id }); } catch {}

  if (action === 'admin_section_main') {
    await sendMainMenu({ config, message, edit: true });
    return { ok: true, action };
  }
  if (action === 'admin_section_archive') {
    await editCallbackMessage({ config, message, text: buildArchiveMainText(), attachments: buildArchiveMainKeyboard() });
    return { ok: true, action };
  }
  if (action === 'archive_lite_list') {
    const page = Math.max(0, Number(payload.page || 0));
    await editCallbackMessage({ config, message, text: buildArchiveListText(page), attachments: buildArchiveListKeyboard(page, payload.mode || '') });
    return { ok: true, action, page };
  }
  if (action === 'archive_post_card') {
    const { getPost } = require('./store');
    const post = getPost(String(payload.commentKey || ''));
    if (!post) {
      await editCallbackMessage({ config, message, text: 'Snapshot не найден. Выберите другой пост.', attachments: buildArchiveListKeyboard(0, payload.mode || '') });
      return { ok: true, action: 'archive_post_card_missing' };
    }
    await editCallbackMessage({ config, message, text: buildPostCardText(post), attachments: buildPostCardKeyboard(post.commentKey || payload.commentKey || '') });
    return { ok: true, action };
  }
  if (action === 'archive_pro_info') {
    await editCallbackMessage({ config, message, text: buildProInfoText(), attachments: [{ type: 'inline_keyboard', payload: { buttons: archiveFooterRows() } }] });
    return { ok: true, action };
  }
  if (action === 'archive_republish_lite') {
    const commentKey = String(payload.commentKey || '').trim();
    try {
      await republishLitePost({ config, commentKey });
      await editCallbackMessage({
        config,
        message,
        text: ['♻️ Перепубликация Lite', '', 'Пост отправлен в канал из сохранённого snapshot.', 'Если в snapshot были медиа, они использованы через сохранённые MAX-данные. Для гарантированного восстановления медиа нужен PRO-архив.'].join('\n'),
        attachments: [{ type: 'inline_keyboard', payload: { buttons: archiveFooterRows() } }]
      });
    } catch (error) {
      await editCallbackMessage({
        config,
        message,
        text: ['Не удалось перепубликовать пост из snapshot.', '', `Ошибка: ${error?.message || 'unknown'}`, '', 'Чаще всего это значит, что MAX не принял старые media-token или у бота нет прав на публикацию в канал.'].join('\n'),
        attachments: buildPostCardKeyboard(commentKey)
      });
    }
    return { ok: true, action };
  }
  return null;
}

function patchBotWebhook() {
  const bot = require('./bot');
  if (!bot || bot.__adminkitArchiveDirectMenuPatched || typeof bot.handleWebhook !== 'function') return;
  const original = bot.handleWebhook;
  bot.handleWebhook = async function adminkitArchiveDirectMenuHandleWebhook(req, res, config) {
    try {
      const update = req.body || {};
      const type = String(update?.update_type || update?.type || '').trim();
      const message = getMessage(update);
      const text = getMessageText(message);
      if (type === 'message_callback') {
        const handled = await handleArchiveOrMainCallback(update, config || {});
        if (handled) return res.status(200).json({ ok: true, archiveDirectMenu: handled });
      }
      if (message && /^\/start(?:\s|$)/i.test(text)) {
        await sendMainMenu({ config: config || {}, message, edit: false });
        return res.status(200).json({ ok: true, archiveDirectMenu: { action: 'start_main_menu' } });
      }
    } catch (error) {
      console.error('[archive-direct-menu] failed:', error?.message || error, error?.data || '');
    }
    return original.call(this, req, res, config);
  };
  bot.__adminkitArchiveDirectMenuPatched = true;
}

function install() {
  if (global[MARKER]) return { ok: true, already: true, runtimeVersion: RUNTIME, marker: MARKER };
  global[MARKER] = true;
  patchMaxApiMenus();
  patchBotWebhook();
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    marker: MARKER,
    policy: 'direct_start_main_menu_with_archive_lite_and_pro_placeholder',
    features: ['direct_start_main_menu', 'main_menu_archive_button', 'lite_snapshot_list', 'lite_republish_attempt', 'pro_placeholder']
  };
}

module.exports = { install, RUNTIME, MARKER };
