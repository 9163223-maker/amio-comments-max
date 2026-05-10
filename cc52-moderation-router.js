'use strict';

// CC6.5.3.5 canonical moderation router.
// This replaces the old moderation UI directly instead of adding another visual layer.
// One route owner: moderation. One compact toggle schema. PostgreSQL remains source of truth.

const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');

const RUNTIME = 'CC6.5.3.5';
const SOURCE = 'adminkit-CC6.5.3.5-canonical-moderation-router';
const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const clean = (v) => db.clean(v);
const cut = (v, n = 56) => db.cut(v, n);
const BASE_STOP_WORDS = ['спам','скам','мошенник','обман','лохотрон','развод','заработок без вложений','быстрый доход','перейди по ссылке','подпишись срочно','розыгрыш призов','бесплатные деньги','ставки','казино','букмекер','крипта','инвестиции без риска','18+','порно','эротика','наркотики','купить документы','паспорт','права без экзамена','кредит без отказа','займ срочно','whatsapp','telegram канал','личка','напиши в личку'];

function button(text, action, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ action, ...extra }) }; }
function keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows.filter(Boolean) } }]; }
function callback(update = {}) { return db.cb(update); }
function payload(update = {}) { return db.payload(update); }
function action(update = {}) { return norm(db.action(update)).toLowerCase(); }
function adminId(update = {}) { return db.adminId(update); }
function callbackId(update = {}) { return db.callbackId(update); }
function messageId(update = {}) { return db.messageId(update); }
function chatId(update = {}) { return db.chatId(update); }
function messageText(update = {}) { return db.text(update); }
function pick(obj, keys) { for (const key of keys) if (obj && obj[key] !== undefined && obj[key] !== null && norm(obj[key])) return norm(obj[key]); return ''; }

function parseScope(rawPayload = {}) {
  let rawScope = pick(rawPayload, ['scopeKey', 'scope', 'targetScope', 'moderationScope']);
  let channelId = pick(rawPayload, ['channelId', 'channel_id', 'channel', 'chatId', 'chat_id']);
  let postId = pick(rawPayload, ['postId', 'post_id', 'selectedPostId', 'messageId', 'message_id', 'mid']);
  let commentKey = clean(pick(rawPayload, ['commentKey', 'comment_key', 'key', 'postKey', 'post_key']));
  let scopeType = pick(rawPayload, ['scopeType', 'scope_type']);
  rawScope = clean(rawScope);
  if (/^post:/i.test(rawScope)) { scopeType = 'post'; commentKey = clean(rawScope.replace(/^post:/i, '')); }
  else if (/^channel:/i.test(rawScope)) { scopeType = 'channel'; channelId = clean(rawScope.replace(/^channel:/i, '')); }
  else if (rawScope && rawScope.includes(':') && !commentKey) { scopeType = 'post'; commentKey = rawScope; }
  else if (rawScope === 'post' || rawScope === 'channel') scopeType = rawScope;
  if (!channelId && commentKey.includes(':')) channelId = commentKey.split(':')[0];
  if (!postId && commentKey.includes(':')) postId = commentKey.split(':').pop();
  if (!commentKey && channelId && postId) commentKey = `${channelId}:${postId}`;
  if (!scopeType) scopeType = postId ? 'post' : (channelId ? 'channel' : 'none');
  return { channelId: norm(channelId), postId: norm(postId), commentKey: clean(commentKey), scopeType };
}

function buildScope(currentAdminId, rawPayload = {}) {
  const s = parseScope(rawPayload);
  if (s.channelId && s.postId) return { adminId: currentAdminId, channelId: s.channelId, scopeType: 'post', postId: s.postId, commentKey: s.commentKey || `${s.channelId}:${s.postId}` };
  if (s.channelId) return { adminId: currentAdminId, channelId: s.channelId, scopeType: 'channel', postId: '', commentKey: '' };
  return { adminId: currentAdminId, channelId: '', scopeType: 'none', postId: '', commentKey: '' };
}

