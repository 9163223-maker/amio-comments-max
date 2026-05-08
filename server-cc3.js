'use strict';

const Module = require('module');
const fs = require('fs');
const path = require('path');

const RUNTIME = 'CC3';
const SOURCE = 'adminkit-CC3-floating-cta-and-moderation-tree';

console.log(`[${RUNTIME}] clean core overlay: CC2 floating CTA + CC3 moderation tree`);
process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;

function norm(v) {
  return String(v || '').replace(/^post:/i, '').replace(/^:+/, '').replace(/^['\"]+|['\"]+$/g, '').trim();
}
function cut(v, n = 64) {
  const s = String(v || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function parsePayload(v) {
  if (v && typeof v === 'object') return v;
  const s = String(v || '').trim();
  if (!s) return {};
  try {
    const p = JSON.parse(s);
    return p && typeof p === 'object' ? p : { action: s };
  } catch {
    return { action: s };
  }
}
function btn(text, action, extra = {}) {
  return { type: 'callback', text, payload: JSON.stringify({ action, ...extra }) };
}
function kb(rows) {
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}
function deep(obj, keys, seen = new Set()) {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return '';
  seen.add(obj);
  const set = new Set(keys.map((k) => String(k).toLowerCase()));
  for (const [k, v] of Object.entries(obj)) {
    if (set.has(String(k).toLowerCase())) {
      const s = String(v || '').trim();
      if (s && s !== '[object Object]') return s;
    }
  }
  for (const v of Object.values(obj)) {
    const found = deep(v, keys, seen);
    if (found) return found;
  }
  return '';
}
function cb(u = {}) { return u.callback || u.data?.callback || u.message?.callback || u.update?.callback || null; }
function msg(u = {}) { return u.message || u.data?.message || u.callback?.message || u.data?.callback?.message || null; }
function payload(u = {}) {
  const c = cb(u) || {};
  return parsePayload(c.payload || c.data || c.callback_data || c.value || deep(c, ['payload', 'data', 'callback_data']));
}
function callbackId(u = {}) {
  const c = cb(u) || {};
  return String(c.callback_id || c.callbackId || c.id || deep(c, ['callback_id', 'callbackId']) || '').trim();
}
function userId(u = {}) { return String(deep(u, ['user_id', 'userId', 'sender_id', 'from_id', 'id']) || '').trim(); }
function chatId(u = {}) {
  const m = msg(u) || {};
  return String(m.recipient?.chat_id || m.recipient?.id || m.chat_id || m.chat?.id || deep(m, ['chat_id']) || '').trim();
}
function textOf(u = {}) {
  const m = msg(u) || {};
  return String(m.body?.text || m.text || m.message?.text || '').trim();
}
function actionOf(u = {}) {
  const p = payload(u);
  return String(p.action || p.type || p.raw || '').trim();
}
function noCache(res) {
  try {
    res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' });
  } catch {}
}
function adminOk(req, res) {
  const expected = String(process.env.MODERATION_ADMIN_TOKEN || process.env.GIFT_ADMIN_TOKEN || process.env.ADMIN_TOKEN || 'admin').trim();
  const got = String(req.query?.token || req.query?.adminToken || req.get?.('x-admin-token') || '').trim();
  if (!expected || got === expected) return true;
  noCache(res);
  res.status(403).json({ ok: false, error: 'admin_forbidden', runtimeVersion: RUNTIME });
  return false;
}
function store() { return require('./store'); }
function channels() {
  try { return require('./services/channelService').listChannels?.() || []; } catch { return []; }
}
function firstChannel(channelId = '') {
  const wanted = String(channelId || '').trim();
  const list = channels();
  return list.find((c) => String(c.channelId || '') === wanted) || list.find((c) => String(c.channelId || '').trim()) || null;
}
function channelTitle(channelId = '') {
  const c = firstChannel(channelId) || {};
  return String(c.title || c.channelTitle || c.name || c.chatTitle || c.channelName || channelId || 'Канал').trim();
}
function postChannel(commentKey = '') {
  const key = norm(commentKey);
  try {
    const post = store().getPost?.(key);
    if (post?.channelId) return String(post.channelId).trim();
  } catch {}
  return key.includes(':') ? key.split(':')[0] : '';
}
function scopeFrom(p = {}) {
  const raw = String(p.scope || p.scopeKey || '').trim();
  const commentKey = norm(p.commentKey || p.key || (/^post:/i.test(raw) ? raw : ''));
  let channelId = String(p.channelId || p.channel || '').trim();
  if (!channelId && commentKey) channelId = postChannel(commentKey);
  if (!channelId) channelId = String(firstChannel()?.channelId || '').trim();
  return { scope: commentKey ? 'post' : 'channel', channelId, commentKey };
}
function getSettings(scope) {
  const s = store();
  if (scope.scope === 'post' && scope.commentKey && typeof s.getPostModerationSettings === 'function') {
    return s.getPostModerationSettings(scope.commentKey) || { ...(s.getModerationSettings?.(scope.channelId) || {}), scope: 'post', commentKey: scope.commentKey, channelId: scope.channelId };
  }
  return s.getModerationSettings?.(scope.channelId) || {};
}
function saveSettings(scope, next) {
  const s = store();
  if (scope.scope === 'post' && scope.commentKey && typeof s.savePostModerationSettings === 'function') {
    return s.savePostModerationSettings(scope.commentKey, { ...next, channelId: scope.channelId });
  }
  return s.saveModerationSettings?.(scope.channelId, next);
}
function listPosts(channelId = '') {
  const s = store();
  if (typeof s.listModerationScopeOptions === 'function') return s.listModerationScopeOptions(channelId, 20).posts || [];
  return (s.listPostsByChannel?.(channelId, 20) || []).map((p) => ({
    commentKey: p.commentKey,
    channelId: p.channelId,
    title: cut(p.originalText || p.text || p.caption || 'Пост без текста')
  }));
}
function currentPostTitle(commentKey = '') {
  try {
    const post = store().getPost?.(norm(commentKey));
    return cut(post?.originalText || post?.text || post?.caption || post?.postId || commentKey, 88);
  } catch {
    return cut(commentKey, 88);
  }
}
function chooseScopeMenu(channelId = '') {
  const ch = firstChannel(channelId);
  const resolved = String(channelId || ch?.channelId || '').trim();
  const rows = [];
  if (resolved) rows.push([btn('🛡 Правила всего канала', 'ak_cc3_channel', { channelId: resolved })]);
  const posts = listPosts(resolved);
  posts.slice(0, 12).forEach((p, i) => {
    rows.push([btn(`🎯 Пост ${i + 1}: ${cut(p.title || p.commentKey, 44)}`, 'ak_cc3_post', { channelId: p.channelId || resolved, commentKey: p.commentKey })]);
  });
  rows.push([btn('🏠 Главное меню', 'ak_main_menu', {})]);
  return {
    text: [
      '🛡 Модерация',
      '',
      'Сначала выберите область правил.',
      '',
      resolved ? `Канал: ${channelTitle(resolved)}` : 'Канал пока не выбран.',
      posts.length ? 'Можно выбрать весь канал или конкретный пост.' : 'Посты пока не найдены. Перешлите нужный пост боту, затем вернитесь в модерацию.'
    ].join('\n'),
    attachments: kb(rows)
  };
}
function moderationMenu(scope) {
  const set = getSettings(scope);
  const enabled = set.enabled !== false;
  const preset = set.applyPresetCommon !== false;
  const links = Boolean(set.blockLinks);
  const invites = set.blockInvites !== false;
  const custom = Array.isArray(set.customBlocklist) ? set.customBlocklist : [];
  const ctx = { scope: scope.scope, channelId: scope.channelId, commentKey: scope.commentKey };
  const isPost = scope.scope === 'post' && scope.commentKey;
  const rows = [];
  rows.push([btn(isPost ? '🎯 Выбрать другой пост' : '🎯 Выбрать пост для правил', 'ak_cc3_choose_scope', { channelId: scope.channelId })]);
  if (isPost) rows.push([btn('🛡 Перейти к правилам всего канала', 'ak_cc3_channel', { channelId: scope.channelId })]);
  rows.push([btn(enabled ? '⏸ Выключить фильтр' : '▶️ Включить фильтр', 'ak_cc3_toggle_enabled', ctx)]);
  rows.push([btn(preset ? '🧱 Стоп-слова: вкл.' : '🧱 Стоп-слова: выкл.', 'ak_cc3_toggle_preset', ctx)]);
  rows.push([btn('➕ Стоп-слово', 'ak_cc3_add_stopword', ctx), btn('🧹 Очистить ручные', 'ak_cc3_clear_stopwords', ctx)]);
  rows.push([btn(links ? '🔗 Ссылки: блок.' : '🔗 Ссылки: разреш.', 'ak_cc3_toggle_links', ctx), btn(invites ? '✉️ Инвайты: блок.' : '✉️ Инвайты: разреш.', 'ak_cc3_toggle_invites', ctx)]);
  rows.push([btn('🤖 AI: PRO', 'ak_cc3_ai_pro', ctx)]);
  rows.push([btn('🏠 Главное меню', 'ak_main_menu', {})]);
  return {
    text: [
      '🛡 Модерация',
      '',
      `Канал: ${channelTitle(scope.channelId)}`,
      isPost ? `Пост: ${currentPostTitle(scope.commentKey)}` : '',
      `Область: ${isPost ? 'правила этого поста' : 'правила всего канала'}`,
      `Фильтр: ${enabled ? 'включён' : 'выключен'}`,
      `Стоп-слова: ${preset ? 'базовый список включён' : 'базовый список выключен'}`,
      `Ручной список: ${custom.length ? custom.join(', ') : 'пока пусто'}`,
      `Ссылки: ${links ? 'блокируются' : 'разрешены'}`,
      `Приглашения: ${invites ? 'блокируются' : 'разрешены'}`,
      `AI-модерация: ${set.aiEnabled ? 'включена' : 'выключена / PRO'}`,
      '',
      'Выберите правило кнопками ниже.'
    ].filter(Boolean).join('\n'),
    attachments: kb(rows)
  };
}
async function send(u, packet) {
  const api = require('./services/maxApi');
  const cfg = require('./config');
  const uid = userId(u);
  const cid = chatId(u);
  return api.sendMessage({ botToken: cfg.botToken, userId: uid || undefined, chatId: uid ? undefined : cid || undefined, text: packet.text, attachments: packet.attachments || [] });
}
async function answer(u, notification) {
  const id = callbackId(u);
  if (!id) return null;
  try { return await require('./services/maxApi').answerCallback({ botToken: require('./config').botToken, callbackId: id, notification }); } catch { return null; }
}
function setFlow(uid, flow) {
  if (!uid) return;
  const s = store();
  const cur = s.getSetupState?.(uid) || {};
  s.setSetupState?.(uid, { ...cur, cc3ModFlow: flow, updatedAt: Date.now() });
}
function getFlow(uid) { return uid ? (store().getSetupState?.(uid)?.cc3ModFlow || null) : null; }
function clearFlow(uid) {
  if (!uid) return;
  const s = store();
  const cur = s.getSetupState?.(uid) || {};
  if (!cur.cc3ModFlow) return;
  delete cur.cc3ModFlow;
  s.setSetupState?.(uid, cur);
}
function appendStopWords(scope, rawText) {
  const words = [...new Set(String(rawText || '').split(/[\n,;]+/g).map((w) => w.trim().toLowerCase()).filter(Boolean))];
  if (!words.length) return [];
  const cur = getSettings(scope);
  const customBlocklist = [...new Set([...(Array.isArray(cur.customBlocklist) ? cur.customBlocklist : []), ...words])];
  saveSettings(scope, { ...cur, enabled: true, customBlocklist });
  return words;
}
async function handleCc3Moderation(u = {}) {
  const uid = userId(u);
  const txt = textOf(u);
  const flow = getFlow(uid);
  if (flow?.type === 'add_stopword' && txt) {
    const scope = scopeFrom(flow);
    const words = appendStopWords(scope, txt);
    clearFlow(uid);
    await send(u, { text: `✅ Стоп-слово сохранено\n\nДобавлено: ${words.join(', ') || 'ничего'}\nОбласть: ${scope.scope === 'post' ? 'правила этого поста' : 'правила всего канала'}` });
    await send(u, moderationMenu(scope));
    return true;
  }
  const p = payload(u);
  const action = String(p.action || p.type || '').trim();
  if (!action) return false;
  const scope = scopeFrom(p);
  if (action === 'admin_moderation' || action === 'moderation' || action === 'ak_cc3_start' || action === 'ak_cc3_choose_scope' || action === 'ak_mod_choose_scope') {
    await answer(u, 'Выберите область');
    await send(u, chooseScopeMenu(scope.channelId));
    return true;
  }
  if (action === 'ak_cc3_channel') {
    await answer(u, 'Правила канала');
    await send(u, moderationMenu({ scope: 'channel', channelId: scope.channelId, commentKey: '' }));
    return true;
  }
  if (action === 'ak_cc3_post') {
    await answer(u, 'Правила поста');
    await send(u, moderationMenu(scope));
    return true;
  }
  if (action === 'ak_cc3_add_stopword') {
    setFlow(uid, { type: 'add_stopword', ...scope });
    await answer(u, 'Пришлите стоп-слово');
    await send(u, { text: ['🧱 Стоп-слово', '', 'Пришлите одним сообщением слово или фразу.', scope.scope === 'post' ? 'Область: правила этого поста' : 'Область: правила всего канала'].join('\n'), attachments: kb([[btn('↩️ Отмена', 'ak_cc3_cancel', scope)]]) });
    return true;
  }
  if (action === 'ak_cc3_cancel') {
    clearFlow(uid);
    await answer(u, 'Отменено');
    await send(u, moderationMenu(scope));
    return true;
  }
  if (action === 'ak_cc3_clear_stopwords') {
    const cur = getSettings(scope);
    saveSettings(scope, { ...cur, customBlocklist: [] });
    await answer(u, 'Очищено');
    await send(u, moderationMenu(scope));
    return true;
  }
  const cur = getSettings(scope);
  const next = { ...cur };
  if (action === 'ak_cc3_toggle_enabled') next.enabled = cur.enabled === false;
  else if (action === 'ak_cc3_toggle_preset') next.applyPresetCommon = cur.applyPresetCommon === false;
  else if (action === 'ak_cc3_toggle_links') next.blockLinks = !cur.blockLinks;
  else if (action === 'ak_cc3_toggle_invites') next.blockInvites = cur.blockInvites === false;
  else if (action === 'ak_cc3_ai_pro') {
    await answer(u, 'AI — PRO');
    await send(u, { text: 'AI-модерация будет отдельной PRO-функцией. Сейчас стабилизируем базовую модерацию.', attachments: kb([[btn('↩️ Назад', scope.scope === 'post' ? 'ak_cc3_post' : 'ak_cc3_channel', scope)]]) });
    return true;
  } else return false;
  saveSettings(scope, next);
  await answer(u, 'Сохранено');
  await send(u, moderationMenu(scope));
  return true;
}
function patchBot(bot) {
  if (!bot || bot.__adminkitCc3Bot) return bot;
  bot.__adminkitCc3Bot = true;
  for (const key of Object.keys(bot)) {
    if (typeof bot[key] !== 'function') continue;
    const old = bot[key];
    bot[key] = async function cc3BotWrapper(...args) {
      const u = args.find((a) => a && typeof a === 'object' && (a.message || a.callback || a.data || a.update)) || args[0];
      try { if (await handleCc3Moderation(u || {})) return { ok: true, handledBy: RUNTIME }; } catch (e) { console.error(`[${RUNTIME}] moderation failed`, e?.message || e); }
      return old.apply(this, args);
    };
  }
  return bot;
}
function rewriteButton(button = {}) {
  if (!button || typeof button !== 'object') return button;
  const text = String(button.text || '').trim();
  const p = parsePayload(button.payload || button.data || '');
  const scope = scopeFrom(p);
  if (/правила\s+этого\s+поста/i.test(text)) return btn(text, 'ak_cc3_choose_scope', { channelId: scope.channelId });
  if (/выбрать.*канал.*пост|выбрать.*пост|в начало модерации/i.test(text)) return btn(text, 'ak_cc3_choose_scope', { channelId: scope.channelId });
  if (/правила\s+всего\s+канала|весь\s+канал/i.test(text)) return btn(text, 'ak_cc3_channel', { channelId: scope.channelId });
  if (/^пост\s*\d+|🎯\s*пост/i.test(text)) return btn(text, 'ak_cc3_post', { channelId: scope.channelId, commentKey: scope.commentKey });
  if (/стоп[-\s]?слово/i.test(text) && /\+|➕|добав/i.test(text)) return btn(text, 'ak_cc3_add_stopword', scope);
  if (/очистить.*руч/i.test(text)) return btn(text, 'ak_cc3_clear_stopwords', scope);
  return button;
}
function rewriteAttachments(attachments) {
  if (!Array.isArray(attachments)) return attachments;
  return attachments.map((item) => {
    if (item?.type !== 'inline_keyboard' || !Array.isArray(item.payload?.buttons)) return item;
    return { ...item, payload: { ...item.payload, buttons: item.payload.buttons.map((row) => Array.isArray(row) ? row.map(rewriteButton) : row) } };
  });
}
function patchMaxApi(api) {
  if (!api || api.__adminkitCc3Max) return api;
  api.__adminkitCc3Max = true;
  for (const name of ['sendMessage', 'editMessage']) {
    if (typeof api[name] !== 'function') continue;
    const old = api[name].bind(api);
    api[name] = function cc3ApiWrapper(args = {}) {
      const text = String(args.text || '');
      if (/Модерация|Стоп-слова|AI-модерация|Область: правила/i.test(text)) {
        return old({ ...args, attachments: rewriteAttachments(args.attachments) });
      }
      return old(args);
    };
  }
  return api;
}

function floatingCtaClientPatch() {
  return `\n;(() => {\n  if (window.__ADMINKIT_CC3_FLOATING_CTA__) return;\n  window.__ADMINKIT_CC3_FLOATING_CTA__ = true;\n  const escape = (value) => String(value || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');\n  let currentUrl = '';\n  function getController(){ try { return typeof getBridgeController === 'function' ? getBridgeController() : null; } catch { return null; } }\n  function openTarget(url){ const target = String(url || '').trim(); if(!target) return; const c = getController(); try { if(/^https:\\/\\/max\\.ru\\//i.test(target) && c && typeof c.openMaxLink === 'function'){ c.openMaxLink(target); return; } if(c && typeof c.openLink === 'function'){ c.openLink(target); return; } } catch(_){} window.location.href = target; }\n  function ensureStyle(){ if(document.getElementById('ak-cc3-cta-style')) return; const style = document.createElement('style'); style.id = 'ak-cc3-cta-style'; style.textContent = '#ak-cc3-floating-cta{position:fixed;left:50%;bottom:calc(var(--ak-composer-height,88px) + env(safe-area-inset-bottom) + 10px);transform:translateX(-50%);z-index:2147482000;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 36px);padding:7px 9px 7px 11px;border-radius:999px;background:rgba(255,255,255,.62);border:1px solid rgba(255,255,255,.72);box-shadow:0 8px 28px rgba(48,111,190,.13),inset 0 1px 0 rgba(255,255,255,.86);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#2563b8;opacity:1;transition:opacity .16s ease,transform .16s ease}#ak-cc3-floating-cta.ak-hidden{opacity:0;pointer-events:none;transform:translateX(-50%) translateY(8px)}#ak-cc3-floating-cta .ak-dot{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(232,244,255,.72);font-size:15px;flex:0 0 26px}#ak-cc3-floating-cta .ak-text{font-size:14px;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:230px}#ak-cc3-floating-cta .ak-close{width:26px;height:26px;border:0;border-radius:50%;background:rgba(226,232,240,.55);color:#64748b;font-size:17px;line-height:24px}body.ak-cc3-keyboard-open #ak-cc3-floating-cta{display:none!important}.growth-lead-card,.growth-card:has(.growth-section-head){ }'; document.head.appendChild(style); }\n  function hideInline(){ try { if (typeof growthLeadCard !== 'undefined' && growthLeadCard) { growthLeadCard.innerHTML = ''; growthLeadCard.classList.add('hidden'); } const bad = /Подключить такие же комментарии|CTA для этого обсуждения|Подарок автора|Услуги автора/; document.querySelectorAll('.growth-card,.growth-lead-card,#growthLeadCard').forEach((el)=>{ const txt=(el.innerText||el.textContent||'').trim(); if(!txt || bad.test(txt)){ el.innerHTML=''; el.classList.add('hidden'); } }); } catch(_){} }\n  function isCommentsMode(){ try { if(document.body?.classList?.contains('miniapp-start-mode')) return false; const composer = document.getElementById('composerCard'); if(!composer) return false; const cs = getComputedStyle(composer); return cs.display !== 'none' && cs.visibility !== 'hidden'; } catch { return false; } }\n  function keyboardOpen(){ try { const active = document.activeElement; const focus = !!(active && /INPUT|TEXTAREA/.test(active.tagName || '')); const vv = window.visualViewport; const overlap = vv ? Math.max(0, Math.round((window.innerHeight || 0) - ((vv.height || 0) + (vv.offsetTop || 0)))) : 0; document.body.classList.toggle('ak-cc3-keyboard-open', focus || overlap > 40); return focus || overlap > 40; } catch { return false; } }\n  function ensureCta(){ ensureStyle(); hideInline(); let el = document.getElementById('ak-cc3-floating-cta'); if(!el){ el = document.createElement('div'); el.id = 'ak-cc3-floating-cta'; el.innerHTML = '<div class="ak-dot">🐋</div><div class="ak-text">Подключить комментарии</div><button class="ak-close" type="button" aria-label="Скрыть">×</button>'; el.addEventListener('click',(event)=>{ if(event.target && event.target.classList.contains('ak-close')){ el.classList.add('ak-hidden'); el.dataset.closed='1'; return; } openTarget(currentUrl); }); document.body.appendChild(el); } const composer = document.getElementById('composerCard'); const h = composer ? Math.max(68, Math.round(composer.getBoundingClientRect().height || composer.offsetHeight || 88)) : 88; document.documentElement.style.setProperty('--ak-composer-height', h + 'px'); const shouldShow = isCommentsMode() && !!currentUrl && !keyboardOpen() && el.dataset.closed !== '1'; el.classList.toggle('ak-hidden', !shouldShow); }\n  function extractUrl(growth){ const lead = growth && growth.leadMagnet ? growth.leadMagnet : null; return String((lead && (lead.trackedUrl || lead.targetUrl)) || (typeof state !== 'undefined' ? state.adminkitLink : '') || '').trim(); }\n  window.__adminkitFloatingCtaUpdate = function(growth){ currentUrl = extractUrl(growth); ensureCta(); };\n  try { renderLeadMagnet = function(growth){ hideInline(); window.__adminkitFloatingCtaUpdate(growth || (typeof state !== 'undefined' ? state.growth : null)); }; } catch(_){}\n  document.addEventListener('focusin', ensureCta, true); document.addEventListener('focusout', () => setTimeout(ensureCta, 160), true); window.visualViewport?.addEventListener?.('resize', ensureCta); window.visualViewport?.addEventListener?.('scroll', ensureCta);\n  setInterval(() => { try { window.__adminkitFloatingCtaUpdate(typeof state !== 'undefined' ? state.growth : null); } catch(_) { ensureCta(); } }, 1000);\n  setTimeout(() => { try { window.__adminkitFloatingCtaUpdate(typeof state !== 'undefined' ? state.growth : null); } catch(_) { ensureCta(); } }, 250);\n})();\n`;
}
function patchAppText(text) {
  let out = String(text || '');
  out = out.replace(/\n;\(\(\) => \{\n  if \(window\.__ADMINKIT_SP4057_CLEAR_CORE__\)[\s\S]*?\n\}\)\(\);\n?/g, '\n');
  out = out.replace(/function renderLeadMagnet\(growth\) \{[\s\S]*?\n\}\n\nfunction renderTrackedButtons/, [
    'function renderLeadMagnet(growth) {',
    '  if (growthLeadCard) { growthLeadCard.innerHTML = ""; growthLeadCard.classList.add("hidden"); }',
    '  try { window.__adminkitFloatingCtaUpdate?.(growth || state.growth); } catch {}',
    '}',
    '',
    'function renderTrackedButtons'
  ].join('\n'));
  out = out.replace(/Полезная ссылка/g, '').replace(/CTA для этого обсуждения/g, '').replace(/Подключить такие же комментарии в свой канал/g, 'Подключить комментарии');
  if (!out.includes('__ADMINKIT_CC3_FLOATING_CTA__')) out += floatingCtaClientPatch();
  return out;
}
function installFinalAppPatch() {
  if (fs.__adminkitCc3ReadPatch) return;
  fs.__adminkitCc3ReadPatch = true;
  const previousRead = fs.readFileSync.bind(fs);
  const appPath = path.resolve(path.join(__dirname, 'public', 'app.js'));
  fs.readFileSync = function cc3ReadFileSync(filePath, options) {
    const content = previousRead(filePath, options);
    try {
      const wantsText = options === 'utf8' || options === 'utf-8' || (options && typeof options === 'object' && /utf-?8/i.test(String(options.encoding || '')));
      if (path.resolve(String(filePath || '')) === appPath && wantsText) return patchAppText(String(content || ''));
    } catch {}
    return content;
  };
}
function installDebug(app) {
  if (!app || app.__adminkitCc3Debug) return app;
  app.__adminkitCc3Debug = true;
  app.get('/debug/qa-lite', (req, res) => {
    if (!adminOk(req, res)) return;
    noCache(res);
    res.type('text/plain').send([
      'OK: PROD_CHECK_READY',
      'runtime: ' + RUNTIME,
      'sourceMarker: ' + SOURCE,
      'versionFormat: CC',
      'clearCore: enabled',
      'cc2FloatingCta: enabled',
      'cc3ModerationTree: enabled',
      'legacyInlineCta: disabled',
      'keyboardSafeInput: enabled',
      'entrypoint: server-cc3.js -> server-sp4058.js'
    ].join('\n') + '\n');
  });
  app.get('/debug/runtime-marker', (req, res) => {
    if (!adminOk(req, res)) return;
    noCache(res);
    res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, versionFormat: 'CC', clearCore: true, cc2FloatingCta: true, cc3ModerationTree: true, legacyInlineCta: false, keyboardSafeInput: true, entrypoint: 'server-cc3.js -> server-sp4058.js', generatedAt: Date.now(), generatedAtIso: new Date().toISOString() });
  });
  return app;
}

installFinalAppPatch();
const previousLoad = Module._load;
Module._load = function cc3ModuleLoad(request, parent, isMain) {
  const loaded = previousLoad.apply(this, arguments);
  const req = String(request || '');
  try {
    if ((req === './bot' || req.endsWith('/bot') || req.endsWith('bot.js')) && loaded) return patchBot(loaded);
    if (req.includes('services/maxApi') && loaded) return patchMaxApi(loaded);
    if (req === 'express' && loaded && !loaded.__adminkitCc3Express) {
      function wrappedExpress(...args) { return installDebug(loaded(...args)); }
      Object.setPrototypeOf(wrappedExpress, loaded);
      Object.assign(wrappedExpress, loaded);
      wrappedExpress.__adminkitCc3Express = true;
      return wrappedExpress;
    }
  } catch (e) {
    console.warn(`[${RUNTIME}] patch skipped for ${req}:`, e?.message || e);
  }
  return loaded;
};

require('./server-sp4058.js');
process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
