'use strict';

/**
 * CC5.2 clean moderation router.
 * Rules: PostgreSQL is the persistent source of truth; no legacy fallback; callbacks never create posts.
 */

const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');

const RUNTIME = 'CC5.2';
const SOURCE = 'adminkit-CC5.2-clean-moderation-router';
const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const clean = (value) => db.clean(value);
const cut = (value, size = 64) => db.cut(value, size);

function button(text, action, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ action, ...extra }) }; }
function keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
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
  const scope = parseScope(rawPayload);
  if (scope.channelId && scope.postId) return { adminId: currentAdminId, channelId: scope.channelId, scopeType: 'post', postId: scope.postId, commentKey: scope.commentKey || `${scope.channelId}:${scope.postId}` };
  if (scope.channelId) return { adminId: currentAdminId, channelId: scope.channelId, scopeType: 'channel', postId: '', commentKey: '' };
  return { adminId: currentAdminId, channelId: '', scopeType: 'none', postId: '', commentKey: '' };
}

function isServiceTitle(title = '') {
  const value = norm(title).toLowerCase();
  if (!value) return false;
  return [/модерац/, /выберите область/, /выберите пост/, /выберите канал/, /правила всего канала/, /правила этого поста/, /фильтр:/, /стоп-слова:/, /ручной список:/, /главное меню/, /помощь по разделу/].some((re) => re.test(value));
}

function routeFrom(rawAction, rawPayload = {}) {
  const a = norm(rawAction).toLowerCase();
  const scope = parseScope(rawPayload);
  const hasPostScope = Boolean(scope.channelId && scope.postId);
  const exact = { moderation: 'mod_start', 'модерация': 'mod_start', ak_mod_start: 'mod_start', mod_start: 'mod_start', mod_choose_channel: 'mod_choose_channel', mod_open_channel: 'mod_open_channel', mod_choose_scope: 'mod_open_channel', mod_choose_post: 'mod_choose_post', mod_channel_rules: 'mod_channel_rules', mod_post_rules: 'mod_post_rules', mod_toggle_enabled: 'mod_toggle_enabled', mod_toggle_preset: 'mod_toggle_preset', mod_add_stopword: 'mod_add_stopword', mod_clear_stopwords: 'mod_clear_stopwords', mod_toggle_links: 'mod_toggle_links', mod_toggle_invites: 'mod_toggle_invites', mod_cancel: 'mod_cancel', mod_help: 'mod_help', mod_help_connect: 'mod_help_connect' };
  if (exact[a]) return exact[a];
  if (hasPostScope) return 'mod_post_rules';
  if (scope.channelId && /(open|select|choose|pick|channel|канал|выбр)/i.test(a)) return 'mod_open_channel';
  if (/(post|пост)/i.test(a) && /(choose|select|pick|выбр)/i.test(a)) return 'mod_choose_post';
  if (/(channel|канал)/i.test(a) && /(choose|select|pick|выбр)/i.test(a)) return 'mod_choose_channel';
  if (/(help|помощ)/i.test(a)) return 'mod_help';
  if (/(moder|модер)/i.test(a)) return 'mod_start';
  return '';
}

function isModerationCallback(update = {}) {
  if (!callback(update)) return false;
  const rawPayload = payload(update);
  const route = routeFrom(action(update), rawPayload);
  if (route) return true;
  const scope = parseScope(rawPayload);
  return Boolean(scope.channelId || scope.postId);
}

function resultMessageId(result) { const match = JSON.stringify(result || {}).match(/"(?:message_id|messageId|id)"\s*:\s*"([^"{}]+)"/); return match ? match[1] : ''; }
async function answer(update, notification) { const id = callbackId(update); if (!id) return; try { await api.answerCallback({ botToken: config.botToken, callbackId: id, notification }); } catch (error) { console.warn('[CC5.2 answerCallback]', error && error.message ? error.message : error); } }

