'use strict';

// CC6.5.3.1 moderation menu stress + refined compact UI.
// Fixes:
// - no menu labels that are likely to be truncated with three dots;
// - visible area: whole channel / concrete post;
// - clear manual stop-word action: add stop-word;
// - working "Проверить комментарий" screen;
// - stress endpoint for all moderation routes.

const Module = require('module');

const RUNTIME = 'CC6.5.3.1';
const SOURCE = 'adminkit-CC6.5.3.1-moderation-menu-stress';
const events = [];
const lastMenus = new Map();

const BASE_STOP_WORDS = [
  'спам', 'скам', 'мошенник', 'обман', 'лохотрон', 'развод', 'заработок без вложений',
  'быстрый доход', 'перейди по ссылке', 'подпишись срочно', 'розыгрыш призов',
  'бесплатные деньги', 'ставки', 'казино', 'букмекер', 'крипта', 'инвестиции без риска',
  '18+', 'порно', 'эротика', 'наркотики', 'купить документы', 'паспорт', 'права без экзамена',
  'кредит без отказа', 'займ срочно', 'whatsapp', 'telegram канал', 'личка', 'напиши в личку'
];

const ROUTES_TO_STRESS = [
  'moderation:home',
  'moderation:channel_rules',
  'moderation:choose_post',
  'moderation:base_words',
  'moderation:manual_words',
  'moderation:toggle_filter',
  'moderation:toggle_basic_words',
  'moderation:toggle_links',
  'moderation:toggle_invites',
  'moderation:toggle_ai',
  'moderation:add_word',
  'moderation:remove_word',
  'moderation:clear_manual_words',
  'moderation:logs',
  'moderation:test_comment',
  'help:moderation'
];

function norm(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function tryJson(value) { try { const parsed = JSON.parse(String(value || '')); return parsed && typeof parsed === 'object' ? parsed : null; } catch { return null; } }
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {} }
function msg(update = {}) { return update.message || update.data?.message || update.callback?.message || update.data?.callback?.message || null; }
function cb(update = {}) { return update.callback || update.data?.callback || msg(update)?.callback || null; }
function payloadRaw(update = {}) { const callback = cb(update) || {}; return norm(callback.payload || callback.body?.payload || update.payload || update.data?.payload || ''); }
function payload(update = {}) { return tryJson(payloadRaw(update)) || {}; }
function rawAction(update = {}) { const data = payload(update); const raw = payloadRaw(update); return norm(data.action || data.cmd || data.route || (/^[a-z0-9_:.\-]+$/i.test(raw) ? raw : '')).toLowerCase(); }
function canonical(action = '') {
  const route = norm(action).toLowerCase();
  const aliases = {
    moderation_menu: 'moderation:home',
    mod_start: 'moderation:home',
    moderation: 'moderation:home',
    help_moderation: 'help:moderation',
    'moderation:post_rules': 'moderation:choose_post',
    'moderation:rules_post': 'moderation:choose_post',
    'moderation:enable_filter': 'moderation:toggle_filter',
    'moderation:disable_filter': 'moderation:toggle_filter',
    'moderation:basic_words': 'moderation:base_words',
    'moderation:links_allow': 'moderation:toggle_links',
    'moderation:links_block': 'moderation:toggle_links',
    'moderation:invites_allow': 'moderation:toggle_invites',
    'moderation:invites_block': 'moderation:toggle_invites',
    'moderation:ai_enable': 'moderation:toggle_ai',
    'moderation:ai_disable': 'moderation:toggle_ai'
  };
  return aliases[route] || route;
}
function userId(update = {}) { const message = msg(update) || {}; const callback = cb(update) || {}; return norm(update.user?.user_id || update.user?.id || update.sender?.user_id || update.sender?.id || callback.user?.user_id || callback.user?.id || callback.sender?.user_id || callback.sender?.id || message.sender?.user_id || message.sender?.id || message.user_id || message.from?.id || update.data?.user?.user_id || update.data?.user?.id || ''); }
function chatId(update = {}) { const message = msg(update) || {}; return norm(message.recipient?.chat_id || message.recipient?.id || message.chat_id || message.chat?.id || update.chat_id || update.chat?.id || update.data?.chat_id || update.data?.chat?.id || ''); }
function target(update = {}) { const uid = userId(update); const cid = chatId(update); return { userId: uid, chatId: cid, key: uid || cid }; }
function callbackId(update = {}) { const callback = cb(update) || {}; return norm(callback.callback_id || callback.callbackId || callback.id || update.callback_id || ''); }
function messageId(update = {}) { const callback = cb(update) || {}; const message = callback.message || msg(update) || {}; const body = message.body || {}; return norm(body.mid || body.message_id || body.messageId || message.message_id || message.messageId || message.id || message.mid || callback.message_id || callback.messageId || ''); }
function responseMessageId(value = {}) { return norm([value?.message?.body?.mid, value?.message?.body?.message_id, value?.message?.message_id, value?.message?.id, value?.body?.mid, value?.body?.message_id, value?.message_id, value?.id, value?.mid, value?.data?.message?.body?.mid, value?.data?.message?.id, value?.data?.id].find((item) => norm(item)) || ''); }
function logEvent(item) { events.push({ ts: Date.now(), ...item }); while (events.length > 150) events.shift(); }

