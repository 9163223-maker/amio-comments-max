'use strict';

// CC6.5.2.9 compact moderation UI.
// Goal: compact moderation screen, one toggle per setting, no abbreviations in labels.
// This layer intercepts moderation routes before the broader production-test UI.

const Module = require('module');

const RUNTIME = 'CC6.5.2.9';
const SOURCE = 'adminkit-CC6.5.2.9-moderation-compact-ui';
const events = [];
const lastMenus = new Map();

function norm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function tryJson(value) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}

function msg(update = {}) {
  return update.message || update.data?.message || update.callback?.message || update.data?.callback?.message || null;
}

function cb(update = {}) {
  return update.callback || update.data?.callback || msg(update)?.callback || null;
}

function payloadRaw(update = {}) {
  const callback = cb(update) || {};
  return norm(callback.payload || callback.body?.payload || update.payload || update.data?.payload || '');
}

function payload(update = {}) {
  return tryJson(payloadRaw(update)) || {};
}

function rawAction(update = {}) {
  const data = payload(update);
  const raw = payloadRaw(update);
  return norm(data.action || data.cmd || data.route || (/^[a-z0-9_:.\-]+$/i.test(raw) ? raw : '')).toLowerCase();
}

function canonical(action = '') {
  const route = norm(action).toLowerCase();
  const aliases = {
    moderation_menu: 'moderation:home',
    mod_start: 'moderation:home',
    help_moderation: 'help:moderation',
    moderation: 'moderation:home',
    'moderation:enable_filter': 'moderation:toggle_filter',
    'moderation:disable_filter': 'moderation:toggle_filter',
    'moderation:basic_words': 'moderation:toggle_basic_words',
    'moderation:links_allow': 'moderation:toggle_links',
    'moderation:links_block': 'moderation:toggle_links',
    'moderation:invites_allow': 'moderation:toggle_invites',
    'moderation:invites_block': 'moderation:toggle_invites',
    'moderation:ai_enable': 'moderation:toggle_ai',
    'moderation:ai_disable': 'moderation:toggle_ai'
  };
  return aliases[route] || route;
}

function userId(update = {}) {
  const message = msg(update) || {};
  const callback = cb(update) || {};
  return norm(
    update.user?.user_id || update.user?.id ||
    update.sender?.user_id || update.sender?.id ||
    callback.user?.user_id || callback.user?.id ||
    callback.sender?.user_id || callback.sender?.id ||
    message.sender?.user_id || message.sender?.id ||
    message.user_id || message.from?.id ||
    update.data?.user?.user_id || update.data?.user?.id || ''
  );
}

function chatId(update = {}) {
  const message = msg(update) || {};
  return norm(
    message.recipient?.chat_id || message.recipient?.id ||
    message.chat_id || message.chat?.id ||
    update.chat_id || update.chat?.id ||
    update.data?.chat_id || update.data?.chat?.id || ''
  );
}

function target(update = {}) {
  const uid = userId(update);
  const cid = chatId(update);
  return { userId: uid, chatId: cid, key: uid || cid };
}

function callbackId(update = {}) {
  const callback = cb(update) || {};
  return norm(callback.callback_id || callback.callbackId || callback.id || update.callback_id || '');
}

function messageId(update = {}) {
  const callback = cb(update) || {};
  const message = callback.message || msg(update) || {};
  const body = message.body || {};
  return norm(
    body.mid || body.message_id || body.messageId ||
    message.message_id || message.messageId || message.id || message.mid ||
    callback.message_id || callback.messageId || ''
  );
}

function responseMessageId(value = {}) {
  return norm([
    value?.message?.body?.mid,
    value?.message?.body?.message_id,
    value?.message?.message_id,
    value?.message?.id,
    value?.body?.mid,
    value?.body?.message_id,
    value?.message_id,
    value?.id,
    value?.mid,
    value?.data?.message?.body?.mid,
    value?.data?.message?.id,
    value?.data?.id
  ].find((item) => norm(item)) || '');
}

function logEvent(item) {
  events.push({ ts: Date.now(), ...item });
  while (events.length > 120) events.shift();
}

function btn(text, action, extra = {}) {
  return { type: 'callback', text, payload: JSON.stringify({ action, ...extra }) };
}

function kb(rows) {
  return [{ type: 'inline_keyboard', payload: { buttons: rows.filter(Boolean) } }];
}

function nav(extra = {}) {
  return [
    [btn('❓ Помощь раздела', 'help:moderation', extra)],
    [btn('↩️ В меню раздела', 'moderation:home', extra)],
    [btn('🏠 Главное меню', 'main:home')]
  ];
}