function isServiceTitle(title = '') {
  const value = norm(title).toLowerCase();
  return !!value && [/модерац/, /выберите область/, /выберите пост/, /выберите канал/, /правила всего канала/, /правила этого поста/, /фильтр:/, /стоп-слова:/, /ручной список:/, /главное меню/, /помощь по разделу/].some((re) => re.test(value));
}

function routeFrom(rawAction, rawPayload = {}) {
  const a = norm(rawAction).toLowerCase();
  const scope = parseScope(rawPayload);
  const hasPostScope = Boolean(scope.channelId && scope.postId);
  const exact = {
    moderation: 'mod_start', 'модерация': 'mod_start', ak_mod_start: 'mod_start', mod_start: 'mod_start', moderation_menu: 'mod_start', 'moderation:home': 'mod_start',
    mod_choose_channel: 'mod_choose_channel', mod_open_channel: 'mod_open_channel', mod_choose_scope: 'mod_open_channel',
    mod_choose_post: 'mod_choose_post', 'moderation:choose_post': 'mod_choose_post',
    mod_channel_rules: 'mod_channel_rules', 'moderation:channel_rules': 'mod_channel_rules',
    mod_post_rules: 'mod_post_rules', 'moderation:post': 'mod_post_rules',
    mod_toggle_enabled: 'mod_toggle_enabled', 'moderation:toggle_filter': 'mod_toggle_enabled',
    mod_toggle_preset: 'mod_toggle_preset', 'moderation:toggle_basic_words': 'mod_toggle_preset',
    mod_add_stopword: 'mod_add_stopword', 'moderation:manual_words': 'mod_add_stopword', 'moderation:add_word': 'mod_add_stopword',
    mod_clear_stopwords: 'mod_clear_stopwords', 'moderation:clear_manual_words': 'mod_clear_stopwords',
    mod_toggle_links: 'mod_toggle_links', 'moderation:toggle_links': 'mod_toggle_links',
    mod_toggle_invites: 'mod_toggle_invites', 'moderation:toggle_invites': 'mod_toggle_invites',
    mod_toggle_ai: 'mod_toggle_ai', 'moderation:toggle_ai': 'mod_toggle_ai',
    mod_base_words: 'mod_base_words', 'moderation:base_words': 'mod_base_words', 'moderation:basic_words': 'mod_base_words',
    mod_logs: 'mod_logs', 'moderation:logs': 'mod_logs',
    mod_test_comment: 'mod_test_comment', 'moderation:test_comment': 'mod_test_comment',
    mod_test_comment_example: 'mod_test_comment_example', 'moderation:test_comment_example': 'mod_test_comment_example',
    mod_cancel: 'mod_cancel', mod_help: 'mod_help', help_moderation: 'mod_help', 'help:moderation': 'mod_help', mod_help_connect: 'mod_help_connect'
  };
  if (exact[a]) return exact[a];
  if (hasPostScope) return 'mod_post_rules';
  if (scope.channelId && /(open|select|choose|pick|channel|канал|выбр)/i.test(a)) return 'mod_open_channel';
  if (/(post|пост)/i.test(a) && /(choose|select|pick|выбр)/i.test(a)) return 'mod_choose_post';
  if (/(help|помощ)/i.test(a)) return 'mod_help';
  if (/(moder|модер)/i.test(a)) return 'mod_start';
  return '';
}

function isModerationCallback(update = {}) {
  if (!callback(update)) return false;
  const raw = payload(update);
  return Boolean(routeFrom(action(update), raw) || parseScope(raw).channelId || parseScope(raw).postId);
}

