'use strict';

const config = require('./config');
const api = require('./services/maxApi');
const db = require('./cc5-db-core');
const state = require('./db-v3-state');
const base = require('./menu-v3-five-sections-v28-db-only');

const RUNTIME = 'CC7.5.7-CLEAN-ADMIN-FLOWS';
const MARKER = '__ADMINKIT_CC7_5_7_CLEAN_ADMIN_FLOWS__';

const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 80) => { const s = clean(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const START = new Set(['/start', 'start', 'старт', 'меню', 'menu', 'главное меню', '🏠 главное меню']);

function body(u) { return u?.body || u?.data || u || {}; }
function msg(u) { return body(u).message || u?.message || body(u).callback?.message || null; }
function cb(u) { return body(u).callback || u?.callback || null; }
function textOf(u) { const m = msg(u); return clean(m?.body?.text || m?.text || body(u).text || ''); }
function payloadOf(u) { const raw = cb(u)?.payload || cb(u)?.data || ''; if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return { r: raw }; } } return raw && typeof raw === 'object' ? raw : {}; }
function routeOf(u) { const p = payloadOf(u); return clean(p.r || p.route || textOf(u)); }
function adminId(u) { try { return db.adminId(u) || db.chatId(u) || ''; } catch { return clean(cb(u)?.user?.user_id || msg(u)?.sender?.user_id || body(u).user_id || ''); } }
function chatId(u) { try { return db.chatId(u) || ''; } catch { return clean(msg(u)?.recipient?.chat_id || msg(u)?.chat_id || body(u).chat_id || ''); } }
function callbackId(u) { try { return db.callbackId(u); } catch { return clean(cb(u)?.callback_id || cb(u)?.id || ''); } }
function messageId(u) { try { return db.messageId(u) || ''; } catch { return clean(cb(u)?.message?.message_id || msg(u)?.message_id || msg(u)?.id || ''); } }
function responseMessageId(d = {}) { return clean(d.message_id || d.messageId || d.id || d.message?.message_id || d.message?.id || d.data?.message_id || d.data?.id || ''); }

