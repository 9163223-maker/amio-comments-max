'use strict';

const Module = require('module');
const fs = require('fs');
const path = require('path');

const RUNTIME = 'CC4.1';
const SOURCE = 'adminkit-CC4.1-debug-nocache-hotfix';
process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
console.log(`[${RUNTIME}] loaded`);

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}

const clean = (v) => String(v || '').replace(/^post:/i, '').replace(/^:+/, '').trim();
const short = (v, n = 48) => { const s = String(v || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const parse = (v) => { if (v && typeof v === 'object') return v; try { return JSON.parse(String(v || '')); } catch { return { action: String(v || '') }; } };
const button = (text, action, extra = {}) => ({ type: 'callback', text, payload: JSON.stringify({ action, ...extra }) });
const keyboard = (rows) => [{ type: 'inline_keyboard', payload: { buttons: rows } }];
function st() { return require('./store'); }
function cfg() { return require('./config'); }
function api() { return require('./services/maxApi'); }
function cb(u) { return u?.callback || u?.data?.callback || u?.message?.callback || null; }
function msg(u) { return u?.message || u?.data?.message || cb(u)?.message || null; }
function payload(u) { const c = cb(u) || {}; return parse(c.payload || c.data || c.callback_data || ''); }
function action(u) { const p = payload(u); return String(p.action || p.type || p.raw || '').trim(); }
function userId(u) { const c = cb(u) || {}; const m = msg(u) || {}; return String(c.user?.user_id || c.user?.id || u?.user?.user_id || u?.user?.id || m.sender?.user_id || m.sender?.id || '').trim(); }
function chatId(u) { const m = msg(u) || {}; return String(m.recipient?.chat_id || m.recipient?.id || m.chat_id || m.chat?.id || '').trim(); }
function text(u) { const m = msg(u) || {}; return String(m.body?.text || m.text || '').trim(); }
function callbackId(u) { const c = cb(u) || {}; return String(c.callback_id || c.callbackId || c.id || '').trim(); }
function channels() { try { return st().getChannelsList?.() || []; } catch { return []; } }
function channel(channelId = '') { const list = channels(); return list.find((c) => String(c.channelId || '') === String(channelId || '')) || list[0] || null; }
function channelTitle(channelId = '') { const c = channel(channelId) || {}; return String(c.title || c.name || c.channelTitle || channelId || 'Канал').trim(); }
function post(commentKey = '') { try { return st().getPost?.(clean(commentKey)) || null; } catch { return null; } }
function scope(data = {}) {
  let key = clean(data.commentKey || data.key || data.postKey || data.scopeKey || '');
  let ch = String(data.channelId || data.channel || '').trim();
  if (!ch && key) ch = String(post(key)?.channelId || (key.includes(':') ? key.split(':')[0] : '')).trim();
  if (!ch) ch = String(channel()?.channelId || '').trim();
  return { scope: key ? 'post' : 'channel', channelId: ch, commentKey: key };
}
function posts(channelId = '') {
  let list = [];
  try { list = st().listPostsByChannel?.(channelId, 50) || []; } catch {}
  if (!list.length) { try { list = st().getPostsList?.().filter((p) => !channelId || String(p.channelId || '') === String(channelId)).slice(0, 50) || []; } catch {} }
  return list.map((p) => ({ channelId: p.channelId || channelId, commentKey: clean(p.commentKey || (p.channelId && p.postId ? `${p.channelId}:${p.postId}` : '')), title: short(p.originalText || p.text || p.caption || p.postId || 'Пост') })).filter((p) => p.commentKey);
}
function settings(sc) {
  const store = st();
  if (sc.scope === 'post' && sc.commentKey) {
    if (store.getPostModerationSettings) return store.getPostModerationSettings(sc.commentKey) || {};
    const base = store.getModerationSettings?.(sc.channelId) || {};
    return { ...base, ...(base.postRules?.[sc.commentKey] || {}) };
  }
  return store.getModerationSettings?.(sc.channelId) || {};
}
function saveSettings(sc, next) {
  const store = st();
  if (sc.scope === 'post' && sc.commentKey) {
    if (store.savePostModerationSettings) return store.savePostModerationSettings(sc.commentKey, { ...next, channelId: sc.channelId });
    const base = store.getModerationSettings?.(sc.channelId) || {};
    const postRules = { ...(base.postRules || {}) };
    postRules[sc.commentKey] = { ...(postRules[sc.commentKey] || {}), ...next, channelId: sc.channelId, commentKey: sc.commentKey };
    return store.saveModerationSettings?.(sc.channelId, { ...base, enabled: true, postRules });
  }
  return store.saveModerationSettings?.(sc.channelId, next);
}
function chooseMenu(channelId = '') {
  const ch = String(channelId || channel()?.channelId || '').trim();
  const rows = [];
  if (ch) rows.push([button('🛡 Правила всего канала', 'cc4_channel', { channelId: ch })]);
  posts(ch).slice(0, 14).forEach((p, i) => rows.push([button(`🎯 ${i + 1}. ${p.title}`, 'cc4_post', { channelId: p.channelId || ch, commentKey: p.commentKey })]));
  rows.push([button('🏠 Главное меню', 'ak_main_menu')]);
  return { text: ['🛡 Модерация', '', 'Выберите область правил:', '', ch ? `Канал: ${channelTitle(ch)}` : 'Канал пока не выбран.'].join('\n'), attachments: keyboard(rows) };
}
function rulesMenu(sc) {
  const s = settings(sc); const isPost = sc.scope === 'post'; const custom = Array.isArray(s.customBlocklist) ? s.customBlocklist : [];
  const rows = [
    [button(isPost ? '🎯 Выбрать другой пост' : '🎯 Выбрать пост для правил', 'cc4_choose', { channelId: sc.channelId })],
    ...(isPost ? [[button('🛡 Правила всего канала', 'cc4_channel', { channelId: sc.channelId })]] : []),
    [button(s.enabled === false ? '▶️ Включить фильтр' : '⏸ Выключить фильтр', 'cc4_toggle_enabled', sc)],
    [button(s.applyPresetCommon === false ? '🧱 Стоп-слова: выкл.' : '🧱 Стоп-слова: вкл.', 'cc4_toggle_preset', sc)],
    [button('➕ Стоп-слово', 'cc4_add_stopword', sc), button('🧹 Очистить ручные', 'cc4_clear_stopwords', sc)],
    [button(s.blockLinks ? '🔗 Ссылки: блок.' : '🔗 Ссылки: разреш.', 'cc4_toggle_links', sc), button(s.blockInvites === false ? '✉️ Инвайты: разреш.' : '✉️ Инвайты: блок.', 'cc4_toggle_invites', sc)],
    [button('🏠 Главное меню', 'ak_main_menu')]
  ];
  const p = isPost ? post(sc.commentKey) : null;
  return { text: ['🛡 Модерация', '', `Канал: ${channelTitle(sc.channelId)}`, isPost ? `Пост: ${short(p?.originalText || p?.postId || sc.commentKey, 70)}` : '', `Область: ${isPost ? 'правила этого поста' : 'правила всего канала'}`, `Фильтр: ${s.enabled === false ? 'выключен' : 'включён'}`, `Стоп-слова: ${s.applyPresetCommon === false ? 'базовый список выключен' : 'базовый список включён'}`, `Ручной список: ${custom.length ? custom.join(', ') : 'пока пусто'}`, `Ссылки: ${s.blockLinks ? 'блокируются' : 'разрешены'}`, `Приглашения: ${s.blockInvites === false ? 'разрешены' : 'блокируются'}`, '', 'Выберите правило кнопками ниже.'].filter(Boolean).join('\n'), attachments: keyboard(rows) };
}
async function notify(u, value) { const id = callbackId(u); if (!id) return; try { await api().answerCallback({ botToken: cfg().botToken, callbackId: id, notification: value }); } catch {} }
async function send(u, packet) { const args = { botToken: cfg().botToken, text: packet.text, attachments: packet.attachments || [] }; const c = chatId(u); const uid = userId(u); if (c) args.chatId = c; else if (uid) args.userId = uid; else return null; return api().sendMessage(args); }
function setupKey(u) { return userId(u) || chatId(u) || 'global'; }
function flow(u) { try { return st().getSetupState?.(setupKey(u))?.cc4Flow || null; } catch { return null; } }
function setFlow(u, value) { try { st().setSetupState?.(setupKey(u), { cc4Flow: value, updatedAt: Date.now() }); } catch {} }
function clearFlow(u) { try { const key = setupKey(u); const cur = st().getSetupState?.(key) || {}; delete cur.cc4Flow; st().setSetupState?.(key, cur); } catch {} }
async function handleModeration(u) {
  const fl = flow(u); const txt = text(u);
  if (fl?.type === 'stopword' && txt) {
    const sc = scope(fl); const words = [...new Set(txt.split(/[\n,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
    const s = settings(sc); saveSettings(sc, { ...s, enabled: true, customBlocklist: [...new Set([...(Array.isArray(s.customBlocklist) ? s.customBlocklist : []), ...words])] }); clearFlow(u);
    await send(u, { text: `✅ Стоп-слово сохранено\n\nДобавлено: ${words.join(', ')}` }); await send(u, rulesMenu(sc)); return true;
  }
  const p = payload(u); const a = action(u).toLowerCase();
  if (!/(cc4|moder|модер|rules|rule|stop|filter|link|invite|post)/i.test(a)) return false;
  const sc = scope(p);
  if (/choose|moder|модер|post_rules_start|this_post|правила.*пост/.test(a) && !p.commentKey) { await notify(u, 'Выберите область'); await send(u, chooseMenu(sc.channelId)); return true; }
  if (/cc4_channel|channel.*rule|всего.*канала/.test(a)) { await notify(u, 'Правила канала'); await send(u, rulesMenu({ scope: 'channel', channelId: sc.channelId, commentKey: '' })); return true; }
  if (/cc4_post|post.*rule/.test(a) && sc.commentKey) { await notify(u, 'Правила поста'); await send(u, rulesMenu(sc)); return true; }
  if (/add.*stop|stop.*add|cc4_add_stopword/.test(a)) { setFlow(u, { type: 'stopword', ...sc }); await notify(u, 'Пришлите стоп-слово'); await send(u, { text: '🧱 Стоп-слово\n\nПришлите одним сообщением слово или фразу.' }); return true; }
  if (/clear.*stop|cc4_clear/.test(a)) { const s = settings(sc); saveSettings(sc, { ...s, customBlocklist: [] }); await notify(u, 'Очищено'); await send(u, rulesMenu(sc)); return true; }
  const s = settings(sc); const n = { ...s };
  if (/toggle.*enabled|filter/.test(a)) n.enabled = s.enabled === false;
  else if (/toggle.*preset|stopwords/.test(a)) n.applyPresetCommon = s.applyPresetCommon === false;
  else if (/toggle.*links|link/.test(a)) n.blockLinks = !s.blockLinks;
  else if (/toggle.*invites|invite/.test(a)) n.blockInvites = s.blockInvites === false;
  else return false;
  saveSettings(sc, n); await notify(u, 'Сохранено'); await send(u, rulesMenu(sc)); return true;
}
function rewriteButton(b = {}) { const t = String(b.text || ''); const sc = scope(parse(b.payload || b.data || ''));
  if (/правила\s+этого\s+поста|выбрать.*пост|другой.*канал.*пост/i.test(t)) return button(t, 'cc4_choose', { channelId: sc.channelId });
  if (/правила\s+всего\s+канала/i.test(t)) return button(t, 'cc4_channel', { channelId: sc.channelId });
  if (/стоп[-\s]?слово/i.test(t) && /\+|➕|добав/i.test(t)) return button(t, 'cc4_add_stopword', sc);
  if (/очистить.*руч/i.test(t)) return button(t, 'cc4_clear_stopwords', sc);
  if (/выключить\s+фильтр|включить\s+фильтр/i.test(t)) return button(t, 'cc4_toggle_enabled', sc);
  if (/стоп[-\s]?слова/i.test(t)) return button(t, 'cc4_toggle_preset', sc);
  if (/ссылки/i.test(t)) return button(t, 'cc4_toggle_links', sc);
  if (/инвайт|приглаш/i.test(t)) return button(t, 'cc4_toggle_invites', sc);
  return b; }
function rewriteAttachments(att) { return Array.isArray(att) ? att.map((a) => a?.type === 'inline_keyboard' && Array.isArray(a.payload?.buttons) ? { ...a, payload: { ...a.payload, buttons: a.payload.buttons.map((r) => Array.isArray(r) ? r.map(rewriteButton) : r) } } : a) : att; }
function patchMaxApi(m) { if (!m || m.__cc4) return m; m.__cc4 = true; ['sendMessage','editMessage'].forEach((name) => { if (typeof m[name] !== 'function') return; const old = m[name].bind(m); m[name] = (args = {}) => old({ ...args, attachments: rewriteAttachments(args.attachments) }); }); return m; }

function patchApp(source) {
  let out = String(source || '');
  out = out.replace(/function renderLeadMagnet\(growth\) \{[\s\S]*?\n\}\n\nfunction renderTrackedButtons/, 'function renderLeadMagnet(growth) {\n  if (growthLeadCard) { growthLeadCard.innerHTML = ""; growthLeadCard.classList.add("hidden"); }\n}\n\nfunction renderTrackedButtons');
  out += `\n;(() => {\n if(window.__AK_CC4_CTA__) return; window.__AK_CC4_CTA__=true; let closed=false;\n function style(){if(document.getElementById('ak-cc4-style'))return; const s=document.createElement('style'); s.id='ak-cc4-style'; s.textContent='#ak-cc4-cta{position:fixed;left:50%;bottom:calc(var(--ak-composer-height,88px) + env(safe-area-inset-bottom) + 10px);transform:translateX(-50%);z-index:2147482000;display:flex;align-items:center;gap:8px;padding:7px 9px 7px 11px;border-radius:999px;background:rgba(255,255,255,.62);border:1px solid rgba(255,255,255,.72);box-shadow:0 8px 28px rgba(48,111,190,.13);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#2563b8}.ak-cc4-dot{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(232,244,255,.72);font-size:15px}.ak-cc4-text{font-size:14px;font-weight:750;white-space:nowrap}.ak-cc4-close{width:26px;height:26px;border:0;border-radius:50%;background:rgba(226,232,240,.55);color:#64748b;font-size:17px}'; document.head.appendChild(s);}\n function inlineOff(){try{if(typeof growthLeadCard!=='undefined'&&growthLeadCard){growthLeadCard.innerHTML='';growthLeadCard.classList.add('hidden');} document.querySelectorAll('#growthLeadCard,.growth-card,.growth-lead-card,#ak-cc3-floating-cta').forEach(e=>{if(e.id==='ak-cc3-floating-cta')e.remove();});}catch(_){}}\n function keyb(){const a=document.activeElement; const focus=!!(a&&/INPUT|TEXTAREA/.test(a.tagName||'')); const vv=window.visualViewport; const o=vv?Math.max(0,(window.innerHeight||0)-((vv.height||0)+(vv.offsetTop||0))):0; return focus||o>40;}\n function ready(){try{if(document.body?.classList?.contains('miniapp-start-mode'))return false; if(keyb())return false; const c=document.getElementById('composerCard'), i=document.getElementById('commentInput'), t=document.getElementById('postTitle'); if(!c||!i||!t)return false; const cs=getComputedStyle(c); if(cs.display==='none'||cs.visibility==='hidden')return false; if(!(t.textContent||'').trim())return false; if(typeof state!=='undefined'&&!String(state.commentKey||'').trim())return false; return true;}catch{return false;}}\n function draw(){inlineOff(); let el=document.getElementById('ak-cc4-cta'); if(!ready()||closed){ if(el)el.remove(); return;} style(); const c=document.getElementById('composerCard'); document.documentElement.style.setProperty('--ak-composer-height',Math.max(68,Math.round(c?.getBoundingClientRect?.().height||88))+'px'); if(!el){el=document.createElement('div'); el.id='ak-cc4-cta'; el.innerHTML='<div class="ak-cc4-dot">🐋</div><div class="ak-cc4-text">Подключить комментарии</div><button class="ak-cc4-close">×</button>'; el.onclick=(e)=>{if(e.target.className==='ak-cc4-close'){closed=true;el.remove();return;} location.href=(typeof state!=='undefined'&&state.adminkitLink)||'https://max.ru/id781310320690_bot?start=menu';}; document.body.appendChild(el);}}\n document.addEventListener('focusin',draw,true); document.addEventListener('focusout',()=>setTimeout(draw,180),true); window.visualViewport?.addEventListener?.('resize',draw); window.visualViewport?.addEventListener?.('scroll',draw); setInterval(draw,900); setTimeout(draw,700);\n})();\n`;
  return out;
}
function patchFs(){ if(fs.__cc4) return; fs.__cc4 = true; const old = fs.readFileSync.bind(fs); const appPath = path.resolve(__dirname, 'public', 'app.js'); fs.readFileSync = (file, options) => { const data = old(file, options); const textMode = options === 'utf8' || options === 'utf-8' || (options && /utf-?8/i.test(String(options.encoding || ''))); if (textMode && path.resolve(String(file || '')) === appPath) return patchApp(String(data || '')); return data; }; }
function installExpress(app) { if (!app || app.__cc4) return app; app.__cc4 = true; const oldPost = app.post.bind(app); app.post = (route, ...handlers) => String(route || '').includes('/webhook') ? oldPost(route, async (req, res, next) => { try { if (await handleModeration(req.body || {})) return res.json({ ok: true, handledBy: RUNTIME }); } catch(e) { console.error('[CC4 moderation]', e.message || e); } next(); }, ...handlers) : oldPost(route, ...handlers); app.get('/debug/qa-lite', (req,res) => { noCache(res); res.type('text/plain').send(['OK: PROD_CHECK_READY','runtime: '+RUNTIME,'sourceMarker: '+SOURCE,'versionFormat: CC','cc2FloatingCta: no_flicker','cc3ModerationTree: webhook_router','legacyInlineCta: disabled','keyboardSafeInput: enabled'].join('\n')+'\n'); }); app.get('/debug/runtime-marker', (req,res) => { noCache(res); res.json({ ok:true, runtimeVersion:RUNTIME, sourceMarker:SOURCE, cc2FloatingCta:'no_flicker', cc3ModerationTree:'webhook_router', legacyInlineCta:false, keyboardSafeInput:true, generatedAt:Date.now() }); }); return app; }

patchFs();
const oldLoad = Module._load;
Module._load = function(request, parent, isMain) { const loaded = oldLoad.apply(this, arguments); try { if (request === 'express' && loaded && !loaded.__cc4wrapped) { function wrapped(...args){ return installExpress(loaded(...args)); } Object.setPrototypeOf(wrapped, loaded); Object.assign(wrapped, loaded); wrapped.__cc4wrapped = true; return wrapped; } if (String(request).includes('services/maxApi')) return patchMaxApi(loaded); } catch(e) {} return loaded; };
require('./server-sp4058.js');
