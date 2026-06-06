'use strict';

const path = require('path');
const storage = require('./services/webPushStorage');

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

async function sendToAll(payload) {
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
    res.sendFile(path.join(__dirname, 'public', 'push.html'));
  });

  app.get('/push/manifest.json', (req, res) => {
    res.json({
      name: 'АдминКИТ Push',
      short_name: 'AdminKIT Push',
      display: 'standalone',
      start_url: '/push',
      scope: '/',
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

  app.post('/api/push/test', requireAdminToken, async (req, res) => {
    const payload = safeNotificationPayload({
      title: 'АдминКИТ Push: тест',
      body: 'Тестовое резервное уведомление доставлено.',
      url: '/push',
      tag: 'adminkit-push-test',
      ...(req.body || {})
    });
    const result = await sendToAll(payload);
    lastTestResult = { ...result, at: new Date().toISOString(), results: undefined };
    res.status(result.ok ? 200 : 503).json(result);
  });

  app.post('/internal/push/send', requireAdminToken, async (req, res) => {
    const payload = safeNotificationPayload(req.body || {});
    const result = await sendToAll(payload);
    lastSendResult = { ...result, at: new Date().toISOString(), results: undefined };
    res.status(result.ok ? 200 : 503).json(result);
  });

  return { ok: true, routes: ['/push', '/push/manifest.json', '/push/sw.js', '/api/push/status', '/internal/push/status', '/api/push/subscribe', '/api/push/test', '/internal/push/send'] };
}

module.exports = {
  install,
  getConfig,
  buildStatus,
  sendToAll
};