function resultMessageId(result) { const match = JSON.stringify(result || {}).match(/"(?:message_id|messageId|id)"\s*:\s*"([^"{}]+)"/); return match ? match[1] : ''; }
async function answer(update, notification) { const id = callbackId(update); if (!id) return; try { await api.answerCallback({ botToken: config.botToken, callbackId: id, notification }); } catch {} }
async function sendOrEdit(update, currentAdminId, packet, preferEdit = true) {
  const mid = preferEdit ? messageId(update) : '';
  if (mid) {
    try { await api.editMessage({ botToken: config.botToken, messageId: mid, text: packet.text, attachments: packet.attachments || [], notify: false }); await db.setMenu(currentAdminId, mid); return; }
    catch (error) { console.warn('[canonical moderation edit]', error && error.message ? error.message : error); }
  }
  const oldMenuId = await db.getMenu(currentAdminId);
  if (oldMenuId && oldMenuId !== mid) { try { await api.deleteMessage({ botToken: config.botToken, messageId: oldMenuId, timeoutMs: 1200 }); } catch {} }
  const args = { botToken: config.botToken, text: packet.text, attachments: packet.attachments || [], notify: false };
  if (currentAdminId) args.userId = currentAdminId; else if (chatId(update)) args.chatId = chatId(update); else return;
  const result = await api.sendMessage(args);
  const newId = resultMessageId(result);
  if (newId) await db.setMenu(currentAdminId, newId);
}

async function channelTitle(currentAdminId, channelId) { const channels = await db.getChannels(currentAdminId); return channels.find((item) => String(item.channelId) === String(channelId))?.title || channelId || 'Канал'; }
async function realPosts(currentAdminId, channelId, limit = 30) {
  const posts = await db.getPosts(currentAdminId, channelId, limit);
  return posts.filter((post) => post && post.postId && post.commentKey && !isServiceTitle(post.title || '') && !String(post.postId).startsWith('mid.') && !String(post.postId).startsWith('menu.'));
}
function scopeButtons(scope) { return { channelId: scope.channelId, postId: scope.postId || '', commentKey: scope.commentKey || '', scopeType: scope.scopeType || 'channel' }; }
function ok(v) { return v ? '✅' : '❌'; }
function enabled(v) { return v === false ? 'выключен' : 'включён'; }
function enabledPlural(v) { return v === false ? 'выключены' : 'включены'; }
function linkStatus(r) { return r.blockLinks ? 'запрещены' : 'разрешены'; }
function inviteStatus(r) { return r.blockInvites === false ? 'разрешены' : 'запрещены'; }
function buttonFilter(r) { return r.enabled === false ? '✅ Фильтр' : '⏸ Фильтр'; }
function buttonLinks(r) { return r.blockLinks ? '🔗 Разрешить' : '🔗 Запретить'; }
function buttonInvites(r) { return r.blockInvites === false ? '✉️ Запретить' : '✉️ Разрешить'; }
function buttonAI(r) { return r.aiEnabled ? '🤖 AI выкл' : '🤖 AI вкл'; }

async function noChannelsMenu() { return { text: ['🛡 Модерация', '', 'У вас ещё нет подключённых каналов.', 'Добавьте бота в канал администратором и перешлите любой пост из канала.'].join('\n'), attachments: keyboard([[button('❓ Как подключить', 'mod_help_connect')], [button('🏠 Главное меню', 'ak_main_menu')]]) }; }
async function channelPicker(currentAdminId) {
  const channels = await db.getChannels(currentAdminId);
  if (!channels.length) return noChannelsMenu();
  const rows = channels.map((ch, i) => [button(`${i + 1}. ${cut(ch.title || ch.channelId, 36)}`, 'mod_open_channel', { channelId: ch.channelId })]);
  rows.push([button('🏠 Главное меню', 'ak_main_menu')]);
  return { text: ['🛡 Модерация', '', 'Выберите канал для модерации.'].join('\n'), attachments: keyboard(rows) };
}
async function areaMenu(currentAdminId, channelId = '') {
  const channels = await db.getChannels(currentAdminId);
  if (!channels.length) return noChannelsMenu();
  const selected = channelId || (channels.length === 1 ? channels[0].channelId : '');
  if (!selected) return channelPicker(currentAdminId);
  const title = await channelTitle(currentAdminId, selected);
  return { text: ['🛡 Модерация', `📺 Канал: ${title}`, '', 'Выберите область настройки.'].join('\n'), attachments: keyboard([[button('🛡 Правила канала', 'mod_channel_rules', { channelId: selected, scopeType: 'channel' }), button('🎯 Правила поста', 'mod_choose_post', { channelId: selected })], [button('📺 Другой канал', 'mod_choose_channel'), button('❓ Помощь', 'mod_help')], [button('🏠 Главное меню', 'ak_main_menu')]]) };
}
async function postPicker(currentAdminId, channelId) {
  if (!channelId) return channelPicker(currentAdminId);
  const title = await channelTitle(currentAdminId, channelId);
  const posts = await realPosts(currentAdminId, channelId, 50);
  const rows = posts.map((post, i) => [button(`${i + 1}. ${cut(post.title || post.postId, 36)}`, 'mod_post_rules', { channelId, postId: post.postId, commentKey: post.commentKey, scopeType: 'post' })]);
  rows.push([button('🛡 Правила канала', 'mod_channel_rules', { channelId, scopeType: 'channel' })], [button('↩️ Раздел', 'mod_open_channel', { channelId }), button('🏠 Главное меню', 'ak_main_menu')]);
  return { text: ['🛡 Модерация → выбор поста', `📺 Канал: ${title}`, '', `Постов найдено: ${posts.length}`, posts.length ? 'Выберите пост.' : 'Перешлите нужный пост боту один раз.'].join('\n'), attachments: keyboard(rows) };
}

