'use strict';

// CC7.5.11 gift flow stable over CC7.5.10 button UX cleanup.
// Goal: preserve accepted comments core and button flow, fix gifts only:
// channel -> post -> title -> gift content -> mode -> review/save.
// Removes unclear word "action" from gift UX: gift content is link, photo, file, or text message.

const config = require('./config');
const api = require('./services/maxApi');
const db = require('./cc5-db-core');
const state = require('./db-v3-state');
const base = require('./adminkit-admin-flows-7510');

const RUNTIME = 'CC7.5.11-GIFT-FLOW-STABLE';
const MARKER = '__ADMINKIT_CC7_5_11_GIFT_FLOW_STABLE__';

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
function userIdFromCallback(u) { return clean(cb(u)?.user?.user_id || cb(u)?.user_id || body(u).user?.user_id || body(u).user_id || adminId(u)); }
function btn(text, route, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ r: route, ...extra }) }; }
function keyboard(items, backRoute = 'main:home') { const rows = []; for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).map(x => btn(x[0], x[1], x[2] || {}))); rows.push([btn('↩️ Назад', backRoute), btn('🏠 Главное', 'main:home')]); return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
function screen(title, lines, items = [], backRoute = 'main:home') { return { text: [title, '', (Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines || ''))].join('\n'), attachments: keyboard(items, backRoute) }; }
function valueSet(v) { return clean(v) ? 'задано' : 'не задано'; }
function postLabel(p = {}) { return cut(p.title || p.raw?.title || p.raw?.originalText || p.raw?.text || p.postId || 'Пост', 50); }
function isHttpUrl(v) { return /^https?:\/\//i.test(clean(v)) || /^https:\/\/max\.ru\//i.test(clean(v)); }

async function getS(id) { const f = await state.getFlow(id); return f.menuV3 || {}; }
async function saveS(id, patch) { return state.setFlow(id, patch); }
async function listChannels(id) { return (await state.listChannels(id)) || []; }
async function listPostsForChannel(id, channelId) { return state.listPosts(id, channelId, 30); }
async function activeChannel(id) { return state.activeChannel(id); }

function b64urlEncodeJson(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function b64urlDecodeJson(value) {
  try {
    const s = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(s, 'base64').toString('utf8'));
  } catch { return null; }
}
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
function parseGiftPayload(value) {
  const raw = clean(value);
  if (!raw.startsWith('akgift_')) return null;
  return b64urlDecodeJson(raw.slice('akgift_'.length));
}

function deleteLater(messageIdValue, delayMs) {
  if (!messageIdValue || !config.botToken) return;
  setTimeout(() => api.deleteMessage({ botToken: config.botToken, messageId: messageIdValue, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {}), delayMs);
}
async function deleteMany(ids = []) {
  const uniq = [...new Set(ids.map(clean).filter(Boolean))];
  uniq.forEach((mid) => {
    api.deleteMessage({ botToken: config.botToken, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {});
    deleteLater(mid, 700);
    deleteLater(mid, 1800);
    deleteLater(mid, 4200);
  });
}

async function sendGiftScreen(update, sc, route, opts = {}) {
  const id = adminId(update) || chatId(update) || 'global';
  const s = await getS(id);
  const currentMessageId = messageId(update);
  const prevGlobal = await state.getMenu(id);
  const promptId = clean(opts.editMessageId || s.giftPromptMessageId || '');
  const history = []
    .concat(Array.isArray(s.giftMenuIds) ? s.giftMenuIds : [])
    .concat(Array.isArray(s.giftGarbageIds) ? s.giftGarbageIds : [])
    .concat([s.giftPromptMessageId, prevGlobal])
    .map(clean).filter(Boolean);

  let mid = '';
  let edited = false;
  const canEditCallbackMessage = opts.preferEdit !== false && currentMessageId && callbackId(update);
  const editTarget = clean(opts.editMessageId || (canEditCallbackMessage ? currentMessageId : ''));
  if (editTarget) {
    try {
      await api.editMessage({ botToken: config.botToken, messageId: editTarget, text: sc.text, attachments: sc.attachments, notify: false });
      mid = editTarget;
      edited = true;
    } catch {}
  }
  if (!mid) {
    const sent = await api.sendMessage({ botToken: config.botToken, chatId: chatId(update) || undefined, userId: chatId(update) ? undefined : id, text: sc.text, attachments: sc.attachments, notify: false });
    mid = responseMessageId(sent);
  }
  if (mid) await state.setMenu(id, mid);
  await saveS(id, { giftMenuIds: mid ? [mid] : [], giftPromptMessageId: mid || promptId, giftGarbageIds: [], giftLastRoute: route, giftUpdatedAt: Date.now() });

  const toDelete = history.concat([currentMessageId]);
  if (edited && mid === currentMessageId) {
    const idx = toDelete.indexOf(currentMessageId);
    if (idx >= 0) toDelete.splice(idx, 1);
  }
  await deleteMany(toDelete.filter(x => x && x !== mid));
  const cbid = callbackId(update); if (cbid) api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: '' }).catch(() => {});
  return { handled: true, route, sentKind: 'cc7511_gift_flow_stable', messageId: mid, edited };
}

async function chooseGiftChannelScreen(id) {
  const channels = await listChannels(id);
  return screen('🎁 Подарки — шаг 1/6', ['Выберите канал, где находится пост.'], channels.slice(0, 10).map((c, i) => [`${i + 1}. ${state.channelTitle(c.channelId, c.title)}`, 'gifts:flow:channel', { channelId: c.channelId, channelTitle: c.title }]), 'main:home');
}
async function chooseGiftPostScreen(id) {
  const s = await getS(id); const f = s.giftsFlow || {}; const chId = f.channelId || (await activeChannel(id)).channelId;
  const posts = await listPostsForChannel(id, chId);
  return screen('🎁 Подарки — шаг 2/6', ['Выберите пост, к которому добавить подарок.'], posts.slice(0, 10).map((p, i) => [`${i + 1}. ${postLabel(p)}`, 'gifts:flow:post', { postId: p.postId, commentKey: p.commentKey, title: p.title, channelId: p.channelId }]), 'gifts:start');
}
async function giftInputScreen(id, field) {
  await saveS(id, { mode: `cc7511:gifts:${field}` });
  if (field === 'giftTitle') {
    return screen('🎁 Подарки — шаг 3/6', ['Пришлите название подарка — текст на кнопке под постом.', 'Например: Чек-лист / PDF-гайд / Промокод'], [], 'gifts:flow:post');
  }
  if (field === 'giftContent') {
    return screen('🎁 Подарки — шаг 4/6', [
      'Пришлите сам подарок.',
      'Можно отправить: ссылку, фото, файл или обычный текст.',
      'Например: https://site.ru/checklist.pdf или текст промокода.'
    ], [], 'gifts:flow:inputTitle');
  }
  return giftModeScreen(id);
}
async function giftModeScreen(id) {
  await saveS(id, { mode: '' });
  return screen('🎁 Подарки — шаг 5/6', ['Выберите, кто сможет получить подарок.'], [['✅ Только подписчикам', 'gifts:flow:mode', { requireSubscription: true }], ['🌐 Всем', 'gifts:flow:mode', { requireSubscription: false }]], 'gifts:flow:inputContent');
}
async function giftReviewScreen(id, afterPatch = null) {
  const s = await getS(id); const f = s.giftsFlow || {};
  const hasTitle = !!clean(f.giftTitle);
  const hasContent = !!clean(f.giftLink);
  const ready = !!(clean(f.commentKey) && hasTitle && hasContent);
  const items = ready
    ? [['💾 Сохранить', 'gifts:flow:save'], ['✏️ Название', 'gifts:flow:inputTitle'], ['📎 Подарок', 'gifts:flow:inputContent'], ['⚙️ Доступ', 'gifts:flow:inputMode']]
    : [['✏️ Название', 'gifts:flow:inputTitle'], ['📎 Подарок', 'gifts:flow:inputContent'], ['⚙️ Доступ', 'gifts:flow:inputMode']];
  return screen('🎁 Подарки — шаг 6/6', [
    `Канал: ${state.channelTitle(f.channelId, f.channelTitle)}`,
    `Пост: ${cut(f.title || f.postId || 'не выбран')}`,
    `Название подарка: ${clean(f.giftTitle) || 'не задано'}`,
    `Подарок: ${valueSet(f.giftLink)}`,
    `Доступ: ${f.requireSubscription === false ? 'всем' : 'только подписчикам'}`,
    `Статус: ${ready ? 'готово к сохранению' : 'не завершено'}`,
    !hasTitle ? 'Нужно задать название подарка.' : '',
    !hasContent ? 'Нужно прислать ссылку, фото, файл или текст подарка.' : '',
    afterPatch ? `Применение к посту: ${afterPatch.ok ? 'успешно' : 'ошибка ' + (afterPatch.reason || afterPatch.error || '')}` : ''
  ], items, 'gifts:start');
}
async function resetGiftsFlow(id) {
  const s = await getS(id);
  await saveS(id, { mode: '', giftsFlow: {}, giftGarbageIds: Array.isArray(s.giftMenuIds) ? s.giftMenuIds : [], giftMenuIds: [], giftPromptMessageId: '' });
}

async function handleGiftRoute(route, id, p) {
  if (route === 'gifts:home' || route === 'gifts:start') { await resetGiftsFlow(id); return chooseGiftChannelScreen(id); }
  if (route === 'gifts:flow:channel') { await saveS(id, { mode: '', giftsFlow: { channelId: p.channelId, channelTitle: p.channelTitle } }); return chooseGiftPostScreen(id); }
  if (route === 'gifts:flow:post') {
    const s = await getS(id); const prev = s.giftsFlow || {};
    await saveS(id, { mode: '', giftsFlow: { channelId: p.channelId || prev.channelId, channelTitle: prev.channelTitle, postId: p.postId, commentKey: p.commentKey, title: p.title, giftTitle: '', giftLink: '', requireSubscription: true } });
    return giftInputScreen(id, 'giftTitle');
  }
  if (route === 'gifts:flow:inputTitle') return giftInputScreen(id, 'giftTitle');
  if (route === 'gifts:flow:inputLink' || route === 'gifts:flow:inputContent') return giftInputScreen(id, 'giftContent');
  if (route === 'gifts:flow:inputMode') return giftModeScreen(id);
  if (route === 'gifts:flow:mode') { const s = await getS(id); await saveS(id, { mode: '', giftsFlow: { ...(s.giftsFlow || {}), requireSubscription: p.requireSubscription !== false } }); return giftReviewScreen(id); }
  if (route === 'gifts:flow:save') {
    const s = await getS(id); const f = s.giftsFlow || {}; const post = await state.getPostByCommentKey(id, f.commentKey);
    if (!post || !clean(f.giftTitle) || !clean(f.giftLink)) return giftReviewScreen(id, { ok: false, reason: 'flow_not_complete' });
    await state.savePostSetting(id, post, { giftsEnabled: true, giftTitle: clean(f.giftTitle), giftLink: clean(f.giftLink), giftsRequireSubscription: f.requireSubscription !== false });
    const patched = await base.forceRepatchPost(id, f.commentKey);
    const result = screen('✅ Подарок добавлен к посту', [
      `Пост: ${cut(f.title || f.postId)}`,
      `Название подарка: ${clean(f.giftTitle)}`,
      `Подарок: ${valueSet(f.giftLink)}`,
      `Доступ: ${f.requireSubscription === false ? 'всем' : 'только подписчикам'}`,
      `Комментариев сохранено: ${patched.commentCount ?? 'без изменений'}`,
      `Применение к посту: ${patched.ok ? 'успешно' : 'ошибка ' + (patched.reason || '')}`
    ], [['🎁 Настроить ещё подарок', 'gifts:start']], 'main:home');
    await saveS(id, { mode: '', giftsFlow: {} });
    return result;
  }
  return null;
}

async function handleAwaitGiftInput(update, id) {
  const s = await getS(id); const mode = clean(s.mode);
  if (!mode.startsWith('cc7511:gifts:') && !mode.startsWith('cc758:gifts:') && !mode.startsWith('cc757:gifts:')) return null;
  const field = mode.split(':').pop();
  const txt = textOf(update);
  const giftPayload = field === 'giftContent' || field === 'giftLink' ? encodeGiftPayloadFromUpdate(update) : '';
  if (!giftPayload && (!txt || START.has(txt.toLowerCase()))) return null;
  const flow = { ...(s.giftsFlow || {}) };
  if (field === 'giftTitle') flow.giftTitle = txt;
  if (field === 'giftContent' || field === 'giftLink') flow.giftLink = giftPayload || txt;
  await saveS(id, { mode: '', giftsFlow: flow });
  const editMessageId = clean(s.giftPromptMessageId || (Array.isArray(s.giftMenuIds) ? s.giftMenuIds[0] : '') || await state.getMenu(id));
  if (field === 'giftTitle') return { screen: await giftInputScreen(id, 'giftContent'), editMessageId };
  return { screen: await giftModeScreen(id), editMessageId };
}

async function findGiftPost(commentKey) {
  await db.init();
  const { rows } = await db.query('select p.admin_id as "adminId", p.channel_id as "channelId", p.post_id as "postId", p.message_id as "messageId", p.comment_key as "commentKey", p.title, s.gifts_enabled as "giftsEnabled", s.gift_title as "giftTitle", s.gift_link as "giftLink", s.gift_message as "giftMessage", s.gifts_require_subscription as "giftsRequireSubscription" from ak_posts p join ak_post_settings s on s.comment_key=p.comment_key where p.comment_key=$1 and s.gifts_enabled=true order by s.updated_at desc limit 1', [commentKey]);
  return rows[0] || null;
}
async function handleGiftClaim(update, p) {
  const commentKey = clean(p.commentKey);
  const post = await findGiftPost(commentKey);
  const uid = userIdFromCallback(update);
  const cbid = callbackId(update);
  if (!post || !clean(post.giftLink)) {
    if (cbid) await api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: 'Подарок не найден' }).catch(() => {});
    return { handled: true, route: 'gifts:claim', sentKind: 'gift_not_found' };
  }
  const title = clean(post.giftTitle) || 'Подарок';
  const parsed = parseGiftPayload(post.giftLink);
  if (parsed?.attachments?.length) {
    await api.sendMessage({ botToken: config.botToken, userId: uid, text: `🎁 ${title}`, attachments: parsed.attachments, notify: false });
  } else if (isHttpUrl(post.giftLink)) {
    await api.sendMessage({ botToken: config.botToken, userId: uid, text: `🎁 ${title}\n${clean(post.giftLink)}`, notify: false });
  } else {
    await api.sendMessage({ botToken: config.botToken, userId: uid, text: `🎁 ${title}\n${clean(post.giftLink)}`, notify: false });
  }
  if (cbid) await api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: 'Подарок отправлен в чат с ботом' }).catch(() => {});
  return { handled: true, route: 'gifts:claim', sentKind: 'cc7511_gift_sent' };
}

