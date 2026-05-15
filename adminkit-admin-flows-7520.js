'use strict';

// CC7.5.20: Lead magnet conditions core over CC7.5.19.
// Scope: safe condition UX + DB schema only.
// Active conditions now: access for everyone / subscribers of current channel.
// Next conditions are shown as planned/Pro placeholders, without changing delivery logic yet.

const config = require('./config');
const api = require('./services/maxApi');
const db = require('./cc5-db-core');
const state = require('./db-v3-state');
const base = require('./adminkit-admin-flows-7519');

const RUNTIME = 'CC7.5.20-LEAD-MAGNET-CONDITIONS-CORE';
const MARKER = '__ADMINKIT_CC7_5_20_LEAD_MAGNET_CONDITIONS_CORE__';
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 90) => { const s = clean(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

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
function screen(title, lines, items = [], backRoute = 'main:home') {
  return { text: [title, '', (Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines || ''))].join('\n'), attachments: keyboardSingle(items, backRoute) };
}
function contentKind(v) { const s = clean(v); if (s.startsWith('akgift_')) return 'MAX-вложение'; if (/^https?:\/\//i.test(s)) return 'ссылка'; return s ? 'текст' : 'не задано'; }
function materialLine(v) { const s = clean(v); if (!s) return 'Материал: не задан'; if (s.startsWith('akgift_')) return 'Материал: MAX-вложение'; if (/^https?:\/\//i.test(s)) return `Материал: ${s}`; return `Материал: ${cut(s, 120)}`; }
function conditionModeFromFlow(f = {}) {
  const explicit = clean(f.leadAccessMode || f.accessMode || '');
  if (explicit) return explicit;
  return f.requireSubscription === false ? 'all' : 'subscribers_current_channel';
}
function conditionLabel(mode) {
  const m = clean(mode);
  if (m === 'all') return 'доступ всем';
  if (m === 'subscribers_current_channel') return 'только подписчикам текущего канала';
  if (m === 'comments_min') return 'комментарий под постом';
  if (m === 'comment_keyword') return 'кодовое слово в комментарии';
  if (m === 'channels_many') return 'подписка на несколько каналов';
  if (m === 'referral') return 'пригласить друзей';
  return 'только подписчикам текущего канала';
}
function conditionsJson(mode, extra = {}) {
  return { version: 1, mode: clean(mode) || 'subscribers_current_channel', ...extra, updatedAt: new Date().toISOString() };
}
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
  const mode = conditionModeFromFlow(flow);
  const requireSubscription = mode === 'subscribers_current_channel';
  await db.query(`
    update ak_post_settings
    set lead_access_mode=$3,
        lead_conditions_json=$4::jsonb,
        lead_conditions_enabled=true,
        gifts_require_subscription=$5,
        updated_at=now()
    where admin_id=$1 and comment_key=$2
  `, [id, commentKey, mode, JSON.stringify(conditionsJson(mode)), requireSubscription]);
  return { ok: true, mode, requireSubscription };
}
async function sendScreen(update, sc, route) {
  const id = adminId(update) || chatId(update) || 'global';
  const prev = await state.getMenu(id);
  const current = messageId(update);
  let mid = ''; let edited = false;
  if (current && callbackId(update)) {
    try { await api.editMessage({ botToken: config.botToken, messageId: current, text: sc.text, attachments: sc.attachments, notify: false }); mid = current; edited = true; } catch {}
  }
  if (!mid) {
    const sent = await api.sendMessage({ botToken: config.botToken, chatId: chatId(update) || undefined, userId: chatId(update) ? undefined : id, text: sc.text, attachments: sc.attachments, notify: false });
    mid = responseMessageId(sent);
  }
  if (mid) await state.setMenu(id, mid);
  [...new Set([prev].filter(x => x && x !== mid && x !== current))].forEach(x => api.deleteMessage({ botToken: config.botToken, messageId: x, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {}));
  const cbid = callbackId(update); if (cbid) api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: '' }).catch(() => {});
  return { handled: true, route, sentKind: 'cc7520_lead_conditions', messageId: mid, edited };
}

async function conditionsScreen(id) {
  const s = await getS(id); const f = s.giftsFlow || {};
  const mode = conditionModeFromFlow(f);
  return screen('🎁 Лид-магниты — шаг 5/6', [
    'Выберите условия получения лид-магнита.',
    '',
    `Сейчас: ${conditionLabel(mode)}`,
    '',
    'На этом шаге включаем только безопасные условия, которые уже не ломают выдачу материала.'
  ], [
    ['🌐 Доступ всем', 'gifts:conditions:set', { mode: 'all' }],
    ['✅ Только подписчикам канала', 'gifts:conditions:set', { mode: 'subscribers_current_channel' }],
    ['💬 Комментарий под постом — скоро', 'gifts:conditions:soon', { mode: 'comments_min' }],
    ['🔑 Кодовое слово — скоро', 'gifts:conditions:soon', { mode: 'comment_keyword' }],
    ['📣 Подписка на каналы — Pro', 'gifts:conditions:pro', { mode: 'channels_many' }],
    ['👥 Пригласить друзей — Pro', 'gifts:conditions:pro', { mode: 'referral' }]
  ], 'gifts:flow:inputContent');
}
async function leadReviewScreen(id) {
  const s = await getS(id); const f = s.giftsFlow || {};
  const mode = conditionModeFromFlow(f);
  const ready = !!(clean(f.commentKey) && clean(f.giftTitle) && clean(f.giftLink));
  return screen('🎁 Лид-магниты — шаг 6/6', [
    `Режим: ${f.giftEditMode === 'edit' ? 'изменить существующий лид-магнит' : 'добавить новый лид-магнит'}`,
    `Пост: ${f.title || f.postId || 'не выбран'}`,
    `Название лид-магнита: ${clean(f.giftTitle) || 'не задано'}`,
    materialLine(f.giftLink),
    `Тип: ${contentKind(f.giftLink)}`,
    `Условия получения: ${conditionLabel(mode)}`,
    `Статус: ${ready ? 'готово к сохранению' : 'не завершено'}`
  ], [
    ...(ready ? [['💾 Сохранить лид-магнит', 'gifts:flow:save']] : []),
    ['✏️ Изменить название', 'gifts:flow:inputTitle'],
    ['📎 Изменить материал', 'gifts:flow:inputContent'],
    ['⚙️ Изменить условия получения', 'gifts:flow:inputMode']
  ], 'gifts:start');
}
async function soonScreen(kind) {
  const label = conditionLabel(kind);
  return screen('🧩 Условие готовим', [
    `Условие: ${label}.`,
    '',
    'Этот режим заложен в структуру лид-магнитов, но пока не включён в боевую выдачу.',
    'Сейчас доступны безопасные режимы: доступ всем и только подписчикам текущего канала.'
  ], [
    ['🌐 Доступ всем', 'gifts:conditions:set', { mode: 'all' }],
    ['✅ Только подписчикам канала', 'gifts:conditions:set', { mode: 'subscribers_current_channel' }]
  ], 'gifts:flow:inputMode');
}
async function handleConditionsRoute(route, id, p) {
  if (route === 'gifts:flow:inputMode') return conditionsScreen(id);
  if (route === 'gifts:conditions:set' || route === 'gifts:flow:mode') {
    const s = await getS(id); const f = s.giftsFlow || {};
    const mode = route === 'gifts:flow:mode'
      ? (p.requireSubscription === false ? 'all' : 'subscribers_current_channel')
      : clean(p.mode || 'subscribers_current_channel');
    await saveS(id, { mode: '', giftsFlow: { ...f, requireSubscription: mode === 'subscribers_current_channel', leadAccessMode: mode, leadConditions: conditionsJson(mode) } });
    return leadReviewScreen(id);
  }
  if (route === 'gifts:conditions:soon' || route === 'gifts:conditions:pro') return soonScreen(clean(p.mode || ''));
  if (route === 'gifts:flow:save') {
    const s = await getS(id); const f = s.giftsFlow || {};
    await saveConditionsToDb(id, f).catch(() => null);
    return null; // delegate actual saving and patching to accepted CC7.5.18 flow
  }
  return null;
}
async function tryHandle(update) {
  const route = routeOf(update); const id = adminId(update) || chatId(update) || 'global'; const p = payloadOf(update);
  const sc = await handleConditionsRoute(route, id, p);
  if (sc) return sendScreen(update, sc, route);
  return base.tryHandle(update);
}
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return base.render(route); }
function selfTest() {
  const b = base.selfTest ? base.selfTest() : {};
  return {
    ...b,
    ok: true,
    runtimeVersion: RUNTIME,
    marker: MARKER,
    leadMagnetConditionsCore: true,
    activeConditions: ['all', 'subscribers_current_channel'],
    plannedConditions: ['comments_min', 'comment_keyword', 'channels_many', 'referral'],
    dbColumns: ['lead_access_mode', 'lead_conditions_json', 'lead_conditions_enabled'],
    internalRoutesKept: 'gifts:*',
    commentsCoreTouched: false,
    buttonsCoreTouched: false,
    giftsCoreTouched: false,
    policy: 'safe_conditions_ui_and_schema_only_over_7519'
  };
}
function install() { return selfTest(); }

module.exports = { RUNTIME, MARKER, install, selfTest, render, tryHandle, tryHandleExpress, forceRepatchPost: base.forceRepatchPost };
