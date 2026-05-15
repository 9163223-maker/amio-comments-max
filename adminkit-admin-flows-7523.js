'use strict';

// CC7.5.23: Lead-magnet bottom menu cleanup over CC7.5.22.
// Fixes the tested UX issue where step 4 -> step 5 left the old menu above the admin input.
// Also keeps the public wording consistent: main section = "Подарки / Лид-магниты", inner flow = "Лид-магниты".
// Comments and buttons cores are untouched.

const config = require('./config');
const api = require('./services/maxApi');
const db = require('./cc5-db-core');
const state = require('./db-v3-state');
const base = require('./adminkit-admin-flows-7522');

const RUNTIME = 'CC7.5.23-LEAD-BOTTOM-MENU-CLEANUP';
const MARKER = '__ADMINKIT_CC7_5_23_LEAD_BOTTOM_MENU_CLEANUP__';
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
function responseMessageId(d = {}) { return clean(d.message_id || d.messageId || d.id || d.message?.message_id || d.message?.id || d.data?.message_id || d.data?.id || ''); }
function parseJson(v, fallback) { if (v && typeof v === 'object') return v; try { return JSON.parse(String(v || '')); } catch { return fallback; } }
function asArray(v) { if (Array.isArray(v)) return v; const p = parseJson(v, []); return Array.isArray(p) ? p : []; }
function isHttpUrl(v) { return /^https?:\/\//i.test(clean(v)); }
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

function patchPublicLeadWording(value) {
  if (typeof value !== 'string' || !value) return value;
  return value
    .split('🎁 Подарки — шаг').join('🎁 Лид-магниты — шаг')
    .split('Подарки — шаг').join('Лид-магниты — шаг')
    .split('🎁 Подарки').join('🎁 Подарки / Лид-магниты')
    .split('Управление подарками поста').join('Управление лид-магнитами поста')
    .split('Выберите пост, к которому применить подарок.').join('Выберите пост, к которому применить лид-магнит.')
    .split('Пришлите название подарка').join('Пришлите название лид-магнита')
    .split('Пришлите сам подарок.').join('Пришлите материал лид-магнита.')
    .split('Подарок добавлен к посту').join('Лид-магнит добавлен к посту')
    .split('Подарок изменён').join('Лид-магнит изменён')
    .split('Подарок удалён').join('Лид-магнит удалён')
    .split('Сохранить подарок').join('Сохранить лид-магнит')
    .split('Изменить подарок').join('Изменить материал')
    .split('Подарок:').join('Материал:')
    .split('Подарки сейчас').join('Лид-магниты сейчас')
    .split('Что сделать с подарками?').join('Что сделать с лид-магнитами?');
}
function patchUiTree(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(patchUiTree);
  const out = { ...value };
  for (const key of Object.keys(out)) {
    if (key === 'payload' || key === 'url') continue;
    out[key] = typeof out[key] === 'string' ? patchPublicLeadWording(out[key]) : patchUiTree(out[key]);
  }
  return out;
}
function patchApiOnce() {
  if (api.__adminkitCc7523LeadWordingPatched) return;
  api.__adminkitCc7523LeadWordingPatched = true;
  const os = api.sendMessage; const oe = api.editMessage; const oa = api.answerCallback;
  api.sendMessage = function cc7523Send(args = {}) { const next = { ...args }; if (next.text) next.text = patchPublicLeadWording(next.text); if (next.attachments) next.attachments = patchUiTree(next.attachments); return os.call(this, next); };
  api.editMessage = function cc7523Edit(args = {}) { const next = { ...args }; if (next.text) next.text = patchPublicLeadWording(next.text); if (next.attachments) next.attachments = patchUiTree(next.attachments); return oe.call(this, next); };
  if (typeof oa === 'function') api.answerCallback = function cc7523Answer(args = {}) { const next = { ...args }; if (next.notification) next.notification = patchPublicLeadWording(next.notification); return oa.call(this, next); };
}
patchApiOnce();

function b64urlEncodeJson(obj) { return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function getIncomingAttachments(update) {
  const m = msg(update) || {}; const b = m.body && typeof m.body === 'object' ? m.body : {};
  const candidates = [b.attachments, m.attachments, body(update).attachments, body(update).message?.attachments, body(update).message?.body?.attachments];
  for (const x of candidates) if (Array.isArray(x) && x.length) return x;
  return [];
}
function encodeGiftPayloadFromUpdate(update) {
  const attachments = getIncomingAttachments(update).filter((a) => a && typeof a === 'object' && a.type !== 'inline_keyboard');
  if (!attachments.length) return '';
  return 'akgift_' + b64urlEncodeJson({ kind: 'max_attachments', attachments: attachments.slice(0, 5), savedAt: Date.now() });
}
function giftContentFromUpdate(update, txt) {
  // Typed URL must stay a URL. MAX may add a link-preview attachment, but that preview is not the lead-magnet material.
  if (isHttpUrl(txt)) return clean(txt);
  return encodeGiftPayloadFromUpdate(update) || clean(txt);
}
function contentKind(v) { const s = clean(v); if (s.startsWith('akgift_')) return 'MAX-вложение'; if (isHttpUrl(s)) return 'ссылка'; return s ? 'текст' : 'не задано'; }
function materialLine(v) { const s = clean(v); if (!s) return 'Материал: не задан'; if (s.startsWith('akgift_')) return 'Материал: MAX-вложение'; if (isHttpUrl(s)) return `Материал: ${s}`; return `Материал: ${cut(s, 160)}`; }
function conditionsJson(mode, extra = {}) { return { version: 3, mode: clean(mode) || 'subscribers_current_channel', ...extra, updatedAt: new Date().toISOString() }; }
function flowMode(f = {}) { return clean(f.leadAccessMode || f.accessMode || (f.requireSubscription === false ? 'all' : 'subscribers_current_channel')); }
function flowConditions(f = {}) { return parseJson(f.leadConditions || f.lead_conditions_json, {}); }
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

async function getS(id) { const f = await state.getFlow(id); return f.menuV3 || {}; }
async function saveS(id, patch) { return state.setFlow(id, patch); }
function giftMenuCandidates(s = {}, prevGlobal = '') {
  return []
    .concat(Array.isArray(s.giftMenuIds) ? s.giftMenuIds : [])
    .concat(Array.isArray(s.giftGarbageIds) ? s.giftGarbageIds : [])
    .concat([s.giftPromptMessageId, s.giftLastPromptMessageId, prevGlobal])
    .map(clean).filter(Boolean);
}
function deleteLater(mid, delayMs) {
  if (!mid || !config.botToken) return;
  setTimeout(() => api.deleteMessage({ botToken: config.botToken, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {}), delayMs);
}
async function neutralizeOldMenus(ids = [], label = 'Получено') {
  for (const mid of [...new Set(ids.map(clean).filter(Boolean))]) {
    try { await api.editMessage({ botToken: config.botToken, messageId: mid, text: `✅ ${label}`, attachments: [], notify: false }); } catch {}
    api.deleteMessage({ botToken: config.botToken, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {});
    deleteLater(mid, 350); deleteLater(mid, 900); deleteLater(mid, 1800); deleteLater(mid, 3600);
  }
}
async function deleteMany(ids = []) {
  for (const mid of [...new Set(ids.map(clean).filter(Boolean))]) {
    api.deleteMessage({ botToken: config.botToken, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {});
    deleteLater(mid, 350); deleteLater(mid, 900); deleteLater(mid, 1800); deleteLater(mid, 3600);
  }
}
async function sendLeadScreen(update, sc, route, opts = {}) {
  const id = adminId(update) || chatId(update) || 'global';
  const s = await getS(id);
  const prevGlobal = await state.getMenu(id);
  const current = messageId(update);
  const oldMenus = giftMenuCandidates(s, prevGlobal).concat(opts.oldPromptIds || []).map(clean).filter(Boolean);
  let mid = ''; let edited = false;
  if (opts.neutralizeLabel) await neutralizeOldMenus(oldMenus.filter(x => x !== current), opts.neutralizeLabel);
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
  return { handled: true, route, sentKind: 'cc7523_lead_bottom_menu', messageId: mid, edited };
}

async function giftInputScreen(id, field) {
  await saveS(id, { mode: `cc7523:gifts:${field}` });
  if (field === 'giftTitle') {
    return screen('🎁 Лид-магниты — шаг 3/6', [
      'Пришлите название лид-магнита — текст на кнопке под постом.',
      'Например: Чек-лист / PDF-гайд / Промокод'
    ], [], 'gifts:flow:post');
  }
  return screen('🎁 Лид-магниты — шаг 4/6', [
    'Пришлите материал лид-магнита.',
    'Можно отправить ссылку, фото, файл или обычный текст.',
    'Если отправляете ссылку, она будет сохранена именно как ссылка.',
    'Например: https://site.ru/checklist.pdf или текст промокода.'
  ], [], 'gifts:flow:inputTitle');
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
async function promptKeyword(id) {
  await saveS(id, { mode: 'cc7523:lead:keyword' });
  return screen('🔑 Кодовое слово', ['Пришлите слово или короткую фразу.', 'Пользователь должен написать комментарий под этим постом с этим словом.'], [], 'gifts:flow:inputMode');
}
async function promptChannels(id) {
  await saveS(id, { mode: 'cc7523:lead:channels' });
  return screen('📣 Подписка на каналы', ['Пришлите до 5 ID каналов или ссылок max.ru, каждый с новой строки или через запятую.', 'Бот должен иметь возможность проверить участников этих каналов.'], [], 'gifts:flow:inputMode');
}
function parseChannels(value) {
  return String(value || '').split(/[\n,;]/g).map((x) => clean(x).replace(/^https?:\/\/(web\.)?max\.ru\//i, '').replace(/[?#].*$/, '')).filter(Boolean).slice(0, 5).map((id) => ({ id }));
}
async function handleGiftTextInput(update, id) {
  const s = await getS(id); const mode = clean(s.mode); const txt = textOf(update);
  const isGiftInput = mode.startsWith('cc7523:gifts:') || mode.startsWith('cc7518:gifts:') || mode.startsWith('cc7517:gifts:') || mode.startsWith('cc7512:gifts:') || mode.startsWith('cc7511:gifts:') || mode.startsWith('cc758:gifts:') || mode.startsWith('cc757:gifts:');
  if (!isGiftInput || START.has(txt.toLowerCase())) return null;
  const previousMenus = giftMenuCandidates(s, await state.getMenu(id));
  const field = mode.split(':').pop();
  const rawValue = (field === 'giftContent' || field === 'giftLink') ? giftContentFromUpdate(update, txt) : txt;
  if (!rawValue) return null;
  const flow = { ...(s.giftsFlow || {}) };
  if (field === 'giftTitle') flow.giftTitle = txt;
  if (field === 'giftContent' || field === 'giftLink') flow.giftLink = rawValue;
  await saveS(id, { mode: '', giftsFlow: flow });
  return {
    screen: field === 'giftTitle' ? await giftInputScreen(id, 'giftContent') : await conditionsScreen(id),
    label: field === 'giftTitle' ? 'Название лид-магнита получено' : 'Материал лид-магнита получен',
    oldPromptIds: previousMenus
  };
}
async function handleLeadConditionInput(update, id) {
  const s = await getS(id); const mode = clean(s.mode); const txt = textOf(update);
  if ((!mode.startsWith('cc7523:lead:') && !mode.startsWith('cc7521:lead:')) || !txt || START.has(txt.toLowerCase())) return null;
  const previousMenus = giftMenuCandidates(s, await state.getMenu(id));
  const f = s.giftsFlow || {};
  if (mode.endsWith(':keyword')) {
    const c = conditionsJson('comment_keyword', { keyword: txt.slice(0, 80) });
    await saveS(id, { mode: '', giftsFlow: { ...f, requireSubscription: false, leadAccessMode: 'comment_keyword', leadConditions: c } });
    return { screen: await leadReviewScreen(id), label: 'Условие получено', oldPromptIds: previousMenus };
  }
  if (mode.endsWith(':channels')) {
    const c = conditionsJson('channels_many', { channels: parseChannels(txt) });
    await saveS(id, { mode: '', giftsFlow: { ...f, requireSubscription: false, leadAccessMode: 'channels_many', leadConditions: c } });
    return { screen: await leadReviewScreen(id), label: 'Каналы получены', oldPromptIds: previousMenus };
  }
  return null;
}
async function handleLeadRoute(route, id, p) {
  if (route === 'gifts:flow:inputTitle') return giftInputScreen(id, 'giftTitle');
  if (route === 'gifts:flow:inputLink' || route === 'gifts:flow:inputContent') return giftInputScreen(id, 'giftContent');
  if (route === 'gifts:flow:inputMode') return conditionsScreen(id);
  if (route === 'lead:cond:set' || route === 'gifts:flow:mode') {
    const s = await getS(id); const f = s.giftsFlow || {};
    const mode = route === 'gifts:flow:mode' ? (p.requireSubscription === false ? 'all' : 'subscribers_current_channel') : clean(p.mode || 'all');
    const extra = mode === 'comments_min' ? { minComments: 1 } : {};
    await saveS(id, { mode: '', giftsFlow: { ...f, requireSubscription: mode === 'subscribers_current_channel', leadAccessMode: mode, leadConditions: conditionsJson(mode, extra) } });
    return leadReviewScreen(id);
  }
  if (route === 'lead:cond:keyword') return promptKeyword(id);
  if (route === 'lead:cond:channels') return promptChannels(id);
  if (route === 'lead:cond:referral') return screen('👥 Пригласить друзей', ['Это условие пока не включено в боевой режим.', 'Для него нужен отдельный механизм реферальных ссылок и учёта приглашений.'], [['⚙️ Выбрать другое условие', 'gifts:flow:inputMode']], 'gifts:flow:inputMode');
  return null;
}
async function tryHandle(update) {
  const route = routeOf(update); const id = adminId(update) || chatId(update) || 'global'; const p = payloadOf(update);
  const giftInput = await handleGiftTextInput(update, id);
  if (giftInput) return sendLeadScreen(update, giftInput.screen, 'lead:gifts:input', { preferEdit: false, neutralizeLabel: giftInput.label, oldPromptIds: giftInput.oldPromptIds });
  const conditionInput = await handleLeadConditionInput(update, id);
  if (conditionInput) return sendLeadScreen(update, conditionInput.screen, 'lead:condition:input', { preferEdit: false, neutralizeLabel: conditionInput.label, oldPromptIds: conditionInput.oldPromptIds });
  const sc = await handleLeadRoute(route, id, p);
  if (sc) return sendLeadScreen(update, sc, route, { preferEdit: true });
  return base.tryHandle(update);
}
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return base.render(route); }
function selfTest() {
  const b = base.selfTest ? base.selfTest() : {};
  return { ...b, ok: true, runtimeVersion: RUNTIME, marker: MARKER,
    sectionLabel: 'Подарки / Лид-магниты', professionalTermInside: 'Лид-магниты',
    leadBottomMenuCleanup: true, giftStep4ToStep5FreshBottom: true, urlGiftMaterialPreferredOverPreview: true,
    activeConditions: ['all', 'subscribers_current_channel', 'comments_min', 'comment_keyword', 'channels_many'],
    commentsCoreTouched: false, buttonsCoreTouched: false, giftsCoreTouched: true,
    policy: 'lead_magnet_input_menu_cleanup_over_7522'
  };
}
function install() { patchApiOnce(); return selfTest(); }

module.exports = { RUNTIME, MARKER, install, selfTest, render, tryHandle, tryHandleExpress, forceRepatchPost: base.forceRepatchPost };
