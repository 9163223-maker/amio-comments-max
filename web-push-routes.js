'use strict';

const path = require('path');
const storage = require('./services/webPushStorage');
const pairing = require('./services/pushPairingService');
const dispatch = require('./services/pushDispatchService');

let lastTestResult = null;
let lastSendResult = null;

function clean(value) {
  return String(value || '').trim();
}

function getConfig() {
  const publicKey = clean(process.env.WEB_PUSH_PUBLIC_KEY);
  const privateKey = clean(process.env.WEB_PUSH_PRIVATE_KEY);
  const subject = clean(process.env.WEB_PUSH_SUBJECT || process.env.ADMINKIT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || 'mailto:admin@example.com');
  const adminToken = clean(process.env.PUSH_ADMIN_TOKEN);
  return {
    publicKey,
    privateKeyConfigured: Boolean(privateKey),
    subject,
    adminTokenConfigured: Boolean(adminToken),
    configured: Boolean(publicKey && privateKey && subject),
    privateKey
  };
}

function webPushAvailable() {
  try {
    require.resolve('web-push');
    return true;
  } catch {
    return false;
  }
}

function getWebPush(config) {
  const webPush = require('web-push');
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return webPush;
}

function requireAdminToken(req, res, next) {
  const token = clean(process.env.PUSH_ADMIN_TOKEN);
  if (!token) return res.status(403).json({ ok: false, error: 'push_admin_token_required' });
  const bearer = clean(req.get('authorization')).replace(/^Bearer\s+/i, '').trim();
  const provided = bearer || clean(req.get('x-push-admin-token'));
  if (provided !== token) return res.status(403).json({ ok: false, error: 'invalid_push_admin_token' });
  return next();
}


function getCookie(req, name) {
  const header = clean(req.get('cookie'));
  const prefix = `${name}=`;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return '';
}

function publicBaseUrl(req) {
  const configured = clean(process.env.ADMINKIT_PUBLIC_BASE_URL || process.env.APP_BASE_URL);
  if (configured) return configured.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function safeErrorCode(error, fallback = 'request_failed') {
  return clean(error && (error.code || error.message)).slice(0, 80) || fallback;
}

function isHttpsRequest(req) {
  if (req && req.secure) return true;
  const forwardedProto = clean(req && req.get && req.get('x-forwarded-proto')).toLowerCase();
  if (forwardedProto.split(',').map((item) => item.trim()).includes('https')) return true;
  const forwardedSsl = clean(req && req.get && req.get('x-forwarded-ssl')).toLowerCase();
  if (['on', '1', 'true', 'yes'].includes(forwardedSsl)) return true;
  const forwardedScheme = clean(req && req.get && req.get('x-forwarded-scheme')).toLowerCase();
  if (forwardedScheme.split(',').map((item) => item.trim()).includes('https')) return true;
  const forwardedProtocol = clean(req && req.get && req.get('x-forwarded-protocol')).toLowerCase();
  if (forwardedProtocol.split(',').map((item) => item.trim()).includes('https')) return true;
  return false;
}

function pairingCookieMaxAgeSeconds(expiresAt) {
  const ms = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.floor(ms / 1000));
}

function sendJoinPage(req, res, tokenContext = {}) {
  const file = path.join(__dirname, 'public', 'push.html');
  const fs = require('fs');
  let html = fs.readFileSync(file, 'utf8');
  const joinConfig = tokenContext.joinMode ? {
    joinMode: true,
    tokenCookie: true,
    tokenStatus: tokenContext.tokenStatus || 'valid',
    expiresAt: tokenContext.expiresAt || '',
    tokenId: tokenContext.tokenId || ''
  } : { joinMode: false };
  html = html.replace('</head>', `<script>window.__ADMINKIT_PUSH_JOIN__=${JSON.stringify(joinConfig).replace(/</g, '\\u003c')};</script></head>`);
  res.type('html').send(html);
}

