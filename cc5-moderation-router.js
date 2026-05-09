'use strict';

const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');

const RUNTIME = 'CC5.0';
const btn = (text, action, extra = {}) => ({ type: 'callback', text, payload: JSON.stringify({ action, ...extra }) });
const kb = (rows) => [{ type: 'inline_keyboard', payload: { buttons: rows } }];
const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const lowerWords = (text) => [...new Set(String(text || '').split(/[\n,;]+/g).map((w) => norm(w).toLowerCase()).filter(Boolean))];

function payload(update) { return db.payload(update); }
function action(update) { return norm(db.action(update)); }
function adminId(update) { return db.adminId(update); }
function cbid(update) { return db.callbackId(update); }
function mid(update) { return db.messageId(update); }
function text(update) { return db.text(update); }
function chatId(update) { return db.chatId(update); }
function cut(v, n = 80) { return db.cut(v, n); }
function postIdFromCommentKey(commentKey = '') { return db.clean(commentKey).split(':').pop() || ''; }
function scopeFromPayload(admin, p = {}) {
  const channelId = norm(p.channelId || p.channel_id || p.channel || '');
  const commentKey = db.clean(p.commentKey || p.key || '');
  const postId = norm(p.postId || p.post_id || (commentKey ? postIdFromCommentKey(commentKey) : ''));
  if (postId) return { adminId: admin, channelId, scopeType: 'post', postId, commentKey };
  return { adminId: admin, channelId, scopeType: 'channel', postId: '', commentKey: '' };
}
function makeScope(admin, channelId, postId = '', commentKey = '') {
  return { adminId: admin, channelId: norm(channelId), scopeType: postId ? 'post' : 'channel', postId: norm(postId), commentKey: db.clean(commentKey || (channelId && postId ? `${channelId}:${postId}` : '')) };
}
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
    } catch {}
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
async function channelPicker(admin) {
  const channels = await db.getChannels(admin);
  const rows = channels.map((c, i) => [btn(`${i + 1}. ${cut(c.title || c.channelId, 36)}`, 'cc5_channel', { channelId: c.channelId })]);
  rows.push([btn('🏠 Главное меню', 'ak_main_menu')]);
  return {
    text: [
      '🛡 Модерация',
      '',
      'Выберите канал для модерации.',
      '',
      channels.length ? 'После выбора канала бот покажет посты именно этого канала.' : 'Каналы пока не найдены в PostgreSQL. Добавьте бота администратором в канал и перешлите любой пост.'
    ].join('\n'),
    attachments: kb(rows)
  };
}
async function scopePicker(admin, channelId) {
  const channels = await db.getChannels(admin);
  const selected = channelId || channels[0]?.channelId || '';
  if (!selected) return channelPicker(admin);
  const posts = await db.getPosts(admin, selected, 20);
  const channel = channels.find((c) => c.channelId === selected) || { channelId: selected, title: selected };
  const rows = [[btn('🛡 Правила всего канала', 'cc5_scope_channel', { channelId: selected })]];
  posts.forEach((p, i) => rows.push([btn(`🎯 ${i + 1}. ${cut(p.title || p.postId, 42)}`, 'cc5_scope_post', { channelId: selected, postId: p.postId, commentKey: p.commentKey })]));
  rows.push([btn('📺 Выбрать другой канал', 'cc5_choose_channel')]);
  rows.push([btn('🏠 Главное меню', 'ak_main_menu')]);
  return {
    text: [
      '🛡 Модерация',
      '',
      'Выберите область правил:',
      `Канал: ${channel.title || channel.channelId}`,
      '',
      posts.length ? 'Можно применить правила ко всему каналу или к конкретному посту.' : 'Посты этого канала пока не найдены в PostgreSQL. Перешлите нужный пост боту один раз.'
    ].join('\n'),
    attachments: kb(rows)
  };
}
async function postTitle(admin, channelId, postId) {
  const posts = await db.getPosts(admin, channelId, 100);
  return posts.find((p) => String(p.postId) === String(postId))?.title || postId;
}
async function rulesMenu(scope, overrideRules = null) {
  const channels = await db.getChannels(scope.adminId);
  const channel = channels.find((c) => c.channelId === scope.channelId) || { channelId: scope.channelId, title: scope.channelId || 'Канал' };
  const rules = overrideRules || await db.getRules(scope);
  const isPost = scope.scopeType === 'post';
  const custom = Array.isArray(rules.customBlocklist) ? rules.customBlocklist : [];
  const rows = [
    [btn(isPost ? '🎯 Выбрать другой пост' : '🎯 Выбрать пост для правил', 'cc5_choose_scope', { channelId: scope.channelId })],
    ...(isPost ? [[btn('🛡 Правила всего канала', 'cc5_scope_channel', { channelId: scope.channelId })]] : []),
    [btn(rules.enabled === false ? '▶️ Включить фильтр' : '⏸ Выключить фильтр', 'cc5_toggle_enabled', scope)],
    [btn(rules.applyPresetCommon === false ? '🧱 Стоп-слова: выкл.' : '🧱 Стоп-слова: вкл.', 'cc5_toggle_preset', scope)],
    [btn('➕ Стоп-слово', 'cc5_add_stopword', scope), btn('🧹 Очистить ручные', 'cc5_clear_stopwords', scope)],
    [btn(rules.blockLinks ? '🔗 Ссылки: блок.' : '🔗 Ссылки: разреш.', 'cc5_toggle_links', scope), btn(rules.blockInvites === false ? '✉️ Инвайты: разреш.' : '✉️ Инвайты: блок.', 'cc5_toggle_invites', scope)],
    [btn('🏠 Главное меню', 'ak_main_menu')]
  ];
  const pTitle = isPost ? await postTitle(scope.adminId, scope.channelId, scope.postId) : '';
  return {
    text: [
      '🛡 Модерация',
      '',
      `Канал: ${channel.title || channel.channelId}`,
      isPost ? `Пост: ${cut(pTitle, 70)}` : '',
      `Область: ${isPost ? 'правила этого поста' : 'правила всего канала'}`,
      `Фильтр: ${rules.enabled === false ? 'выключен' : 'включён'}`,
      `Стоп-слова: ${rules.applyPresetCommon === false ? 'базовый список выключен' : 'базовый список включён'}`,
      `Ручной список: ${custom.length ? custom.join(', ') : 'пока пусто'}`,
      `Ссылки: ${rules.blockLinks ? 'блокируются' : 'разрешены'}`,
      `Приглашения: ${rules.blockInvites === false ? 'разрешены' : 'блокируются'}`,
      '',
      'Выберите правило кнопками ниже.'
    ].filter(Boolean).join('\n'),
    attachments: kb(rows)
  };
}
function isKnownModerationAction(a) {
  return /^cc5_/.test(a) || /^cc4/.test(a) || /^cc48/.test(a) || /^cc49/.test(a) || /^ak_mod_/.test(a) || /модер|moder|filter|фильтр|stop|стоп|правила/.test(a);
}
function legacyToCc5Action(a) {
  if (/choose|выбрать|scope/.test(a)) return 'cc5_choose_scope';
  if (/channel|канала/.test(a)) return 'cc5_scope_channel';
  if (/post|pick/.test(a)) return 'cc5_scope_post';
  if (/add.*stop|stop.*add|стоп/.test(a) && /add|добав/.test(a)) return 'cc5_add_stopword';
  if (/clear.*stop|очист/.test(a)) return 'cc5_clear_stopwords';
  if (/toggle.*enabled|filter|фильтр/.test(a)) return 'cc5_toggle_enabled';
  if (/toggle.*preset|stopwords/.test(a)) return 'cc5_toggle_preset';
  if (/toggle.*links|link|ссыл/.test(a)) return 'cc5_toggle_links';
  if (/toggle.*invites|invite|инвайт|приглаш/.test(a)) return 'cc5_toggle_invites';
  return a;
}
async function handleTextFlow(update, admin) {
  const flow = await db.getFlow(admin);
  const tx = text(update);
  if (!flow || flow.type !== 'cc5_add_stopword' || !tx) return false;
  const scope = makeScope(admin, flow.channelId, flow.postId, flow.commentKey);
  const current = await db.getRules(scope);
  const customBlocklist = [...new Set([...(Array.isArray(current.customBlocklist) ? current.customBlocklist : []), ...lowerWords(tx)])];
  const saved = await db.saveRules(scope, { customBlocklist });
  await db.clearFlow(admin);
  await sendOrEdit(update, admin, await rulesMenu(scope, saved), false);
  return true;
}
async function handle(update = {}) {
  await db.init();
  const admin = adminId(update);
  if (!admin) return false;
  if (await handleTextFlow(update, admin)) return true;
  // Record every durable admin/channel/post observation before routing.
  await db.upsertFromUpdate(update).catch((e) => console.error('[CC5 upsert]', e.message));
  let a = legacyToCc5Action(action(update).toLowerCase());
  const p = payload(update);
  if (!isKnownModerationAction(a)) return false;
  await answer(update, a.includes('choose') ? 'Выберите область' : 'Сохранено');
  if (a === 'cc5_choose_channel' || a === 'ak_mod_start') {
    await sendOrEdit(update, admin, await channelPicker(admin));
    return true;
  }
  const raw = scopeFromPayload(admin, p);
  if (a === 'cc5_choose_scope') {
    const channelId = raw.channelId || (await db.getChannels(admin))[0]?.channelId || '';
    await sendOrEdit(update, admin, await scopePicker(admin, channelId));
    return true;
  }
  if (a === 'cc5_channel') {
    await sendOrEdit(update, admin, await scopePicker(admin, raw.channelId));
    return true;
  }
  if (a === 'cc5_scope_channel') {
    const scope = makeScope(admin, raw.channelId);
    await sendOrEdit(update, admin, await rulesMenu(scope));
    return true;
  }
  if (a === 'cc5_scope_post') {
    if (!raw.channelId || !raw.postId) {
      await sendOrEdit(update, admin, await scopePicker(admin, raw.channelId));
      return true;
    }
    const scope = makeScope(admin, raw.channelId, raw.postId, raw.commentKey);
    await sendOrEdit(update, admin, await rulesMenu(scope));
    return true;
  }
  const scope = raw.postId ? makeScope(admin, raw.channelId, raw.postId, raw.commentKey) : makeScope(admin, raw.channelId);
  if (!scope.channelId || (scope.scopeType === 'post' && !scope.postId)) {
    await sendOrEdit(update, admin, await channelPicker(admin));
    return true;
  }
  if (a === 'cc5_add_stopword') {
    await db.setFlow(admin, { type: 'cc5_add_stopword', channelId: scope.channelId, postId: scope.postId, commentKey: scope.commentKey, createdAt: Date.now() });
    await sendOrEdit(update, admin, { text: ['🧱 Стоп-слово', '', 'Пришлите слово или фразу одним сообщением.', 'Оно будет записано в PostgreSQL именно для текущей области:', scope.scopeType === 'post' ? `пост ${scope.postId}` : `канал ${scope.channelId}`].join('\n'), attachments: kb([[btn('↩️ Отмена', 'cc5_cancel', scope)]]) });
    return true;
  }
  if (a === 'cc5_cancel') {
    await db.clearFlow(admin);
    await sendOrEdit(update, admin, await rulesMenu(scope));
    return true;
  }
  const current = await db.getRules(scope);
  let next = { ...current };
  if (a === 'cc5_clear_stopwords') next.customBlocklist = [];
  else if (a === 'cc5_toggle_enabled') next.enabled = current.enabled === false;
  else if (a === 'cc5_toggle_preset') next.applyPresetCommon = current.applyPresetCommon === false;
  else if (a === 'cc5_toggle_links') next.blockLinks = !current.blockLinks;
  else if (a === 'cc5_toggle_invites') next.blockInvites = current.blockInvites === false;
  else return false;
  const saved = await db.saveRules(scope, next);
  await sendOrEdit(update, admin, await rulesMenu(scope, saved));
  return true;
}

module.exports = { RUNTIME, handle, channelPicker, scopePicker, rulesMenu };