async function sendOrEdit(update, currentAdminId, packet, preferEdit = true) {
  const currentMessageId = preferEdit ? messageId(update) : '';
  if (currentMessageId) {
    try { await api.editMessage({ botToken: config.botToken, messageId: currentMessageId, text: packet.text, attachments: packet.attachments || [], notify: false }); await db.setMenu(currentAdminId, currentMessageId); return; }
    catch (error) { console.warn('[CC5.2 editMessage]', error && error.message ? error.message : error); }
  }
  const oldMenuId = await db.getMenu(currentAdminId);
  if (oldMenuId && oldMenuId !== currentMessageId) { try { await api.deleteMessage({ botToken: config.botToken, messageId: oldMenuId, timeoutMs: 1200 }); } catch {} }
  const args = { botToken: config.botToken, text: packet.text, attachments: packet.attachments || [], notify: false };
  if (currentAdminId) args.userId = currentAdminId; else if (chatId(update)) args.chatId = chatId(update); else return;
  const result = await api.sendMessage(args);
  const newMessageId = resultMessageId(result);
  if (newMessageId) await db.setMenu(currentAdminId, newMessageId);
}

async function channelTitle(currentAdminId, channelId) { const channels = await db.getChannels(currentAdminId); const channel = channels.find((item) => String(item.channelId) === String(channelId)); return channel?.title || channelId || 'Канал'; }
async function realPosts(currentAdminId, channelId, limit = 30) {
  const posts = await db.getPosts(currentAdminId, channelId, limit);
  return posts.filter((post) => post && post.postId && post.commentKey && !isServiceTitle(post.title || '') && !String(post.postId).startsWith('mid.') && !String(post.postId).startsWith('menu.'));
}

async function noChannelsMenu() { return { text: ['🛡 Модерация', '', 'У вас ещё нет подключённых каналов.', 'Добавьте бота в канал администратором и перешлите любой пост из канала.'].join('\n'), attachments: keyboard([[button('❓ Как подключить', 'mod_help_connect')], [button('🏠 Главное меню', 'ak_main_menu')]]) }; }
async function channelPicker(currentAdminId) {
  const channels = await db.getChannels(currentAdminId);
  if (!channels.length) return noChannelsMenu();
  const rows = channels.map((channel, index) => [button(`${index + 1}. ${cut(channel.title || channel.channelId, 42)}`, 'mod_open_channel', { channelId: channel.channelId })]);
  rows.push([button('🏠 Главное меню', 'ak_main_menu')]);
  return { text: ['🛡 Модерация', '', 'Выберите канал для модерации.'].join('\n'), attachments: keyboard(rows) };
}
async function areaMenu(currentAdminId, channelId = '') {
  const channels = await db.getChannels(currentAdminId);
  if (!channels.length) return noChannelsMenu();
  const selectedChannelId = channelId || (channels.length === 1 ? channels[0].channelId : '');
  if (!selectedChannelId) return channelPicker(currentAdminId);
  const title = await channelTitle(currentAdminId, selectedChannelId);
  return { text: ['🛡 Модерация', '', `Канал: ${title}`, '', 'Что настраиваем?'].join('\n'), attachments: keyboard([[button('🛡 Правила всего канала', 'mod_channel_rules', { channelId: selectedChannelId, scopeType: 'channel' })], [button('🎯 Правила конкретного поста', 'mod_choose_post', { channelId: selectedChannelId })], [button('📺 Другой канал', 'mod_choose_channel')], [button('🏠 Главное меню', 'ak_main_menu')]]) };
}
async function postPicker(currentAdminId, channelId) {
  if (!channelId) return channelPicker(currentAdminId);
  const title = await channelTitle(currentAdminId, channelId);
  const posts = await realPosts(currentAdminId, channelId, 50);
  const rows = posts.map((post, index) => [button(`🎯 Пост ${index + 1}: ${cut(post.title || post.postId, 38)}`, 'mod_post_rules', { channelId, postId: post.postId, commentKey: post.commentKey, scopeType: 'post' })]);
  rows.push([button('🛡 Правила всего канала', 'mod_channel_rules', { channelId, scopeType: 'channel' })], [button('📺 Другой канал', 'mod_choose_channel')], [button('🏠 Главное меню', 'ak_main_menu')]);
  return { text: ['🛡 Модерация', '', `Канал: ${title}`, '', posts.length ? 'Выберите ПОСТ для отдельных правил. В списке ниже только реальные посты канала.' : 'Реальных постов этого канала пока нет в PostgreSQL. Перешлите нужный пост боту один раз.'].join('\n'), attachments: keyboard(rows) };
}