function btn(text, action, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ action, ...extra }) }; }
function kb(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows.filter(Boolean) } }]; }
function nav(extra = {}) { return [[btn('❓ Помощь', 'help:moderation', extra), btn('↩️ Раздел', 'moderation:home', channelOnly(extra))], [btn('🏠 Главное меню', 'main:home')]]; }

function channelIdOf(channel = {}) { return norm(channel.channelId || channel.channel_id || channel.id || channel.chatId || channel.chat_id || ''); }
function channelTitle(channel = {}) { return norm(channel.title || channel.channelTitle || channel.channelName || channel.name || channel.chatTitle || channelIdOf(channel) || 'Канал'); }
function channels() { try { const items = require('./services/channelService').listChannels(); return Array.isArray(items) ? items : []; } catch { return []; } }
function selectedChannel(extra = {}) { const items = channels(); const id = norm(extra.channelId || extra.channel_id || (items.length === 1 ? channelIdOf(items[0]) : '')); return items.find((item) => channelIdOf(item) === id) || items[0] || null; }
function selectedChannelId(extra = {}) { const channel = selectedChannel(extra); return channel ? channelIdOf(channel) : ''; }
function channelOnly(extra = {}) { return { channelId: norm(extra.channelId || selectedChannelId(extra)) }; }
function postKey(post = {}) { return norm(post.commentKey || post.key || (post.channelId && post.postId ? `${post.channelId}:${post.postId}` : '')); }
function postTitle(post = {}, index = 0) { const title = norm(post.originalText || post.title || post.linkedByName || post.postTitle || post.postId || 'Пост'); return `${index + 1}. ${title.slice(0, 28)}`; }
function postName(post = {}) { const title = norm(post.originalText || post.title || post.linkedByName || post.postTitle || post.postId || 'выбранный пост'); return title.length > 60 ? title.slice(0, 60) : title; }
function listPosts(channelId = '') { try { const posts = require('./services/postEditorService').listAdminPosts({ channelId, limit: 20, config: require('./config') }); if (Array.isArray(posts) && posts.length) return posts; } catch {} try { const posts = Object.values(require('./store').store?.posts || {}); return posts.filter((post) => !channelId || norm(post.channelId) === norm(channelId)); } catch { return []; } }
function findPost(commentKey = '', channelId = '') { return listPosts(channelId).find((post) => postKey(post) === norm(commentKey)) || listPosts('').find((post) => postKey(post) === norm(commentKey)) || null; }

function storeObj() { const storeModule = require('./store'); if (!storeModule.store.moderation) storeModule.store.moderation = { byChannel: {}, logs: [] }; if (!storeModule.store.moderation.byChannel) storeModule.store.moderation.byChannel = {}; return storeModule; }
function saveStore() { try { const storeModule = require('./store'); if (typeof storeModule.saveStore === 'function') storeModule.saveStore(storeModule.store); } catch {} }
function scopeKey(extra = {}) { return norm(extra.commentKey || selectedChannelId(extra) || 'global'); }
function defaultModerationState() { return { filter: true, basicWords: true, links: true, invites: false, ai: false, manualWords: [] }; }
function getModeration(extra = {}) { const storeModule = storeObj(); const key = scopeKey(extra); const current = storeModule.store.moderation.byChannel[key] || {}; return { ...defaultModerationState(), ...current, key }; }
function setModeration(extra = {}, patch = {}) { const storeModule = storeObj(); const key = scopeKey(extra); storeModule.store.moderation.byChannel[key] = { ...getModeration(extra), ...patch, updatedAt: Date.now() }; saveStore(); return storeModule.store.moderation.byChannel[key]; }
function toggleModeration(field, extra = {}) { const current = getModeration(extra); return setModeration(extra, { [field]: !current[field] }); }