async function getS(id) { const f = await state.getFlow(id); return f.menuV3 || {}; }
async function saveS(id, patch) { return state.setFlow(id, patch); }
function btn(text, route, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ r: route, ...extra }) }; }
function keyboard(items, backRoute = 'main:home') { const rows = []; for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).map(x => btn(x[0], x[1], x[2] || {}))); rows.push([btn('↩️ Назад', backRoute), btn('🏠 Главное', 'main:home')]); return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
function screen(title, lines, items = [], backRoute = 'main:home') { return { text: [title, '', (Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines || ''))].join('\n'), attachments: keyboard(items, backRoute) }; }
function isHttpUrl(v) { return /^https?:\/\//i.test(clean(v)) || /^https:\/\/max\.ru\//i.test(clean(v)); }
function valueSet(v) { return clean(v) ? 'задано' : 'не задано'; }
function postLabel(p = {}) { return cut(p.title || p.raw?.title || p.raw?.originalText || p.raw?.text || p.postId || 'Пост', 50); }

async function listChannels(id) { const list = await state.listChannels(id); return list || []; }
async function listPostsForChannel(id, channelId) { return state.listPosts(id, channelId, 30); }
async function activeChannel(id) { return state.activeChannel(id); }
async function selectedPostFromFlow(id, flowKey) {
  const s = await getS(id); const f = s[flowKey] || {};
  if (!f.commentKey) return null;
  return state.getPostByCommentKey(id, f.commentKey);
}

function extractPostSnapshot(post = {}) {
  const raw = post.raw && typeof post.raw === 'object' ? post.raw : {};
  return {
    text: String(raw.originalText || raw.text || post.title || ''),
    link: raw.originalLink || null,
    format: raw.originalFormat !== undefined ? raw.originalFormat : undefined,
    attachments: Array.isArray(raw.sourceAttachments) ? raw.sourceAttachments.filter(a => a?.type !== 'inline_keyboard') : []
  };
}

function stripInlineKeyboard(attachments) { return (Array.isArray(attachments) ? attachments : []).filter(a => a?.type !== 'inline_keyboard'); }
function customRowsFromPost(post = {}) {
  const rows = [];
  if (post.buttonsEnabled && clean(post.ctaButtonText) && clean(post.ctaButtonLink)) {
    const action = clean(post.ctaButtonLink);
    const item = isHttpUrl(action)
      ? { type: 'link', text: clean(post.ctaButtonText).slice(0, 64), url: action }
      : { type: 'callback', text: clean(post.ctaButtonText).slice(0, 64), payload: JSON.stringify({ r: 'buttons:action', commentKey: post.commentKey, action }) };
    rows.push([item]);
  }
  if (post.giftsEnabled && clean(post.giftTitle) && clean(post.giftLink)) {
    const target = clean(post.giftLink);
    const item = isHttpUrl(target)
      ? { type: 'link', text: ('🎁 ' + clean(post.giftTitle)).slice(0, 64), url: target }
      : { type: 'callback', text: ('🎁 ' + clean(post.giftTitle)).slice(0, 64), payload: JSON.stringify({ r: 'gifts:claim', commentKey: post.commentKey }) };
    rows.push([item]);
  }
  return rows;
}

async function forceRepatchPost(id, commentKey) {
  const post = await state.getPostByCommentKey(id, commentKey);
  if (!post) return { ok: false, reason: 'post_not_found' };
  if (!config.botToken) return { ok: false, reason: 'bot_token_missing' };
  const messageIdValue = clean(post.messageId || post.postId);
  if (!messageIdValue) return { ok: false, reason: 'message_id_missing' };
  const snap = extractPostSnapshot(post);
  let liveBody = {};
  try {
    const live = await api.getMessage({ botToken: config.botToken, messageId: messageIdValue });
    liveBody = live?.body && typeof live.body === 'object' ? live.body : {};
  } catch {}
  const baseAttachments = stripInlineKeyboard(Array.isArray(liveBody.attachments) && liveBody.attachments.length ? liveBody.attachments : snap.attachments);
  const extraRows = customRowsFromPost(post);
  const commentsRows = api.buildCommentsKeyboard({
    appBaseUrl: config.appBaseUrl,
    botUsername: config.botUsername,
    maxDeepLinkBase: config.maxDeepLinkBase,
    handoffToken: '',
    postId: post.postId,
    channelId: post.channelId,
    commentKey: post.commentKey,
    messageId: messageIdValue,
    count: 0,
    extraRows,
    showPrimaryButton: post.commentsEnabled !== false
  });
  const payload = { botToken: config.botToken, messageId: messageIdValue, attachments: [...baseAttachments, ...commentsRows], notify: false };
  const text = String(liveBody.text || snap.text || '');
  if (text) payload.text = text;
  const link = liveBody.link || snap.link;
  if (link && typeof link === 'object') payload.link = JSON.parse(JSON.stringify(link));
  const format = liveBody.format !== undefined ? liveBody.format : snap.format;
  if (format !== undefined && format !== null) payload.format = format;
  const result = await api.editMessage(payload);
  return { ok: true, runtimeVersion: RUNTIME, commentKey, postId: post.postId, extraRows: extraRows.length, result };
}

async function sendScreen(update, sc, route) {
  const id = adminId(update) || chatId(update) || 'global';
  const prev = await state.getMenu(id);
  const sent = await api.sendMessage({ botToken: config.botToken, chatId: chatId(update) || undefined, userId: chatId(update) ? undefined : id, text: sc.text, attachments: sc.attachments, notify: false });
  const mid = responseMessageId(sent);
  if (mid) await state.setMenu(id, mid);
  [...new Set([prev, messageId(update)].filter(x => x && x !== mid))].forEach(x => api.deleteMessage({ botToken: config.botToken, messageId: x, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {}));
  const cbid = callbackId(update); if (cbid) api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: '' }).catch(() => {});
  return { handled: true, route, sentKind: 'cc757_clean_flow', messageId: mid };
}

