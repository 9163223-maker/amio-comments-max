'use strict';

// CC7.5.21: Active lead-magnet conditions over CC7.5.20.
// - Main section label: "Подарки / Лид-магниты" for non-expert admins.
// - Inside the flow we keep the professional term "Лид-магниты".
// - Active conditions: all, current-channel subscription, comment under post, keyword in comment, subscription to up to 5 channels.
// - Referral/invite-friends remains planned because it needs referral links/tracking.

const config = require('./config');
const api = require('./services/maxApi');
const db = require('./cc5-db-core');
const state = require('./db-v3-state');
const store = require('./store');
const base = require('./adminkit-admin-flows-7520');

const RUNTIME = 'CC7.5.21-LEAD-MAGNET-ACTIVE-CONDITIONS';
const MARKER = '__ADMINKIT_CC7_5_21_LEAD_MAGNET_ACTIVE_CONDITIONS__';
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 140) => { const s = clean(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
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
function userIdFromCallback(u) { return clean(cb(u)?.user?.user_id || cb(u)?.user_id || body(u).user?.user_id || body(u).user_id || adminId(u)); }
function responseMessageId(d = {}) { return clean(d.message_id || d.messageId || d.id || d.message?.message_id || d.message?.id || d.data?.message_id || d.data?.id || ''); }
function btn(text, route, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ r: route, ...extra }) }; }
function keyboardSingle(items, backRoute = 'main:home') {
  const rows = items.map(x => [btn(x[0], x[1], x[2] || {})]);
  rows.push([btn('↩️ Назад', backRoute)]);
  rows.push([btn('🏠 Главное меню', 'main:home')]);
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}
function screen(title, lines, items = [], backRoute = 'main:home') {
  return { text: [title, '', (Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines || ''))].join('\n'), attachments: keyboardSingle(items, backRoute) };
}
function parseJson(v, fallback) { if (v && typeof v === 'object') return v; try { return JSON.parse(String(v || '')); } catch { return fallback; } }
function asArray(v) { if (Array.isArray(v)) return v; const p = parseJson(v, []); return Array.isArray(p) ? p : []; }
function isHttpUrl(v) { return /^https?:\/\//i.test(clean(v)); }
function conditionLabel(mode, c = {}) {
  const m = clean(mode || c.mode || 'subscribers_current_channel');
  if (m === 'all') return 'доступ всем';
  if (m === 'subscribers_current_channel') return 'только подписчикам текущего канала';
  if (m === 'comments_min') return `нужно написать комментарий под постом${Number(c.minComments || 1) > 1 ? `: ${Number(c.minComments)} шт.` : ''}`;
  if (m === 'comment_keyword') return `кодовое слово в комментарии: ${cut(c.keyword || '', 40) || 'не задано'}`;
  if (m === 'channels_many') return `подписка на каналы: ${asArray(c.channels).length || 0}`;
  if (m === 'referral') return 'пригласить друзей';
  return 'только подписчикам текущего канала';
}
function contentKind(v) { const s = clean(v); if (s.startsWith('akgift_')) return 'MAX-вложение'; if (isHttpUrl(s)) return 'ссылка'; return s ? 'текст' : 'не задано'; }
function materialLine(v) { const s = clean(v); if (!s) return 'Материал: не задан'; if (s.startsWith('akgift_')) return 'Материал: MAX-вложение'; if (isHttpUrl(s)) return `Материал: ${s}`; return `Материал: ${cut(s, 160)}`; }
function conditionsJson(mode, extra = {}) { return { version: 2, mode: clean(mode) || 'subscribers_current_channel', ...extra, updatedAt: new Date().toISOString() }; }
function flowMode(f = {}) { return clean(f.leadAccessMode || f.accessMode || (f.requireSubscription === false ? 'all' : 'subscribers_current_channel')); }
function flowConditions(f = {}) { return parseJson(f.leadConditions || f.lead_conditions_json, {}); }

function renameMainLeadButton(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(renameMainLeadButton);
  const out = { ...value };
  Object.keys(out).forEach((key) => {
    if (key === 'payload' || key === 'url') return;
    if (key === 'text' && out[key] === '🎁 Лид-магниты') out[key] = '🎁 Подарки / Лид-магниты';
    else if (out[key] && typeof out[key] === 'object') out[key] = renameMainLeadButton(out[key]);
  });
  return out;
}
function patchApiOnce() {
  if (api.__adminkitCc7521LeadButtonPatched) return;
  api.__adminkitCc7521LeadButtonPatched = true;
  const os = api.sendMessage; const oe = api.editMessage;
  api.sendMessage = function cc7521Send(args = {}) { const next = { ...args }; if (next.attachments) next.attachments = renameMainLeadButton(next.attachments); return os.call(this, next); };
  api.editMessage = function cc7521Edit(args = {}) { const next = { ...args }; if (next.attachments) next.attachments = renameMainLeadButton(next.attachments); return oe.call(this, next); };
}
patchApiOnce();

async function ensureConditionColumns() {
  await db.init();
  await db.query(`
    alter table ak_post_settings add column if not exists lead_access_mode text not null default 'subscribers_current_channel';
    alter table ak_post_settings add column if not exists lead_conditions_json jsonb not null default '{}'::jsonb;
    alter table ak_post_settings add column if not exists lead_conditions_enabled boolean not null default true;
  `);
}
async function getS(id) { const f = await state.getFlow(id); return f.menuV3 || {}; }
async function saveS(id, patch) { return state.setFlow(id, patch); }
async function saveConditionsToDb(id, flow) {
  await ensureConditionColumns();
  const commentKey = clean(flow.commentKey);
  if (!commentKey) return { ok: false, reason: 'comment_key_missing' };
  const mode = flowMode(flow);
  const c = flowConditions(flow);
  await db.query(`
    update ak_post_settings
       set lead_access_mode=$3,
           lead_conditions_json=$4::jsonb,
           lead_conditions_enabled=true,
           gifts_require_subscription=$5,
           updated_at=now()
     where admin_id=$1 and comment_key=$2
  `, [id, commentKey, mode, JSON.stringify(conditionsJson(mode, c)), mode === 'subscribers_current_channel']);
  return { ok: true, mode };
}
async function postCondition(commentKey) {
  await ensureConditionColumns();
  const { rows } = await db.query(`
    select p.admin_id as "adminId", p.channel_id as "channelId", p.post_id as "postId", p.comment_key as "commentKey",
           coalesce(s.lead_access_mode, case when coalesce(s.gifts_require_subscription,true) then 'subscribers_current_channel' else 'all' end) as "leadAccessMode",
           coalesce(s.lead_conditions_json, '{}'::jsonb) as "leadConditionsJson"
      from ak_posts p left join ak_post_settings s on s.comment_key=p.comment_key
     where p.comment_key=$1 order by p.updated_at desc limit 1
  `, [clean(commentKey)]);
  return rows[0] || null;
}
async function checkMember(chatIdValue, userIdValue) {
  const chat = clean(chatIdValue), user = clean(userIdValue);
  if (!chat || !user) return { ok: false, member: false, reason: 'missing_chat_or_user' };
  try {
    const data = await api.getChatMembers({ botToken: config.botToken, chatId: chat, userIds: [user], count: 1 });
    const list = Array.isArray(data?.members) ? data.members : (Array.isArray(data) ? data : []);
    const member = list.some((m) => clean(m?.user_id || m?.id || m?.user?.user_id || m?.user?.id) === user);
    return { ok: true, member };
  } catch (e) { return { ok: false, member: false, reason: e?.message || String(e) }; }
}
function userComments(commentKey, userId) {
  return (store.getComments(commentKey) || []).filter((c) => clean(c.userId || c.user_id) === clean(userId));
}
async function verifyLeadCondition({ commentKey, userId }) {
  const post = await postCondition(commentKey);
  const mode = clean(post?.leadAccessMode || 'subscribers_current_channel');
  const c = parseJson(post?.leadConditionsJson, {});
  if (mode === 'all') return { ok: true, mode };
  if (mode === 'subscribers_current_channel') {
    const r = await checkMember(post?.channelId, userId);
    return r.member ? { ok: true, mode } : { ok: false, mode, message: r.ok ? 'Сначала подпишитесь на канал, затем нажмите кнопку ещё раз.' : 'Не удалось проверить подписку. Попробуйте позже.' };
  }
  if (mode === 'comments_min') {
    const need = Math.max(1, Math.min(Number(c.minComments || 1) || 1, 20));
    const have = userComments(commentKey, userId).length;
    return have >= need ? { ok: true, mode } : { ok: false, mode, message: `Чтобы получить лид-магнит, напишите комментарий под этим постом. Сейчас: ${have}/${need}.` };
  }
  if (mode === 'comment_keyword') {
    const keyword = clean(c.keyword).toLowerCase();
    if (!keyword) return { ok: false, mode, message: 'Кодовое слово ещё не настроено.' };
    const found = userComments(commentKey, userId).some((x) => clean(x.text).toLowerCase().includes(keyword));
    return found ? { ok: true, mode } : { ok: false, mode, message: `Чтобы получить лид-магнит, напишите комментарий с кодовым словом: ${keyword}.` };
  }
  if (mode === 'channels_many') {
    const channels = asArray(c.channels).map((x) => clean(x.id || x.channelId || x)).filter(Boolean).slice(0, 5);
    if (!channels.length) return { ok: false, mode, message: 'Каналы для проверки ещё не настроены.' };
    const checks = [];
    for (const ch of channels) checks.push(await checkMember(ch, userId));
    const ok = checks.every((x) => x.member);
    return ok ? { ok: true, mode } : { ok: false, mode, message: 'Для получения лид-магнита нужна подписка на все указанные каналы.' };
  }
  return { ok: true, mode: 'fallback_allow' };
}

async function sendScreen(update, sc, route) {
  const id = adminId(update) || chatId(update) || 'global';
  const prev = await state.getMenu(id);
  const current = messageId(update);
  let mid = ''; let edited = false;
  if (current && callbackId(update)) {
    try { await api.editMessage({ botToken: config.botToken, messageId: current, text: sc.text, attachments: sc.attachments, notify: false }); mid = current; edited = true; } catch {}
  }
  if (!mid) { const sent = await api.sendMessage({ botToken: config.botToken, chatId: chatId(update) || undefined, userId: chatId(update) ? undefined : id, text: sc.text, attachments: sc.attachments, notify: false }); mid = responseMessageId(sent); }
  if (mid) await state.setMenu(id, mid);
  if (prev && prev !== mid && prev !== current) api.deleteMessage({ botToken: config.botToken, messageId: prev, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {});
  const cbid = callbackId(update); if (cbid) api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: '' }).catch(() => {});
  return { handled: true, route, sentKind: 'cc7521_lead_conditions', messageId: mid, edited };
}
async function conditionsScreen(id) {
  const s = await getS(id); const f = s.giftsFlow || {}; const c = flowConditions(f); const mode = flowMode(f);
  return screen('🎁 Лид-магниты — шаг 5/6', [
    'Выберите условия получения лид-магнита.',
    `Сейчас: ${conditionLabel(mode, c)}`,
    '',
    'Можно включить условия, которые бот способен проверить автоматически.'
  ], [
    ['🌐 Доступ всем', 'lead:cond:set', { mode: 'all' }],
    ['✅ Подписчик текущего канала', 'lead:cond:set', { mode: 'subscribers_current_channel' }],
    ['💬 Комментарий под постом', 'lead:cond:set', { mode: 'comments_min' }],
    ['🔑 Кодовое слово в комментарии', 'lead:cond:keyword'],
    ['📣 Подписка на каналы', 'lead:cond:channels'],
    ['👥 Пригласить друзей — позже', 'lead:cond:referral']
  ], 'gifts:flow:inputContent');
}
async function leadReviewScreen(id) {
  const s = await getS(id); const f = s.giftsFlow || {}; const mode = flowMode(f); const c = flowConditions(f);
  const ready = !!(clean(f.commentKey) && clean(f.giftTitle) && clean(f.giftLink));
  return screen('🎁 Лид-магниты — шаг 6/6', [
    `Режим: ${f.giftEditMode === 'edit' ? 'изменить существующий лид-магнит' : 'добавить новый лид-магнит'}`,
    `Пост: ${f.title || f.postId || 'не выбран'}`,
    `Название лид-магнита: ${clean(f.giftTitle) || 'не задано'}`,
    materialLine(f.giftLink),
    `Тип: ${contentKind(f.giftLink)}`,
    `Условия получения: ${conditionLabel(mode, c)}`,
    `Статус: ${ready ? 'готово к сохранению' : 'не завершено'}`
  ], [
    ...(ready ? [['💾 Сохранить лид-магнит', 'gifts:flow:save']] : []),
    ['✏️ Изменить название', 'gifts:flow:inputTitle'],
    ['📎 Изменить материал', 'gifts:flow:inputContent'],
    ['⚙️ Изменить условия получения', 'gifts:flow:inputMode']
  ], 'gifts:start');
}
async function promptKeyword(id) { await saveS(id, { mode: 'cc7521:lead:keyword' }); return screen('🔑 Кодовое слово', ['Пришлите слово или короткую фразу.', 'Пользователь должен написать комментарий под этим постом с этим словом.'], [], 'gifts:flow:inputMode'); }
async function promptChannels(id) { await saveS(id, { mode: 'cc7521:lead:channels' }); return screen('📣 Подписка на каналы', ['Пришлите до 5 ID каналов или ссылок max.ru, каждый с новой строки или через запятую.', 'Бот должен иметь возможность проверить участников этих каналов.'], [], 'gifts:flow:inputMode'); }
function parseChannels(value) {
  return String(value || '').split(/[\n,;]/g).map((x) => clean(x).replace(/^https?:\/\/(web\.)?max\.ru\//i, '').replace(/[?#].*$/, '')).filter(Boolean).slice(0, 5).map((id) => ({ id }));
}
async function handleLeadInput(update, id) {
  const s = await getS(id); const mode = clean(s.mode); const txt = textOf(update);
  if (!mode.startsWith('cc7521:lead:') || !txt || START.has(txt.toLowerCase())) return null;
  const f = s.giftsFlow || {};
  if (mode.endsWith(':keyword')) {
    const c = conditionsJson('comment_keyword', { keyword: txt.slice(0, 80) });
    await saveS(id, { mode: '', giftsFlow: { ...f, requireSubscription: false, leadAccessMode: 'comment_keyword', leadConditions: c } });
    return leadReviewScreen(id);
  }
  if (mode.endsWith(':channels')) {
    const channels = parseChannels(txt);
    const c = conditionsJson('channels_many', { channels });
    await saveS(id, { mode: '', giftsFlow: { ...f, requireSubscription: false, leadAccessMode: 'channels_many', leadConditions: c } });
    return leadReviewScreen(id);
  }
  return null;
}
async function handleLeadRoute(route, id, p) {
  if (route === 'gifts:flow:inputMode') return conditionsScreen(id);
  if (route === 'lead:cond:set') {
    const s = await getS(id); const f = s.giftsFlow || {}; const mode = clean(p.mode || 'all');
    const extra = mode === 'comments_min' ? { minComments: 1 } : {};
    await saveS(id, { mode: '', giftsFlow: { ...f, requireSubscription: mode === 'subscribers_current_channel', leadAccessMode: mode, leadConditions: conditionsJson(mode, extra) } });
    return leadReviewScreen(id);
  }
  if (route === 'lead:cond:keyword') return promptKeyword(id);
  if (route === 'lead:cond:channels') return promptChannels(id);
  if (route === 'lead:cond:referral') return screen('👥 Пригласить друзей', ['Это условие пока не включаю в боевой режим.', 'Для него нужен отдельный механизм реферальных ссылок и учёта приглашений.'], [['⚙️ Выбрать другое условие', 'gifts:flow:inputMode']], 'gifts:flow:inputMode');
  if (route === 'gifts:flow:save') { const s = await getS(id); await saveConditionsToDb(id, s.giftsFlow || {}).catch(() => null); return null; }
  return null;
}
async function handleClaim(update, p) {
  const commentKey = clean(p.commentKey); const uid = userIdFromCallback(update); const cbid = callbackId(update);
  const verdict = await verifyLeadCondition({ commentKey, userId: uid }).catch((e) => ({ ok: false, message: e?.message || 'Не удалось проверить условия.' }));
  if (!verdict.ok) {
    if (cbid) await api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: verdict.message || 'Условия получения пока не выполнены.' }).catch(() => {});
    return { handled: true, route: 'gifts:claim', sentKind: 'lead_condition_denied', conditionMode: verdict.mode };
  }
  return base.tryHandle(update);
}
async function tryHandle(update) {
  const route = routeOf(update); const id = adminId(update) || chatId(update) || 'global'; const p = payloadOf(update);
  if (route === 'gifts:claim') return handleClaim(update, p);
  const inputSc = await handleLeadInput(update, id);
  if (inputSc) return sendScreen(update, inputSc, 'lead:input');
  const sc = await handleLeadRoute(route, id, p);
  if (sc) return sendScreen(update, sc, route);
  return base.tryHandle(update);
}
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return base.render(route); }
function selfTest() {
  const b = base.selfTest ? base.selfTest() : {};
  return { ...b, ok: true, runtimeVersion: RUNTIME, marker: MARKER,
    sectionLabel: 'Подарки / Лид-магниты', professionalTermInside: 'Лид-магниты',
    activeConditions: ['all', 'subscribers_current_channel', 'comments_min', 'comment_keyword', 'channels_many'],
    plannedConditions: ['referral'],
    claimGuard: true, commentsCoreTouched: false, buttonsCoreTouched: false,
    policy: 'active_lead_magnet_conditions_over_7520'
  };
}
function install() { patchApiOnce(); return selfTest(); }
module.exports = { RUNTIME, MARKER, install, selfTest, render, tryHandle, tryHandleExpress, forceRepatchPost: base.forceRepatchPost };