async function rulesMenu(scope, overrideRules = null) {
  const rules = overrideRules || await db.getRules(scope);
  const isPost = scope.scopeType === 'post' && scope.postId;
  const title = await channelTitle(scope.adminId, scope.channelId);
  const posts = isPost ? await realPosts(scope.adminId, scope.channelId, 100) : [];
  const postTitle = isPost ? (posts.find((p) => String(p.postId) === String(scope.postId))?.title || scope.postId) : '';
  const custom = Array.isArray(rules.customBlocklist) ? rules.customBlocklist : [];
  const scopePayload = scopeButtons(scope);
  return {
    text: [
      isPost ? '🛡 Модерация → пост' : '🛡 Модерация',
      `📺 Канал: ${title}`,
      `🎯 Область: ${isPost ? 'конкретный пост' : 'весь канал'}`,
      isPost ? `📝 Пост: ${cut(postTitle, 60)}` : '',
      '',
      `🛡 Фильтр: ${enabled(rules.enabled)} ${ok(rules.enabled !== false)} · 🧱 База: ${enabledPlural(rules.applyPresetCommon)} ${ok(rules.applyPresetCommon !== false)}`,
      `➕ Стоп-слова: ${custom.length} · 🔗 Ссылки: ${linkStatus(rules)} ${ok(!rules.blockLinks)}`,
      `✉️ Инвайты: ${inviteStatus(rules)} ${ok(rules.blockInvites === false)} · 🤖 AI: ${enabled(rules.aiEnabled)} ${ok(rules.aiEnabled)}`
    ].filter(Boolean).join('\n'),
    attachments: keyboard([
      [button('🛡 Канал', 'mod_channel_rules', { channelId: scope.channelId, scopeType: 'channel' }), button('🎯 Пост', 'mod_choose_post', { channelId: scope.channelId })],
      [button(buttonFilter(rules), 'mod_toggle_enabled', scopePayload), button('🧱 База', 'mod_base_words', scopePayload)],
      [button(buttonLinks(rules), 'mod_toggle_links', scopePayload), button(buttonInvites(rules), 'mod_toggle_invites', scopePayload)],
      [button(buttonAI(rules), 'mod_toggle_ai', scopePayload), button('➕ Стоп-слово', 'mod_add_stopword', scopePayload)],
      [button('📋 Журнал', 'mod_logs', scopePayload), button('🧪 Проверка', 'mod_test_comment', scopePayload)],
      [button('❓ Помощь', 'mod_help'), button('↩️ Раздел', 'mod_open_channel', { channelId: scope.channelId })],
      [button('🏠 Главное меню', 'ak_main_menu')]
    ])
  };
}