async function tryHandle(update) {
  const route = routeOf(update); const id = adminId(update) || chatId(update) || 'global'; const p = payloadOf(update);
  if (route === 'gifts:claim') return handleGiftClaim(update, p);
  const awaitedGift = await handleAwaitGiftInput(update, id);
  if (awaitedGift) return sendGiftScreen(update, awaitedGift.screen, 'gifts:await', { preferEdit: false, editMessageId: awaitedGift.editMessageId });
  if (route.startsWith('gifts:')) {
    const sc = await handleGiftRoute(route, id, p);
    if (sc) return sendGiftScreen(update, sc, route, { preferEdit: true });
  }
  return base.tryHandle(update);
}
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return base.render(route); }
function selfTest() { const b = base.selfTest ? base.selfTest() : {}; return { ...b, ok: true, runtimeVersion: RUNTIME, marker: MARKER, features: [...(b.features || []), 'gift_step4_content_no_action_wording', 'gift_step4_to_step5_not_review', 'gift_final_save_required', 'gift_single_active_menu_cleanup', 'gift_claim_send_to_user'], commentsCoreTouched: false, buttonsCoreTouched: false, policy: 'gift_flow_stable_only_over_7510_buttons_and_756_comments' }; }
function install() { return selfTest(); }

module.exports = { RUNTIME, MARKER, install, selfTest, render, tryHandle, tryHandleExpress, forceRepatchPost: base.forceRepatchPost };
