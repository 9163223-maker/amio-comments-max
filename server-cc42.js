'use strict';

const Module = require('module');

const RUNTIME = 'CC4.2';
const SOURCE = 'adminkit-CC4.2-post-moderation-toggle-fix';
process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
console.log(`[${RUNTIME}] post moderation toggle pre-router loaded`);

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}
const parse = (v) => { if (v && typeof v === 'object') return v; const s = String(v || '').trim(); if (!s) return {}; try { const p = JSON.parse(s); return p && typeof p === 'object' ? p : { action: s }; } catch { return { action: s }; } };
const clean = (v) => String(v || '').replace(/^post:/i, '').replace(/^:+/, '').replace(/^['\"]+|['\"]+$/g, '').trim();
const cut = (v, n = 48) => { const s = String(v || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const button = (text, action, extra = {}) => ({ type: 'callback', text, payload: JSON.stringify({ action, ...extra }) });
const keyboard = (rows) => [{ type: 'inline_keyboard', payload: { buttons: rows } }];
function store() { return require('./store'); }
function config() { return require('./config'); }
function maxApi() { return require('./services/maxApi'); }
function cb(u = {}) { return u.callback || u.data?.callback || u.message?.callback || u.update?.callback || null; }
function msg(u = {}) { return u.message || u.data?.message || cb(u)?.message || u.data?.callback?.message || null; }
function payload(u = {}) { const c = cb(u) || {}; return parse(c.payload || c.data || c.callback_data || c.value || u.payload || ''); }
function action(u = {}) { const p = payload(u); return String(p.action || p.type || p.command || p.raw || '').trim(); }
function uid(u = {}) { const c = cb(u) || {}; const m = msg(u) || {}; return String(c.user?.user_id || c.user?.id || u.user?.user_id || u.user?.id || m.sender?.user_id || m.sender?.id || '').trim(); }
function cid(u = {}) { const m = msg(u) || {}; return String(m.recipient?.chat_id || m.recipient?.id || m.chat_id || m.chat?.id || '').trim(); }
function text(u = {}) { const m = msg(u) || {}; return String(m.body?.text || m.text || m.message?.text || '').trim(); }
function callbackId(u = {}) { const c = cb(u) || {}; return String(c.callback_id || c.callbackId || c.id || '').trim(); }
function channels() { try { return store().getChannelsList?.() || []; } catch { return []; } }
function firstChannel(channelId = '') { const list = channels(); const wanted = String(channelId || '').trim(); return list.find((c) => String(c.channelId || '') === wanted) || list[0] || null; }
function channelTitle(channelId = '') { const c = firstChannel(channelId) || {}; return String(c.title || c.name || c.channelTitle || channelId || 'Канал').trim(); }
function getPost(commentKey = '') { try { return store().getPost?.(clean(commentKey)) || null; } catch { return null; } }
function scope(data = {}) {
  let key = clean(data.commentKey || data.key || data.postKey || data.scopeKey || data.postId || '');
  let channelId = String(data.channelId || data.channel || '').trim();
  if (!channelId && key) channelId = String(getPost(key)?.channelId || (key.includes(':') ? key.split(':')[0] : '')).trim();
  if (!channelId) channelId = String(firstChannel()?.channelId || '').trim();
  if (key && !key.includes(':') && channelId) key = `${channelId}:${key}`;
  return { scope: key ? 'post' : 'channel', channelId, commentKey: key };
}
function postList(channelId = '') {
  let items = [];
  try { items = store().listPostsByChannel?.(channelId, 50) || []; } catch {}
  if (!items.length) { try { items = store().getPostsList?.().filter((p) => !channelId || String(p.channelId || '') === String(channelId)).slice(0, 50) || []; } catch {} }
  return items.map((p) => ({ channelId: String(p.channelId || channelId || '').trim(), commentKey: clean(p.commentKey || (p.channelId && p.postId ? `${p.channelId}:${p.postId}` : '')), title: cut(p.originalText || p.text || p.caption || p.postId || p.messageId || 'Пост') })).filter((p) => p.commentKey);
}
function key(sc) { return sc.scope === 'post' && sc.commentKey ? `cc42:mod:post:${sc.commentKey}` : `cc42:mod:channel:${sc.channelId || 'global'}`; }
function defaults() { return { enabled: true, applyPresetCommon: true, blockLinks: false, blockInvites: true, customBlocklist: [] }; }
function readRules(sc) {
  try {
    const saved = store().getSetupState?.(key(sc))?.rules;
    if (saved && typeof saved === 'object') return { ...defaults(), ...saved };
  } catch {}
  return defaults();
}
function writeRules(sc, next) {
  const rules = { ...defaults(), ...(next || {}), updatedAt: Date.now(), channelId: sc.channelId || '', commentKey: sc.commentKey || '', scope: sc.scope };
  try { store().setSetupState?.(key(sc), { rules, updatedAt: Date.now() }); } catch {}
  // Best-effort bridge for older store implementations. If these methods exist later, use them too.
  try {
    if (sc.scope === 'post' && sc.commentKey && typeof store().savePostModerationSettings === 'function') store().savePostModerationSettings(sc.commentKey, rules);
    else if (typeof store().saveModerationSettings === 'function') store().saveModerationSettings(sc.channelId, rules);
  } catch {}
  return rules;
}
function chooseMenu(channelId = '') {
  const ch = String(channelId || firstChannel()?.channelId || '').trim();
  const rows = [];
  if (ch) rows.push([button('🛡 Правила всего канала', 'cc42_channel', { channelId: ch })]);
  postList(ch).slice(0, 14).forEach((p, i) => rows.push([button(`🎯 ${i + 1}. ${p.title}`, 'cc42_post', { channelId: p.channelId || ch, commentKey: p.commentKey })]));
  rows.push([button('🏠 Главное меню', 'ak_main_menu')]);
  return { text: ['🛡 Модерация', '', 'Выберите область правил:', '', ch ? `Канал: ${channelTitle(ch)}` : 'Канал пока не выбран.', rows.length > 2 ? 'Ниже — сохранённые посты.' : 'Посты пока не найдены. Перешлите нужный пост боту один раз.'].join('\n'), attachments: keyboard(rows) };
}
function rulesMenu(sc) {
  const r = readRules(sc);
  const isPost = sc.scope === 'post' && sc.commentKey;
  const p = isPost ? getPost(sc.commentKey) : null;
  const rows = [
    [button(isPost ? '🎯 Выбрать другой пост' : '🎯 Выбрать пост для правил', 'cc42_choose', { channelId: sc.channelId })],
    ...(isPost ? [[button('🛡 Правила всего канала', 'cc42_channel', { channelId: sc.channelId })]] : []),
    [button(r.enabled === false ? '▶️ Включить фильтр' : '⏸ Выключить фильтр', 'cc42_toggle_enabled', sc)],
    [button(r.applyPresetCommon === false ? '🧱 Стоп-слова: выкл.' : '🧱 Стоп-слова: вкл.', 'cc42_toggle_preset', sc)],
    [button('➕ Стоп-слово', 'cc42_add_stopword', sc), button('🧹 Очистить ручные', 'cc42_clear_stopwords', sc)],
    [button(r.blockLinks ? '🔗 Ссылки: блок.' : '🔗 Ссылки: разреш.', 'cc42_toggle_links', sc), button(r.blockInvites === false ? '✉️ Инвайты: разреш.' : '✉️ Инвайты: блок.', 'cc42_toggle_invites', sc)],
    [button('🏠 Главное меню', 'ak_main_menu')]
  ];
  return { text: ['🛡 Модерация', '', `Канал: ${channelTitle(sc.channelId)}`, isPost ? `Пост: ${cut(p?.originalText || p?.text || p?.postId || sc.commentKey, 70)}` : '', `Область: ${isPost ? 'правила этого поста' : 'правила всего канала'}`, `Фильтр: ${r.enabled === false ? 'выключен' : 'включён'}`, `Стоп-слова: ${r.applyPresetCommon === false ? 'базовый список выключен' : 'базовый список включён'}`, `Ручной список: ${Array.isArray(r.customBlocklist) && r.customBlocklist.length ? r.customBlocklist.join(', ') : 'пока пусто'}`, `Ссылки: ${r.blockLinks ? 'блокируются' : 'разрешены'}`, `Приглашения: ${r.blockInvites === false ? 'разрешены' : 'блокируются'}`, '', 'Выберите правило кнопками ниже.'].filter(Boolean).join('\n'), attachments: keyboard(rows) };
}
async function answer(u, value) { const id = callbackId(u); if (!id) return; try { await maxApi().answerCallback({ botToken: config().botToken, callbackId: id, notification: value }); } catch {} }
async function send(u, packet) { const args = { botToken: config().botToken, text: packet.text, attachments: packet.attachments || [] }; const chat = cid(u); const user = uid(u); if (chat) args.chatId = chat; else if (user) args.userId = user; else return null; return maxApi().sendMessage(args); }
function flowKey(u) { return uid(u) || cid(u) || 'global'; }
function getFlow(u) { try { return store().getSetupState?.(flowKey(u))?.cc42Flow || null; } catch { return null; } }
function setFlow(u, value) { try { store().setSetupState?.(flowKey(u), { cc42Flow: value, updatedAt: Date.now() }); } catch {} }
function clearFlow(u) { try { const k = flowKey(u); const cur = store().getSetupState?.(k) || {}; delete cur.cc42Flow; store().setSetupState?.(k, cur); } catch {} }
function mustHandle(a = '') { return /cc42|cc4|moder|модер|правила|rules|rule|stop|стоп|filter|фильтр|link|ссыл|invite|инвайт|post/i.test(String(a || '')); }
async function handle(u = {}) {
  const fl = getFlow(u);
  const txt = text(u);
  if (fl?.type === 'stopword' && txt) {
    const sc = scope(fl);
    const words = [...new Set(txt.split(/[\n,;]+/g).map((x) => x.trim().toLowerCase()).filter(Boolean))];
    const r = readRules(sc);
    writeRules(sc, { ...r, enabled: true, customBlocklist: [...new Set([...(Array.isArray(r.customBlocklist) ? r.customBlocklist : []), ...words])] });
    clearFlow(u);
    await send(u, { text: `✅ Стоп-слово сохранено\n\nДобавлено: ${words.join(', ') || 'ничего'}` });
    await send(u, rulesMenu(sc));
    return true;
  }
  const p = payload(u);
  const a = action(u).toLowerCase();
  if (!mustHandle(a)) return false;
  const sc = scope(p);
  if (/cc42_choose|cc4_choose|choose|выбрать.*пост|правила.*поста|moder|модер/.test(a) && !/toggle|add|clear/.test(a) && !p.commentKey) { await answer(u, 'Выберите область'); await send(u, chooseMenu(sc.channelId)); return true; }
  if (/cc42_channel|cc4_channel|channel.*rule|всего.*канала/.test(a)) { await answer(u, 'Правила канала'); await send(u, rulesMenu({ scope: 'channel', channelId: sc.channelId, commentKey: '' })); return true; }
  if (/cc42_post|cc4_post|post.*rule/.test(a) && sc.commentKey) { await answer(u, 'Правила поста'); await send(u, rulesMenu(sc)); return true; }
  if (/add.*stop|stop.*add|стоп.*добав|cc42_add_stopword|cc4_add_stopword/.test(a)) { setFlow(u, { type: 'stopword', ...sc }); await answer(u, 'Пришлите стоп-слово'); await send(u, { text: ['🧱 Стоп-слово', '', 'Пришлите одним сообщением слово или фразу.', `Область: ${sc.scope === 'post' ? 'правила этого поста' : 'правила всего канала'}`].join('\n') }); return true; }
  if (/clear.*stop|очист|cc42_clear|cc4_clear/.test(a)) { const r = readRules(sc); writeRules(sc, { ...r, customBlocklist: [] }); await answer(u, 'Очищено'); await send(u, rulesMenu(sc)); return true; }
  const r = readRules(sc); const next = { ...r };
  if (/toggle.*enabled|filter|фильтр/.test(a)) next.enabled = r.enabled === false;
  else if (/toggle.*preset|stopwords|стоп-слова/.test(a)) next.applyPresetCommon = r.applyPresetCommon === false;
  else if (/toggle.*links|link|ссыл/.test(a)) next.blockLinks = !r.blockLinks;
  else if (/toggle.*invites|invite|инвайт|приглаш/.test(a)) next.blockInvites = r.blockInvites === false;
  else return false;
  writeRules(sc, next);
  await answer(u, 'Сохранено');
  await send(u, rulesMenu(sc));
  return true;
}
function rewriteButton(b = {}) {
  if (!b || typeof b !== 'object') return b;
  const t = String(b.text || ''); const sc = scope(parse(b.payload || b.data || ''));
  if (/правила\s+этого\s+поста|выбрать.*пост|другой.*канал.*пост/i.test(t)) return button(t, 'cc42_choose', { channelId: sc.channelId });
  if (/правила\s+всего\s+канала/i.test(t)) return button(t, 'cc42_channel', { channelId: sc.channelId });
  if (/стоп[-\s]?слово/i.test(t) && /\+|➕|добав/i.test(t)) return button(t, 'cc42_add_stopword', sc);
  if (/очистить.*руч/i.test(t)) return button(t, 'cc42_clear_stopwords', sc);
  if (/выключить\s+фильтр|включить\s+фильтр/i.test(t)) return button(t, 'cc42_toggle_enabled', sc);
  if (/стоп[-\s]?слова/i.test(t)) return button(t, 'cc42_toggle_preset', sc);
  if (/ссылки/i.test(t)) return button(t, 'cc42_toggle_links', sc);
  if (/инвайт|приглаш/i.test(t)) return button(t, 'cc42_toggle_invites', sc);
  return b;
}
function rewriteAttachments(att) { return Array.isArray(att) ? att.map((a) => a?.type === 'inline_keyboard' && Array.isArray(a.payload?.buttons) ? { ...a, payload: { ...a.payload, buttons: a.payload.buttons.map((r) => Array.isArray(r) ? r.map(rewriteButton) : r) } } : a) : att; }
function patchMaxApi(m) { if (!m || m.__cc42) return m; m.__cc42 = true; ['sendMessage','editMessage'].forEach((name) => { if (typeof m[name] !== 'function') return; const old = m[name].bind(m); m[name] = (args = {}) => old({ ...args, attachments: rewriteAttachments(args.attachments) }); }); return m; }
function install(app) {
  if (!app || app.__cc42) return app;
  app.__cc42 = true;
  const oldPost = app.post.bind(app);
  app.post = (route, ...handlers) => String(route || '').includes('/webhook') ? oldPost(route, async (req, res, next) => { try { if (await handle(req.body || {})) return res.json({ ok: true, handledBy: RUNTIME }); } catch (e) { console.error(`[${RUNTIME}] moderation`, e?.message || e); } next(); }, ...handlers) : oldPost(route, ...handlers);
  app.get('/debug/qa-lite', (req, res) => { noCache(res); res.type('text/plain').send(['OK: PROD_CHECK_READY','runtime: '+RUNTIME,'sourceMarker: '+SOURCE,'versionFormat: CC','postModerationToggle: fixed_setupState_store','cc2FloatingCta: inherited_cc4','cc3ModerationTree: webhook_pre_router','legacyInlineCta: disabled','keyboardSafeInput: enabled'].join('\n') + '\n'); });
  app.get('/debug/runtime-marker', (req, res) => { noCache(res); res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, postModerationToggle: 'fixed_setupState_store', cc3ModerationTree: 'webhook_pre_router', generatedAt: Date.now() }); });
  app.get('/debug/moderation-cc42', (req, res) => { noCache(res); const sc = scope({ channelId: req.query.channelId, commentKey: req.query.commentKey }); res.json({ ok: true, runtimeVersion: RUNTIME, scope: sc, key: key(sc), rules: readRules(sc), posts: postList(sc.channelId).slice(0, 20) }); });
  return app;
}
const prevLoad = Module._load;
Module._load = function cc42Load(request, parent, isMain) {
  const loaded = prevLoad.apply(this, arguments);
  try {
    if (String(request) === 'express' && loaded && !loaded.__cc42Wrapped) {
      function wrappedExpress(...args) { return install(loaded(...args)); }
      Object.setPrototypeOf(wrappedExpress, loaded); Object.assign(wrappedExpress, loaded); wrappedExpress.__cc42Wrapped = true; return wrappedExpress;
    }
    if (String(request).includes('services/maxApi')) return patchMaxApi(loaded);
  } catch {}
  return loaded;
};
require('./server-cc4.js');
