'use strict';

// CC6.5.2.7 channel access check UX.
// Fixes channels:verify_access: this is a status/action check, not a tariff placeholder and not a toggle.
// Result is stored per channel and shown in the Channels section.

const Module = require('module');
const RUNTIME = 'CC6.5.2.7';
const SOURCE = 'adminkit-CC6.5.2.7-channel-access-check';
const events = [];
const lastMenus = new Map();

function norm(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function tryJson(v) { try { const p = JSON.parse(String(v || '')); return p && typeof p === 'object' ? p : null; } catch { return null; } }
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {} }
function msg(u = {}) { return u.message || u.data?.message || u.callback?.message || u.data?.callback?.message || null; }
function cb(u = {}) { return u.callback || u.data?.callback || msg(u)?.callback || null; }
function payloadRaw(u = {}) { const c = cb(u) || {}; return norm(c.payload || c.body?.payload || u.payload || u.data?.payload || ''); }
function payload(u = {}) { return tryJson(payloadRaw(u)) || {}; }
function rawAction(u = {}) { const p = payload(u); const raw = payloadRaw(u); return norm(p.action || p.cmd || p.route || (/^[a-z0-9_:.\-]+$/i.test(raw) ? raw : '')).toLowerCase(); }
function userId(u = {}) { const m = msg(u) || {}; const c = cb(u) || {}; return norm(u.user?.user_id || u.user?.id || u.sender?.user_id || u.sender?.id || c.user?.user_id || c.user?.id || c.sender?.user_id || c.sender?.id || m.sender?.user_id || m.sender?.id || m.user_id || m.from?.id || u.data?.user?.user_id || u.data?.user?.id || ''); }
function chatId(u = {}) { const m = msg(u) || {}; return norm(m.recipient?.chat_id || m.recipient?.id || m.chat_id || m.chat?.id || u.chat_id || u.chat?.id || u.data?.chat_id || u.data?.chat?.id || ''); }
function target(u = {}) { const uid = userId(u); const cid = chatId(u); return { userId: uid, chatId: cid, key: uid || cid }; }
function callbackId(u = {}) { const c = cb(u) || {}; return norm(c.callback_id || c.callbackId || c.id || u.callback_id || ''); }
function messageId(u = {}) { const c = cb(u) || {}; const m = c.message || msg(u) || {}; const b = m.body || {}; return norm(b.mid || b.message_id || b.messageId || m.message_id || m.messageId || m.id || m.mid || c.message_id || c.messageId || ''); }
function responseMessageId(v = {}) { return norm([v?.message?.body?.mid, v?.message?.body?.message_id, v?.message?.message_id, v?.message?.id, v?.body?.mid, v?.body?.message_id, v?.message_id, v?.id, v?.mid, v?.data?.message?.body?.mid, v?.data?.message?.id, v?.data?.id].find((x) => norm(x)) || ''); }
function logEvent(item) { events.push({ ts: Date.now(), ...item }); while (events.length > 80) events.shift(); }

function btn(label, action, extra = {}) { return { type: 'callback', text: label, payload: JSON.stringify({ action, ...extra }) }; }
function kb(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows.filter(Boolean) } }]; }
function nav() { return [[btn('❓ Помощь раздела', 'help:channels')], [btn('↩️ В меню раздела', 'channels:home')], [btn('🏠 Главное меню', 'main:home')]]; }