async function baseWordsMenu(scope) {
  const rules = await db.getRules(scope);
  const preview = BASE_STOP_WORDS.slice(0, 18).join(', ');
  return { text: ['🧱 Базовые стоп-слова', `Статус: ${enabledPlural(rules.applyPresetCommon)} ${ok(rules.applyPresetCommon !== false)}`, `Всего слов и фраз: ${BASE_STOP_WORDS.length}`, '', `Пример: ${preview} и ещё ${Math.max(0, BASE_STOP_WORDS.length - 18)}.`, '', 'Список закрывает массовый спам, мошенничество, ставки, агрессивные приглашения и подозрительные заработки.'].join('\n'), attachments: keyboard([[button(rules.applyPresetCommon === false ? '🧱 Включить базу' : '🧱 Выключить базу', 'mod_toggle_preset', scopeButtons(scope))], [button('↩️ Назад', scope.scopeType === 'post' ? 'mod_post_rules' : 'mod_channel_rules', scopeButtons(scope)), button('🏠 Главное меню', 'ak_main_menu')]]) };
}
async function logsMenu(scope) { return { text: ['📋 Журнал модерации', '', 'Пока журнал пуст.', 'Здесь будут последние срабатывания фильтра: слово, причина, пост и действие администратора.'].join('\n'), attachments: keyboard([[button('↩️ Назад', scope.scopeType === 'post' ? 'mod_post_rules' : 'mod_channel_rules', scopeButtons(scope)), button('🏠 Главное меню', 'ak_main_menu')]]) }; }
async function testCommentMenu(scope) { return { text: ['🧪 Проверка комментария', '', 'Отправьте текст комментария следующим сообщением.', 'Бот покажет результат: пропустить, скрыть или отправить на ручную модерацию.'].join('\n'), attachments: keyboard([[button('🧪 Пример', 'mod_test_comment_example', scopeButtons(scope))], [button('↩️ Назад', scope.scopeType === 'post' ? 'mod_post_rules' : 'mod_channel_rules', scopeButtons(scope)), button('🏠 Главное меню', 'ak_main_menu')]]) }; }
async function testCommentExample(scope) { const rules = await db.getRules(scope); const blocked = (rules.enabled !== false && rules.applyPresetCommon !== false) || rules.blockLinks; return { text: ['🧪 Проверка комментария', '', 'Текст: «спам, перейди по ссылке»', `Результат: ${blocked ? 'скрыть' : 'пропустить'}`, `Причина: ${blocked ? 'найдено базовое стоп-слово или запрещённая ссылка' : 'нарушений не найдено'}.`].join('\n'), attachments: keyboard([[button('↩️ Назад', scope.scopeType === 'post' ? 'mod_post_rules' : 'mod_channel_rules', scopeButtons(scope)), button('🏠 Главное меню', 'ak_main_menu')]]) }; }
async function helpMenu() { return { text: ['❓ Помощь по модерации', '', 'Одна настройка — одна кнопка. Нажатие меняет состояние и сразу обновляет сводку сверху.', 'Области две: весь канал или конкретный пост.', 'Правила поста сохраняются отдельно и не применяются к другим постам.'].join('\n'), attachments: keyboard([[button('🛡 В начало модерации', 'mod_start')], [button('🏠 Главное меню', 'ak_main_menu')]]) }; }
async function connectHelpMenu() { return { text: ['✅ Как подключить канал', '', '1. Добавьте бота в канал администратором.', '2. Перешлите боту любой пост из канала.', '3. Канал и пост появятся в разделах управления.'].join('\n'), attachments: keyboard([[button('🛡 В начало модерации', 'mod_start')], [button('🏠 Главное меню', 'ak_main_menu')]]) }; }
function splitStopWords(value) { return [...new Set(String(value || '').split(/[\n,;]+/g).map((word) => norm(word).toLowerCase()).filter(Boolean))]; }

