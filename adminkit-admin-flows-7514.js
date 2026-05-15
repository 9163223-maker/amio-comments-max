'use strict';

// CC7.5.14: addon management layer over CC7.5.13.
// Keeps comments core CC7.5.6 and gifts flow CC7.5.12 behavior.
// Adds: existing button/gift detection after post selection, add/edit/delete entry points,
// multiple CTA button storage through cta_buttons_json, and stronger old-menu neutralization after text/link input.

const config = require('./config');
const api = require('./services/maxApi');
const db = require('./cc5-db-core');
const state = require('./db-v3-state');
const postPatcher = require('./db-v3-post-patcher');
const base = require('./adminkit-admin-flows-7513');

const RUNTIME = 'CC7.5.14-ADDON-MANAGER-BUTTONS-GIFTS';
const MARKER = '__ADMINKIT_CC7_5_14_ADDON_MANAGER_BUTTONS_GIFTS__';
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
function messageId(u) { try { return db.messageId(u) || ''; } catch { return clean(cb(u)?.message?.message_id || msg(u)?.message_id || msg(u)?.id || ''); } }
function callbackId(u) { try { return db.callbackId(u); } catch { return clean(cb(u)?.callback_id || cb(u)?.id || ''); } }
function responseMessageId(d = {}) { return clean(d.message_id || d.messageId || d.id || d.message?.message_id || d.message?.id || d.data?.message_id || d.data?.id || ''); }
function btn(text, route, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ r: route, ...extra }) }; }
function keyboard(items, backRoute = 'main:home') {
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).map(x => btn(x[0], x[1], x[2] || {})));
  rows.push([btn('↩️ Назад', backRoute), btn('🏠 Главное', 'main:home')]);
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}
function screen(title, lines, items = [], backRoute = 'main:home') { return { text: [title, '', (Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines || ''))].join('\n'), attachments: keyboard(items, backRoute) }; }
function valueSet(v) { return clean(v) ? 'задано' : 'не задано'; }
function isHttpUrl(v) { return /^https?:\/\//i.test(clean(v)) || /^https:\/\/max\.ru\//i.test(clean(v)); }
function postLabel(p = {}) { return cut(p.title || p.raw?.title || p.raw?.originalText || p.raw?.text || p.postId || 'Пост', 50); }
function asArray(value) { if (Array.isArray(value)) return value; if (typeof value === 'string' && value.trim()) { try { const p = JSON.parse(value); return Array.isArray(p) ? p : []; } catch { return []; } } return []; }

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

async function postWithAddons(id, commentKey) {
  await ensureAddonColumns();
  const { rows } = await db.query(`
    select p.admin_id as "adminId", p.channel_id as "channelId", p.post_id as "postId", p.message_id as "messageId", p.comment_key as "commentKey", p.title, p.raw,
      coalesce(s.buttons_enabled, false) as "buttonsEnabled", coalesce(s.cta_button_text, '') as "ctaButtonText", coalesce(s.cta_button_link, '') as "ctaButtonLink", coalesce(s.cta_buttons_json, '[]'::jsonb) as "ctaButtonsJson",
      coalesce(s.gifts_enabled, false) as "giftsEnabled", coalesce(s.gift_title, '') as "giftTitle", coalesce(s.gift_link, '') as "giftLink", coalesce(s.gifts_require_subscription, true) as "giftsRequireSubscription", coalesce(s.gifts_json, '[]'::jsonb) as "giftsJson"
    from ak_posts p left join ak_post_settings s on s.admin_id=p.admin_id and s.comment_key=p.comment_key
    where p.admin_id=$1 and p.comment_key=$2 order by p.updated_at desc limit 1
  `, [id, commentKey]);
  return rows[0] || null;
}
function buttonsOf(post = {}) {
  const out = [];
  if (post.buttonsEnabled && clean(post.ctaButtonText) && clean(post.ctaButtonLink)) out.push({ index: 0, kind: 'legacy', text: clean(post.ctaButtonText), link: clean(post.ctaButtonLink) });
  asArray(post.ctaButtonsJson).forEach((b, i) => { if (clean(b?.text || b?.label || b?.title) && clean(b?.url || b?.link || b?.action)) out.push({ index: i + 1, kind: 'json', text: clean(b.text || b.label || b.title), link: clean(b.url || b.link || b.action) }); });
  return out;
}
function giftsOf(post = {}) {
  const out = [];
  if (post.giftsEnabled && clean(post.giftTitle) && clean(post.giftLink)) out.push({ index: 0, kind: 'legacy', title: clean(post.giftTitle), link: clean(post.giftLink), requireSubscription: post.giftsRequireSubscription !== false });
  asArray(post.giftsJson).forEach((g, i) => { if (clean(g?.title) && clean(g?.link)) out.push({ index: i + 1, kind: 'json', title: clean(g.title), link: clean(g.link), requireSubscription: g.requireSubscription !== false }); });
  return out;
}
async function ensurePostSettingsForFlow(id, flow) {
  const p = { channelId: flow.channelId, postId: flow.postId, commentKey: flow.commentKey, title: flow.title };
  return state.ensurePostSettings(id, p);
}

function deleteLater(messageIdValue, delayMs) {
  if (!messageIdValue || !config.botToken) return;
  setTimeout(() => api.deleteMessage({ botToken: config.botToken, messageId: messageIdValue, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {}), delayMs);
}
async function neutralizeOldMenus(ids = [], label = 'Получено') {
  const uniq = [...new Set(ids.map(clean).filter(Boolean))];
  for (const mid of uniq) {
    try { await api.editMessage({ botToken: config.botToken, messageId: mid, text: `✅ ${label}`, attachments: [], notify: false }); } catch {}
    api.deleteMessage({ botToken: config.botToken, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {});
    deleteLater(mid, 900); deleteLater(mid, 2400); deleteLater(mid, 5200);
  }
}
async function deleteMany(ids = []) {
  [...new Set(ids.map(clean).filter(Boolean))].forEach((mid) => {
    api.deleteMessage({ botToken: config.botToken, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {});
    deleteLater(mid, 900); deleteLater(mid, 2400); deleteLater(mid, 5200);
  });
}
async function sendButtonScreen(update, sc, route, opts = {}) {
  const id = adminId(update) || chatId(update) || 'global';
  const s = await getS(id);
  const prevGlobal = await state.getMenu(id);
  const current = messageId(update);
  const oldMenus = []
    .concat(Array.isArray(s.buttonMenuIds) ? s.buttonMenuIds : [])
    .concat(Array.isArray(s.buttonGarbageIds) ? s.buttonGarbageIds : [])
    .concat([s.buttonPromptMessageId, prevGlobal])
    .map(clean).filter(Boolean);
  if (opts.neutralizeLabel) await neutralizeOldMenus(oldMenus.filter(x => x !== current), opts.neutralizeLabel);

  let mid = '';
  let edited = false;
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
  return { handled: true, route, sentKind: 'cc7514_button_manager', messageId: mid, edited };
}

async function chooseButtonChannelScreen(id) {
  const channels = await listChannels(id);
  return screen('🔘 Кнопки — шаг 1/5', ['Выберите канал, где находится пост.'], channels.slice(0, 10).map((c, i) => [`${i + 1}. ${state.channelTitle(c.channelId, c.title)}`, 'buttons:flow:channel', { channelId: c.channelId, channelTitle: c.title }]), 'main:home');
}
async function chooseButtonPostScreen(id) {
  const s = await getS(id); const f = s.buttonsFlow || {}; const chId = f.channelId || (await activeChannel(id)).channelId;
  const posts = await listPostsForChannel(id, chId);
  return screen('🔘 Кнопки — шаг 2/5', ['Выберите пост, к которому применить кнопку.'], posts.slice(0, 10).map((p, i) => [`${i + 1}. ${postLabel(p)}`, 'buttons:flow:post', { postId: p.postId, commentKey: p.commentKey, title: p.title, channelId: p.channelId }]), 'buttons:start');
}
async function buttonPostManagerScreen(id, post) {
  const buttons = buttonsOf(post);
  const gifts = giftsOf(post);
  const lines = [`Пост: ${postLabel(post)}`];
  if (buttons.length) lines.push('Уже есть кнопки:', ...buttons.slice(0, 6).map((b, i) => `${i + 1}. ${cut(b.text, 32)} → ${isHttpUrl(b.link) ? 'ссылка' : 'действие'}`));
  else lines.push('Кнопок у поста пока нет.');
  if (gifts.length) lines.push('', `Также есть подарок: ${cut(gifts[0].title, 36)}`);
  lines.push('', 'Выберите, что сделать.');
  const items = [['➕ Добавить кнопку', 'buttons:flow:add']];
  if (buttons.length) {
    items.push(['✏️ Изменить 1', 'buttons:flow:edit', { index: buttons[0].index }]);
    items.push(['🗑 Удалить 1', 'buttons:flow:delete', { index: buttons[0].index }]);
  }
  if (buttons.length > 1) {
    items.push(['✏️ Изменить 2', 'buttons:flow:edit', { index: buttons[1].index }]);
    items.push(['🗑 Удалить 2', 'buttons:flow:delete', { index: buttons[1].index }]);
  }
  return screen('🔘 Управление кнопками поста', lines, items, 'buttons:flow:channel');
}
async function inputButtonScreen(id, field) {
  await saveS(id, { mode: `cc7514:buttons:${field}` });
  if (field === 'buttonText') return screen('🔘 Кнопки — шаг 3/5', ['Пришлите название кнопки — текст, который увидит подписчик.', 'Например: Купить / Записаться / Скачать чек-лист'], [], 'buttons:flow:post');
  return screen('🔘 Кнопки — шаг 4/5', ['Куда должна вести кнопка?', 'Сейчас поддерживается ссылка.', 'Пришлите ссылку в формате https://...', 'Действия внутри MAX добавим позже отдельным режимом.'], [], 'buttons:flow:inputText');
}
async function reviewButtonScreen(id, afterPatch = null) {
  const s = await getS(id); const f = s.buttonsFlow || {};
  const ready = !!(clean(f.commentKey) && clean(f.buttonText) && clean(f.buttonAction));
  const items = ready ? [['💾 Сохранить', 'buttons:flow:save'], ['✏️ Название', 'buttons:flow:inputText'], ['🔗 Ссылка', 'buttons:flow:inputAction']] : [['✏️ Название', 'buttons:flow:inputText'], ['🔗 Ссылка', 'buttons:flow:inputAction']];
  return screen('🔘 Кнопки — шаг 5/5', [
    `Режим: ${f.buttonEditMode === 'edit' ? 'изменить кнопку' : 'добавить кнопку'}`,
    `Канал: ${state.channelTitle(f.channelId, f.channelTitle)}`,
    `Пост: ${cut(f.title || f.postId || 'не выбран')}`,
    `Название кнопки: ${clean(f.buttonText) || 'не задано'}`,
    `Ссылка: ${valueSet(f.buttonAction)}`,
    `Статус: ${ready ? 'готово к сохранению' : 'не завершено'}`,
    afterPatch ? `Применение к посту: ${afterPatch.ok ? 'успешно' : 'ошибка ' + (afterPatch.reason || afterPatch.error || '')}` : ''
  ], items, 'buttons:start');
}
async function resetButtonsFlow(id) {
  const s = await getS(id);
  await saveS(id, { mode: '', buttonsFlow: {}, buttonGarbageIds: Array.isArray(s.buttonMenuIds) ? s.buttonMenuIds : [], buttonMenuIds: [], buttonPromptMessageId: '' });
}
async function saveButtonToPost(id, f) {
  await ensurePostSettingsForFlow(id, f);
  await ensureAddonColumns();
  const post = await postWithAddons(id, f.commentKey);
  const buttons = buttonsOf(post);
  const extras = asArray(post.ctaButtonsJson).map((b) => ({ text: clean(b.text || b.label || b.title), url: clean(b.url || b.link || b.action) })).filter(b => b.text && b.url);
  const text = clean(f.buttonText); const url = clean(f.buttonAction);
  if (f.buttonEditMode === 'edit') {
    const idx = Number(f.buttonIndex || 0);
    if (idx === 0) {
      await db.query('update ak_post_settings set buttons_enabled=true, cta_button_text=$3, cta_button_link=$4, updated_at=now() where admin_id=$1 and comment_key=$2', [id, f.commentKey, text, url]);
    } else {
      const j = idx - 1; if (extras[j]) extras[j] = { text, url };
      await db.query('update ak_post_settings set buttons_enabled=true, cta_buttons_json=$3::jsonb, updated_at=now() where admin_id=$1 and comment_key=$2', [id, f.commentKey, JSON.stringify(extras)]);
    }
  } else if (!buttons.length) {
    await db.query('update ak_post_settings set buttons_enabled=true, cta_button_text=$3, cta_button_link=$4, updated_at=now() where admin_id=$1 and comment_key=$2', [id, f.commentKey, text, url]);
  } else {
    extras.push({ text, url });
    await db.query('update ak_post_settings set buttons_enabled=true, cta_buttons_json=$3::jsonb, updated_at=now() where admin_id=$1 and comment_key=$2', [id, f.commentKey, JSON.stringify(extras)]);
  }
}
async function deleteButtonFromPost(id, commentKey, index) {
  await ensureAddonColumns();
  const post = await postWithAddons(id, commentKey);
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
    const post = await postWithAddons(id, p.commentKey);
    if (post && (buttonsOf(post).length || giftsOf(post).length)) return buttonPostManagerScreen(id, post);
    return inputButtonScreen(id, 'buttonText');
  }
  if (route === 'buttons:flow:add') { const s = await getS(id); await saveS(id, { buttonsFlow: { ...(s.buttonsFlow || {}), buttonText: '', buttonAction: '', buttonEditMode: 'add', buttonIndex: null } }); return inputButtonScreen(id, 'buttonText'); }
  if (route === 'buttons:flow:edit') {
    const s = await getS(id); const f = s.buttonsFlow || {}; const post = await postWithAddons(id, f.commentKey); const found = buttonsOf(post).find(b => Number(b.index) === Number(p.index));
    await saveS(id, { buttonsFlow: { ...f, buttonText: found?.text || '', buttonAction: found?.link || '', buttonEditMode: 'edit', buttonIndex: Number(p.index || 0) } });
    return reviewButtonScreen(id);
  }
  if (route === 'buttons:flow:delete') {
    const s = await getS(id); const f = s.buttonsFlow || {}; const patched = await deleteButtonFromPost(id, f.commentKey, p.index);
    const post = await postWithAddons(id, f.commentKey);
    return screen('🗑 Кнопка удалена', [`Пост: ${cut(f.title || f.postId)}`, `Применение к посту: ${patched.ok ? 'успешно' : 'ошибка ' + (patched.reason || '')}`], [['➕ Добавить кнопку', 'buttons:flow:add'], ['🔘 Кнопки поста', 'buttons:flow:post', { postId: f.postId, commentKey: f.commentKey, title: f.title, channelId: f.channelId }]], 'buttons:start');
  }
  if (route === 'buttons:flow:inputText') return inputButtonScreen(id, 'buttonText');
  if (route === 'buttons:flow:inputAction') return inputButtonScreen(id, 'buttonAction');
  if (route === 'buttons:flow:save') {
    const s = await getS(id); const f = s.buttonsFlow || {};
    if (!clean(f.commentKey) || !clean(f.buttonText) || !clean(f.buttonAction)) return reviewButtonScreen(id, { ok: false, reason: 'flow_not_complete' });
    await saveButtonToPost(id, f);
    const patched = await postPatcher.patchCommentsButtonByCommentKey(f.commentKey);
    await saveS(id, { mode: '', buttonsFlow: {} });
    return screen(f.buttonEditMode === 'edit' ? '✅ Кнопка изменена' : '✅ Кнопка добавлена к посту', [`Пост: ${cut(f.title || f.postId)}`, `Название кнопки: ${clean(f.buttonText)}`, `Куда ведёт: ${valueSet(f.buttonAction)}`, `Применение к посту: ${patched.ok ? 'успешно' : 'ошибка ' + (patched.reason || '')}`], [['🔘 Настроить ещё кнопку', 'buttons:start']], 'main:home');
  }
  return null;
}
async function handleAwaitButtonsInput(update, id) {
  const s = await getS(id); const mode = clean(s.mode);
  if (!mode.startsWith('cc7514:buttons:') && !mode.startsWith('cc7513:buttons:') && !mode.startsWith('cc7510:buttons:') && !mode.startsWith('cc759:buttons:') && !mode.startsWith('cc757:buttons:')) return null;
  const value = textOf(update);
  if (!value || START.has(value.toLowerCase())) return null;
  const field = mode.split(':').pop();
  const flow = { ...(s.buttonsFlow || {}) };
  if (field === 'buttonText') flow.buttonText = value;
  if (field === 'buttonAction') flow.buttonAction = value;
  await saveS(id, { mode: '', buttonsFlow: flow });
  return { screen: field === 'buttonText' ? await inputButtonScreen(id, 'buttonAction') : await reviewButtonScreen(id), label: field === 'buttonText' ? 'Название кнопки получено' : 'Ссылка получена' };
}

async function sendGiftManagerScreen(update, sc, route, opts = {}) {
  const id = adminId(update) || chatId(update) || 'global';
  const s = await getS(id); const prevGlobal = await state.getMenu(id); const current = messageId(update);
  const oldMenus = []
    .concat(Array.isArray(s.giftMenuIds) ? s.giftMenuIds : [])
    .concat(Array.isArray(s.giftGarbageIds) ? s.giftGarbageIds : [])
    .concat([s.giftPromptMessageId, prevGlobal]).map(clean).filter(Boolean);
  let mid = '';
  if (opts.preferEdit !== false && current && callbackId(update)) {
    try { await api.editMessage({ botToken: config.botToken, messageId: current, text: sc.text, attachments: sc.attachments, notify: false }); mid = current; } catch {}
  }
  if (!mid) { const sent = await api.sendMessage({ botToken: config.botToken, chatId: chatId(update) || undefined, userId: chatId(update) ? undefined : id, text: sc.text, attachments: sc.attachments, notify: false }); mid = responseMessageId(sent); }
  if (mid) await state.setMenu(id, mid);
  await saveS(id, { giftMenuIds: mid ? [mid] : [], giftPromptMessageId: mid || '', giftGarbageIds: [], giftLastRoute: route, giftUpdatedAt: Date.now() });
  await deleteMany(oldMenus.concat(opts.preferEdit === false ? [] : [current]).filter(x => x && x !== mid));
  const cbid = callbackId(update); if (cbid) api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: '' }).catch(() => {});
  return { handled: true, route, sentKind: 'cc7514_gift_manager', messageId: mid };
}
async function giftPostManagerScreen(id, post) {
  const gifts = giftsOf(post); const buttons = buttonsOf(post);
  const lines = [`Пост: ${postLabel(post)}`];
  if (gifts.length) lines.push('Уже есть подарок:', `1. 🎁 ${cut(gifts[0].title, 42)}`);
  else lines.push('Подарка у поста пока нет.');
  if (buttons.length) lines.push('', `Также есть кнопок: ${buttons.length}`);
  lines.push('', 'Выберите, что сделать.');
  const items = gifts.length ? [['✏️ Изменить подарок', 'gifts:manage:edit'], ['🗑 Удалить подарок', 'gifts:manage:delete']] : [['➕ Добавить подарок', 'gifts:manage:add']];
  return screen('🎁 Управление подарком поста', lines, items, 'gifts:flow:channel');
}
async function handleGiftManageRoute(route, id, p) {
  if (route === 'gifts:flow:post') {
    const s = await getS(id); const prev = s.giftsFlow || {};
    const flow = { channelId: p.channelId || prev.channelId, channelTitle: prev.channelTitle || p.channelTitle, postId: p.postId, commentKey: p.commentKey, title: p.title, giftTitle: '', giftLink: '', requireSubscription: true };
    await saveS(id, { mode: '', giftsFlow: flow });
    const post = await postWithAddons(id, p.commentKey);
    if (post && (giftsOf(post).length || buttonsOf(post).length)) return giftPostManagerScreen(id, post);
    await saveS(id, { mode: 'cc7511:gifts:giftTitle' });
    return screen('🎁 Подарки — шаг 3/6', ['Пришлите название подарка — текст на кнопке под постом.', 'Например: Чек-лист / PDF-гайд / Промокод'], [], 'gifts:flow:post');
  }
  if (route === 'gifts:manage:add' || route === 'gifts:manage:edit') {
    const s = await getS(id); const f = s.giftsFlow || {}; const post = await postWithAddons(id, f.commentKey); const gift = giftsOf(post)[0];
    await saveS(id, { mode: 'cc7511:gifts:giftTitle', giftsFlow: { ...f, giftTitle: route.endsWith('edit') ? (gift?.title || '') : '', giftLink: route.endsWith('edit') ? (gift?.link || '') : '', requireSubscription: gift?.requireSubscription !== false } });
    return screen(route.endsWith('edit') ? '🎁 Изменить подарок' : '🎁 Подарки — шаг 3/6', ['Пришлите название подарка — текст на кнопке под постом.', route.endsWith('edit') && gift ? `Сейчас: ${cut(gift.title, 50)}` : 'Например: Чек-лист / PDF-гайд / Промокод'], [], 'gifts:flow:post');
  }
  if (route === 'gifts:manage:delete') {
    const s = await getS(id); const f = s.giftsFlow || {}; await ensurePostSettingsForFlow(id, f); await ensureAddonColumns();
    await db.query("update ak_post_settings set gifts_enabled=false, gift_title='', gift_link='', gift_message='', gifts_json='[]'::jsonb, updated_at=now() where admin_id=$1 and comment_key=$2", [id, f.commentKey]);
    const patched = await postPatcher.patchCommentsButtonByCommentKey(f.commentKey);
    await saveS(id, { mode: '', giftsFlow: {} });
    return screen('🗑 Подарок удалён', [`Пост: ${cut(f.title || f.postId)}`, `Применение к посту: ${patched.ok ? 'успешно' : 'ошибка ' + (patched.reason || '')}`], [['🎁 Настроить подарок', 'gifts:start']], 'main:home');
  }
  return null;
}

async function tryHandle(update) {
  const route = routeOf(update); const id = adminId(update) || chatId(update) || 'global'; const p = payloadOf(update);
  const awaitedButton = await handleAwaitButtonsInput(update, id);
  if (awaitedButton) return sendButtonScreen(update, awaitedButton.screen, 'buttons:await', { preferEdit: false, neutralizeLabel: awaitedButton.label });
  if (route.startsWith('buttons:')) {
    const sc = await handleButtonsRoute(route, id, p);
    if (sc) return sendButtonScreen(update, sc, route, { preferEdit: true });
  }
  if (route === 'gifts:flow:post' || route.startsWith('gifts:manage:')) {
    const sc = await handleGiftManageRoute(route, id, p);
    if (sc) return sendGiftManagerScreen(update, sc, route, { preferEdit: true });
  }
  return base.tryHandle(update);
}
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return base.render(route); }
function selfTest() {
  const b = base.selfTest ? base.selfTest() : {};
  return { ...b, ok: true, runtimeVersion: RUNTIME, marker: MARKER,
    features: [...(b.features || []), 'existing_button_detection_after_post_select', 'button_add_edit_delete', 'multi_cta_buttons_json', 'existing_gift_detection_after_post_select', 'gift_edit_delete_entry', 'old_button_menu_neutralized_after_input'],
    commentsCoreTouched: false, giftsCoreTouched: false, buttonsCoreTouched: true,
    policy: 'addon_manager_over_7513_keep_comments_and_gifts_core_stable'
  };
}
function install() { return selfTest(); }
module.exports = { RUNTIME, MARKER, install, selfTest, render, tryHandle, tryHandleExpress, forceRepatchPost: (id, commentKey) => postPatcher.patchCommentsButtonByCommentKey(commentKey) };