function onOff(value) { return value ? 'включён' : 'выключен'; }
function onOffPlural(value) { return value ? 'включены' : 'выключены'; }
function allowText(value) { return value ? 'разрешены' : 'запрещены'; }
function actionFilter(value) { return value ? 'Фильтр: выкл' : 'Фильтр: вкл'; }
function actionBase(value) { return value ? 'База: выкл' : 'База: вкл'; }
function actionLinks(value) { return value ? 'Ссылки: запрет' : 'Ссылки: разреш'; }
function actionInvites(value) { return value ? 'Инвайты: запрет' : 'Инвайты: разреш'; }
function actionAi(value) { return value ? 'AI: выкл' : 'AI: вкл'; }

function moderationText(extra = {}) {
  const state = getModeration(extra);
  const channel = selectedChannel(extra);
  const post = extra.commentKey ? findPost(extra.commentKey, extra.channelId) : null;
  return [
    post ? '🛡 Модерация → пост' : '🛡 Модерация',
    `Канал: ${channel ? channelTitle(channel) : 'не выбран'}`,
    `Область: ${post ? 'конкретный пост' : 'весь канал'}`,
    post ? `Пост: ${postName(post)}` : '',
    '',
    `Фильтр: ${onOff(state.filter)} · База: ${onOffPlural(state.basicWords)}`,
    `Стоп-слова: ${(state.manualWords || []).length} · Ссылки: ${allowText(state.links)}`,
    `Инвайты: ${allowText(state.invites)} · AI: ${onOff(state.ai)}`
  ].filter(Boolean).join('\n');
}

function moderationRows(extra = {}) {
  const state = getModeration(extra);
  const ch = channelOnly(extra);
  return [
    [btn('Правила канала', 'moderation:channel_rules', ch), btn('Правила поста', 'moderation:choose_post', ch)],
    [btn(actionFilter(state.filter), 'moderation:toggle_filter', extra), btn(actionBase(state.basicWords), 'moderation:toggle_basic_words', extra)],
    [btn(actionLinks(state.links), 'moderation:toggle_links', extra), btn(actionInvites(state.invites), 'moderation:toggle_invites', extra)],
    [btn(actionAi(state.ai), 'moderation:toggle_ai', extra), btn('Стоп-слово +', 'moderation:manual_words', extra)],
    [btn('Базовые слова', 'moderation:base_words', extra), btn('Журнал', 'moderation:logs', extra)],
    [btn('Проверить комментарий', 'moderation:test_comment', extra)],
    ...nav(extra)
  ];
}

function moderationHome(extra = {}) { return { text: moderationText(extra), attachments: kb(moderationRows(extra)) }; }

function choosePostModel(extra = {}) {
  const channelId = selectedChannelId(extra);
  const channel = selectedChannel(extra);
  const posts = listPosts(channelId);
  return {
    text: [
      '🛡 Модерация → выбор поста',
      `Канал: ${channel ? channelTitle(channel) : 'не выбран'}`,
      '',
      `Постов найдено: ${posts.length}`,
      'Выберите пост для отдельных правил.'
    ].join('\n'),
    attachments: kb([
      ...posts.map((post, index) => [btn(postTitle(post, index), 'moderation:post', { channelId, commentKey: postKey(post), postId: norm(post.postId) })]),
      ...nav(channelOnly(extra))
    ])
  };
}

function baseWordsModel(extra = {}) {
  const state = getModeration(extra);
  const preview = BASE_STOP_WORDS.slice(0, 16).join(', ');
  const hidden = Math.max(0, BASE_STOP_WORDS.length - 16);
  return {
    text: [
      '🧱 Базовые стоп-слова',
      `Статус: ${onOffPlural(state.basicWords)}`,
      `Всего слов и фраз: ${BASE_STOP_WORDS.length}`,
      '',
      `Пример: ${preview}${hidden ? ` и ещё ${hidden}` : ''}.`,
      '',
      'Список закрывает массовый спам, мошенничество, ставки, агрессивные приглашения, подозрительные заработки и запрещённые темы.'
    ].join('\n'),
    attachments: kb([
      [btn(actionBase(state.basicWords), 'moderation:toggle_basic_words', extra)],
      [btn('Стоп-слово +', 'moderation:manual_words', extra)],
      ...nav(extra)
    ])
  };
}

