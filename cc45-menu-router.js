'use strict';

const { clean } = require('./cc43-store-hotfix');

const RUNTIME = 'CC4.6';
const FLOW_TTL_MS = 15 * 60 * 1000;
const btn = (text, action, extra = {}) => ({ type: 'callback', text, payload: JSON.stringify({ action, ...extra }) });
const kb = (rows) => [{ type: 'inline_keyboard', payload: { buttons: rows } }];
const cut = (v, n = 64) => { const s = String(v || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function deep(o, keys, seen = new Set()) {
  if (!o || typeof o !== 'object' || seen.has(o)) return '';
  seen.add(o);
  const wanted = new Set(keys.map((k) => String(k).toLowerCase()));
  for (const [k, v] of Object.entries(o)) {
    if (wanted.has(String(k).toLowerCase())) {
      const s = String(v || '').trim();
      if (s && s !== '[object Object]') return s;
    }
  }
  for (const v of Object.values(o)) {
    const found = deep(v, keys, seen);
    if (found) return found;
  }
  return '';
}
function deepObj(o, k, seen = new Set()) {
  if (!o || typeof o !== 'object' || seen.has(o)) return null;
  seen.add(o);
  if (o[k] && typeof o[k] === 'object') return o[k];
  for (const v of Object.values(o)) {
    const r = deepObj(v, k, seen);
    if (r) return r;
  }
  return null;
}
function parse(v) {
  if (v && typeof v === 'object') return v;
  const s = String(v || '').trim();
  if (!s) return {};
  try { const p = JSON.parse(s); return p && typeof p === 'object' ? p : { action: s }; } catch { return { action: s }; }
}
function cb(u = {}) { return u.callback || u.data?.callback || u.message?.callback || u.update?.callback || null; }
function msg(u = {}) { return u.message || u.data?.message || cb(u)?.message || u.data?.callback?.message || deepObj(u, 'message') || null; }
function payload(u = {}) {
  const c = cb(u) || {};
  return parse(c.payload || c.data || c.callback_data || c.value || u.payload || deep(c, ['payload', 'data', 'callback_data', 'value']) || deep(u, ['payload', 'callback_data']));
}
function action(u = {}) { const p = payload(u); return String(p.action || p.type || p.command || p.raw || '').trim(); }
function uid(u = {}) {
  const c = cb(u) || {}, m = msg(u) || {};
  return String(c.user?.user_id || c.user?.id || c.sender?.user_id || c.sender?.id || u.user?.user_id || u.user?.id || m.sender?.user_id || m.sender?.id || deep(u, ['user_id', 'userId', 'sender_id', 'from_id']) || '').trim();
}
function cid(u = {}) {
  const c = cb(u) || {}, m = msg(u) || {};
  return String(m.recipient?.chat_id || m.recipient?.id || c.message?.recipient?.chat_id || c.message?.recipient?.id || m.chat_id || m.chat?.id || deep(m, ['chat_id']) || deep(u, ['chat_id']) || '').trim();
}
function mid(u = {}) {
  const c = cb(u) || {}, m = msg(u) || {};
  return String(c.message?.message_id || c.message?.id || m.message_id || m.messageId || m.mid || m.id || deep(u, ['message_id', 'messageId', 'mid']) || '').trim();
}
function cbid(u = {}) { const c = cb(u) || {}; return String(c.callback_id || c.callbackId || c.id || deep(c, ['callback_id', 'callbackId']) || deep(u, ['callback_id', 'callbackId']) || '').trim(); }
function txt(u = {}) { const m = msg(u) || {}; return String(m.body?.text || m.text || m.message?.text || deep(m, ['text']) || '').trim(); }
function keys(u = {}) {
  const out = new Set(['global']);
  const uId = uid(u), cId = cid(u);
  if (uId) out.add(`u:${uId}`);
  if (cId) out.add(`c:${cId}`);
  const rawUser = deep(u, ['user_id', 'userId']); if (rawUser) out.add(`u:${rawUser}`);
  const rawChat = deep(u, ['chat_id']); if (rawChat) out.add(`c:${rawChat}`);
  return [...out];
}
function state(st, k) { try { return st.getSetupState?.(k) || {}; } catch { return {}; } }
function setState(st, k, v) { try { st.setSetupState?.(k, { ...v, updatedAt: Date.now() }); } catch {} }
function getChannels(st) { try { return st.getChannelsList?.() || []; } catch { return []; } }
function firstCh(st, id = '') { const arr = getChannels(st), wanted = String(id || ''); return arr.find((c) => String(c.channelId || '') === wanted) || arr[0] || {}; }
function title(st, id = '') { const c = firstCh(st, id); return String(c.title || c.name || c.channelTitle || id || 'Канал'); }
function post(st, k = '') { try { return st.getPost?.(clean(k)) || null; } catch { return null; } }
function posts(st, ch = '') {
  let arr = [];
  try { arr = st.listPostsByChannel?.(ch, 80) || []; } catch {}
  if (!arr.length) {
    try { arr = (st.getPostsList?.() || []).filter((p) => !ch || String(p.channelId || '') === String(ch)).slice(0, 80); } catch {}
  }
  return arr.map((p) => ({
    channelId: String(p.channelId || ch || ''),
    commentKey: clean(p.commentKey || (p.channelId && p.postId ? `${p.channelId}:${p.postId}` : '')),
    title: cut(p.originalText || p.text || p.caption || p.postId || p.messageId || 'Пост', 46)
  })).filter((p) => p.commentKey);
}
function rawScope(st, d = {}) {
  let key = clean(d.commentKey || d.key || d.postKey || d.scopeKey || d.postId || '');
  let ch = String(d.channelId || d.channel || '').trim();
  if (!ch && key) ch = String(post(st, key)?.channelId || (key.includes(':') ? key.split(':')[0] : '')).trim();
  if (!ch) ch = String(firstCh(st).channelId || '').trim();
  if (key && !key.includes(':') && ch) key = `${ch}:${key}`;
  return { scope: key ? 'post' : 'channel', channelId: ch, commentKey: key };
}
function rememberScope(st, u, sc) {
  const rec = { scope: sc.scope, channelId: sc.channelId || '', commentKey: sc.commentKey || '', updatedAt: Date.now() };
  for (const k of keys(u)) setState(st, `cc46:lastScope:${k}`, rec);
  setState(st, 'cc46:lastScope:latest', rec);
}
function lastScope(st, u) {
  for (const k of keys(u)) {
    const rec = state(st, `cc46:lastScope:${k}`);
    if (rec && (rec.channelId || rec.commentKey)) return rec;
  }
  const latest = state(st, 'cc46:lastScope:latest');
  return latest && (latest.channelId || latest.commentKey) ? latest : null;
}
function scope(st, d = {}, u = {}) {
  const sc = rawScope(st, d || {});
  if (sc.commentKey || d.channelId || d.channel || d.scope === 'channel') return sc;
  const last = lastScope(st, u);
  return last ? rawScope(st, last) : sc;
}
function rules(st, sc) { return sc.scope === 'post' ? st.getPostModerationSettings(sc.commentKey) : st.getModerationSettings(sc.channelId); }
function save(st, sc, next) { return sc.scope === 'post' ? st.savePostModerationSettings(sc.commentKey, { ...next, channelId: sc.channelId }) : st.saveModerationSettings(sc.channelId, next); }
function choose(st, ch = '') {
  ch = String(ch || firstCh(st).channelId || '');
  const rows = [];
  if (ch) rows.push([btn('🛡 Правила всего канала', 'cc46_channel', { channelId: ch })]);
  posts(st, ch).slice(0, 14).forEach((p, i) => rows.push([btn(`🎯 ${i + 1}. ${p.title}`, 'cc46_post', { channelId: p.channelId || ch, commentKey: p.commentKey })]));
  rows.push([btn('🏠 Главное меню', 'ak_main_menu')]);
  return { text: ['🛡 Модерация', '', 'Выберите область правил:', ch ? `Канал: ${title(st, ch)}` : 'Канал пока не выбран.'].join('\n'), attachments: kb(rows) };
}
function menu(st, sc) {
  const r = rules(st, sc) || {}, isPost = sc.scope === 'post' && sc.commentKey, p = isPost ? post(st, sc.commentKey) : null, custom = Array.isArray(r.customBlocklist) ? r.customBlocklist : [];
  const rows = [
    [btn(isPost ? '🎯 Выбрать другой пост' : '🎯 Выбрать пост для правил', 'cc46_choose', { channelId: sc.channelId })],
    ...(isPost ? [[btn('🛡 Правила всего канала', 'cc46_channel', { channelId: sc.channelId })]] : []),
    [btn(r.enabled === false ? '▶️ Включить фильтр' : '⏸ Выключить фильтр', 'cc46_toggle_enabled', sc)],
    [btn(r.applyPresetCommon === false ? '🧱 Стоп-слова: выкл.' : '🧱 Стоп-слова: вкл.', 'cc46_toggle_preset', sc)],
    [btn('➕ Стоп-слово', 'cc46_add_stopword', sc), btn('🧹 Очистить ручные', 'cc46_clear_stopwords', sc)],
    [btn(r.blockLinks ? '🔗 Ссылки: блок.' : '🔗 Ссылки: разреш.', 'cc46_toggle_links', sc), btn(r.blockInvites === false ? '✉️ Инвайты: разреш.' : '✉️ Инвайты: блок.', 'cc46_toggle_invites', sc)],
    [btn('🏠 Главное меню', 'ak_main_menu')]
  ];
  return { text: ['🛡 Модерация', '', `Канал: ${title(st, sc.channelId)}`, isPost ? `Пост: ${cut(p?.originalText || p?.text || p?.postId || sc.commentKey, 70)}` : '', `Область: ${isPost ? 'правила этого поста' : 'правила всего канала'}`, `Фильтр: ${r.enabled === false ? 'выключен' : 'включён'}`, `Стоп-слова: ${r.applyPresetCommon === false ? 'базовый список выключен' : 'базовый список включён'}`, `Ручной список: ${custom.length ? custom.join(', ') : 'пока пусто'}`, `Ссылки: ${r.blockLinks ? 'блокируются' : 'разрешены'}`, `Приглашения: ${r.blockInvites === false ? 'разрешены' : 'блокируются'}`, '', 'Выберите правило кнопками ниже.'].filter(Boolean).join('\n'), attachments: kb(rows) };
}
function flowGet(st, u) {
  for (const k of keys(u)) {
    const f = state(st, `cc46:flow:${k}`).flow || state(st, k).cc45Flow || null;
    if (f && (!f.updatedAt || Date.now() - Number(f.updatedAt) < FLOW_TTL_MS)) return f;
  }
  const latest = state(st, 'cc46:flow:latest').flow || null;
  if (latest && (!latest.updatedAt || Date.now() - Number(latest.updatedAt) < FLOW_TTL_MS)) return latest;
  return null;
}
function flowSet(st, u, flow) {
  const rec = { ...flow, updatedAt: Date.now() };
  for (const k of keys(u)) setState(st, `cc46:flow:${k}`, { flow: rec });
  setState(st, 'cc46:flow:latest', { flow: rec });
}
function flowClear(st, u) {
  for (const k of keys(u)) setState(st, `cc46:flow:${k}`, { flow: null });
  setState(st, 'cc46:flow:latest', { flow: null });
}
async function answer(api, cfg, u, n) { const id = cbid(u); if (id) try { await api.answerCallback({ botToken: cfg.botToken, callbackId: id, notification: n }); } catch {} }
function resId(r) { return String(r?.message_id || r?.messageId || r?.message?.message_id || r?.id || deep(r, ['message_id', 'messageId', 'mid']) || '').trim(); }
async function show(api, cfg, st, u, packet, sc = null) {
  if (sc) rememberScope(st, u, sc);
  const k0 = keys(u)[0] || 'global';
  const key = `cc46:activeMenu:${k0}`;
  const isCallback = Boolean(cbid(u));
  const m = isCallback ? mid(u) : '';
  if (m) {
    try { await api.editMessage({ botToken: cfg.botToken, messageId: m, text: packet.text, attachments: packet.attachments || [], notify: false }); setState(st, key, { messageId: m }); return; } catch {}
  }
  const old = String(state(st, key).messageId || '').trim();
  if (old) { try { await api.deleteMessage({ botToken: cfg.botToken, messageId: old, timeoutMs: 1200 }); } catch {} }
  const args = { botToken: cfg.botToken, text: packet.text, attachments: packet.attachments || [], notify: false };
  const uId = uid(u), cId = cid(u);
  if (uId) args.userId = uId; else if (cId) args.chatId = cId; else return;
  const r = await api.sendMessage(args);
  const id = resId(r);
  if (id) setState(st, key, { messageId: id });
}
function isModAction(a) { return /cc46|cc45|cc43|cc42|cc4|ak_mod_|moder|модер|правила|filter|фильтр|stop|стоп|link|ссыл|invite|инвайт/.test(String(a || '').toLowerCase()); }
async function handle(u, mods) {
  const st = mods.store, api = mods.api, cfg = mods.config;
  const flow = flowGet(st, u), text = txt(u);
  if (flow?.type === 'stopword' && text) {
    const sc = scope(st, flow, u);
    const r = rules(st, sc) || {};
    const words = [...new Set(text.split(/[\n,;]+/g).map((x) => x.trim().toLowerCase()).filter(Boolean))];
    const customBlocklist = [...new Set([...(Array.isArray(r.customBlocklist) ? r.customBlocklist : []), ...words])];
    save(st, sc, { ...r, customBlocklist });
    flowClear(st, u);
    await show(api, cfg, st, u, { text: `✅ Добавлено: ${words.join(', ') || 'ничего'}\n\nВозвращаю меню этой области.`, attachments: [] }, sc);
    await show(api, cfg, st, u, menu(st, sc), sc);
    return true;
  }
  const p = payload(u), a = action(u).toLowerCase();
  if (!isModAction(a)) return false;
  let sc = scope(st, p, u);
  if (/choose|выбрать|правила.*пост/.test(a) && !/toggle|add|clear/.test(a)) { await answer(api, cfg, u, 'Выберите область'); await show(api, cfg, st, u, choose(st, sc.channelId), sc); return true; }
  if (/channel|канала/.test(a) && !/toggle/.test(a)) { sc = { scope: 'channel', channelId: sc.channelId, commentKey: '' }; await answer(api, cfg, u, 'Правила канала'); await show(api, cfg, st, u, menu(st, sc), sc); return true; }
  if (/post|pick/.test(a) && sc.commentKey && !/toggle/.test(a)) { await answer(api, cfg, u, 'Правила поста'); await show(api, cfg, st, u, menu(st, sc), sc); return true; }
  if (/add.*stop|stop.*add|стоп.*добав/.test(a)) { rememberScope(st, u, sc); flowSet(st, u, { type: 'stopword', ...sc }); await answer(api, cfg, u, 'Пришлите стоп-слово'); await show(api, cfg, st, u, { text: ['🧱 Стоп-слово', '', 'Пришлите слово или фразу одним сообщением.', `Область: ${sc.scope === 'post' ? 'правила этого поста' : 'правила всего канала'}`].join('\n'), attachments: kb([[btn('↩️ Отмена', 'cc46_cancel', sc)]]) }, sc); return true; }
  if (/cancel|отмена/.test(a)) { flowClear(st, u); await answer(api, cfg, u, 'Отменено'); await show(api, cfg, st, u, menu(st, sc), sc); return true; }
  if (/clear.*stop|очист/.test(a)) { const r = rules(st, sc) || {}; save(st, sc, { ...r, customBlocklist: [] }); await answer(api, cfg, u, 'Очищено'); await show(api, cfg, st, u, menu(st, sc), sc); return true; }
  const r = rules(st, sc) || {}, next = { ...r };
  if (/toggle.*enabled|filter|фильтр/.test(a)) next.enabled = r.enabled === false;
  else if (/toggle.*preset|stopwords|стоп-слова/.test(a)) next.applyPresetCommon = r.applyPresetCommon === false;
  else if (/toggle.*links|link|ссыл/.test(a)) next.blockLinks = !r.blockLinks;
  else if (/toggle.*invites|invite|инвайт|приглаш/.test(a)) next.blockInvites = r.blockInvites === false;
  else return false;
  save(st, sc, next);
  await answer(api, cfg, u, 'Сохранено');
  await show(api, cfg, st, u, menu(st, sc), sc);
  return true;
}
module.exports = { handle, scope, posts, menu, choose, RUNTIME };