function subscribeMode() {
  const tokenConfigured = Boolean(clean(process.env.PUSH_SUBSCRIBE_TOKEN));
  const publicAllowed = clean(process.env.PUSH_ALLOW_PUBLIC_SUBSCRIBE) === '1';
  return {
    tokenConfigured,
    publicAllowed,
    allowed: tokenConfigured || publicAllowed,
    mode: tokenConfigured ? 'token' : (publicAllowed ? 'public-explicit' : 'closed')
  };
}

function requireSubscribeAccess(req, res, next) {
  const token = clean(process.env.PUSH_SUBSCRIBE_TOKEN);
  if (token) {
    const bearer = clean(req.get('authorization')).replace(/^Bearer\s+/i, '').trim();
    const provided = bearer || clean(req.get('x-push-subscribe-token'));
    if (provided !== token) return res.status(403).json({ ok: false, error: 'invalid_push_subscribe_token', subscribeMode: 'token' });
    return next();
  }
  if (clean(process.env.PUSH_ALLOW_PUBLIC_SUBSCRIBE) === '1') return next();
  return res.status(403).json({
    ok: false,
    error: 'push_subscribe_closed',
    subscribeMode: 'closed',
    hint: 'Set PUSH_SUBSCRIBE_TOKEN or PUSH_ALLOW_PUBLIC_SUBSCRIBE=1 to allow new subscriptions.'
  });
}

function safeNotificationPayload(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    title: clean(source.title).slice(0, 120) || 'АдминКИТ Push',
    body: clean(source.body).slice(0, 500) || 'Тестовое резервное уведомление',
    icon: clean(source.icon).slice(0, 300) || '/public/adminkit_start_logo.png',
    badge: clean(source.badge).slice(0, 300) || '/public/adminkit_chat_logo.png',
    tag: clean(source.tag).slice(0, 120) || (source.important ? 'adminkit-important' : 'adminkit-test'),
    data: {
      url: clean(source.url).slice(0, 500) || '/push',
      important: Boolean(source.important),
      sentAt: new Date().toISOString()
    }
  };
}

async function sendTestToAllAdminOnly(payload) {
  const config = getConfig();
  if (!config.configured) return { ok: false, error: 'web_push_not_configured', configured: false };
  if (!webPushAvailable()) return { ok: false, error: 'web_push_package_missing', configured: true };
  const webPush = getWebPush(config);
  const subscriptions = await storage.listActiveSubscriptions();
  const results = [];
  for (const item of subscriptions) {
    try {
      const response = await webPush.sendNotification(item.subscription, JSON.stringify(payload));
      const result = { id: item.id, ok: true, statusCode: response && response.statusCode };
      results.push(result);
      await storage.markResult(item.id, { ok: true });
    } catch (error) {
      const statusCode = Number(error && error.statusCode) || 0;
      const disable = statusCode === 404 || statusCode === 410;
      const result = { id: item.id, ok: false, statusCode, error: clean(error && error.message).slice(0, 300), disabled: disable };
      results.push(result);
      await storage.markResult(item.id, { ok: false, error: result.error, disable });
    }
  }
  const success = results.filter((item) => item.ok).length;
  const failed = results.length - success;
  return { ok: failed === 0, configured: true, total: results.length, success, failed, results };
}

async function buildStatus(options = {}) {
  const config = getConfig();
  const mode = subscribeMode();
  const base = {
    ok: true,
    webPushConfigured: config.configured,
    publicKeyAvailable: Boolean(config.publicKey),
    publicKey: config.publicKey,
    pushSupported: {
      webPushPackageAvailable: webPushAvailable(),
      vapidSubjectConfigured: Boolean(config.subject),
      subscribeAllowed: mode.allowed,
      subscribeRequiresToken: mode.tokenConfigured,
      subscribeMode: mode.mode,
      adminTokenConfigured: config.adminTokenConfigured
    }
  };
  if (!options.admin) return base;
  const count = await storage.countSubscriptions();
  const storageInfo = storage.info();
  return {
    ...base,
    privateKeyConfigured: config.privateKeyConfigured,
    storedSubscriptionsCount: count,
    storage: { backend: storageInfo.backend, persistent: storageInfo.persistent },
    lastTestResult,
    lastSendResult
  };
}