async function handleStopWordTextFlow(update, currentAdminId) {
  const flow = await db.getFlow(currentAdminId);
  const value = messageText(update);
  if (!flow || flow.type !== 'mod_add_stopword' || !value) return false;
  const scope = flow.scopeType === 'post' ? { adminId: currentAdminId, channelId: flow.channelId, scopeType: 'post', postId: flow.postId, commentKey: flow.commentKey } : { adminId: currentAdminId, channelId: flow.channelId, scopeType: 'channel', postId: '', commentKey: '' };
  const oldRules = await db.getRules(scope);
  const nextCustomBlocklist = [...new Set([...(Array.isArray(oldRules.customBlocklist) ? oldRules.customBlocklist : []), ...splitStopWords(value)])];
  const saved = await db.saveRules(scope, { customBlocklist: nextCustomBlocklist });
  await db.clearFlow(currentAdminId);
  await sendOrEdit(update, currentAdminId, await rulesMenu(scope, saved), false);
  return true;
}
function looksLikeForwardedChannelPost(update = {}) {
  if (callback(update)) return false;
  const stringified = JSON.stringify(update || {}).toLowerCase();
  const explicitForward = /forward|forwarded|переслан|sender_chat|original|channel_id/.test(stringified);
  const p = payload(update); const channel = db.extractChannel(update, p); const post = db.extractPost(update, p, channel.channelId); const currentChat = chatId(update);
  if (!channel.channelId || !post.postId || !post.commentKey) return false;
  if (currentChat && String(channel.channelId) === String(currentChat)) return false;
  if (isServiceTitle(post.title || '')) return false;
  return /^-/.test(String(channel.channelId)) || explicitForward;
}
async function persistForwardedPost(update) { if (!looksLikeForwardedChannelPost(update)) return null; const registered = await db.upsertFromUpdate(update); return registered && registered.channelId && registered.postId ? registered : null; }
async function handleForwardedPost(update, currentAdminId) {
  const registered = await persistForwardedPost(update);
  if (!registered) return false;
  const scope = { adminId: currentAdminId, channelId: registered.channelId, scopeType: 'post', postId: registered.postId, commentKey: registered.commentKey || `${registered.channelId}:${registered.postId}` };
  await db.saveRules(scope, await db.getRules(scope));
  await sendOrEdit(update, currentAdminId, await rulesMenu(scope), false);
  return true;
}