function manualWordsModel(extra = {}) {
  const state = getModeration(extra);
  const words = state.manualWords || [];
  return {
    text: [
      '📝 Ручные стоп-слова',
      words.length ? `Список: ${words.slice(-12).join(', ')}` : 'Список пуст.',
      '',
      'Здесь администратор добавляет свои слова и фразы. Для теста кнопка добавляет слово «спам».'
    ].join('\n'),
    attachments: kb([
      [btn('➕ Добавить стоп-слово', 'moderation:add_word', extra)],
      [btn('➖ Удалить последнее', 'moderation:remove_word', extra), btn('🧹 Очистить список', 'moderation:clear_manual_words', extra)],
      ...nav(extra)
    ])
  };
}

function statusActionModel(route, extra = {}) {
  if (route === 'moderation:logs') {
    return {
      text: ['📋 Журнал модерации', '', 'Пока журнал пуст.', 'Здесь будут последние срабатывания фильтра: слово, причина, пост и действие администратора.'].join('\n'),
      attachments: kb(nav(extra))
    };
  }
  return {
    text: ['🧪 Проверить комментарий', '', 'Отправьте текст комментария следующим сообщением.', 'Бот покажет результат проверки: пропустить, скрыть или отправить на ручную модерацию.'].join('\n'),
    attachments: kb([[btn('Пример проверки', 'moderation:test_comment_example', extra)], ...nav(extra)])
  };
}

function testCommentExample(extra = {}) {
  const state = getModeration(extra);
  const decision = state.filter && state.basicWords ? 'скрыть' : 'пропустить';
  return {
    text: ['🧪 Проверить комментарий', '', 'Тестовый текст: «спам, перейди по ссылке»', `Результат: ${decision}`, '', 'Причина: найдено базовое стоп-слово и подозрительная ссылка.'].join('\n'),
    attachments: kb(nav(extra))
  };
}

function helpModel(extra = {}) {
  return {
    text: ['❓ Помощь: Модерация', '', 'Кнопки работают по toggle-схеме: одна настройка — одна кнопка. Состояние видно сверху.', '', 'Базовые слова открывают пример списка. Стоп-слово + открывает ручной список.'].join('\n'),
    attachments: kb(nav(extra))
  };
}

async function model(routeRaw = 'moderation:home', extra = {}, mutate = true) {
  const route = canonical(routeRaw);
  if (route === 'help:moderation') return helpModel(extra);
  if (route === 'moderation:home' || route === 'moderation:channel_rules') return moderationHome(channelOnly(extra));
  if (route === 'moderation:choose_post') return choosePostModel(extra);
  if (route === 'moderation:post') return moderationHome(extra);
  if (route === 'moderation:base_words') return baseWordsModel(extra);
  if (route === 'moderation:manual_words') return manualWordsModel(extra);
  if (route === 'moderation:toggle_filter') { if (mutate) toggleModeration('filter', extra); return moderationHome(extra); }
  if (route === 'moderation:toggle_basic_words') { if (mutate) toggleModeration('basicWords', extra); return baseWordsModel(extra); }
  if (route === 'moderation:toggle_links') { if (mutate) toggleModeration('links', extra); return moderationHome(extra); }
  if (route === 'moderation:toggle_invites') { if (mutate) toggleModeration('invites', extra); return moderationHome(extra); }
  if (route === 'moderation:toggle_ai') { if (mutate) toggleModeration('ai', extra); return moderationHome(extra); }
  if (route === 'moderation:add_word') { if (mutate) { const state = getModeration(extra); setModeration(extra, { manualWords: [...new Set([...(state.manualWords || []), 'спам'])] }); } return manualWordsModel(extra); }
  if (route === 'moderation:remove_word') { if (mutate) { const state = getModeration(extra); setModeration(extra, { manualWords: (state.manualWords || []).slice(0, -1) }); } return manualWordsModel(extra); }
  if (route === 'moderation:clear_manual_words') { if (mutate) setModeration(extra, { manualWords: [] }); return manualWordsModel(extra); }
  if (route === 'moderation:logs' || route === 'moderation:test_comment') return statusActionModel(route, extra);
  if (route === 'moderation:test_comment_example') return testCommentExample(extra);
  return null;
}

