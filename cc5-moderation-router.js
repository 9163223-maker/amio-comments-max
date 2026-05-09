'use strict';

const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');

const RUNTIME = 'CC5.1';
const btn = (text, action, extra = {}) => ({ type: 'callback', text, payload: JSON.stringify({ action, ...extra }) });
const kb = (rows) => [{ type: 'inline_keyboard', payload: { buttons: rows } }];
const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const lowerWords = (value) => [...new Set(String(value || '').split(/[\n,;]+/g).map((w) => norm(w).toLowerCase()).filter(Boolean))];
const isPostScope = (scope) => scope && scope.scopeType === 'post' && scope.postId;

function payload(update) { return db.payload(update); }
function action(update) { return norm(db.action(update)); }
function adminId(update) { return db.adminId(update); }
function cbid(update) { return db.callbackId(update); }
function mid(update) { return db.messageId(update); }
function text(update) { return db.text(update); }
function chatId(update) { return db.chatId(update); }
function cut(v, n = 80) { return db.cut(v, n); }
function postIdFromCommentKey(commentKey = '') { return db.clean(commentKey).split(':').pop() || ''; }
function isModerationAction(name) {
  const a = norm(name).toLowerCase();
  return a.startsWith('mod_') || a === 'ak_mod_start' || a === 'moderation' || a === 'модерация' || a.startsWith('cc5_') || a.startsWith('cc4');
}
function legacyAction(name) {
  const a = norm(name).toLowerCase();
  if (a === 'mod_start' || a === 'ak_mod_start' || a === 'moderation' || a === 'модерация') return 'mod_start';
  if (a === 'mod_choose_channel' || a === 'cc5_choose_channel') return 'mod_choose_channel';
  if (a === 'mod_open_channel' || a === 'cc5_channel') return 'mod_open_channel';
  if (a === 'mod_choose_scope' || a === 'cc5_choose_scope') return 'mod_choose_scope';
  if (a === 'mod_channel_rules' || a === 'cc5_scope_channel') return 'mod_channel_rules';
  if (a === 'mod_choose_post') return 'mod_choose_post';
  if (a === 'mod_post_rules' || a === 'cc5_scope_post') return 'mod_post_rules';
  if (a === 'mod_toggle_enabled' || a === 'cc5_toggle_enabled') return 'mod_toggle_enabled';
  if (a === 'mod_toggle_preset' || a === 'cc5_toggle_preset') return 'mod_toggle_preset';
  if (a === 'mod_add_stopword' || a === 'cc5_add_stopword') return 'mod_add_stopword';
  if (a === 'mod_clear_stopwords' || a === 'cc5_clear_stopwords') return 'mod_clear_stopwords';
  if (a === 'mod_toggle_links' || a === 'cc5_toggle_links') return 'mod_toggle_links';
  if (a === 'mod_toggle_invites' || a === 'cc5_toggle_invites') return 'mod_toggle_invites';
  if (a === 'mod_ai_pro') return 'mod_ai_pro';
  if (a === 'mod_help') return 'mod_help';
  if (a === 'mod_cancel' || a === 'cc5_cancel') return 'mod_cancel';
  // legacy Russian/text fallback only maps to section entry, not to a specific post/channel.
  if (/модер|moder/.test(a)) return 'mod_start';
  return a;
}
function scopeFromPayload(admin, p = {}) {
  const channelId = norm(p.channelId || p.channel_id || p.channel || '');
  const commentKey = db.clean(p.commentKey || p.key || '');
  const postId = norm(p.postId || p.post_id || (commentKey ? postIdFromCommentKey(commentKey) : ''));
  if (channelId && postId) return { adminId: admin, channelId, scopeType: 'post', postId, commentKey: commentKey || `${channelId}:${postId}` };
  if (channelId) return { adminId: admin, channelId, scopeType: 'channel', postId: '', commentKey: '' };
  return { adminId: admin, channelId: '', scopeType: 'none', postId: '', commentKey: '' };
}
function channelScope(admin, channelId) { return { adminId: admin, channelId: norm(channelId), scopeType: 'channel', postId: '', commentKey: '' }; }
function postScope(admin, channelId, postId, commentKey = '') { return { adminId: admin, channelId: norm(channelId), scopeType: 'post', postId: norm(postId), commentKey: db.clean(commentKey || `${channelId}:${postId}`) }; }
async function answer(update, notification) {
  const callbackId = cbid(update);
  if (!callbackId) return;
  try { await api.answerCallback({ botToken: config.botToken, callbackId, notification }); } catch {}
}
function resId(result) {
  const s = JSON.stringify(result || {});
  const m = s.match(/"(?:message_id|messageId|id)"\s*:\s*"([^"{}]+)"/);
  return m ? m[1] : '';
}
async function sendOrEdit(update, admin, packet, preferEdit = true) {
  const messageId = preferEdit ? mid(update) : '';
  if (messageId) {
    try {
      await api.editMessage({ botToken: config.botToken, messageId, text: packet.text, attachments: packet.attachments || [], notify: false });
      await db.setMenu(admin, messageId);
      return;
    } catch (e) {
      console.warn('[CC5.1 edit failed]', e && e.message ? e.message : e);
    }
  }
  const old = await db.getMenu(admin);
  if (old && old !== messageId) {
    try { await api.deleteMessage({ botToken: config.botToken, messageId: old, timeoutMs: 1200 }); } catch {}
  }
  const args = { botToken: config.botToken, text: packet.text, attachments: packet.attachments || [], notify: false };
  const uid = adminId(update);
  const cid = chatId(update);
  if (uid) args.userId = uid; else if (cid) args.chatId = cid; else return;
  const result = await api.sendMessage(args);
  const id = resId(result);
  if (id) await db.setMenu(admin, id);
}
async function getChannelTitle(admin, channelId) {
  const channels = await db.getChannels(admin);
  return channels.find((c) => String(c.channelId) === String(channelId))?.title || channelId || 'Канал';
}
async function getPostTitle(admin, channelId, postId) {
  const posts = await db.getPosts(admin, channelId, 100);
  return posts.find((p) => String(p.postId) === String(postId))?.title || postId || 'Пост';
}
async function noChannelsMenu() {
  return {
    text: ['🛡 Модерация', '', 'У вас ещё нет подключённых каналов.', 'Добавьте бота в канал администратором и перешлите любой пост из канала.'].join('\n'),
    attachments: kb([
      [btn('✅ Подключить канал', 'mod_help_connect')],
      [btn('❓ Как подключить', 'mod_help_connect')],
      [btn('❓ Помощь по разделу', 'mod_help')],
      [btn('🏠 Главное меню', 'ak_main_menu')]
    ])
  };
}
async function channelPicker(admin) {
  const channels = await db.getChannels(admin);
  if (!channels.length) return noChannelsMenu();
  const rows = channels.map((c, i) => [btn(`${i + 1}. ${cut(c.title || c.channelId, 42)}`, 'mod_open_channel', { channelId: c.channelId })]);
  rows.push([btn('❓ Помощь по разделу', 'mod_help')]);
  rows.push([btn('🏠 Главное меню', 'ak_main_menu')]);
  return { text: ['🛡 Модерация', '', 'Выберите канал для модерации.'].join('\n'), attachments: kb(rows) };
}
async function sectionMenu(admin, channelId = '') {
  const channels = await db.getChannels(admin);
  if (!channels.length) return noChannelsMenu();
  const selected = channelId || (channels.length === 1 ? channels[0].channelId : '');
  if (!selected && channels.length > 1) return channelPicker(admin);
  const title = await getChannelTitle(admin, selected);
  return {
    text: ['🛡 Модерация', '', 'Выберите область правил:', `Канал: ${title}`].join('\n'),
    attachments: kb([
      [btn('🛡 Правила всего канала', 'mod_channel_rules', { channelId: selected })],
      [btn('🎯 Выбрать пост для правил', 'mod_choose_post', { channelId: selected })],
      ...(channels.length > 1 ? [[btn('📺 Выбрать другой канал', 'mod_choose_channel')]] : []),
      [btn('❓ Помощь по разделу', 'mod_help')],
      [btn('🏠 Главное меню', 'ak_main_menu')]
    ])
  };
}
async function postPicker(admin, channelId) {
  if (!channelId) return channelPicker(admin);
  const title = await getChannelTitle(admin, channelId);
  const posts = await db.getPosts(admin, channelId, 30);
  const rows = posts.map((p, i) => [btn(`🎯 ${i + 1}. ${cut(p.title || p.postId, 44)}`, 'mod_post_rules', { channelId, postId: p.postId, commentKey: p.commentKey })]);
  rows.push([btn('🛡 Правила всего канала', 'mod_channel_rules', { channelId })]);
  rows.push([btn('📺 Выбрать другой канал', 'mod_choose_channel')]);
  rows.push([btn('🏠 Главное меню', 'ak_main_menu')]);
  return {
    text: ['🛡 Модерация', '', `Канал: ${title}`, '', posts.length ? 'Выберите пост из списка или просто перешлите нужный пост боту.' : 'Посты этого канала пока не найдены в PostgreSQL. Перешлите нужный пост боту один раз.'].join('\n'),
    attachments: kb(rows)
  };
}
async function rulesMenu(scope, overrideRules = null) {
  const title = await getChannelTitle(scope.adminId, scope.channelId);
  const rules = overrideRules || await db.getRules(scope);
  const isPost = isPostScope(scope);
  const pTitle = isPost ? await getPostTitle(scope.adminId, scope.channelId, scope.postId) : '';
  const custom = Array.isArray(rules.customBlocklist) ? rules.customBlocklist : [];
  const rows = [
    [btn(isPost ? '🎯 Выбрать другой пост' : '🎯 Выбрать пост для правил', 'mod_choose_post', { channelId: scope.channelId })],
    ...(isPost ? [[btn('🛡 Правила всего канала', 'mod_channel_rules', { channelId: scope.channelId })]] : []),
    [btn(rules.enabled === false ? '▶️ Включить фильтр' : '⏸ Выключить фильтр', 'mod_toggle_enabled', scope)],
    [btn(rules.applyPresetCommon === false ? '🧱 Стоп-слова: выкл.' : '🧱 Стоп-слова: вкл.', 'mod_toggle_preset', scope)],
    [btn('➕ Стоп-слово', 'mod_add_stopword', scope), btn('🧹 Очистить ручные', 'mod_clear_stopwords', scope)],
    [btn(rules.blockLinks ? '🔗 Ссылки: блок.' : '🔗 Ссылки: разреш.', 'mod_toggle_links', scope), btn(rules.blockInvites === false ? '✉️ Инвайты: разреш.' : '✉️ Инвайты: блок.', 'mod_toggle_invites', scope)],
    [btn('🤖 AI: PRO', 'mod_ai_pro', scope)],
    [btn('🏠 Главное меню', 'ak_main_menu')]
  ];
  return {
    text: ['🛡 Модерация', '', `Канал: ${title}`, isPost ? `Пост: ${cut(pTitle, 70)}` : '', `Область: ${isPost ? 'правила этого поста' : 'правила всего канала'}`, `Фильтр: ${rules.enabled === false ? 'выключен' : 'включён'}`, `Стоп-слова: ${rules.applyPresetCommon === false ? 'базовый список выключен' : 'базовый список включён'}`, `Ручной список: ${custom.length ? custom.join(', ') : 'пока пусто'}`, `Ссылки: ${rules.blockLinks ? 'блокируются' : 'разрешены'}`, `Приглашения: ${rules.blockInvites === false ? 'разрешены' : 'блокируются'}`, 'AI-модерация: выключена / PRO', '', 'Выберите правило кнопками ниже.'].filter(Boolean).join('\n'),
    attachments: kb(rows)
  };
}
async function helpMenu() {
  return {
    text: ['🛡 Помощь по модерации', '', '1. Сначала выберите канал.', '2. Затем выберите область: весь канал или конкретный пост.', '3. Все правила пишутся только в PostgreSQL по связке adminUserId → channelId → postId.', '4. Правила одного поста не применяются к другому посту автоматически.', '5. setupState используется только для временного шага, например ожидания стоп-слова.'].join('\n'),
    attachments: kb([[btn('🛡 В начало модерации', 'mod_start')], [btn('🏠 Главное меню', 'ak_main_menu')]])
  };
}
async function connectHelpMenu() {
  return {
    text: ['✅ Как подключить канал', '', '1. Добавьте бота в нужный канал администратором.', '2. Перешлите боту любой пост из этого канала.', '3. Бот запишет связку adminUserId → channelId → postId в PostgreSQL.', '4. После этого канал и посты появятся в разделе модерации.'].join('\n'),
    attachments: kb([[btn('🛡 В начало модерации', 'mod_start')], [btn('🏠 Главное меню', 'ak_main_menu')]])
  };
}
async function handleTextFlow(update, admin) {
  const flow = await db.getFlow(admin);
  const tx = text(update);
  if (!flow || flow.type !== 'mod_add_stopword' || !tx) return false;
  const scope = flow.scopeType === 'post' ? postScope(admin, flow.channelId, flow.postId, flow.commentKey) : channelScope(admin, flow.channelId);
  const current = await db.getRules(scope);
  const customBlocklist = [...new Set([...(Array.isArray(current.customBlocklist) ? current.customBlocklist : []), ...lowerWords(tx)])];
  const saved = await db.saveRules(scope, { customBlocklist });
  await db.clearFlow(admin);
  await sendOrEdit(update, admin, await rulesMenu(scope, saved), false);
  return true;
}
async function durableTouch(update) {
  try { await db.upsertFromUpdate(update); } catch (e) { console.error('[CC5.1 durable touch]', e && e.message ? e.message : e); }
}
async function handle(update = {}) {
  await db.init();
  const admin = adminId(update);
  if (!admin) return false;
  if (await handleTextFlow(update, admin)) return true;
  await durableTouch(update);
  const rawAction = action(update);
  if (!isModerationAction(rawAction)) return false;
  const a = legacyAction(rawAction);
  const p = payload(update);
  const rawScope = scopeFromPayload(admin, p);
  if (a === 'mod_help') { await answer(update, 'Помощь'); await sendOrEdit(update, admin, await helpMenu()); return true; }
  if (a === 'mod_help_connect') { await answer(update, 'Как подключить'); await sendOrEdit(update, admin, await connectHelpMenu()); return true; }
  if (a === 'mod_start') { await answer(update, 'Модерация'); await sendOrEdit(update, admin, await sectionMenu(admin)); return true; }
  if (a === 'mod_choose_channel') { await answer(update, 'Выберите канал'); await sendOrEdit(update, admin, await channelPicker(admin)); return true; }
  if (a === 'mod_open_channel') { await answer(update, 'Канал выбран'); await sendOrEdit(update, admin, await sectionMenu(admin, rawScope.channelId)); return true; }
  if (a === 'mod_choose_scope') { await answer(update, 'Выберите область'); await sendOrEdit(update, admin, await sectionMenu(admin, rawScope.channelId)); return true; }
  if (a === 'mod_choose_post') { await answer(update, 'Выберите пост'); await sendOrEdit(update, admin, await postPicker(admin, rawScope.channelId)); return true; }
  if (a === 'mod_channel_rules') {
    if (!rawScope.channelId) { await sendOrEdit(update, admin, await channelPicker(admin)); return true; }
    const scope = channelScope(admin, rawScope.channelId);
    await db.saveRules(scope, await db.getRules(scope));
    await answer(update, 'Правила канала');
    await sendOrEdit(update, admin, await rulesMenu(scope));
    return true;
  }
  if (a === 'mod_post_rules') {
    if (!rawScope.channelId || !rawScope.postId) { await answer(update, 'Выберите пост'); await sendOrEdit(update, admin, await postPicker(admin, rawScope.channelId)); return true; }
    const scope = postScope(admin, rawScope.channelId, rawScope.postId, rawScope.commentKey);
    await db.saveRules(scope, await db.getRules(scope));
    await answer(update, 'Правила поста');
    await sendOrEdit(update, admin, await rulesMenu(scope));
    return true;
  }
  if (a === 'mod_ai_pro') { await answer(update, 'AI-модерация будет в PRO'); await sendOrEdit(update, admin, await rulesMenu(rawScope)); return true; }
  if (a === 'mod_cancel') { await db.clearFlow(admin); await answer(update, 'Отменено'); await sendOrEdit(update, admin, rawScope.channelId ? await rulesMenu(rawScope) : await sectionMenu(admin)); return true; }
  if (!rawScope.channelId || (rawScope.scopeType === 'post' && !rawScope.postId)) { await answer(update, 'Сначала выберите область'); await sendOrEdit(update, admin, await sectionMenu(admin, rawScope.channelId)); return true; }
  const scope = rawScope.scopeType === 'post' ? postScope(admin, rawScope.channelId, rawScope.postId, rawScope.commentKey) : channelScope(admin, rawScope.channelId);
  if (a === 'mod_add_stopword') {
    await db.setFlow(admin, { type: 'mod_add_stopword', channelId: scope.channelId, scopeType: scope.scopeType, postId: scope.postId, commentKey: scope.commentKey, createdAt: Date.now() });
    await answer(update, 'Пришлите стоп-слово');
    await sendOrEdit(update, admin, { text: ['🧱 Стоп-слово', '', 'Пришлите слово или фразу одним сообщением.', scope.scopeType === 'post' ? 'Оно будет добавлено только к этому посту.' : 'Оно будет добавлено к правилам всего канала.'].join('\n'), attachments: kb([[btn('↩️ Отмена', 'mod_cancel', scope)]]) });
    return true;
  }
  const current = await db.getRules(scope);
  const next = { ...current };
  if (a === 'mod_clear_stopwords') next.customBlocklist = [];
  else if (a === 'mod_toggle_enabled') next.enabled = current.enabled === false;
  else if (a === 'mod_toggle_preset') next.applyPresetCommon = current.applyPresetCommon === false;
  else if (a === 'mod_toggle_links') next.blockLinks = !current.blockLinks;
  else if (a === 'mod_toggle_invites') next.blockInvites = current.blockInvites === false;
  else return false;
  const saved = await db.saveRules(scope, next);
  await answer(update, 'Сохранено');
  await sendOrEdit(update, admin, await rulesMenu(scope, saved));
  return true;
}

module.exports = { RUNTIME, handle, channelPicker, sectionMenu, postPicker, rulesMenu };
