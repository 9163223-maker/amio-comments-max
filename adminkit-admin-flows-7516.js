'use strict';

// CC7.5.16: button manager wording/link polish over CC7.5.15.
// Keeps comments core, gifts core and post patcher stable.
// Changes only button admin screens: do not mention gifts in button flow, and show actual button links.

const config = require('./config');
const api = require('./services/maxApi');
const db = require('./cc5-db-core');
const state = require('./db-v3-state');
const postPatcher = require('./db-v3-post-patcher');
const base = require('./adminkit-admin-flows-7515');

const RUNTIME = 'CC7.5.16-BUTTON-LINKS-NO-GIFT-MENTION';
const MARKER = '__ADMINKIT_CC7_5_16_BUTTON_LINKS_NO_GIFT_MENTION__';
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const START = new Set(['/start', 'start', 'старт', 'меню', 'menu', 'главное меню', '🏠 главное меню']);

function body(u) { return u?.body || u?.data || u || {}; }
function msg(u) { return body(u).message || u?.message || body(u).callback?.message || null; }
function cb(u) { return body(u).callback || u?.callback || null; }
function textOf(u) { const m = msg(u); return clean(m?.body?.text || m?.text || body(u).text || ''); }
function payloadOf(u) { const raw = cb(u)?.payload || cb(u)?.data || ''; if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return { r: raw }; } } return raw && typeof raw === 'object' ? raw : {}; }
function routeOf(u) { const p = payloadOf(u); return clean(p.r || p.route || textOf(u)); }
function adminId(u) { try { return db.adminId(u) || db.chatId(u) || ''; } catch { return clean(cb(u)?.user?.user_id || msg(u)?.sender?.user_id || body(u).user_id || ''); } }
function chatId(u) { try { return db.chatId(u) || ''; } catch { return clean(msg(u)?.recipient?.chat_id || msg(u)?.chat_id || body(u).chat_id || ''); } }
function messageId(u) { try { return db.messageId(u) || ''; } catch { return clean(cb(u)?.message?.message_id || msg(u)?.message_id || msg(u)?.id || ''); } }
function callbackId(u) { try { return db.callbackId(u); } catch { return clean(cb(u)?.callback_id || cb(u)?.id || ''); } }
function responseMessageId(d = {}) { return clean(d.message_id || d.messageId || d.id || d.message?.message_id || d.message?.id || d.data?.message_id || d.data?.id || ''); }
function btn(text, route, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ r: route, ...extra }) }; }
function keyboardSingle(items, backRoute = 'main:home') {
  const rows = items.map(x => [btn(x[0], x[1], x[2] || {})]);
  rows.push([btn('↩️ Назад', backRoute)]);
  rows.push([btn('🏠 Главное меню', 'main:home')]);
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}
function keyboardPairs(items, backRoute = 'main:home') {
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).map(x => btn(x[0], x[1], x[2] || {})));
  rows.push([btn('↩️ Назад', backRoute), btn('🏠 Главное', 'main:home')]);
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}
function screen(title, lines, items = [], backRoute = 'main:home', single = false) {
  return { text: [title, '', (Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines || ''))].join('\n'), attachments: single ? keyboardSingle(items, backRoute) : keyboardPairs(items, backRoute) };
}
function valueSet(v) { return clean(v) ? 'задано' : 'не задано'; }
function asArray(value) { if (Array.isArray(value)) return value; if (typeof value === 'string' && value.trim()) { try { const p = JSON.parse(value); return Array.isArray(p) ? p : []; } catch { return []; } } return []; }
function postTitle(post = {}) { return clean(post.title || post.raw?.title || post.raw?.originalText || post.raw?.text || post.postId || 'Пост'); }
function linkLine(link) { return `Ссылка: ${clean(link) || 'не задано'}`; }

async function ensureAddonColumns() {
  await db.init();
  await db.query(`
    alter table ak_post_settings add column if not exists cta_buttons_json jsonb not null default '[]'::jsonb;
    alter table ak_post_settings add column if not exists gifts_json jsonb not null default '[]'::jsonb;
  `);
}
async function getS(id) { const f = await state.getFlow(id); return f.menuV3 || {}; }
async function saveS(id, patch) { return state.setFlow(id, patch); }
async function listChannels(id) { return (await state.listChannels(id)) || []; }
async function listPostsForChannel(id, channelId) { return state.listPosts(id, channelId, 30); }
async function activeChannel(id) { return state.activeChannel(id); }
async function ensurePostSettingsForFlow(id, flow) { return state.ensurePostSettings(id, { channelId: flow.channelId, postId: flow.postId, commentKey: flow.commentKey, title: flow.title }); }