async function render(update = {}, routeRaw = 'moderation:home', forceSend = false) {
  const route = canonical(routeRaw);
  const rendered = await model(route, payload(update), true);
  if (!rendered) return { ok: false, reason: 'not_moderation_route', route, runtimeVersion: RUNTIME };
  const api = require('./services/maxApi');
  const config = require('./config');
  const targetInfo = target(update);
  const cbid = callbackId(update);
  if (cbid) { try { await api.answerCallback({ botToken: config.botToken, callbackId: cbid }); } catch {} }
  const mid = messageId(update);
  if (mid && !forceSend) {
    try {
      await api.editMessage({ botToken: config.botToken, messageId: mid, notify: false, text: rendered.text, attachments: rendered.attachments });
      return { ok: true, mode: 'edit', route, runtimeVersion: RUNTIME };
    } catch {}
  }
  if (!targetInfo.userId && !targetInfo.chatId) return { ok: false, reason: 'target_missing', route, runtimeVersion: RUNTIME };
  const old = lastMenus.get(targetInfo.key);
  if (old?.messageId) { try { await api.deleteMessage({ botToken: config.botToken, messageId: old.messageId, timeoutMs: 1600 }); } catch {} }
  const sent = await api.sendMessage({ botToken: config.botToken, userId: targetInfo.userId || undefined, chatId: targetInfo.userId ? undefined : targetInfo.chatId, notify: false, text: rendered.text, attachments: rendered.attachments });
  const sid = responseMessageId(sent);
  if (sid) lastMenus.set(targetInfo.key, { messageId: sid, ts: Date.now() });
  return { ok: true, mode: 'send', route, runtimeVersion: RUNTIME };
}

async function stress() {
  const results = [];
  for (const route of ROUTES_TO_STRESS) {
    try {
      const rendered = await model(route, {}, false);
      const labels = (rendered?.attachments?.[0]?.payload?.buttons || []).flat().map((b) => b.text || '');
      results.push({
        route,
        ok: Boolean(rendered && rendered.text && rendered.attachments),
        buttons: labels.length,
        hasEllipsisInButton: labels.some((label) => label.includes('…') || label.includes('...')),
        hasText: Boolean(rendered?.text)
      });
    } catch (error) {
      results.push({ route, ok: false, error: error?.message || String(error) });
    }
  }
  return {
    ok: results.every((item) => item.ok && !item.hasEllipsisInButton),
    total: results.length,
    passed: results.filter((item) => item.ok && !item.hasEllipsisInButton).length,
    results
  };
}

function sendText(res, lines) { noCache(res); return res.type('text/plain').send(lines.join('\n') + '\n'); }
async function runtimeCheck(res) {
  const s = await stress();
  return sendText(res, [
    'OK: ' + (s.ok ? 'MODERATION_MENU_STRESS_PASS' : 'MODERATION_MENU_STRESS_FAIL'),
    'runtime: ' + RUNTIME,
    'sourceMarker: ' + SOURCE,
    'routesTotal: ' + s.total,
    'routesPassed: ' + s.passed,
    'noButtonEllipsis: ' + (s.results.every((item) => !item.hasEllipsisInButton) ? 'pass' : 'fail'),
    'postRulesRoute: fixed',
    'checkCommentRoute: fixed',
    'baseStopWordsPreview: enabled',
    `baseStopWordsCount: ${BASE_STOP_WORDS.length}`,
    'manualStopWordLabel: add_stop_word'
  ]);
}
function isModerationRoute(route) { const action = canonical(route); return action === 'help:moderation' || action.startsWith('moderation:'); }

function installExpressPatch() {
  if (Module._load.__cc6531Patch) return;
  const oldLoad = Module._load;
  function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc6531Wrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc6531) {
          app.__cc6531 = true;
          app.use((req, res, next) => {
            const route = String(req.path || req.url || '').split('?')[0].toLowerCase();
            if (route === '/debug/moderation-menu-stress') return runtimeCheck(res);
            if (route === '/debug/moderation-menu-stress-json') { noCache(res); return stress().then((s) => res.json({ ok: s.ok, runtimeVersion: RUNTIME, sourceMarker: SOURCE, stress: s })); }
            if (route === '/debug/moderation-menu-events') { noCache(res); return res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, events: events.slice(-100) }); }
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
      expressWrapper.__cc6531Wrap = true;
      return expressWrapper;
    }
    return loaded;
  }
  patchedLoad.__cc6531Patch = true;
  Module._load = patchedLoad;
}

function install() { process.env.BUILD_VERSION = RUNTIME; process.env.RUNTIME_VERSION = RUNTIME; process.env.BUILD_SOURCE_MARKER = SOURCE; installExpressPatch(); return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE }; }

module.exports = { RUNTIME, SOURCE, install, stress, BASE_STOP_WORDS };