function install(app) {
  app.get('/push', (req, res) => {
    sendJoinPage(req, res, { joinMode: false });
  });

  app.get('/push/join', (req, res) => {
    const token = clean(req.query && req.query.t);
    try {
      const verified = pairing.verifyPairingToken(token);
      const maxAge = pairingCookieMaxAgeSeconds(verified.expiresAt);
      const cookie = `push_pairing_token=${encodeURIComponent(token)}; Path=/api/push/pair; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
      res.set('Set-Cookie', isHttpsRequest(req) ? `${cookie}; Secure` : cookie);
      return sendJoinPage(req, res, { joinMode: true, tokenStatus: 'valid', expiresAt: verified.expiresAt, tokenId: verified.nonceHash });
    } catch (error) {
      return res.status(400).send(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>АдминКИТ Push</title></head><body><main><h1>АдминКИТ Push</h1><p>Ссылка подключения недействительна или истекла.</p><p>Код: ${safeErrorCode(error, 'invalid_push_pairing_token')}</p></main></body></html>`);
    }
  });

  app.get('/push/manifest.json', (req, res) => {
    res.json({
      name: 'АдминКИТ Push',
      short_name: 'AdminKIT Push',
      id: '/push',
      display: 'standalone',
      start_url: '/push',
      scope: '/push/',
      theme_color: '#111827',
      background_color: '#f8fafc',
      icons: [
        { src: '/public/adminkit_start_logo.png', sizes: '192x192', type: 'image/png' },
        { src: '/public/adminkit_chat_logo.png', sizes: '512x512', type: 'image/png' }
      ]
    });
  });

  app.get('/push/sw.js', (req, res) => {
    res.type('application/javascript').sendFile(path.join(__dirname, 'public', 'push-sw.js'));
  });

  app.get('/api/push/status', async (req, res) => {
    res.json(await buildStatus());
  });

  app.get('/internal/push/status', requireAdminToken, async (req, res) => {
    res.json(await buildStatus({ admin: true }));
  });

  app.post('/api/push/subscribe', requireSubscribeAccess, async (req, res) => {
    const config = getConfig();
    if (!config.configured) return res.status(503).json({ ok: false, error: 'web_push_not_configured' });
    try {
      const saved = await storage.saveSubscription(req.body && req.body.subscription ? req.body.subscription : req.body, { userAgent: req.get('user-agent') });
      return res.json({ ok: true, id: saved.id.slice(0, 16), backend: saved.backend });
    } catch (error) {
      return res.status(400).json({ ok: false, error: clean(error && (error.code || error.message)) || 'subscribe_failed' });
    }
  });

  app.post('/api/push/pair', async (req, res) => {
    const config = getConfig();
    if (!config.configured) return res.status(503).json({ ok: false, error: 'web_push_not_configured' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const token = clean(body.pairingToken) || getCookie(req, 'push_pairing_token');
    if (!token) return res.status(403).json({ ok: false, error: 'push_pairing_token_required' });
    try {
      const verified = pairing.consumePairingToken(token);
      const subscription = body.subscription || body;
      const saved = await storage.savePairedDevice(subscription, {
        maxUserId: verified.maxUserId,
        chatId: verified.chatId,
        channelId: verified.channelId,
        userAgent: req.get('user-agent'),
        status: 'pending'
      });
      return res.json({ ok: true, status: saved.status, deviceId: saved.deviceId.slice(0, 16), endpointHash: saved.endpointHash.slice(0, 16), confirmationRequired: true, confirmationAvailable: false, limitation: 'max_confirmation_callback_not_wired_in_pr144' });
    } catch (error) {
      return res.status(400).json({ ok: false, error: safeErrorCode(error, 'push_pair_failed') });
    }
  });

  app.post('/internal/push/device/activate', requireAdminToken, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await storage.markDeviceActive(body.deviceId, { maxUserId: body.maxUserId, chatId: body.chatId });
    return res.status(result.ok ? 200 : 404).json(result.ok ? { ok: true, status: 'active' } : { ok: false, error: 'push_device_not_found' });
  });

  app.post('/internal/push/invite', requireAdminToken, async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const token = pairing.createPairingToken({ maxUserId: body.maxUserId, chatId: body.chatId, channelId: body.channelId, issuedByAdminId: body.issuedByAdminId || 'internal', ttlMinutes: body.ttlMinutes });
      const verified = pairing.verifyPairingToken(token, { allowUsed: true });
      return res.json({ ok: true, joinUrl: `${publicBaseUrl(req)}/push/join?t=${encodeURIComponent(token)}`, expiresAt: verified.expiresAt, tokenId: verified.nonceHash });
    } catch (error) {
      return res.status(400).json({ ok: false, error: safeErrorCode(error, 'push_invite_failed') });
    }
  });

  app.post('/internal/push/invite-chat', requireAdminToken, async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const userIds = Array.isArray(body.userIds) ? body.userIds.map(clean).filter(Boolean) : [];
      if (!userIds.length) return res.status(400).json({ ok: false, error: 'member_registry_not_available', hint: 'Provide explicit userIds; reliable chat member discovery is not available in this PR.' });
      const invites = userIds.map((maxUserId) => {
        const token = pairing.createPairingToken({ maxUserId, chatId: body.chatId, channelId: body.channelId, issuedByAdminId: body.issuedByAdminId || 'internal', ttlMinutes: body.ttlMinutes });
        const verified = pairing.verifyPairingToken(token, { allowUsed: true });
        return { ok: true, joinUrl: `${publicBaseUrl(req)}/push/join?t=${encodeURIComponent(token)}`, expiresAt: verified.expiresAt, tokenId: verified.nonceHash };
      });
      return res.json({ ok: true, chatIdHash: require('crypto').createHash('sha256').update(clean(body.chatId)).digest('hex').slice(0, 12), invites });
    } catch (error) {
      return res.status(400).json({ ok: false, error: safeErrorCode(error, 'push_invite_chat_failed') });
    }
  });

  app.post('/internal/push/targeted', requireAdminToken, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await dispatch.sendPushToUser({ maxUserId: body.maxUserId, chatId: body.chatId, payload: body.payload });
    res.status(result.ok ? 200 : 503).json(result);
  });

  app.post('/api/push/test', requireAdminToken, async (req, res) => {
    const payload = safeNotificationPayload({
      title: 'АдминКИТ Push: тест',
      body: 'Тестовое резервное уведомление доставлено.',
      url: '/push',
      tag: 'adminkit-push-test',
      ...(req.body || {})
    });
    const result = await sendTestToAllAdminOnly(payload);
    lastTestResult = { ...result, at: new Date().toISOString(), results: undefined };
    res.status(result.ok ? 200 : 503).json(result);
  });

  app.post('/internal/push/send', requireAdminToken, async (req, res) => {
    const payload = safeNotificationPayload(req.body || {});
    const result = await sendTestToAllAdminOnly(payload);
    lastSendResult = { ...result, at: new Date().toISOString(), results: undefined };
    res.status(result.ok ? 200 : 503).json(result);
  });

  return { ok: true, routes: ['/push', '/push/join', '/push/manifest.json', '/push/sw.js', '/api/push/status', '/internal/push/status', '/api/push/subscribe', '/api/push/pair', '/api/push/test', '/internal/push/send', '/internal/push/invite', '/internal/push/invite-chat', '/internal/push/targeted'] };
}

module.exports = {
  install,
  getConfig,
  buildStatus,
  sendToAll: sendTestToAllAdminOnly,
  sendTestToAllAdminOnly,
  isHttpsRequest
};