async function chooseChannelScreen(id, kind) {
  const channels = await listChannels(id);
  const title = kind === 'buttons' ? '🔘 Кнопки — шаг 1/5' : '🎁 Подарки — шаг 1/6';
  const nextRoute = `${kind}:flow:channel`;
  return screen(title, ['Выберите канал, где находится пост.'], channels.slice(0, 10).map((c, i) => [`${i + 1}. ${state.channelTitle(c.channelId, c.title)}`, nextRoute, { channelId: c.channelId, channelTitle: c.title }]), 'main:home');
}
async function choosePostScreen(id, kind) {
  const s = await getS(id); const f = s[`${kind}Flow`] || {}; const chId = f.channelId || (await activeChannel(id)).channelId;
  const posts = await listPostsForChannel(id, chId);
  const title = kind === 'buttons' ? '🔘 Кнопки — шаг 2/5' : '🎁 Подарки — шаг 2/6';
  return screen(title, ['Выберите пост, к которому применить настройку.'], posts.slice(0, 10).map((p, i) => [`${i + 1}. ${postLabel(p)}`, `${kind}:flow:post`, { postId: p.postId, commentKey: p.commentKey, title: p.title, channelId: p.channelId }]), `${kind}:start`);
}
async function inputScreen(id, kind, field) {
  await saveS(id, { mode: `cc757:${kind}:${field}` });
  const map = { buttonText: ['🔘 Кнопки — шаг 3/5', 'Пришлите текст кнопки. Например: Купить'], buttonAction: ['🔘 Кнопки — шаг 4/5', 'Пришлите ссылку или действие кнопки. Например: https://site.ru'], giftTitle: ['🎁 Подарки — шаг 3/6', 'Пришлите название подарка.'], giftLink: ['🎁 Подарки — шаг 4/6', 'Пришлите ссылку или файл/действие подарка.'], giftMode: ['🎁 Подарки — шаг 5/6', 'Выберите режим выдачи подарка.'] };
  const [title, line] = map[field] || ['✏️ Ввод', 'Пришлите значение.'];
  if (field === 'giftMode') return screen(title, ['Выберите режим выдачи.'], [['✅ Только подписчикам', 'gifts:flow:mode', { requireSubscription: true }], ['🌐 Всем', 'gifts:flow:mode', { requireSubscription: false }]], `${kind}:flow:post`);
  return screen(title, [line], [], `${kind}:flow:post`);
}
async function reviewScreen(id, kind, afterPatch = null) {
  const s = await getS(id); const f = s[`${kind}Flow`] || {};
  const chTitle = state.channelTitle(f.channelId, f.channelTitle);
  if (kind === 'buttons') {
    const ready = clean(f.buttonText) && clean(f.buttonAction);
    return screen('🔘 Кнопки — шаг 5/5', [`Канал: ${chTitle}`, `Пост: ${cut(f.title || f.postId || 'не выбран')}`, `Текст кнопки: ${clean(f.buttonText) || 'не задан'}`, `Действие: ${valueSet(f.buttonAction)}`, `Статус: ${ready ? 'готово к сохранению' : 'не завершено'}`, afterPatch ? `Применение к посту: ${afterPatch.ok ? 'успешно' : 'ошибка ' + (afterPatch.reason || afterPatch.error || '')}` : ''], ready ? [['💾 Сохранить', 'buttons:flow:save'], ['✏️ Изменить текст', 'buttons:flow:inputText'], ['🔗 Изменить действие', 'buttons:flow:inputAction']] : [['✏️ Текст', 'buttons:flow:inputText'], ['🔗 Действие', 'buttons:flow:inputAction']], 'buttons:start');
  }
  const ready = clean(f.giftTitle) && clean(f.giftLink);
  return screen('🎁 Подарки — шаг 6/6', [`Канал: ${chTitle}`, `Пост: ${cut(f.title || f.postId || 'не выбран')}`, `Подарок: ${clean(f.giftTitle) || 'не задан'}`, `Файл/ссылка: ${valueSet(f.giftLink)}`, `Только подписчикам: ${f.requireSubscription === false ? 'нет' : 'да'}`, `Статус: ${ready ? 'готово к сохранению' : 'не завершено'}`, afterPatch ? `Применение к посту: ${afterPatch.ok ? 'успешно' : 'ошибка ' + (afterPatch.reason || afterPatch.error || '')}` : ''], ready ? [['💾 Сохранить', 'gifts:flow:save'], ['✏️ Название', 'gifts:flow:inputTitle'], ['🔗 Файл/ссылка', 'gifts:flow:inputLink'], ['⚙️ Режим', 'gifts:flow:inputMode']] : [['✏️ Название', 'gifts:flow:inputTitle'], ['🔗 Файл/ссылка', 'gifts:flow:inputLink'], ['⚙️ Режим', 'gifts:flow:inputMode']], 'gifts:start');
}