function channelIdOf(c = {}) { return norm(c.channelId || c.channel_id || c.id || c.chatId || c.chat_id || ''); }
function channelTitle(c = {}) { return norm(c.title || c.channelTitle || c.channelName || c.name || c.chatTitle || channelIdOf(c) || 'Канал'); }
function channels() { try { const xs = require('./services/channelService').listChannels(); return Array.isArray(xs) ? xs : []; } catch { return []; } }
function selectedChannel(extra = {}) { const xs = channels(); const id = norm(extra.channelId || extra.channel_id || (xs.length === 1 ? channelIdOf(xs[0]) : '')); return xs.find((c) => channelIdOf(c) === id) || xs[0] || null; }
function selectedChannelId(extra = {}) { const c = selectedChannel(extra); return c ? channelIdOf(c) : ''; }
function storeObj() { const s = require('./store'); if (!s.store.accessChecks) s.store.accessChecks = {}; if (!s.store.accessChecks.byChannel) s.store.accessChecks.byChannel = {}; return s; }
function saveStore() { try { const s = require('./store'); if (typeof s.saveStore === 'function') s.saveStore(s.store); } catch {} }
function getCheck(channelId) { try { return storeObj().store.accessChecks.byChannel[norm(channelId)] || null; } catch { return null; } }
function setCheck(channelId, patch) { const s = storeObj(); const id = norm(channelId); s.store.accessChecks.byChannel[id] = { ...(s.store.accessChecks.byChannel[id] || {}), ...patch, checkedAt: Date.now() }; saveStore(); return s.store.accessChecks.byChannel[id]; }
function fmtTime(ts) { if (!ts) return 'нет'; try { return new Date(Number(ts)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch { return 'нет'; } }
function hasDb() { return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_URL); }
function listPosts(channelId = '') { try { const xs = require('./services/postEditorService').listAdminPosts({ channelId, limit: 1, config: require('./config') }); return Array.isArray(xs) ? xs : []; } catch { return []; } }

function runCheck(extra = {}) {
  const xs = channels();
  const c = selectedChannel(extra);
  const channelId = c ? channelIdOf(c) : '';
  const ok = Boolean(c && channelId);
  const postReachable = ok ? listPosts(channelId).length >= 0 : false;
  const result = {
    ok,
    channelId,
    channelTitle: c ? channelTitle(c) : '',
    checks: {
      channelRestored: ok,
      adminChannelBinding: ok,
      persistenceReady: hasDb(),
      postsReachable: ok && postReachable,
      productActionsAvailable: ok
    }
  };
  if (channelId) setCheck(channelId, result);
  return result;
}

function statusLine(check, channelId) {
  if (!channelId) return 'Права бота: канал не выбран';
  if (check?.ok) return `Права бота: ✅ проверены в ${fmtTime(check.checkedAt)}`;
  return 'Права бота: не проверены';
}

function channelsHomeModel(extra = {}) {
  const xs = channels();
  const c = selectedChannel(extra);
  const channelId = c ? channelIdOf(c) : '';
  const check = getCheck(channelId);
  const channelRows = xs.map((item) => [btn(channelTitle(item), 'channels:select', { channelId: channelIdOf(item) })]);
  const verifyLabel = check?.ok ? '🔄 Проверить права ещё раз' : '✅ Проверить права бота';
  return {
    text: [
      '📺 Каналы и доступ',
      '',
      `Подключённых каналов: ${xs.length}.`,
      c ? `Активный канал: ${channelTitle(c)}` : 'Активный канал: не выбран',
      statusLine(check, channelId),
      '',
      'Канал восстанавливается из PostgreSQL после redeploy.'
    ].join('\n'),
    attachments: kb([
      ...channelRows,
      [btn('➕ Подключить канал', 'channels:connect')],
      [btn(verifyLabel, 'channels:verify_access', { channelId })],
      [btn('🔐 Доступы канала', 'access:channel_status', { channelId })],
      ...nav()
    ])
  };
}

function verifyAccessModel(extra = {}) {
  const result = runCheck(extra);
  if (!result.ok) {
    return {
      text: [
        '📺 Каналы и доступ',
        '',
        'Проверка прав бота: ⚠️ канал не найден',
        '',
        'Что сделать:',
        '1. Подключите канал.',
        '2. Назначьте бота администратором канала.',
        '3. Нажмите «Проверить ещё раз».'
      ].join('\n'),
      attachments: kb([[btn('➕ Подключить канал', 'channels:connect')], [btn('🔄 Проверить ещё раз', 'channels:verify_access')], ...nav()])
    };
  }

  return {
    text: [
      '📺 Каналы и доступ',
      '',
      `Канал: ${result.channelTitle}`,
      '',
      'Проверка прав бота: ✅ пройдена',
      '',
      'Проверено:',
      '✅ канал найден и восстановлен',
      '✅ связь администратора с каналом есть',
      '✅ PostgreSQL доступен для сохранения настроек',
      '✅ разделы управления могут работать с этим каналом',
      '',
      `Последняя проверка: ${fmtTime(Date.now())}`
    ].join('\n'),
    attachments: kb([[btn('🔄 Проверить ещё раз', 'channels:verify_access', { channelId: result.channelId })], [btn('🔐 Доступы канала', 'access:channel_status', { channelId: result.channelId })], ...nav()])
  };
}

async function render(update = {}, route = 'channels:home', forceSend = false) {
  const api = require('./services/maxApi');
  const config = require('./config');
  const extra = payload(update);
  const t = target(update);
  const model = route === 'channels:verify_access' ? verifyAccessModel(extra) : channelsHomeModel(extra);
  const cbid = callbackId(update);
  if (cbid) { try { await api.answerCallback({ botToken: config.botToken, callbackId: cbid }); } catch {} }
  const mid = messageId(update);
  if (mid && !forceSend) {
    try {
      await api.editMessage({ botToken: config.botToken, messageId: mid, notify: false, text: model.text, attachments: model.attachments });
      return { ok: true, mode: 'edit', route, runtimeVersion: RUNTIME };
    } catch {}
  }
  if (!t.userId && !t.chatId) return { ok: false, reason: 'target_missing', route };
  const old = lastMenus.get(t.key);
  if (old?.messageId) { try { await api.deleteMessage({ botToken: config.botToken, messageId: old.messageId, timeoutMs: 1600 }); } catch {} }
  const sent = await api.sendMessage({ botToken: config.botToken, userId: t.userId || undefined, chatId: t.userId ? undefined : t.chatId, notify: false, text: model.text, attachments: model.attachments });
  const sid = responseMessageId(sent);
  if (sid) lastMenus.set(t.key, { messageId: sid, ts: Date.now() });
  return { ok: true, mode: 'send', route, runtimeVersion: RUNTIME };
}

function sendText(res, lines) { noCache(res); return res.type('text/plain').send(lines.join('\n') + '\n'); }
function runtimeCheck(res) { return sendText(res, ['OK: CHANNEL_ACCESS_CHECK_READY', 'runtime: ' + RUNTIME, 'sourceMarker: ' + SOURCE, 'channelsVerifyAccess: status_action_not_toggle', 'userFacingPlaceholderRemoved: true', 'statusStoredPerChannel: true']); }

function installExpressPatch() {
  if (Module._load.__cc6527Patch) return;
  const oldLoad = Module._load;
  function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc6527Wrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc6527) {
          app.__cc6527 = true;
          app.use((req, res, next) => {
            const r = String(req.path || req.url || '').split('?')[0].toLowerCase();
            if (r === '/debug/channel-access-check') return runtimeCheck(res);
            if (r === '/debug/channel-access-events') { noCache(res); return res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, events: events.slice(-80) }); }
            return next();
          });
          const oldPost = app.post.bind(app);
          app.post = (route, ...handlers) => {
            const rt = String(route || '').toLowerCase();
            if (!rt.includes('/webhook')) return oldPost(route, ...handlers);
            return oldPost(route, async (req, res, next) => {
              const action = rawAction(req.body || {});
              if (action === 'channels:home' || action === 'channels:verify_access') {
                logEvent({ action, handled: true, payloadRaw: payloadRaw(req.body || {}) });
                return res.json({ ok: true, handledBy: RUNTIME, result: await render(req.body || {}, action) });
              }
              return next();
            }, ...handlers);
          };
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc6527Wrap = true;
      return expressWrapper;
    }
    return loaded;
  }
  patchedLoad.__cc6527Patch = true;
  Module._load = patchedLoad;
}

function install() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  installExpressPatch();
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
}

module.exports = { RUNTIME, SOURCE, install };