async function rulesMenu(scope, overrideRules = null) {
  const rules = overrideRules || await db.getRules(scope);
  const isPost = scope.scopeType === 'post' && scope.postId;
  const title = await channelTitle(scope.adminId, scope.channelId);
  const posts = isPost ? await realPosts(scope.adminId, scope.channelId, 100) : [];
  const postTitle = isPost ? (posts.find((post) => String(post.postId) === String(scope.postId))?.title || scope.postId) : '';
  const customBlocklist = Array.isArray(rules.customBlocklist) ? rules.customBlocklist : [];
  const rows = [[button(isPost ? '🎯 Другой пост' : '🎯 Правила конкретного поста', 'mod_choose_post', { channelId: scope.channelId })], ...(isPost ? [[button('🛡 Правила всего канала', 'mod_channel_rules', { channelId: scope.channelId, scopeType: 'channel' })]] : []), [button(rules.enabled === false ? '▶️ Включить фильтр' : '⏸ Выключить фильтр', 'mod_toggle_enabled', scope)], [button(rules.applyPresetCommon === false ? '🧱 Базовые стоп-слова: выкл.' : '🧱 Базовые стоп-слова: вкл.', 'mod_toggle_preset', scope)], [button('➕ Стоп-слово', 'mod_add_stopword', scope), button('🧹 Очистить ручные', 'mod_clear_stopwords', scope)], [button(rules.blockLinks ? '🔗 Ссылки: блок.' : '🔗 Ссылки: разреш.', 'mod_toggle_links', scope), button(rules.blockInvites === false ? '✉️ Инвайты: разреш.' : '✉️ Инвайты: блок.', 'mod_toggle_invites', scope)], [button('🏠 Главное меню', 'ak_main_menu')]];
  return { text: ['🛡 Модерация', '', `Канал: ${title}`, isPost ? `Пост: ${cut(postTitle, 70)}` : '', `Область: ${isPost ? 'правила этого поста' : 'правила всего канала'}`, `Фильтр: ${rules.enabled === false ? 'выключен' : 'включён'}`, `Базовые стоп-слова: ${rules.applyPresetCommon === false ? 'выключены' : 'включены'}`, `Ручной список: ${customBlocklist.length ? customBlocklist.join(', ') : 'пока пусто'}`, `Ссылки: ${rules.blockLinks ? 'блокируются' : 'разрешены'}`, `Приглашения: ${rules.blockInvites === false ? 'разрешены' : 'блокируются'}`, '', 'Выберите правило кнопками ниже.'].filter(Boolean).join('\n'), attachments: keyboard(rows) };
}

async function helpMenu() { return { text: ['🛡 Помощь по модерации', '', 'Путь: канал → область правил → правило.', 'Области две: весь канал или конкретный пост.', 'Правила поста сохраняются отдельно и не применяются к другим постам.', 'Все постоянные данные хранятся в PostgreSQL.'].join('\n'), attachments: keyboard([[button('🛡 В начало модерации', 'mod_start')], [button('🏠 Главное меню', 'ak_main_menu')]]) }; }
async function connectHelpMenu() { return { text: ['✅ Как подключить канал', '', '1. Добавьте бота в канал администратором.', '2. Перешлите боту любой пост из канала.', '3. Бот запишет связку adminId → channelId → postId в PostgreSQL.', '4. После этого канал и пост появятся в модерации.'].join('\n'), attachments: keyboard([[button('🛡 В начало модерации', 'mod_start')], [button('🏠 Главное меню', 'ak_main_menu')]]) }; }
function splitStopWords(value) { return [...new Set(String(value || '').split(/[\n,;]+/g).map((word) => norm(word).toLowerCase()).filter(Boolean))]; }