async function handleFlowRoute(update, route, id, p) {
  const kind = route.startsWith('gifts:') ? 'gifts' : 'buttons';
  if (route === `${kind}:home` || route === `${kind}:start`) return chooseChannelScreen(id, kind);
  if (route === `${kind}:flow:channel`) { await saveS(id, { [`${kind}Flow`]: { channelId: p.channelId, channelTitle: p.channelTitle } }); return choosePostScreen(id, kind); }
  if (route === `${kind}:flow:post`) { const s = await getS(id); await saveS(id, { [`${kind}Flow`]: { ...(s[`${kind}Flow`] || {}), postId: p.postId, commentKey: p.commentKey, title: p.title, channelId: p.channelId || (s[`${kind}Flow`] || {}).channelId } }); return kind === 'buttons' ? inputScreen(id, kind, 'buttonText') : inputScreen(id, kind, 'giftTitle'); }
  if (route === 'buttons:flow:inputText') return inputScreen(id, kind, 'buttonText');
  if (route === 'buttons:flow:inputAction') return inputScreen(id, kind, 'buttonAction');
  if (route === 'gifts:flow:inputTitle') return inputScreen(id, kind, 'giftTitle');
  if (route === 'gifts:flow:inputLink') return inputScreen(id, kind, 'giftLink');
  if (route === 'gifts:flow:inputMode') return inputScreen(id, kind, 'giftMode');
  if (route === 'gifts:flow:mode') { const s = await getS(id); await saveS(id, { giftsFlow: { ...(s.giftsFlow || {}), requireSubscription: p.requireSubscription !== false } }); return reviewScreen(id, kind); }
  if (route === 'buttons:flow:save') {
    const s = await getS(id); const f = s.buttonsFlow || {}; const post = await state.getPostByCommentKey(id, f.commentKey);
    if (!post || !clean(f.buttonText) || !clean(f.buttonAction)) return reviewScreen(id, kind, { ok: false, reason: 'flow_not_complete' });
    await state.savePostSetting(id, post, { buttonsEnabled: true, ctaButtonText: clean(f.buttonText), ctaButtonLink: clean(f.buttonAction) });
    const patched = await forceRepatchPost(id, f.commentKey);
    return screen('✅ Кнопка добавлена к посту', [`Пост: ${cut(f.title || f.postId)}`, `Текст: ${clean(f.buttonText)}`, `Действие: ${valueSet(f.buttonAction)}`, `Применение к посту: ${patched.ok ? 'успешно' : 'ошибка ' + (patched.reason || '')}`], [['🔘 Настроить ещё кнопку', 'buttons:start']], 'main:home');
  }
  if (route === 'gifts:flow:save') {
    const s = await getS(id); const f = s.giftsFlow || {}; const post = await state.getPostByCommentKey(id, f.commentKey);
    if (!post || !clean(f.giftTitle) || !clean(f.giftLink)) return reviewScreen(id, kind, { ok: false, reason: 'flow_not_complete' });
    await state.savePostSetting(id, post, { giftsEnabled: true, giftTitle: clean(f.giftTitle), giftLink: clean(f.giftLink), giftsRequireSubscription: f.requireSubscription !== false });
    const patched = await forceRepatchPost(id, f.commentKey);
    return screen('✅ Подарок добавлен к посту', [`Пост: ${cut(f.title || f.postId)}`, `Подарок: ${clean(f.giftTitle)}`, `Файл/ссылка: ${valueSet(f.giftLink)}`, `Только подписчикам: ${f.requireSubscription === false ? 'нет' : 'да'}`, `Применение к посту: ${patched.ok ? 'успешно' : 'ошибка ' + (patched.reason || '')}`], [['🎁 Настроить ещё подарок', 'gifts:start']], 'main:home');
  }
  return null;
}

async function handleAwaitInput(update, id) {
  const s = await getS(id); const mode = clean(s.mode); if (!mode.startsWith('cc757:')) return null;
  const value = textOf(update); if (!value || START.has(value.toLowerCase())) return null;
  const [, kind, field] = mode.split(':');
  const key = `${kind}Flow`; const flow = { ...(s[key] || {}) };
  if (field === 'buttonText') flow.buttonText = value;
  if (field === 'buttonAction') flow.buttonAction = value;
  if (field === 'giftTitle') flow.giftTitle = value;
  if (field === 'giftLink') flow.giftLink = value;
  await saveS(id, { mode: '', [key]: flow });
  if (kind === 'buttons' && field === 'buttonText') return inputScreen(id, kind, 'buttonAction');
  if (kind === 'gifts' && field === 'giftTitle') return inputScreen(id, kind, 'giftLink');
  if (kind === 'gifts' && field === 'giftLink') return inputScreen(id, kind, 'giftMode');
  return reviewScreen(id, kind);
}

async function tryHandle(update) {
  const route = routeOf(update); const id = adminId(update) || chatId(update) || 'global'; const p = payloadOf(update);
  const awaitScreen = await handleAwaitInput(update, id);
  if (awaitScreen) return sendScreen(update, awaitScreen, route || 'await');
  if (route.startsWith('buttons:') || route.startsWith('gifts:')) {
    const sc = await handleFlowRoute(update, route, id, p);
    if (sc) return sendScreen(update, sc, route);
  }
  return base.tryHandle(update);
}
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return base.render(route); }
function selfTest() { const b = base.selfTest ? base.selfTest() : {}; return { ...b, ok: true, runtimeVersion: RUNTIME, features: ['buttons_5_steps', 'gifts_6_steps', 'final_save_required', 'force_repatch_after_save', 'single_menu_cleanup'], commentsCoreTouched: false, policy: 'clean_admin_flows_only_comments_core_untouched' }; }
function install() { return selfTest(); }

module.exports = { RUNTIME, MARKER, install, selfTest, render, tryHandle, tryHandleExpress, forceRepatchPost };