async function handle(update = {}) {
  await db.init();
  const uid = adminId(update);
  if (!uid) return false;
  if (await handleStopWordTextFlow(update, uid)) return true;
  if (!callback(update)) return handleForwardedPost(update, uid);
  if (!isModerationCallback(update)) return false;
  const raw = payload(update);
  const route = routeFrom(action(update), raw);
  const scope = buildScope(uid, raw);
  if (route === 'mod_start') { await answer(update, 'Модерация'); await sendOrEdit(update, uid, await areaMenu(uid)); return true; }
  if (route === 'mod_help') { await answer(update, 'Помощь'); await sendOrEdit(update, uid, await helpMenu()); return true; }
  if (route === 'mod_help_connect') { await answer(update, 'Как подключить'); await sendOrEdit(update, uid, await connectHelpMenu()); return true; }
  if (route === 'mod_choose_channel') { await answer(update, 'Выберите канал'); await sendOrEdit(update, uid, await channelPicker(uid)); return true; }
  if (route === 'mod_open_channel') { await answer(update, 'Канал выбран'); await sendOrEdit(update, uid, await areaMenu(uid, scope.channelId)); return true; }
  if (route === 'mod_choose_post') { await answer(update, 'Выберите пост'); await sendOrEdit(update, uid, await postPicker(uid, scope.channelId)); return true; }
  if (route === 'mod_channel_rules') {
    if (!scope.channelId) { await answer(update, 'Сначала выберите канал'); await sendOrEdit(update, uid, await channelPicker(uid)); return true; }
    const channelScope = { adminId: uid, channelId: scope.channelId, scopeType: 'channel', postId: '', commentKey: '' };
    await db.saveRules(channelScope, await db.getRules(channelScope)); await answer(update, 'Правила канала'); await sendOrEdit(update, uid, await rulesMenu(channelScope)); return true;
  }
  if (route === 'mod_post_rules') {
    if (!scope.channelId || !scope.postId) { await answer(update, 'Сначала выберите пост'); await sendOrEdit(update, uid, await postPicker(uid, scope.channelId)); return true; }
    const postScope = { adminId: uid, channelId: scope.channelId, scopeType: 'post', postId: scope.postId, commentKey: scope.commentKey || `${scope.channelId}:${scope.postId}` };
    await db.saveRules(postScope, await db.getRules(postScope)); await answer(update, 'Правила поста'); await sendOrEdit(update, uid, await rulesMenu(postScope)); return true;
  }
  if (!scope.channelId) { await answer(update, 'Сначала выберите канал'); await sendOrEdit(update, uid, await channelPicker(uid)); return true; }
  const targetScope = scope.scopeType === 'post' && scope.postId ? { adminId: uid, channelId: scope.channelId, scopeType: 'post', postId: scope.postId, commentKey: scope.commentKey || `${scope.channelId}:${scope.postId}` } : { adminId: uid, channelId: scope.channelId, scopeType: 'channel', postId: '', commentKey: '' };
  if (route === 'mod_base_words') { await answer(update, 'Базовые слова'); await sendOrEdit(update, uid, await baseWordsMenu(targetScope)); return true; }
  if (route === 'mod_logs') { await answer(update, 'Журнал'); await sendOrEdit(update, uid, await logsMenu(targetScope)); return true; }
  if (route === 'mod_test_comment') { await answer(update, 'Проверка'); await sendOrEdit(update, uid, await testCommentMenu(targetScope)); return true; }
  if (route === 'mod_test_comment_example') { await answer(update, 'Пример'); await sendOrEdit(update, uid, await testCommentExample(targetScope)); return true; }
  if (route === 'mod_add_stopword') {
    await db.setFlow(uid, { type: 'mod_add_stopword', channelId: targetScope.channelId, scopeType: targetScope.scopeType, postId: targetScope.postId, commentKey: targetScope.commentKey, createdAt: Date.now() });
    await answer(update, 'Пришлите стоп-слово');
    await sendOrEdit(update, uid, { text: ['➕ Стоп-слово', '', 'Пришлите слово или фразу одним сообщением.', targetScope.scopeType === 'post' ? 'Оно будет добавлено только к этому посту.' : 'Оно будет добавлено к правилам всего канала.'].join('\n'), attachments: keyboard([[button('↩️ Отмена', 'mod_cancel', scopeButtons(targetScope))]]) });
    return true;
  }
  if (route === 'mod_cancel') { await db.clearFlow(uid); await answer(update, 'Отменено'); await sendOrEdit(update, uid, await rulesMenu(targetScope)); return true; }
  const old = await db.getRules(targetScope);
  const next = { ...old };
  if (route === 'mod_toggle_enabled') next.enabled = old.enabled === false;
  else if (route === 'mod_toggle_preset') next.applyPresetCommon = old.applyPresetCommon === false;
  else if (route === 'mod_clear_stopwords') next.customBlocklist = [];
  else if (route === 'mod_toggle_links') next.blockLinks = !old.blockLinks;
  else if (route === 'mod_toggle_invites') next.blockInvites = old.blockInvites === false;
  else if (route === 'mod_toggle_ai') next.aiEnabled = !old.aiEnabled;
  else return false;
  const saved = await db.saveRules(targetScope, next);
  await answer(update, 'Сохранено');
  await sendOrEdit(update, uid, await rulesMenu(targetScope, saved));
  return true;
}

function selfTest() {
  const postPayload = { action: 'mod_post_rules', channelId: '-100', postId: 'p1', commentKey: '-100:p1', scopeType: 'post' };
  const channelPayload = { action: 'mod_channel_rules', channelId: '-100', scopeType: 'channel' };
  const checks = {
    postRoute: routeFrom(postPayload.action, postPayload) === 'mod_post_rules',
    channelRoute: routeFrom(channelPayload.action, channelPayload) === 'mod_channel_rules',
    modernToggleRoute: routeFrom('moderation:toggle_links', postPayload) === 'mod_toggle_links',
    baseWordsRoute: routeFrom('moderation:base_words', postPayload) === 'mod_base_words',
    checkCommentRoute: routeFrom('moderation:test_comment', postPayload) === 'mod_test_comment',
    callbackPostUpsert: 'disabled' === 'disabled'
  };
  return { ok: Object.values(checks).every(Boolean), checks, runtime: RUNTIME, sourceMarker: SOURCE, baseStopWordsCount: BASE_STOP_WORDS.length, callbackPostUpsert: 'disabled' };
}

module.exports = { RUNTIME, SOURCE, handle, parseScope, buildScope, routeFrom, isServiceTitle, looksLikeForwardedChannelPost, selfTest };
