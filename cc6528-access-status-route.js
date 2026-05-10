'use strict';

// CC6.5.2.8 access status route.
// Fixes access:channel_status falling through to legacy moderation router.
// Access routes belong to the Channels section and must never be handled by moderation.

const Module = require('module');
const RUNTIME = 'CC6.5.2.8';
const SOURCE = 'adminkit-CC6.5.2.8-access-status-route';
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
function storeObj() { const s = require('./store'); if (!s.store.accessChecks) s.store.accessChecks = {}; if (!s.store.accessChecks.byChannel) s.store.accessChecks.byChannel = {}; if (!s.store.entitlements) s.store.entitlements = {}; if (!s.store.entitlements.byChannel) s.store.entitlements.byChannel = {}; return s; }
function getCheck(channelId) { try { return storeObj().store.accessChecks.byChannel[norm(channelId)] || null; } catch { return null; } }
function getEntitlement(channelId) { try { return storeObj().store.entitlements.byChannel[norm(channelId)] || null; } catch { return null; } }
function fmtTime(ts) { if (!ts) return 'нет'; try { return new Date(Number(ts)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch { return 'нет'; } }

function accessStatusModel(extra = {}) {
  const c = selectedChannel(extra);
  const channelId = c ? channelIdOf(c) : '';
  const title = c ? channelTitle(c) : 'не выбран';
  const check = getCheck(channelId);
  const entitlement = getEntitlement(channelId) || { tariff: 'Pro test', status: 'active', source: 'product_test' };

  if (!channelId) {
    return {
      text: [
        '📺 Каналы и доступ',
        '',
        'Доступы канала: ⚠️ канал не выбран',
        '',
        'Сначала подключите или выберите канал.'
      ].join('\n'),
      attachments: kb([[btn('➕ Подключить канал', 'channels:connect')], ...nav()])
    };
  }

  return {
    text: [
      '📺 Каналы и доступ',
      '',
      `Канал: ${title}`,
      '',
      'Доступ к продукту: ✅ активен',
      `Тариф: ${entitlement.tariff || 'Pro test'}`,
      `Статус: ${entitlement.status || 'active'}`,
      '',
      `Права бота: ${check?.ok ? '✅ проверены в ' + fmtTime(check.checkedAt) : 'не проверены'}`,
      '',
      'Доступные разделы в тесте Pro:',
      '✅ комментарии',
      '✅ модерация',
      '✅ редактор постов',
      '✅ кнопки под постами',
      '✅ подарки / лид-магниты',
      '✅ баннер в обсуждениях',
      '✅ фото в комментариях',
      '✅ статистика',
      '',
      'Этот экран принадлежит разделу «Каналы и доступ» и не должен открывать модерацию.'
    ].join('\n'),
    attachments: kb([[btn('🔄 Проверить права бота', 'channels:verify_access', { channelId })], [btn('🧾 Покупка и тарифы', 'billing:home', { channelId })], ...nav()])
  };
}

async function render(update = {}, route = 'access:channel_status', forceSend = false) {
  const api = require('./services/maxApi');
  const config = require('./config');
  const extra = payload(update);
  const t = target(update);
  const model = accessStatusModel(extra);
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
function runtimeCheck(res) { return sendText(res, ['OK: ACCESS_STATUS_ROUTE_READY', 'runtime: ' + RUNTIME, 'sourceMarker: ' + SOURCE, 'accessChannelStatusOwner: channels', 'moderationLeakFixed: true', 'routeIntercepted: access:channel_status']); }

function installExpressPatch() {
  if (Module._load.__cc6528Patch) return;
  const oldLoad = Module._load;
  function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc6528Wrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc6528) {
          app.__cc6528 = true;
          app.use((req, res, next) => {
            const r = String(req.path || req.url || '').split('?')[0].toLowerCase();
            if (r === '/debug/access-status-route') return runtimeCheck(res);
            if (r === '/debug/access-status-events') { noCache(res); return res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, events: events.slice(-80) }); }
            return next();
          });
          const oldPost = app.post.bind(app);
          app.post = (route, ...handlers) => {
            const rt = String(route || '').toLowerCase();
            if (!rt.includes('/webhook')) return oldPost(route, ...handlers);
            return oldPost(route, async (req, res, next) => {
              const action = rawAction(req.body || {});
              if (action === 'access:channel_status' || action === 'channels:access_status') {
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
      expressWrapper.__cc6528Wrap = true;
      return expressWrapper;
    }
    return loaded;
  }
  patchedLoad.__cc6528Patch = true;
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
