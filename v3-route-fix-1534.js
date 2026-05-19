'use strict';

const Module = require('module');

const RUNTIME = 'CC7.5.34-CORE-1.53.4-V3-MENU-ROUTE-FIX';
const MARKER = '__ADMINKIT_V3_ROUTE_FIX_1534__';
const BASE = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

function cb(action, extra) {
  return JSON.stringify(Object.assign({ action }, extra || {}));
}

function mainButton() {
  return [{ type: 'inline_keyboard', payload: { buttons: [[{ type: 'callback', text: '🏠 Главное меню', payload: cb('admin_section_main') }]] } }];
}

function sectionButtons(source) {
  const root = source === 'polls' ? 'admin_section_polls' : 'admin_section_highlights';
  const label = source === 'polls' ? '🗳 В начало опросов' : '⭐ В начало выделения';
  return [[{ type: 'callback', text: label, payload: cb(root) }], [{ type: 'callback', text: '🏠 Главное меню', payload: cb('admin_section_main') }]];
}

function titleFor(source) {
  return source === 'polls' ? '🗳 Голосовалки / опросы' : '⭐ Выделение постов';
}

function safeChannelName(post) {
  const direct = String(post && (post.channelTitle || post.title || post.channelName || post.chatTitle) || '').trim();
  if (direct && direct.toLowerCase() !== 'global') return direct;
  try {
    const { listChannels } = require('./services/channelService');
    const channelId = String(post && post.channelId || '').trim();
    const found = listChannels().find((item) => String(item.channelId || '').trim() === channelId);
    const name = String(found && (found.title || found.channelTitle || found.name) || '').trim();
    if (name && name.toLowerCase() !== 'global') return name;
  } catch {}
  const channelId = String(post && post.channelId || '').trim();
  return channelId ? `Канал ${channelId}` : 'Канал пока не выбран';
}

function postPreview(post) {
  const text = String(post && (post.originalText || post.text || post.caption || post.postId || post.messageId) || 'Пост без текста').replace(/\s+/g, ' ').trim();
  return text.length > 60 ? text.slice(0, 59).trim() + '…' : text;
}