async function postWithButtons(id, commentKey) {
  await ensureAddonColumns();
  const { rows } = await db.query(`
    select p.admin_id as "adminId", p.channel_id as "channelId", p.post_id as "postId", p.message_id as "messageId", p.comment_key as "commentKey", p.title, p.raw,
      coalesce(s.buttons_enabled, false) as "buttonsEnabled", coalesce(s.cta_button_text, '') as "ctaButtonText", coalesce(s.cta_button_link, '') as "ctaButtonLink", coalesce(s.cta_buttons_json, '[]'::jsonb) as "ctaButtonsJson"
    from ak_posts p left join ak_post_settings s on s.admin_id=p.admin_id and s.comment_key=p.comment_key
    where p.admin_id=$1 and p.comment_key=$2 order by p.updated_at desc limit 1
  `, [id, clean(commentKey)]);
  return rows[0] || null;
}
function buttonsOf(post = {}) {
  const out = [];
  if (post.buttonsEnabled && clean(post.ctaButtonText) && clean(post.ctaButtonLink)) out.push({ index: 0, text: clean(post.ctaButtonText), link: clean(post.ctaButtonLink) });
  asArray(post.ctaButtonsJson).forEach((b, i) => {
    const text = clean(b?.text || b?.label || b?.title); const link = clean(b?.url || b?.link || b?.action);
    if (text && link) out.push({ index: i + 1, text, link });
  });
  return out;
}
function buttonListLines(buttons = []) {
  if (!buttons.length) return ['Кнопок у поста пока нет.'];
  const lines = [`Кнопки сейчас: ${buttons.length}`];
  buttons.forEach((b, i) => {
    lines.push(`${i + 1}. ${b.text}`);
    lines.push(`   ${linkLine(b.link)}`);
  });
  return lines;
}