function channelIdOf(channel = {}) {
  return norm(channel.channelId || channel.channel_id || channel.id || channel.chatId || channel.chat_id || '');
}

function channelTitle(channel = {}) {
  return norm(channel.title || channel.channelTitle || channel.channelName || channel.name || channel.chatTitle || channelIdOf(channel) || 'Канал');
}

function channels() {
  try {
    const items = require('./services/channelService').listChannels();
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function selectedChannel(extra = {}) {
  const items = channels();
  const id = norm(extra.channelId || extra.channel_id || (items.length === 1 ? channelIdOf(items[0]) : ''));
  return items.find((item) => channelIdOf(item) === id) || items[0] || null;
}

function selectedChannelId(extra = {}) {
  const channel = selectedChannel(extra);
  return channel ? channelIdOf(channel) : '';
}

function postKey(post = {}) {
  return norm(post.commentKey || post.key || (post.channelId && post.postId ? `${post.channelId}:${post.postId}` : ''));
}

function postTitle(post = {}, index = 0) {
  const title = norm(post.originalText || post.title || post.linkedByName || post.postTitle || post.postId || post.commentKey || 'Пост');
  return `${index + 1}. ${title.length > 44 ? title.slice(0, 43) + '…' : title}`;
}

function listPosts(channelId = '') {
  try {
    const posts = require('./services/postEditorService').listAdminPosts({ channelId, limit: 20, config: require('./config') });
    if (Array.isArray(posts) && posts.length) return posts;
  } catch {}
  try {
    const posts = Object.values(require('./store').store?.posts || {});
    return posts.filter((post) => !channelId || norm(post.channelId) === norm(channelId));
  } catch {
    return [];
  }
}

function findPost(commentKey = '', channelId = '') {
  return listPosts(channelId).find((post) => postKey(post) === norm(commentKey)) ||
    listPosts('').find((post) => postKey(post) === norm(commentKey)) || null;
}

function storeObj() {
  const storeModule = require('./store');
  if (!storeModule.store.moderation) storeModule.store.moderation = { byChannel: {}, logs: [] };
  if (!storeModule.store.moderation.byChannel) storeModule.store.moderation.byChannel = {};
  return storeModule;
}

function saveStore() {
  try {
    const storeModule = require('./store');
    if (typeof storeModule.saveStore === 'function') storeModule.saveStore(storeModule.store);
  } catch {}
}

function scopeKey(extra = {}) {
  return norm(extra.commentKey || selectedChannelId(extra) || 'global');
}

function defaultModerationState() {
  return {
    filter: true,
    basicWords: true,
    links: true,
    invites: false,
    ai: false,
    manualWords: []
  };
}

function getModeration(extra = {}) {
  const storeModule = storeObj();
  const key = scopeKey(extra);
  const current = storeModule.store.moderation.byChannel[key] || {};
  return { ...defaultModerationState(), ...current, key };
}

function setModeration(extra = {}, patch = {}) {
  const storeModule = storeObj();
  const key = scopeKey(extra);
  storeModule.store.moderation.byChannel[key] = { ...getModeration(extra), ...patch, updatedAt: Date.now() };
  saveStore();
  return storeModule.store.moderation.byChannel[key];
}

function toggleModeration(field, extra = {}) {
  const current = getModeration(extra);
  return setModeration(extra, { [field]: !current[field] });
}

function onOff(value) {
  return value ? 'включён' : 'выключен';
}

function onOffPlural(value) {
  return value ? 'включены' : 'выключены';
}

function allowText(value) {
  return value ? 'разрешены' : 'запрещены';
}

function compactSummary(extra = {}) {
  const state = getModeration(extra);
  return [
    `Фильтр: ${onOff(state.filter)}`,
    `Базовые стоп-слова: ${onOffPlural(state.basicWords)}`,
    `Ручные стоп-слова: ${(state.manualWords || []).length}`,
    `Ссылки: ${allowText(state.links)}`,
    `Приглашения: ${allowText(state.invites)}`,
    `AI-модерация: ${onOff(state.ai)}`
  ];
}

function toggleRows(extra = {}) {
  const state = getModeration(extra);
  return [
    [btn('🎯 Правила конкретного поста', 'moderation:choose_post', extra)],
    [btn(state.filter ? '⏸ Выключить фильтр' : '✅ Включить фильтр', 'moderation:toggle_filter', extra)],
    [btn(state.basicWords ? '🧱 Выключить базовые стоп-слова' : '🧱 Включить базовые стоп-слова', 'moderation:toggle_basic_words', extra)],
    [btn('📝 Ручные стоп-слова', 'moderation:manual_words', extra)],
    [btn(state.links ? '🔗 Запретить ссылки' : '🔗 Разрешить ссылки', 'moderation:toggle_links', extra)],
    [btn(state.invites ? '✉️ Запретить приглашения' : '✉️ Разрешить приглашения', 'moderation:toggle_invites', extra)],
    [btn(state.ai ? '🤖 Выключить AI-модерацию' : '🤖 Включить AI-модерацию', 'moderation:toggle_ai', extra)],
    [btn('📋 Журнал модерации', 'moderation:logs', extra)],
    [btn('🧪 Тест комментария', 'moderation:test_comment', extra)]
  ];
}

function moderationHome(extra = {}) {
  const channel = selectedChannel(extra);
  const post = extra.commentKey ? findPost(extra.commentKey, extra.channelId) : null;
  const title = post ? '🛡 Модерация → пост' : '🛡 Модерация';
  const scopeLine = post
    ? `Пост: ${norm(post.originalText || post.title || post.postTitle || post.linkedByName || 'выбранный пост')}`
    : `Канал: ${channel ? channelTitle(channel) : 'не выбран'}`;

  return {
    text: [
      title,
      scopeLine,
      '',
      ...compactSummary(extra)
    ].join('\n'),
    attachments: kb([...toggleRows(extra), ...nav(extra)])
  };
}

function manualWordsModel(extra = {}) {
  const state = getModeration(extra);
  const words = state.manualWords || [];
  return {
    text: [
      '📝 Ручные стоп-слова',
      '',
      words.length ? `Список: ${words.slice(-12).join(', ')}` : 'Список пуст.',
      '',
      'Для теста кнопка добавляет слово «спам». В production здесь будет ввод своего слова сообщением.'
    ].join('\n'),
    attachments: kb([
      [btn('➕ Добавить слово «спам»', 'moderation:add_word', extra)],
      [btn('➖ Удалить последнее слово', 'moderation:remove_word', extra)],
      [btn('🧹 Очистить список', 'moderation:clear_manual_words', extra)],
      ...nav(extra)
    ])
  };
}

function choosePostModel(extra = {}) {
  const channelId = selectedChannelId(extra);
  const channel = selectedChannel(extra);
  const posts = listPosts(channelId);
  return {
    text: [
      '🛡 Модерация → выбор поста',
      '',
      `Канал: ${channel ? channelTitle(channel) : 'не выбран'}`,
      `Постов найдено: ${posts.length}`,
      '',
      'Выберите пост.'
    ].join('\n'),
    attachments: kb([
      ...posts.map((post, index) => [btn(postTitle(post, index), 'moderation:post', { ...extra, channelId, commentKey: postKey(post), postId: norm(post.postId) })]),
      ...nav(extra)
    ])
  };
}

function statusActionModel(route, extra = {}) {
  const titles = {
    'moderation:logs': '📋 Журнал модерации',
    'moderation:test_comment': '🧪 Тест комментария'
  };
  return {
    text: [
      titles[route] || '🛡 Модерация',
      '',
      'Экран открыт в тестовом режиме Pro.',
      'Состояние раздела сохранено, маршрут не передан в другие разделы.'
    ].join('\n'),
    attachments: kb([...nav(extra)])
  };
}

function helpModel(extra = {}) {
  return {
    text: [
      '❓ Помощь: Модерация',
      '',
      'Каждая настройка управляется одной кнопкой. Нажатие меняет состояние и сразу обновляет сводку сверху.',
      '',
      'Выбор поста внутри модерации открывает только правила этого поста.'
    ].join('\n'),
    attachments: kb([...nav(extra)])
  };
}

async function model(routeRaw = 'moderation:home', extra = {}) {
  const route = canonical(routeRaw);
  if (route === 'help:moderation') return helpModel(extra);
  if (route === 'moderation:home' || route === 'moderation:channel_rules') return moderationHome(extra);
  if (route === 'moderation:choose_post') return choosePostModel(extra);
  if (route === 'moderation:post') return moderationHome(extra);
  if (route === 'moderation:manual_words') return manualWordsModel(extra);
  if (route === 'moderation:toggle_filter') { toggleModeration('filter', extra); return moderationHome(extra); }
  if (route === 'moderation:toggle_basic_words') { toggleModeration('basicWords', extra); return moderationHome(extra); }
  if (route === 'moderation:toggle_links') { toggleModeration('links', extra); return moderationHome(extra); }
  if (route === 'moderation:toggle_invites') { toggleModeration('invites', extra); return moderationHome(extra); }
  if (route === 'moderation:toggle_ai') { toggleModeration('ai', extra); return moderationHome(extra); }
  if (route === 'moderation:add_word') {
    const state = getModeration(extra);
    setModeration(extra, { manualWords: [...new Set([...(state.manualWords || []), 'спам'])] });
    return manualWordsModel(extra);
  }
  if (route === 'moderation:remove_word') {
    const state = getModeration(extra);
    setModeration(extra, { manualWords: (state.manualWords || []).slice(0, -1) });
    return manualWordsModel(extra);
  }
  if (route === 'moderation:clear_manual_words') {
    setModeration(extra, { manualWords: [] });
    return manualWordsModel(extra);
  }
  if (route === 'moderation:logs' || route === 'moderation:test_comment') return statusActionModel(route, extra);
  return null;
}

async function render(update = {}, routeRaw = 'moderation:home', forceSend = false) {
  const route = canonical(routeRaw);
  const rendered = await model(route, payload(update));
  if (!rendered) return { ok: false, reason: 'not_moderation_route', route, runtimeVersion: RUNTIME };

  const api = require('./services/maxApi');
  const config = require('./config');
  const targetInfo = target(update);

  const cbid = callbackId(update);
  if (cbid) {
    try { await api.answerCallback({ botToken: config.botToken, callbackId: cbid }); } catch {}
  }

  const mid = messageId(update);
  if (mid && !forceSend) {
    try {
      await api.editMessage({ botToken: config.botToken, messageId: mid, notify: false, text: rendered.text, attachments: rendered.attachments });
      return { ok: true, mode: 'edit', route, runtimeVersion: RUNTIME };
    } catch {}
  }

  if (!targetInfo.userId && !targetInfo.chatId) return { ok: false, reason: 'target_missing', route, runtimeVersion: RUNTIME };
  const old = lastMenus.get(targetInfo.key);
  if (old?.messageId) {
    try { await api.deleteMessage({ botToken: config.botToken, messageId: old.messageId, timeoutMs: 1600 }); } catch {}
  }
  const sent = await api.sendMessage({ botToken: config.botToken, userId: targetInfo.userId || undefined, chatId: targetInfo.userId ? undefined : targetInfo.chatId, notify: false, text: rendered.text, attachments: rendered.attachments });
  const sid = responseMessageId(sent);
  if (sid) lastMenus.set(targetInfo.key, { messageId: sid, ts: Date.now() });
  return { ok: true, mode: 'send', route, runtimeVersion: RUNTIME };
}

function sendText(res, lines) {
  noCache(res);
  return res.type('text/plain').send(lines.join('\n') + '\n');
}

function runtimeCheck(res) {
  return sendText(res, [
    'OK: MODERATION_COMPACT_UI_READY',
    'runtime: ' + RUNTIME,
    'sourceMarker: ' + SOURCE,
    'singleTogglePolicy: enabled',
    'compactSummary: enabled',
    'noAbbreviationsInLabels: enabled',
    'legacyModerationBypass: enabled'
  ]);
}

function isModerationRoute(route) {
  const action = canonical(route);
  return action === 'help:moderation' || action.startsWith('moderation:');
}

function installExpressPatch() {
  if (Module._load.__cc6529Patch) return;
  const oldLoad = Module._load;
  function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc6529Wrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc6529) {
          app.__cc6529 = true;
          app.use((req, res, next) => {
            const route = String(req.path || req.url || '').split('?')[0].toLowerCase();
            if (route === '/debug/moderation-compact-ui') return runtimeCheck(res);
            if (route === '/debug/moderation-compact-events') {
              noCache(res);
              return res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, events: events.slice(-100) });
            }
            return next();
          });
          const oldPost = app.post.bind(app);
          app.post = (route, ...handlers) => {
            const routeText = String(route || '').toLowerCase();
            if (!routeText.includes('/webhook')) return oldPost(route, ...handlers);
            return oldPost(route, async (req, res, next) => {
              const action = canonical(rawAction(req.body || {}));
              if (isModerationRoute(action)) {
                logEvent({ action, handled: true, payloadRaw: payloadRaw(req.body || {}) });
                return res.json({ ok: true, handledBy: RUNTIME, result: await render(req.body || {}, action) });
              }
              return next();
            }, ...handlers);
          };
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc6529Wrap = true;
      return expressWrapper;
    }
    return loaded;
  }
  patchedLoad.__cc6529Patch = true;
  Module._load = patchedLoad;
}

function install() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  installExpressPatch();
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
}

module.exports = { RUNTIME, SOURCE, install };