async function handleStopWordTextFlow(update, currentAdminId) {
  const flow = await db.getFlow(currentAdminId);
  const value = messageText(update);
  if (!flow || flow.type !== 'mod_add_stopword' || !value) return false;
  const scope = flow.scopeType === 'post' ? { adminId: currentAdminId, channelId: flow.channelId, scopeType: 'post', postId: flow.postId, commentKey: flow.commentKey } : { adminId: currentAdminId, channelId: flow.channelId, scopeType: 'channel', postId: '', commentKey: '' };
  const oldRules = await db.getRules(scope);
  const nextCustomBlocklist = [...new Set([...(Array.isArray(oldRules.customBlocklist) ? oldRules.customBlocklist : []), ...splitStopWords(value)])];
  const savedRules = await db.saveRules(scope, { customBlocklist: nextCustomBlocklist });
  await db.clearFlow(currentAdminId);
  await sendOrEdit(update, currentAdminId, await rulesMenu(scope, savedRules), false);
  return true;
}

function looksLikeForwardedChannelPost(update = {}) {
  if (callback(update)) return false;
  const stringified = JSON.stringify(update || {}).toLowerCase();
  const explicitForward = /forward|forwarded|переслан|sender_chat|original|channel_id/.test(stringified);
  const p = payload(update);
  const channel = db.extractChannel(update, p);
  const post = db.extractPost(update, p, channel.channelId);
  const currentChat = chatId(update);
  if (!channel.channelId || !post.postId || !post.commentKey) return false;
  if (currentChat && String(channel.channelId) === String(currentChat)) return false;
  if (isServiceTitle(post.title || '')) return false;
  if (/^-/.test(String(channel.channelId))) return true;
  return explicitForward;
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
  const currentAdminId = adminId(update);
  if (!currentAdminId) return false;
  if (await handleStopWordTextFlow(update, currentAdminId)) return true;
  if (!callback(update)) return handleForwardedPost(update, currentAdminId);
  if (!isModerationCallback(update)) return false;
  const rawPayload = payload(update);
  const route = routeFrom(action(update), rawPayload);
  const scope = buildScope(currentAdminId, rawPayload);
  if (route === 'mod_start') { await answer(update, 'Модерация'); await sendOrEdit(update, currentAdminId, await areaMenu(currentAdminId)); return true; }
  if (route === 'mod_help') { await answer(update, 'Помощь'); await sendOrEdit(update, currentAdminId, await helpMenu()); return true; }
  if (route === 'mod_help_connect') { await answer(update, 'Как подключить'); await sendOrEdit(update, currentAdminId, await connectHelpMenu()); return true; }
  if (route === 'mod_choose_channel') { await answer(update, 'Выберите канал'); await sendOrEdit(update, currentAdminId, await channelPicker(currentAdminId)); return true; }
  if (route === 'mod_open_channel') { await answer(update, 'Канал выбран'); await sendOrEdit(update, currentAdminId, await areaMenu(currentAdminId, scope.channelId)); return true; }
  if (route === 'mod_choose_post') { await answer(update, 'Выберите пост'); await sendOrEdit(update, currentAdminId, await postPicker(currentAdminId, scope.channelId)); return true; }
  if (route === 'mod_channel_rules') {
    if (!scope.channelId) { await answer(update, 'Сначала выберите канал'); await sendOrEdit(update, currentAdminId, await channelPicker(currentAdminId)); return true; }
    const channelScope = { adminId: currentAdminId, channelId: scope.channelId, scopeType: 'channel', postId: '', commentKey: '' };
    await db.saveRules(channelScope, await db.getRules(channelScope)); await answer(update, 'Правила канала'); await sendOrEdit(update, currentAdminId, await rulesMenu(channelScope)); return true;
  }
  if (route === 'mod_post_rules') {
    if (!scope.channelId || !scope.postId) { await answer(update, 'Сначала выберите пост'); await sendOrEdit(update, currentAdminId, await postPicker(currentAdminId, scope.channelId)); return true; }
    const postScope = { adminId: currentAdminId, channelId: scope.channelId, scopeType: 'post', postId: scope.postId, commentKey: scope.commentKey || `${scope.channelId}:${scope.postId}` };
    await db.saveRules(postScope, await db.getRules(postScope)); await answer(update, 'Правила поста'); await sendOrEdit(update, currentAdminId, await rulesMenu(postScope)); return true;
  }
  if (!scope.channelId) { await answer(update, 'Сначала выберите канал'); await sendOrEdit(update, currentAdminId, await channelPicker(currentAdminId)); return true; }
  const targetScope = scope.scopeType === 'post' && scope.postId ? { adminId: currentAdminId, channelId: scope.channelId, scopeType: 'post', postId: scope.postId, commentKey: scope.commentKey || `${scope.channelId}:${scope.postId}` } : { adminId: currentAdminId, channelId: scope.channelId, scopeType: 'channel', postId: '', commentKey: '' };
  if (route === 'mod_add_stopword') {
    await db.setFlow(currentAdminId, { type: 'mod_add_stopword', channelId: targetScope.channelId, scopeType: targetScope.scopeType, postId: targetScope.postId, commentKey: targetScope.commentKey, createdAt: Date.now() });
    await answer(update, 'Пришлите стоп-слово');
    await sendOrEdit(update, currentAdminId, { text: ['🧱 Стоп-слово', '', 'Пришлите слово или фразу одним сообщением.', targetScope.scopeType === 'post' ? 'Оно будет добавлено только к этому посту.' : 'Оно будет добавлено к правилам всего канала.'].join('\n'), attachments: keyboard([[button('↩️ Отмена', 'mod_cancel', targetScope)]]) });
    return true;
  }
  if (route === 'mod_cancel') { await db.clearFlow(currentAdminId); await answer(update, 'Отменено'); await sendOrEdit(update, currentAdminId, await rulesMenu(targetScope)); return true; }
  const oldRules = await db.getRules(targetScope);
  const nextRules = { ...oldRules };
  if (route === 'mod_toggle_enabled') nextRules.enabled = oldRules.enabled === false;
  else if (route === 'mod_toggle_preset') nextRules.applyPresetCommon = oldRules.applyPresetCommon === false;
  else if (route === 'mod_clear_stopwords') nextRules.customBlocklist = [];
  else if (route === 'mod_toggle_links') nextRules.blockLinks = !oldRules.blockLinks;
  else if (route === 'mod_toggle_invites') nextRules.blockInvites = oldRules.blockInvites === false;
  else return false;
  const savedRules = await db.saveRules(targetScope, nextRules);
  await answer(update, 'Сохранено');
  await sendOrEdit(update, currentAdminId, await rulesMenu(targetScope, savedRules));
  return true;
}