function deleteLater(messageIdValue, delayMs) {
  if (!messageIdValue || !config.botToken) return;
  setTimeout(() => api.deleteMessage({ botToken: config.botToken, messageId: messageIdValue, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {}), delayMs);
}
async function deleteMany(ids = []) {
  [...new Set(ids.map(clean).filter(Boolean))].forEach((mid) => {
    api.deleteMessage({ botToken: config.botToken, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {});
    deleteLater(mid, 900); deleteLater(mid, 2400); deleteLater(mid, 5200);
  });
}
async function neutralizeOldMenus(ids = [], label = 'Получено') {
  for (const mid of [...new Set(ids.map(clean).filter(Boolean))]) {
    try { await api.editMessage({ botToken: config.botToken, messageId: mid, text: `✅ ${label}`, attachments: [], notify: false }); } catch {}
    api.deleteMessage({ botToken: config.botToken, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {});
    deleteLater(mid, 900); deleteLater(mid, 2400); deleteLater(mid, 5200);
  }
}
async function sendButtonScreen(update, sc, route, opts = {}) {
  const id = adminId(update) || chatId(update) || 'global';
  const s = await getS(id);
  const prevGlobal = await state.getMenu(id);
  const current = messageId(update);
  const oldMenus = []
    .concat(Array.isArray(s.buttonMenuIds) ? s.buttonMenuIds : [])
    .concat(Array.isArray(s.buttonGarbageIds) ? s.buttonGarbageIds : [])
    .concat([s.buttonPromptMessageId, prevGlobal]).map(clean).filter(Boolean);
  if (opts.neutralizeLabel) await neutralizeOldMenus(oldMenus.filter(x => x !== current), opts.neutralizeLabel);
  let mid = ''; let edited = false;
  if (opts.preferEdit !== false && current && callbackId(update)) {
    try { await api.editMessage({ botToken: config.botToken, messageId: current, text: sc.text, attachments: sc.attachments, notify: false }); mid = current; edited = true; } catch {}
  }
  if (!mid) {
    const sent = await api.sendMessage({ botToken: config.botToken, chatId: chatId(update) || undefined, userId: chatId(update) ? undefined : id, text: sc.text, attachments: sc.attachments, notify: false });
    mid = responseMessageId(sent);
  }
  if (mid) await state.setMenu(id, mid);
  await saveS(id, { buttonMenuIds: mid ? [mid] : [], buttonPromptMessageId: mid || '', buttonGarbageIds: [], buttonLastRoute: route, buttonUpdatedAt: Date.now() });
  if (!opts.neutralizeLabel) await deleteMany(oldMenus.concat(edited ? [] : [current]).filter(x => x && x !== mid));
  const cbid = callbackId(update); if (cbid) api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: '' }).catch(() => {});
  return { handled: true, route, sentKind: 'cc7516_button_links_no_gift', messageId: mid, edited };
}

async function chooseButtonChannelScreen(id) {
  const channels = await listChannels(id);
  return screen('🔘 Кнопки — шаг 1/5', ['Выберите канал, где находится пост.'], channels.slice(0, 10).map((c, i) => [`${i + 1}. ${state.channelTitle(c.channelId, c.title)}`, 'buttons:flow:channel', { channelId: c.channelId, channelTitle: c.title }]), 'main:home');
}
async function chooseButtonPostScreen(id) {
  const s = await getS(id); const f = s.buttonsFlow || {}; const chId = f.channelId || (await activeChannel(id)).channelId;
  const posts = await listPostsForChannel(id, chId);
  return screen('🔘 Кнопки — шаг 2/5', ['Выберите пост, к которому применить кнопку.'], posts.slice(0, 10).map((p, i) => [`${i + 1}. ${postTitle(p)}`, 'buttons:flow:post', { postId: p.postId, commentKey: p.commentKey, title: p.title, channelId: p.channelId }]), 'buttons:start');
}
async function buttonPostManagerScreen(id, post, headline = '🔘 Управление кнопками поста') {
  const buttons = buttonsOf(post);
  const lines = [`Пост: ${postTitle(post)}`, '', ...buttonListLines(buttons), '', 'Что сделать с кнопками?'];
  const items = [['➕ Добавить новую кнопку', 'buttons:flow:add']];
  buttons.slice(0, 4).forEach((b, i) => {
    items.push([`✏️ Изменить кнопку ${i + 1}`, 'buttons:flow:edit', { index: b.index }]);
    items.push([`🗑 Удалить кнопку ${i + 1}`, 'buttons:flow:delete', { index: b.index }]);
  });
  return screen(headline, lines, items, 'buttons:flow:channel', true);
}
async function inputButtonScreen(id, field) {
  await saveS(id, { mode: `cc7516:buttons:${field}` });
  if (field === 'buttonText') return screen('🔘 Кнопки — шаг 3/5', ['Пришлите название кнопки — текст, который увидит подписчик.', 'Например: Купить / Записаться / Скачать чек-лист'], [], 'buttons:flow:post', true);
  return screen('🔘 Кнопки — шаг 4/5', ['Куда должна вести кнопка?', 'Сейчас поддерживается ссылка.', 'Пришлите ссылку в формате https://...', 'Действия внутри MAX добавим позже отдельным режимом.'], [], 'buttons:flow:inputText', true);
}
async function reviewButtonScreen(id) {
  const s = await getS(id); const f = s.buttonsFlow || {};
  const ready = !!(clean(f.commentKey) && clean(f.buttonText) && clean(f.buttonAction));
  const items = ready ? [['💾 Сохранить кнопку', 'buttons:flow:save'], ['✏️ Изменить название', 'buttons:flow:inputText'], ['🔗 Изменить ссылку', 'buttons:flow:inputAction']] : [['✏️ Изменить название', 'buttons:flow:inputText'], ['🔗 Изменить ссылку', 'buttons:flow:inputAction']];
  return screen('🔘 Кнопки — шаг 5/5', [
    `Режим: ${f.buttonEditMode === 'edit' ? 'изменить существующую кнопку' : 'добавить новую кнопку'}`,
    `Пост: ${f.title || f.postId || 'не выбран'}`,
    `Название кнопки: ${clean(f.buttonText) || 'не задано'}`,
    `${linkLine(f.buttonAction)}`,
    `Статус: ${ready ? 'готово к сохранению' : 'не завершено'}`
  ], items, 'buttons:start', true);
}
async function resetButtonsFlow(id) {
  const s = await getS(id);
  await saveS(id, { mode: '', buttonsFlow: {}, buttonGarbageIds: Array.isArray(s.buttonMenuIds) ? s.buttonMenuIds : [], buttonMenuIds: [], buttonPromptMessageId: '' });
}
async function saveButtonToPost(id, f) {
  await ensurePostSettingsForFlow(id, f);
  await ensureAddonColumns();
  const post = await postWithButtons(id, f.commentKey);
  const buttons = buttonsOf(post);
  const extras = asArray(post?.ctaButtonsJson).map((b) => ({ text: clean(b.text || b.label || b.title), url: clean(b.url || b.link || b.action) })).filter(b => b.text && b.url);
  const text = clean(f.buttonText); const url = clean(f.buttonAction);
  if (f.buttonEditMode === 'edit') {
    const idx = Number(f.buttonIndex || 0);
    if (idx === 0) await db.query('update ak_post_settings set buttons_enabled=true, cta_button_text=$3, cta_button_link=$4, updated_at=now() where admin_id=$1 and comment_key=$2', [id, f.commentKey, text, url]);
    else { const j = idx - 1; if (extras[j]) extras[j] = { text, url }; await db.query('update ak_post_settings set buttons_enabled=true, cta_buttons_json=$3::jsonb, updated_at=now() where admin_id=$1 and comment_key=$2', [id, f.commentKey, JSON.stringify(extras)]); }
  } else if (!buttons.length) {
    await db.query('update ak_post_settings set buttons_enabled=true, cta_button_text=$3, cta_button_link=$4, updated_at=now() where admin_id=$1 and comment_key=$2', [id, f.commentKey, text, url]);
  } else {
    extras.push({ text, url });
    await db.query('update ak_post_settings set buttons_enabled=true, cta_buttons_json=$3::jsonb, updated_at=now() where admin_id=$1 and comment_key=$2', [id, f.commentKey, JSON.stringify(extras)]);
  }
}
async function deleteButtonFromPost(id, commentKey, index) {
  await ensureAddonColumns();
  const post = await postWithButtons(id, commentKey);
  if (!post) return { ok: false, reason: 'post_not_found' };
  const extras = asArray(post.ctaButtonsJson).map((b) => ({ text: clean(b.text || b.label || b.title), url: clean(b.url || b.link || b.action) })).filter(b => b.text && b.url);
  const idx = Number(index || 0);
  if (idx === 0) {
    if (extras.length) {
      const promoted = extras.shift();
      await db.query('update ak_post_settings set buttons_enabled=true, cta_button_text=$3, cta_button_link=$4, cta_buttons_json=$5::jsonb, updated_at=now() where admin_id=$1 and comment_key=$2', [id, commentKey, promoted.text, promoted.url, JSON.stringify(extras)]);
    } else {
      await db.query("update ak_post_settings set buttons_enabled=false, cta_button_text='', cta_button_link='', cta_buttons_json='[]'::jsonb, updated_at=now() where admin_id=$1 and comment_key=$2", [id, commentKey]);
    }
  } else {
    extras.splice(idx - 1, 1);
    const enabled = !!(clean(post.ctaButtonText) && clean(post.ctaButtonLink)) || extras.length > 0;
    await db.query('update ak_post_settings set buttons_enabled=$3, cta_buttons_json=$4::jsonb, updated_at=now() where admin_id=$1 and comment_key=$2', [id, commentKey, enabled, JSON.stringify(extras)]);
  }
  return postPatcher.patchCommentsButtonByCommentKey(commentKey);
}
async function handleButtonsRoute(route, id, p) {
  if (route === 'buttons:home' || route === 'buttons:start') { await resetButtonsFlow(id); return chooseButtonChannelScreen(id); }
  if (route === 'buttons:flow:channel') { await saveS(id, { mode: '', buttonsFlow: { channelId: p.channelId, channelTitle: p.channelTitle } }); return chooseButtonPostScreen(id); }
  if (route === 'buttons:flow:post') {
    const s = await getS(id); const prev = s.buttonsFlow || {};
    const flow = { channelId: p.channelId || prev.channelId, channelTitle: prev.channelTitle || p.channelTitle, postId: p.postId, commentKey: p.commentKey, title: p.title, buttonText: '', buttonAction: '', buttonEditMode: 'add', buttonIndex: null };
    await saveS(id, { mode: '', buttonsFlow: flow });
    const post = await postWithButtons(id, p.commentKey);
    if (post && buttonsOf(post).length) return buttonPostManagerScreen(id, post);
    return inputButtonScreen(id, 'buttonText');
  }
  if (route === 'buttons:flow:add') { const s = await getS(id); await saveS(id, { buttonsFlow: { ...(s.buttonsFlow || {}), buttonText: '', buttonAction: '', buttonEditMode: 'add', buttonIndex: null } }); return inputButtonScreen(id, 'buttonText'); }
  if (route === 'buttons:flow:edit') {
    const s = await getS(id); const f = s.buttonsFlow || {}; const post = await postWithButtons(id, f.commentKey); const found = buttonsOf(post).find(b => Number(b.index) === Number(p.index));
    await saveS(id, { buttonsFlow: { ...f, buttonText: found?.text || '', buttonAction: found?.link || '', buttonEditMode: 'edit', buttonIndex: Number(p.index || 0) } });
    return reviewButtonScreen(id);
  }
  if (route === 'buttons:flow:delete') {
    const s = await getS(id); const f = s.buttonsFlow || {}; const patched = await deleteButtonFromPost(id, f.commentKey, p.index);
    const post = await postWithButtons(id, f.commentKey);
    return buttonPostManagerScreen(id, post || { ...f, commentKey: f.commentKey }, patched.ok ? '🗑 Кнопка удалена' : '⚠️ Не удалось удалить кнопку');
  }
  if (route === 'buttons:flow:inputText') return inputButtonScreen(id, 'buttonText');
  if (route === 'buttons:flow:inputAction') return inputButtonScreen(id, 'buttonAction');
  if (route === 'buttons:flow:save') {
    const s = await getS(id); const f = s.buttonsFlow || {};
    if (!clean(f.commentKey) || !clean(f.buttonText) || !clean(f.buttonAction)) return reviewButtonScreen(id);
    await saveButtonToPost(id, f);
    const patched = await postPatcher.patchCommentsButtonByCommentKey(f.commentKey);
    const post = await postWithButtons(id, f.commentKey);
    await saveS(id, { mode: '', buttonsFlow: { channelId: f.channelId, channelTitle: f.channelTitle, postId: f.postId, commentKey: f.commentKey, title: f.title } });
    const title = f.buttonEditMode === 'edit' ? '✅ Кнопка изменена' : '✅ Кнопка добавлена к посту';
    const lines = [`Пост: ${postTitle(post || f)}`, `Применение к посту: ${patched.ok ? 'успешно' : 'ошибка ' + (patched.reason || '')}`, '', ...buttonListLines(buttonsOf(post || {})), '', 'Можно сразу продолжить управление кнопками этого поста.'];
    const items = [['➕ Добавить ещё одну кнопку', 'buttons:flow:add'], ['🔘 Управлять кнопками этого поста', 'buttons:flow:post', { postId: f.postId, commentKey: f.commentKey, title: f.title, channelId: f.channelId }], ['🔘 Выбрать другой пост', 'buttons:start']];
    return screen(title, lines, items, 'main:home', true);
  }
  return null;
}
async function handleAwaitButtonsInput(update, id) {
  const s = await getS(id); const mode = clean(s.mode);
  if (!mode.startsWith('cc7516:buttons:') && !mode.startsWith('cc7515:buttons:') && !mode.startsWith('cc7514:buttons:') && !mode.startsWith('cc7513:buttons:') && !mode.startsWith('cc7510:buttons:') && !mode.startsWith('cc759:buttons:') && !mode.startsWith('cc757:buttons:')) return null;
  const value = textOf(update);
  if (!value || START.has(value.toLowerCase())) return null;
  const field = mode.split(':').pop(); const flow = { ...(s.buttonsFlow || {}) };
  if (field === 'buttonText') flow.buttonText = value;
  if (field === 'buttonAction') flow.buttonAction = value;
  await saveS(id, { mode: '', buttonsFlow: flow });
  return { screen: field === 'buttonText' ? await inputButtonScreen(id, 'buttonAction') : await reviewButtonScreen(id), label: field === 'buttonText' ? 'Название кнопки получено' : 'Ссылка получена' };
}
async function tryHandle(update) {
  const route = routeOf(update); const id = adminId(update) || chatId(update) || 'global'; const p = payloadOf(update);
  const awaited = await handleAwaitButtonsInput(update, id);
  if (awaited) return sendButtonScreen(update, awaited.screen, 'buttons:await', { preferEdit: false, neutralizeLabel: awaited.label });
  if (route.startsWith('buttons:')) {
    const sc = await handleButtonsRoute(route, id, p);
    if (sc) return sendButtonScreen(update, sc, route, { preferEdit: true });
  }
  return base.tryHandle(update);
}
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return base.render(route); }
function selfTest() {
  const b = base.selfTest ? base.selfTest() : {};
  return { ...b, ok: true, runtimeVersion: RUNTIME, marker: MARKER,
    features: [...(b.features || []), 'button_manager_no_gift_mention', 'button_manager_shows_actual_links', 'button_final_summary_shows_actual_links'],
    commentsCoreTouched: false, giftsCoreTouched: false, buttonsCoreTouched: true,
    policy: 'button_manager_wording_and_link_display_only_over_7515'
  };
}
function install() { return selfTest(); }
module.exports = { RUNTIME, MARKER, install, selfTest, render, tryHandle, tryHandleExpress, forceRepatchPost: (id, commentKey) => postPatcher.patchCommentsButtonByCommentKey(commentKey) };
