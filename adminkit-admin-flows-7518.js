'use strict';

// CC7.5.18: Gift manager cleanup/link fix over CC7.5.16 + CC7.5.17 idea.
// Fixes two tested issues:
// 1) after gift title/content input, the previous step menu is explicitly neutralized/deleted;
// 2) if the admin sends a URL as gift content, store/show the URL, not MAX link-preview attachment.
// Buttons manager remains CC7.5.16. Comments core remains accepted CC7.5.6.

const config = require('./config');
const api = require('./services/maxApi');
const db = require('./cc5-db-core');
const state = require('./db-v3-state');
const postPatcher = require('./db-v3-post-patcher');
const base = require('./adminkit-admin-flows-7516');

const RUNTIME = 'CC7.5.18-GIFT-CLEANUP-LINK-CONTENT';
const MARKER = '__ADMINKIT_CC7_5_18_GIFT_CLEANUP_LINK_CONTENT__';
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 90) => { const s = clean(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
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
function userIdFromCallback(u) { return clean(cb(u)?.user?.user_id || cb(u)?.user_id || body(u).user?.user_id || body(u).user_id || adminId(u)); }
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
function asArray(value) { if (Array.isArray(value)) return value; if (typeof value === 'string' && value.trim()) { try { const p = JSON.parse(value); return Array.isArray(p) ? p : []; } catch { return []; } } return []; }
function isHttpUrl(v) { return /^https?:\/\//i.test(clean(v)) || /^https:\/\/max\.ru\//i.test(clean(v)); }
function postTitle(post = {}) { return clean(post.title || post.raw?.title || post.raw?.originalText || post.raw?.text || post.postId || 'Пост'); }
function contentKind(v) { const s = clean(v); if (s.startsWith('akgift_')) return 'MAX-вложение'; if (isHttpUrl(s)) return 'ссылка'; return s ? 'текст' : 'не задано'; }
function contentLine(v) { const s = clean(v); if (!s) return 'Подарок: не задан'; if (s.startsWith('akgift_')) return 'Подарок: MAX-вложение'; if (isHttpUrl(s)) return `Подарок: ${s}`; return `Подарок: ${cut(s, 120)}`; }

function b64urlEncodeJson(obj) { return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function b64urlDecodeJson(value) { try { const s = String(value || '').replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(Buffer.from(s, 'base64').toString('utf8')); } catch { return null; } }
function getIncomingAttachments(update) {
  const m = msg(update) || {};
  const b = m.body && typeof m.body === 'object' ? m.body : {};
  const candidates = [b.attachments, m.attachments, body(update).attachments, body(update).message?.attachments, body(update).message?.body?.attachments];
  for (const x of candidates) if (Array.isArray(x) && x.length) return x;
  return [];
}
function encodeGiftPayloadFromUpdate(update) {
  const attachments = getIncomingAttachments(update).filter((a) => a && typeof a === 'object' && a.type !== 'inline_keyboard');
  if (!attachments.length) return '';
  return 'akgift_' + b64urlEncodeJson({ kind: 'max_attachments', attachments: attachments.slice(0, 5), savedAt: Date.now() });
}
function parseGiftPayload(value) { const raw = clean(value); if (!raw.startsWith('akgift_')) return null; return b64urlDecodeJson(raw.slice('akgift_'.length)); }
function giftContentFromUpdate(update, txt) {
  // MAX often attaches a link preview to a URL message. For gift content, a typed URL must stay a URL.
  if (isHttpUrl(txt)) return clean(txt);
  const attachmentPayload = encodeGiftPayloadFromUpdate(update);
  return attachmentPayload || clean(txt);
}

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

async function postWithGifts(id, commentKey) {
  await ensureAddonColumns();
  const { rows } = await db.query(`
    select p.admin_id as "adminId", p.channel_id as "channelId", p.post_id as "postId", p.message_id as "messageId", p.comment_key as "commentKey", p.title, p.raw,
      coalesce(s.gifts_enabled, false) as "giftsEnabled", coalesce(s.gift_title, '') as "giftTitle", coalesce(s.gift_link, '') as "giftLink", coalesce(s.gifts_require_subscription, true) as "giftsRequireSubscription", coalesce(s.gifts_json, '[]'::jsonb) as "giftsJson"
    from ak_posts p left join ak_post_settings s on s.admin_id=p.admin_id and s.comment_key=p.comment_key
    where p.admin_id=$1 and p.comment_key=$2 order by p.updated_at desc limit 1
  `, [id, clean(commentKey)]);
  return rows[0] || null;
}
function giftsOf(post = {}) {
  const out = [];
  if (post.giftsEnabled && clean(post.giftTitle) && clean(post.giftLink)) out.push({ index: 0, title: clean(post.giftTitle), link: clean(post.giftLink), requireSubscription: post.giftsRequireSubscription !== false });
  asArray(post.giftsJson).forEach((g, i) => {
    const title = clean(g?.title || g?.text || g?.label);
    const link = clean(g?.link || g?.content || g?.url || g?.payload);
    if (title && link) out.push({ index: i + 1, title, link, requireSubscription: g?.requireSubscription !== false });
  });
  return out;
}
function giftListLines(gifts = []) {
  if (!gifts.length) return ['Подарков у поста пока нет.'];
  const lines = [`Подарки сейчас: ${gifts.length}`];
  gifts.forEach((g, i) => {
    lines.push(`${i + 1}. ${g.title}`);
    lines.push(`   ${contentLine(g.link)}`);
    lines.push(`   Доступ: ${g.requireSubscription === false ? 'всем' : 'только подписчикам'}`);
  });
  return lines;
}

function giftMenuCandidates(s = {}, prevGlobal = '') {
  return []
    .concat(Array.isArray(s.giftMenuIds) ? s.giftMenuIds : [])
    .concat(Array.isArray(s.giftGarbageIds) ? s.giftGarbageIds : [])
    .concat([s.giftPromptMessageId, s.giftLastPromptMessageId, prevGlobal])
    .map(clean).filter(Boolean);
}
function deleteLater(messageIdValue, delayMs) {
  if (!messageIdValue || !config.botToken) return;
  setTimeout(() => api.deleteMessage({ botToken: config.botToken, messageId: messageIdValue, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {}), delayMs);
}
async function deleteMany(ids = []) {
  [...new Set(ids.map(clean).filter(Boolean))].forEach((mid) => {
    api.deleteMessage({ botToken: config.botToken, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {});
    deleteLater(mid, 500); deleteLater(mid, 1200); deleteLater(mid, 2600); deleteLater(mid, 5200);
  });
}
async function neutralizeOldMenus(ids = [], label = 'Получено') {
  for (const mid of [...new Set(ids.map(clean).filter(Boolean))]) {
    try { await api.editMessage({ botToken: config.botToken, messageId: mid, text: `✅ ${label}`, attachments: [], notify: false }); } catch {}
    api.deleteMessage({ botToken: config.botToken, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {});
    deleteLater(mid, 500); deleteLater(mid, 1200); deleteLater(mid, 2600); deleteLater(mid, 5200);
  }
}
async function sendGiftScreen(update, sc, route, opts = {}) {
  const id = adminId(update) || chatId(update) || 'global';
  const s = await getS(id);
  const prevGlobal = await state.getMenu(id);
  const current = messageId(update);
  const oldMenus = giftMenuCandidates(s, prevGlobal).concat(opts.oldPromptIds || []).map(clean).filter(Boolean);
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
  await saveS(id, { giftMenuIds: mid ? [mid] : [], giftPromptMessageId: mid || '', giftLastPromptMessageId: mid || '', giftGarbageIds: [], giftLastRoute: route, giftUpdatedAt: Date.now() });
  if (!opts.neutralizeLabel) await deleteMany(oldMenus.concat(edited ? [] : [current]).filter(x => x && x !== mid));
  const cbid = callbackId(update); if (cbid) api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: '' }).catch(() => {});
  return { handled: true, route, sentKind: 'cc7518_gift_cleanup_link_content', messageId: mid, edited };
}

async function chooseGiftChannelScreen(id) {
  const channels = await listChannels(id);
  return screen('🎁 Подарки — шаг 1/6', ['Выберите канал, где находится пост.'], channels.slice(0, 10).map((c, i) => [`${i + 1}. ${state.channelTitle(c.channelId, c.title)}`, 'gifts:flow:channel', { channelId: c.channelId, channelTitle: c.title }]), 'main:home');
}
async function chooseGiftPostScreen(id) {
  const s = await getS(id); const f = s.giftsFlow || {}; const chId = f.channelId || (await activeChannel(id)).channelId;
  const posts = await listPostsForChannel(id, chId);
  return screen('🎁 Подарки — шаг 2/6', ['Выберите пост, к которому применить подарок.'], posts.slice(0, 10).map((p, i) => [`${i + 1}. ${postTitle(p)}`, 'gifts:flow:post', { postId: p.postId, commentKey: p.commentKey, title: p.title, channelId: p.channelId }]), 'gifts:start');
}
async function giftPostManagerScreen(id, post, headline = '🎁 Управление подарками поста') {
  const gifts = giftsOf(post);
  const lines = [`Пост: ${postTitle(post)}`, '', ...giftListLines(gifts), '', 'Что сделать с подарками?'];
  const items = [['➕ Добавить новый подарок', 'gifts:flow:add']];
  gifts.slice(0, 4).forEach((g, i) => {
    items.push([`✏️ Изменить подарок ${i + 1}`, 'gifts:flow:edit', { index: g.index }]);
    items.push([`🗑 Удалить подарок ${i + 1}`, 'gifts:flow:delete', { index: g.index }]);
  });
  return screen(headline, lines, items, 'gifts:flow:channel', true);
}
async function giftInputScreen(id, field) {
  await saveS(id, { mode: `cc7518:gifts:${field}` });
  if (field === 'giftTitle') {
    return screen('🎁 Подарки — шаг 3/6', ['Пришлите название подарка — текст на кнопке под постом.', 'Например: Чек-лист / PDF-гайд / Промокод'], [], 'gifts:flow:post', true);
  }
  return screen('🎁 Подарки — шаг 4/6', [
    'Пришлите сам подарок.',
    'Можно отправить ссылку, фото, файл или обычный текст.',
    'Если отправляете ссылку, она будет сохранена именно как ссылка.',
    'Например: https://site.ru/checklist.pdf или текст промокода.'
  ], [], 'gifts:flow:inputTitle', true);
}
async function giftModeScreen(id) {
  await saveS(id, { mode: '' });
  return screen('🎁 Подарки — шаг 5/6', ['Выберите, кто сможет получить подарок.'], [['✅ Только подписчикам', 'gifts:flow:mode', { requireSubscription: true }], ['🌐 Всем', 'gifts:flow:mode', { requireSubscription: false }]], 'gifts:flow:inputContent');
}
async function giftReviewScreen(id, afterPatch = null) {
  const s = await getS(id); const f = s.giftsFlow || {};
  const ready = !!(clean(f.commentKey) && clean(f.giftTitle) && clean(f.giftLink));
  const items = ready ? [['💾 Сохранить подарок', 'gifts:flow:save'], ['✏️ Изменить название', 'gifts:flow:inputTitle'], ['📎 Изменить подарок', 'gifts:flow:inputContent'], ['⚙️ Изменить доступ', 'gifts:flow:inputMode']] : [['✏️ Изменить название', 'gifts:flow:inputTitle'], ['📎 Изменить подарок', 'gifts:flow:inputContent'], ['⚙️ Изменить доступ', 'gifts:flow:inputMode']];
  return screen('🎁 Подарки — шаг 6/6', [
    `Режим: ${f.giftEditMode === 'edit' ? 'изменить существующий подарок' : 'добавить новый подарок'}`,
    `Пост: ${f.title || f.postId || 'не выбран'}`,
    `Название подарка: ${clean(f.giftTitle) || 'не задано'}`,
    contentLine(f.giftLink),
    `Тип: ${contentKind(f.giftLink)}`,
    `Доступ: ${f.requireSubscription === false ? 'всем' : 'только подписчикам'}`,
    `Статус: ${ready ? 'готово к сохранению' : 'не завершено'}`,
    afterPatch ? `Применение к посту: ${afterPatch.ok ? 'успешно' : 'ошибка ' + (patched.reason || afterPatch.error || '')}` : ''
  ], items, 'gifts:start', true);
}
async function resetGiftsFlow(id) {
  const s = await getS(id);
  await saveS(id, { mode: '', giftsFlow: {}, giftGarbageIds: Array.isArray(s.giftMenuIds) ? s.giftMenuIds : [], giftMenuIds: [], giftPromptMessageId: '' });
}
function giftToJson(g) { return { title: clean(g.title), link: clean(g.link), requireSubscription: g.requireSubscription !== false }; }
async function saveGiftToPost(id, f) {
  await ensurePostSettingsForFlow(id, f);
  await ensureAddonColumns();
  const post = await postWithGifts(id, f.commentKey);
  const gifts = giftsOf(post);
  const extras = asArray(post?.giftsJson).map((g) => giftToJson({ title: g?.title || g?.text || g?.label, link: g?.link || g?.content || g?.url || g?.payload, requireSubscription: g?.requireSubscription !== false })).filter(g => g.title && g.link);
  const title = clean(f.giftTitle); const link = clean(f.giftLink); const req = f.requireSubscription !== false;
  if (f.giftEditMode === 'edit') {
    const idx = Number(f.giftIndex || 0);
    if (idx === 0) await db.query('update ak_post_settings set gifts_enabled=true, gift_title=$3, gift_link=$4, gifts_require_subscription=$5, updated_at=now() where admin_id=$1 and comment_key=$2', [id, f.commentKey, title, link, req]);
    else { const j = idx - 1; if (extras[j]) extras[j] = { title, link, requireSubscription: req }; await db.query('update ak_post_settings set gifts_enabled=true, gifts_json=$3::jsonb, updated_at=now() where admin_id=$1 and comment_key=$2', [id, f.commentKey, JSON.stringify(extras)]); }
  } else if (!gifts.length) {
    await db.query('update ak_post_settings set gifts_enabled=true, gift_title=$3, gift_link=$4, gifts_require_subscription=$5, updated_at=now() where admin_id=$1 and comment_key=$2', [id, f.commentKey, title, link, req]);
  } else {
    extras.push({ title, link, requireSubscription: req });
    await db.query('update ak_post_settings set gifts_enabled=true, gifts_json=$3::jsonb, updated_at=now() where admin_id=$1 and comment_key=$2', [id, f.commentKey, JSON.stringify(extras)]);
  }
}
async function deleteGiftFromPost(id, commentKey, index) {
  await ensureAddonColumns();
  const post = await postWithGifts(id, commentKey);
  if (!post) return { ok: false, reason: 'post_not_found' };
  const extras = asArray(post.giftsJson).map((g) => giftToJson({ title: g?.title || g?.text || g?.label, link: g?.link || g?.content || g?.url || g?.payload, requireSubscription: g?.requireSubscription !== false })).filter(g => g.title && g.link);
  const idx = Number(index || 0);
  if (idx === 0) {
    if (extras.length) { const promoted = extras.shift(); await db.query('update ak_post_settings set gifts_enabled=true, gift_title=$3, gift_link=$4, gifts_require_subscription=$5, gifts_json=$6::jsonb, updated_at=now() where admin_id=$1 and comment_key=$2', [id, commentKey, promoted.title, promoted.link, promoted.requireSubscription !== false, JSON.stringify(extras)]); }
    else await db.query("update ak_post_settings set gifts_enabled=false, gift_title='', gift_link='', gifts_json='[]'::jsonb, updated_at=now() where admin_id=$1 and comment_key=$2", [id, commentKey]);
  } else {
    extras.splice(idx - 1, 1);
    const enabled = !!(clean(post.giftTitle) && clean(post.giftLink)) || extras.length > 0;
    await db.query('update ak_post_settings set gifts_enabled=$3, gifts_json=$4::jsonb, updated_at=now() where admin_id=$1 and comment_key=$2', [id, commentKey, enabled, JSON.stringify(extras)]);
  }
  return postPatcher.patchCommentsButtonByCommentKey(commentKey);
}

async function handleGiftRoute(route, id, p) {
  if (route === 'gifts:home' || route === 'gifts:start') { await resetGiftsFlow(id); return chooseGiftChannelScreen(id); }
  if (route === 'gifts:flow:channel') { await saveS(id, { mode: '', giftsFlow: { channelId: p.channelId, channelTitle: p.channelTitle } }); return chooseGiftPostScreen(id); }
  if (route === 'gifts:flow:post') {
    const s = await getS(id); const prev = s.giftsFlow || {};
    const flow = { channelId: p.channelId || prev.channelId, channelTitle: prev.channelTitle || p.channelTitle, postId: p.postId, commentKey: p.commentKey, title: p.title, giftTitle: '', giftLink: '', requireSubscription: true, giftEditMode: 'add', giftIndex: null };
    await saveS(id, { mode: '', giftsFlow: flow });
    const post = await postWithGifts(id, p.commentKey);
    if (post && giftsOf(post).length) return giftPostManagerScreen(id, post);
    return giftInputScreen(id, 'giftTitle');
  }
  if (route === 'gifts:flow:add') { const s = await getS(id); await saveS(id, { giftsFlow: { ...(s.giftsFlow || {}), giftTitle: '', giftLink: '', requireSubscription: true, giftEditMode: 'add', giftIndex: null } }); return giftInputScreen(id, 'giftTitle'); }
  if (route === 'gifts:flow:edit') {
    const s = await getS(id); const f = s.giftsFlow || {}; const post = await postWithGifts(id, f.commentKey); const found = giftsOf(post).find(g => Number(g.index) === Number(p.index));
    await saveS(id, { giftsFlow: { ...f, giftTitle: found?.title || '', giftLink: found?.link || '', requireSubscription: found?.requireSubscription !== false, giftEditMode: 'edit', giftIndex: Number(p.index || 0) } });
    return giftReviewScreen(id);
  }
  if (route === 'gifts:flow:delete') {
    const s = await getS(id); const f = s.giftsFlow || {}; const patched = await deleteGiftFromPost(id, f.commentKey, p.index);
    const post = await postWithGifts(id, f.commentKey);
    return giftPostManagerScreen(id, post || { ...f, commentKey: f.commentKey }, patched.ok ? '🗑 Подарок удалён' : '⚠️ Не удалось удалить подарок');
  }
  if (route === 'gifts:flow:inputTitle') return giftInputScreen(id, 'giftTitle');
  if (route === 'gifts:flow:inputLink' || route === 'gifts:flow:inputContent') return giftInputScreen(id, 'giftContent');
  if (route === 'gifts:flow:inputMode') return giftModeScreen(id);
  if (route === 'gifts:flow:mode') { const s = await getS(id); await saveS(id, { mode: '', giftsFlow: { ...(s.giftsFlow || {}), requireSubscription: p.requireSubscription !== false } }); return giftReviewScreen(id); }
  if (route === 'gifts:flow:save') {
    const s = await getS(id); const f = s.giftsFlow || {};
    if (!clean(f.commentKey) || !clean(f.giftTitle) || !clean(f.giftLink)) return giftReviewScreen(id, { ok: false, reason: 'flow_not_complete' });
    await saveGiftToPost(id, f);
    const patched = await postPatcher.patchCommentsButtonByCommentKey(f.commentKey);
    const post = await postWithGifts(id, f.commentKey);
    await saveS(id, { mode: '', giftsFlow: { channelId: f.channelId, channelTitle: f.channelTitle, postId: f.postId, commentKey: f.commentKey, title: f.title } });
    const title = f.giftEditMode === 'edit' ? '✅ Подарок изменён' : '✅ Подарок добавлен к посту';
    const lines = [`Пост: ${postTitle(post || f)}`, `Применение к посту: ${patched.ok ? 'успешно' : 'ошибка ' + (patched.reason || '')}`, '', ...giftListLines(giftsOf(post || {})), '', 'Можно сразу продолжить управление подарками этого поста.'];
    const items = [['➕ Добавить ещё один подарок', 'gifts:flow:add'], ['🎁 Управлять подарками этого поста', 'gifts:flow:post', { postId: f.postId, commentKey: f.commentKey, title: f.title, channelId: f.channelId }], ['🎁 Выбрать другой пост', 'gifts:start']];
    return screen(title, lines, items, 'main:home', true);
  }
  return null;
}
async function handleAwaitGiftInput(update, id) {
  const s = await getS(id); const mode = clean(s.mode);
  if (!mode.startsWith('cc7518:gifts:') && !mode.startsWith('cc7517:gifts:') && !mode.startsWith('cc7512:gifts:') && !mode.startsWith('cc7511:gifts:') && !mode.startsWith('cc758:gifts:') && !mode.startsWith('cc757:gifts:')) return null;
  const previousMenus = giftMenuCandidates(s, await state.getMenu(id));
  const field = mode.split(':').pop();
  const txt = textOf(update);
  const value = (field === 'giftContent' || field === 'giftLink') ? giftContentFromUpdate(update, txt) : txt;
  if (!value || START.has(clean(value).toLowerCase())) return null;
  const flow = { ...(s.giftsFlow || {}) };
  if (field === 'giftTitle') flow.giftTitle = txt;
  if (field === 'giftContent' || field === 'giftLink') flow.giftLink = value;
  await saveS(id, { mode: '', giftsFlow: flow });
  return { screen: field === 'giftTitle' ? await giftInputScreen(id, 'giftContent') : await giftModeScreen(id), label: field === 'giftTitle' ? 'Название подарка получено' : 'Подарок получен', oldPromptIds: previousMenus };
}

async function findGiftPost(commentKey) {
  await ensureAddonColumns();
  const { rows } = await db.query(`
    select p.admin_id as "adminId", p.channel_id as "channelId", p.post_id as "postId", p.message_id as "messageId", p.comment_key as "commentKey", p.title,
      s.gifts_enabled as "giftsEnabled", s.gift_title as "giftTitle", s.gift_link as "giftLink", s.gift_message as "giftMessage", s.gifts_require_subscription as "giftsRequireSubscription", coalesce(s.gifts_json, '[]'::jsonb) as "giftsJson"
    from ak_posts p join ak_post_settings s on s.comment_key=p.comment_key
    where p.comment_key=$1 and s.gifts_enabled=true order by s.updated_at desc limit 1
  `, [clean(commentKey)]);
  return rows[0] || null;
}
async function handleGiftClaim(update, p) {
  const commentKey = clean(p.commentKey);
  const post = await findGiftPost(commentKey);
  const giftIndex = Number(p.giftIndex || 0);
  const gift = giftsOf(post).find(g => Number(g.index) === giftIndex) || giftsOf(post)[0];
  const uid = userIdFromCallback(update);
  const cbid = callbackId(update);
  if (!post || !gift || !clean(gift.link)) {
    if (cbid) await api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: 'Подарок не найден' }).catch(() => {});
    return { handled: true, route: 'gifts:claim', sentKind: 'gift_not_found' };
  }
  const title = clean(gift.title) || 'Подарок';
  const parsed = parseGiftPayload(gift.link);
  if (parsed?.attachments?.length) await api.sendMessage({ botToken: config.botToken, userId: uid, text: `🎁 ${title}`, attachments: parsed.attachments, notify: false });
  else await api.sendMessage({ botToken: config.botToken, userId: uid, text: `🎁 ${title}\n${clean(gift.link)}`, notify: false });
  if (cbid) await api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: 'Подарок отправлен в чат с ботом' }).catch(() => {});
  return { handled: true, route: 'gifts:claim', sentKind: 'cc7518_gift_sent', giftIndex };
}

async function tryHandle(update) {
  const route = routeOf(update); const id = adminId(update) || chatId(update) || 'global'; const p = payloadOf(update);
  if (route === 'gifts:claim') return handleGiftClaim(update, p);
  const awaitedGift = await handleAwaitGiftInput(update, id);
  if (awaitedGift) return sendGiftScreen(update, awaitedGift.screen, 'gifts:await', { preferEdit: false, neutralizeLabel: awaitedGift.label, oldPromptIds: awaitedGift.oldPromptIds });
  if (route.startsWith('gifts:')) {
    const sc = await handleGiftRoute(route, id, p);
    if (sc) return sendGiftScreen(update, sc, route, { preferEdit: true });
  }
  return base.tryHandle(update);
}
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return base.render(route); }
function selfTest() {
  const b = base.selfTest ? base.selfTest() : {};
  return { ...b, ok: true, runtimeVersion: RUNTIME, marker: MARKER,
    features: [...(b.features || []), 'gift_manager_like_buttons', 'gift_previous_step_menu_neutralized_after_input', 'gift_url_preferred_over_link_preview_attachment', 'gift_add_edit_delete', 'multi_gifts_json', 'gift_claim_by_index'],
    commentsCoreTouched: false, buttonsCoreTouched: false, giftsCoreTouched: true,
    policy: 'fix_gift_menu_multiplication_and_link_content_over_7517'
  };
}
function install() { return selfTest(); }
module.exports = { RUNTIME, MARKER, install, selfTest, render, tryHandle, tryHandleExpress, forceRepatchPost: (id, commentKey) => postPatcher.patchCommentsButtonByCommentKey(commentKey) };