function selfTest() {
  const postPayload = { action: 'mod_post_rules', channelId: '-100', postId: 'p1', commentKey: '-100:p1', scopeType: 'post' };
  const choosePostPayload = { action: 'mod_choose_post', channelId: '-100' };
  const channelPayload = { action: 'mod_channel_rules', channelId: '-100', scopeType: 'channel' };
  const legacyPostPayload = { action: 'open_scope', channelId: '-100', postId: 'p2', commentKey: '-100:p2' };
  const checks = [routeFrom(postPayload.action, postPayload) === 'mod_post_rules', routeFrom(choosePostPayload.action, choosePostPayload) === 'mod_choose_post', routeFrom(channelPayload.action, channelPayload) === 'mod_channel_rules', routeFrom(legacyPostPayload.action, legacyPostPayload) === 'mod_post_rules', buildScope('u1', postPayload).scopeType === 'post', buildScope('u1', postPayload).postId === 'p1', buildScope('u1', channelPayload).scopeType === 'channel', isServiceTitle('🛡 Модерация Выберите область правил') === true, isServiceTitle('Реальный пост про CC5.2') === false];
  return { ok: checks.every(Boolean), checks, runtime: RUNTIME, sourceMarker: SOURCE, routePost: routeFrom(postPayload.action, postPayload), routeLegacyPost: routeFrom(legacyPostPayload.action, legacyPostPayload), callbackPostUpsert: 'disabled' };
}

module.exports = { RUNTIME, SOURCE, handle, parseScope, buildScope, routeFrom, isServiceTitle, looksLikeForwardedChannelPost, selfTest };