function recentPosts() {
  try {
    const { getPostsList } = require('./store');
    const seen = new Set();
    return getPostsList().filter((post) => {
      const key = String(post && (post.commentKey || `${post.channelId}:${post.postId || post.messageId}`) || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
  } catch { return []; }
}

function pickerScreen(source) {
  const posts = recentPosts();
  const lines = [titleFor(source), '', posts.length ? 'Выберите пост из последних сохранённых постов.' : 'Пока нет постов в памяти бота. Перешлите нужную публикацию боту.'];
  if (posts.length) {
    lines.push('');
    posts.forEach((post, i) => lines.push(`${i + 1}. ${safeChannelName(post)} — ${postPreview(post)}`));
  }
  const buttons = posts.map((post, i) => [{ type: 'callback', text: `${i + 1}. ${postPreview(post)}`, payload: cb('comments_pick_post', { source, commentKey: String(post.commentKey || '').trim() }) }]);
  buttons.push(...sectionButtons(source));
  return { text: lines.join('\n'), attachments: [{ type: 'inline_keyboard', payload: { buttons } }] };
}

function introScreen(source) {
  return {
    text: [titleFor(source), '', source === 'polls' ? 'Раздел для выбора поста, к которому будет добавлена голосовалка или опрос.' : 'Раздел для выбора поста, который нужно выделить.', '', 'Этот сценарий не является разделом комментариев, поэтому назад ведёт в свой раздел.'].join('\n'),
    attachments: [{ type: 'inline_keyboard', payload: { buttons: [[{ type: 'callback', text: '📌 Выбрать пост', payload: cb('comments_select_post', { source }) }], ...sectionButtons(source)] } }]
  };
}

function selectedScreen(source, commentKey) {
  let post = null;
  try { post = require('./store').getPostsList().find((p) => String(p.commentKey || '') === String(commentKey || '')) || null; } catch {}
  return {
    text: [titleFor(source), '', post ? 'Пост выбран.' : 'Не удалось найти выбранный пост.', post ? `Канал: ${safeChannelName(post)}` : '', post ? `Пост: ${postPreview(post)}` : '', '', source === 'polls' ? 'Следующий шаг: настройка вариантов голосования/опроса.' : 'Следующий шаг: настройка выделения выбранного поста.'].filter(Boolean).join('\n'),
    attachments: [{ type: 'inline_keyboard', payload: { buttons: [[{ type: 'callback', text: '📌 Выбрать другой пост', payload: cb('comments_select_post', { source }) }], ...sectionButtons(source)] } }]
  };
}

function productionScreen() {
  return { text: ['✅ Production checklist', '', 'Финальная служебная проверка перед production.', '', 'Проверяется:', '• актуальный runtime и package start;', '• /start и посадочная Start ведут в один V3-flow;', '• старые legacy keyboards не используются;', '• доступны 15 разделов V3 feature-плана;', '• фото и реакции находятся внутри комментариев;', '• видео и файлы в комментариях выключены;', '• Выделение постов и Опросы не возвращают в комментарии;', '• Debug и Навигация имеют отдельные экраны.'].join('\n'), attachments: mainButton() };
}

function navigationScreen() {
  return { text: ['🧭 Меню и навигация', '', 'Проверка V3-навигации.', '', 'Правильно:', '• каждый раздел имеет свой экран;', '• назад ведёт в текущий раздел;', '• главное меню всегда возвращает в V3-меню;', '• служебные разделы не показывают общий help-текст.'].join('\n'), attachments: mainButton() };
}

function landingScreen() {
  return { text: ['🚀 Посадочная Start', '', 'Проверка входа пользователя в V3-flow.', '', 'Ожидается:', '• /start открывает актуальное V3-меню;', '• старое меню не появляется;', '• посадочная Start ведёт в главное меню управления.'].join('\n'), attachments: mainButton() };
}

function debugScreen() {
  const buttons = [[{ type: 'link', text: 'Version', url: `${BASE}/debug-lite/version?t=1534` }, { type: 'link', text: 'Health', url: `${BASE}/debug-lite/health?t=1534` }], [{ type: 'link', text: 'Menu audit', url: `${BASE}/debug/menu/audit?t=1534` }, { type: 'link', text: 'Routes', url: `${BASE}/debug/menu/routes?t=1534` }], [{ type: 'callback', text: '🏠 Главное меню', payload: cb('admin_section_main') }]];
  return { text: ['🧪 Debug / GitHub export', '', 'Безопасные debug-lite ссылки для проверки версии, health и V3-меню.', '', 'Heavy store/export/stress отсюда не запускаются.'].join('\n'), attachments: [{ type: 'inline_keyboard', payload: { buttons } }] };
}

function payloadOf(update) {
  const c = update && (update.callback || (update.data && update.data.callback) || (update.message && update.message.callback));
  const raw = String(c && (c.payload || (c.button && c.button.payload) || c.data) || '').trim();
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function callbackIdOf(update) {
  const c = update && (update.callback || (update.data && update.data.callback) || (update.message && update.message.callback));
  return String(c && (c.callback_id || c.id || c.callbackId) || '').trim();
}

function messageOf(update) {
  return update && (update.message || (update.data && update.data.message) || (update.callback && update.callback.message) || (update.data && update.data.callback && update.data.callback.message)) || null;
}

function ids(message, update) {
  const c = update && (update.callback || (update.data && update.data.callback) || {});
  return {
    messageId: String((message && message.body && (message.body.mid || message.body.message_id)) || message && (message.message_id || message.id || message.mid) || '').trim(),
    userId: String((c.user && (c.user.user_id || c.user.id)) || (c.sender && (c.sender.user_id || c.sender.id)) || update && update.user && (update.user.user_id || update.user.id) || '').trim()
  };
}

function screenFor(payload) {
  const action = String(payload.action || '').trim();
  const source = String(payload.source || '').trim();
  const context = String(payload.context || '').trim();
  if (action === 'admin_section_highlights') return introScreen('highlights');
  if (action === 'admin_section_polls') return introScreen('polls');
  if (action === 'comments_select_post' && (source === 'highlights' || source === 'polls')) return pickerScreen(source);
  if (action === 'comments_pick_post' && (source === 'highlights' || source === 'polls')) return selectedScreen(source, payload.commentKey);
  if (action === 'admin_section_navigation' || (action === 'admin_section_help' && context === 'navigation_v3')) return navigationScreen();
  if (action === 'admin_section_landing_start' || (action === 'admin_section_main' && source === 'landing_start')) return landingScreen();
  if (action === 'admin_section_debug' || (action === 'admin_section_help' && context === 'debug')) return debugScreen();
  if (action === 'admin_section_production_checklist' || (action === 'admin_section_help' && context === 'production_checklist')) return productionScreen();
  return null;
}

async function show(update, config, screen) {
  const api = require('./services/maxApi');
  const message = messageOf(update);
  const id = ids(message, update);
  const callbackId = callbackIdOf(update);
  if (callbackId && typeof api.answerCallback === 'function') await api.answerCallback({ botToken: config.botToken, callbackId }).catch(() => null);
  if (id.messageId && typeof api.editMessage === 'function') {
    try { return await api.editMessage({ botToken: config.botToken, messageId: id.messageId, text: screen.text, attachments: screen.attachments, notify: false }); } catch {}
  }
  if (id.userId && typeof api.sendMessage === 'function') return api.sendMessage({ botToken: config.botToken, userId: id.userId, text: screen.text, attachments: screen.attachments });
  return null;
}

function install() {
  if (global[MARKER]) return { ok: true, already: true, runtimeVersion: RUNTIME };
  global[MARKER] = true;
  const previous = Module._load;
  Module._load = function(request, parent, isMain) {
    const loaded = previous.apply(this, arguments);
    if (!loaded || typeof loaded.handleWebhook !== 'function' || loaded.__v3RouteFix1534) return loaded;
    if (!String(request).endsWith('/bot') && String(request) !== './bot') return loaded;
    const original = loaded.handleWebhook;
    loaded.handleWebhook = async function(req, res, config) {
      const update = (req && req.body) || {};
      if (String(update.update_type || update.type || '') === 'message_callback') {
        const screen = screenFor(payloadOf(update));
        if (screen) {
          await show(update, config || {}, screen);
          return res.status(200).json({ ok: true, routeFix: '1.53.4' });
        }
      }
      return original.apply(this, arguments);
    };
    loaded.__v3RouteFix1534 = true;
    return loaded;
  };
  return { ok: true, runtimeVersion: RUNTIME };
}

module.exports = { install, RUNTIME, MARKER };