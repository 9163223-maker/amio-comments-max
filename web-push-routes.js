'use strict';

const path = require('path');
const storage = require('./services/webPushStorage');
const pairing = require('./services/pushPairingService');
const dispatch = require('./services/pushDispatchService');
const confirmation = require('./services/pushConfirmationService');
const pushPairingLog = require('./services/pushPairingLogService');
const groupPush = require('./services/groupPushOnboardingService');
const { sendMessage } = require('./services/maxApi');

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


const MAX_API_BASE_URL = 'https://platform-api.max.ru';

function getMaxBotToken() {
  return clean(process.env.BOT_TOKEN || process.env.MAX_BOT_TOKEN);
}

function safePageCount(value) {
  const parsed = Number.parseInt(clean(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(parsed, 100);
}

function safeMarker(value) {
  return clean(value).slice(0, 300);
}

function isSafeChatId(value) {
  return /^[A-Za-z0-9_.:@-]{1,200}$/.test(clean(value));
}

function firstValue(source, keys) {
  if (!source || typeof source !== 'object') return '';
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return '';
}

function normalizeMaxList(data, keys) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

function normalizeMarker(data) {
  return clean(data && typeof data === 'object' && (data.marker || data.next_marker || data.nextMarker)).slice(0, 300) || undefined;
}

function sanitizePermissionNames(value) {
  const list = Array.isArray(value) ? value : (value && typeof value === 'object' ? Object.keys(value).filter((key) => value[key]) : []);
  return list.map(clean).filter((item) => /^[A-Za-z0-9_.:-]{1,80}$/.test(item)).slice(0, 60);
}

function sanitizeChat(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const chat = source.chat && typeof source.chat === 'object' ? source.chat : source;
  const rawKind = clean(firstValue(chat, ['type', 'kind', 'chat_type', 'chatType'])).slice(0, 60);
  const loweredKind = rawKind.toLowerCase();
  return {
    chatId: clean(firstValue(chat, ['chat_id', 'chatId', 'id'])).slice(0, 200),
    title: clean(firstValue(chat, ['title', 'name', 'chat_title'])).slice(0, 160),
    type: rawKind,
    status: clean(firstValue(chat, ['status', 'membership_status', 'membershipStatus'])).slice(0, 80),
    participantsCount: Number(firstValue(chat, ['participants_count', 'participantsCount', 'members_count', 'membersCount'])) || undefined,
    isChannel: Boolean(chat.is_channel || chat.isChannel || loweredKind.includes('channel')),
    isGroup: Boolean(chat.is_group || chat.isGroup || loweredKind.includes('group') || loweredKind.includes('chat')),
    rawKind
  };
}

function sanitizeMember(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const user = source.user && typeof source.user === 'object' ? source.user : source;
  const role = clean(firstValue(source, ['role', 'member_role', 'memberRole'])).toLowerCase();
  return {
    userId: clean(firstValue(user, ['user_id', 'userId', 'id'])).slice(0, 200),
    name: clean(firstValue(user, ['name', 'display_name', 'displayName', 'first_name', 'firstName'])).slice(0, 160),
    username: clean(firstValue(user, ['username', 'login', 'handle'])).slice(0, 120),
    link: clean(firstValue(user, ['link', 'url', 'profile_link', 'profileLink'])).slice(0, 300),
    isAdmin: Boolean(source.is_admin || source.isAdmin || user.is_admin || user.isAdmin || role === 'admin' || role === 'administrator' || role === 'owner'),
    isOwner: Boolean(source.is_owner || source.isOwner || user.is_owner || user.isOwner || role === 'owner'),
    isBot: Boolean(user.is_bot || user.isBot || source.is_bot || source.isBot),
    lastActivityTime: clean(firstValue(source, ['last_activity_time', 'lastActivityTime', 'last_activity_at', 'lastActivityAt'])).slice(0, 80) || undefined,
    permissions: sanitizePermissionNames(source.permissions || source.permission_names || source.permissionNames)
  };
}

async function callMaxApiSafe(pathname, query, botToken) {
  const url = new URL(`${MAX_API_BASE_URL}${pathname}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { method: 'GET', headers: { Authorization: botToken } });
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error('max_api_request_failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data || {};
}

function sendSafeMaxError(res, error, fallback) {
  const status = Number(error && error.status) || 500;
  let code = fallback || 'max_api_request_failed';
  if (status === 401 || status === 403) code = fallback === 'max_bot_not_chat_admin_or_no_access' ? fallback : 'max_api_forbidden_or_unauthorized';
  return res.status(status === 401 || status === 403 ? 403 : 502).json({ ok: false, error: code, statusCode: status || undefined });
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
  const configured = clean(process.env.PUBLIC_BASE_URL || process.env.ADMINKIT_PUBLIC_BASE_URL || process.env.APP_BASE_URL);
  if (configured) return configured.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function safeErrorCode(error, fallback = 'request_failed') {
  return clean(error && (error.code || error.message)).slice(0, 80) || fallback;
}

function extractPushSubscriptionFromBody(body) {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    if (body.subscription && typeof body.subscription === 'object' && !Array.isArray(body.subscription)) {
      return { subscription: body.subscription, source: 'nested' };
    }
    if (body.endpoint || body.keys) {
      return { subscription: body, source: 'direct' };
    }
  }
  return { subscription: undefined, source: 'missing' };
}

function requestBodyType(body) {
  if (body === null || body === undefined) return 'null';
  if (Array.isArray(body)) return 'array';
  return typeof body;
}

function safePushRequestShape(body, extractionSource) {
  return {
    bodyType: requestBodyType(body),
    hasNestedSubscription: Boolean(body && typeof body === 'object' && !Array.isArray(body) && Object.prototype.hasOwnProperty.call(body, 'subscription')),
    extractionSource: extractionSource || 'missing'
  };
}

function invalidSubscriptionResponse(error, subscriptionCandidate, fallback = 'subscribe_failed', requestShape) {
  const code = safeErrorCode(error, fallback);
  const body = { ok: false, error: code };
  if (code === 'invalid_push_subscription') {
    body.subscriptionShape = storage.subscriptionShape(subscriptionCandidate);
    if (requestShape) body.requestShape = requestShape;
  }
  return body;
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

function stripMarkedHtml(html, marker) {
  const pattern = new RegExp(`\\s*<!-- ${marker}-start -->[\\s\\S]*?<!-- ${marker}-end -->`, 'g');
  return html.replace(pattern, '');
}

function pushManifestHref(token) {
  const safeToken = clean(token);
  return safeToken ? `/push/manifest/${encodeURIComponent(safeToken)}.json` : '/push/manifest.json';
}

function pairingTokenFromRequest(req) {
  return clean(req && req.params && req.params.token) || clean(req && req.query && req.query.t);
}

function pairingOpenedAs(req) {
  return clean(req && req.query && req.query.source) === 'manifest-start-url' ? 'standalone-pwa' : 'safari';
}

function recordPushPairingEvent(event) {
  pushPairingLog.record(event).catch(() => undefined);
}


function safeChatTitle(value) { return clean(value).slice(0, 120); }
function safePublicChatItem(value) {
  const source = value && typeof value === 'object' ? value : {};
  const title = safeChatTitle(source.chatTitle || source.title);
  const chatId = clean(source.chatId).replace(/[^A-Za-z0-9_.:@-]/g, '').slice(0, 80);
  if (!title && !chatId) return null;
  return { chatId, title: title || 'Чат MAX', status: 'Уведомления включены' };
}
function safePublicChats(value) { return Array.isArray(value) ? value.map(safePublicChatItem).filter(Boolean).slice(0, 20) : []; }

function sendPushPage(req, res, options = {}) {
  const file = path.join(__dirname, 'public', 'push.html');
  const fs = require('fs');
  let html = fs.readFileSync(file, 'utf8');
  const mode = options.mode === 'admin' ? 'admin' : 'client';
  const joinConfig = options.joinMode ? {
    joinMode: true,
    tokenCookie: true,
    tokenStatus: options.tokenStatus || 'valid',
    token: options.linkChatMode || options.tokenStatus === 'used' ? '' : clean(options.token),
    relaunchMode: options.tokenStatus === 'used',
    adminMode: false,
    chatLinkMode: Boolean(options.linkChatMode),
    existingActiveDevicesFound: Boolean(options.existingActiveDevicesFound),
    chatTitle: safeChatTitle(options.chatTitle)
  } : { joinMode: false, landingMode: mode === 'client', adminMode: mode === 'admin' };
  if (mode === 'admin') {
    html = html
      .replace('<link rel="manifest" href="/push/manifest.json">', '<link rel="manifest" href="/public/push-admin-manifest.json">')
      .replace('<meta name="apple-mobile-web-app-title" content="АдминКИТ Push">', '<meta name="apple-mobile-web-app-title" content="Push Admin">')
      .replace('<title>АдминКИТ Push</title>', '<title>АдминКИТ Push Admin</title>');
  } else {
    const manifestHref = options.linkChatMode ? pushManifestHref('') : pushManifestHref(options.token);
    html = html.replace('<link rel="manifest" href="/push/manifest.json">', `<link rel="manifest" href="${manifestHref}">`);
    html = stripMarkedHtml(html, 'admin-diagnostics');
    html = stripMarkedHtml(html, 'raw-diagnostics');
  }
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
    icon: clean(source.icon).slice(0, 300) || '/public/adminkit-push-icon-192.png',
    badge: clean(source.badge).slice(0, 300) || '/public/favicon-32.png',
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
    recordPushPairingEvent({ event: 'push_opened', route: '/push', result: 'binding_missing', tokenSource: 'missing', hasPairingToken: false, hasPairingCookie: Boolean(getCookie(req, 'push_pairing_token')), openedAs: 'unknown' });
    sendPushPage(req, res, { mode: 'client', joinMode: false });
  });

  app.get('/push/admin', (req, res) => {
    sendPushPage(req, res, { mode: 'admin', joinMode: false });
  });

  async function handlePushJoin(req, res) {
    const token = pairingTokenFromRequest(req);
    const fromManifest = clean(req.query && req.query.source) === 'manifest-start-url';
    recordPushPairingEvent({ event: fromManifest ? 'pwa_opened' : 'link_opened', pairingToken: token, route: '/push/join', result: fromManifest ? 'pwa_opened' : 'link_opened', tokenSource: fromManifest ? 'manifest-start-url' : 'query', hasPairingToken: Boolean(token), hasPairingCookie: Boolean(getCookie(req, 'push_pairing_token')), openedAs: pairingOpenedAs(req) });
    try {
      const verified = pairing.verifyPairingToken(token);
      const maxAge = pairingCookieMaxAgeSeconds(verified.expiresAt);
      const cookie = `push_pairing_token=${encodeURIComponent(token)}; Path=/api/push; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
      res.set('Set-Cookie', isHttpsRequest(req) ? `${cookie}; Secure` : cookie);
      const activeDevices = await storage.listActiveDevicesForUser(verified.maxUserId);
      const existingActiveDevicesFound = activeDevices.length > 0;
      return sendPushPage(req, res, {
        mode: 'client',
        joinMode: true,
        tokenStatus: 'valid',
        token,
        linkChatMode: existingActiveDevicesFound,
        existingActiveDevicesFound,
        chatTitle: verified.chatTitle
      });
    } catch (error) {
      const code = safeErrorCode(error, 'invalid_push_pairing_token');
      if (code === 'push_pairing_token_used') {
        return sendPushPage(req, res, { mode: 'client', joinMode: true, tokenStatus: 'used', token });
      }
      return res.status(400).send(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="apple-touch-icon" sizes="180x180" href="/public/adminkit-push-icon-192.png?v=pr167"><title>АдминКИТ Push</title></head><body><main><h1>АдминКИТ Push</h1><p>Ссылка истекла. Вернитесь в MAX и отправьте /push ещё раз.</p><p>Подключённые чаты появятся здесь после включения уведомлений.</p></main></body></html>`);
    }
  }
  app.get('/push/join', handlePushJoin);
  app.get('/push/join/:token', handlePushJoin);

  function sendPushManifest(req, res) {
    const token = pairingTokenFromRequest(req).replace(/\.json$/i, '');
    const flowId = pushPairingLog.hash(token);
    const startUrl = token ? `/push/join/${encodeURIComponent(token)}?source=manifest-start-url` : '/push';
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json({
      name: 'АдминКИТ Push',
      short_name: 'AdminKIT Push',
      id: token ? `/push/install/${flowId}` : '/push',
      display: 'standalone',
      start_url: startUrl,
      scope: '/push/',
      theme_color: '#111827',
      background_color: '#f8fafc',
      icons: [
        { src: '/public/adminkit-push-icon-192.png?v=pr167', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/public/adminkit-push-icon-512.png?v=pr167', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    });
  }
  app.get('/push/manifest.json', sendPushManifest);
  app.get('/push/manifest/:token', sendPushManifest);

  app.get('/push/sw.js', (req, res) => {
    res.type('application/javascript').sendFile(path.join(__dirname, 'public', 'push-sw.js'));
  });

  app.get('/api/push/status', async (req, res) => {
    res.json(await buildStatus());
  });

  app.get('/internal/max/chats', requireAdminToken, async (req, res) => {
    const botToken = getMaxBotToken();
    if (!botToken) return res.status(503).json({ ok: false, error: 'max_bot_token_not_configured' });
    try {
      const data = await callMaxApiSafe('/chats', { count: safePageCount(req.query && req.query.count), marker: safeMarker(req.query && req.query.marker) }, botToken);
      const chats = normalizeMaxList(data, ['chats', 'items', 'data']).map(sanitizeChat).filter((chat) => chat.chatId);
      return res.json({ ok: true, chats, marker: normalizeMarker(data) });
    } catch (error) {
      return sendSafeMaxError(res, error, 'max_api_request_failed');
    }
  });

  app.get('/internal/max/chat-members', requireAdminToken, async (req, res) => {
    const botToken = getMaxBotToken();
    if (!botToken) return res.status(503).json({ ok: false, error: 'max_bot_token_not_configured' });
    const chatId = clean(req.query && req.query.chatId);
    if (!isSafeChatId(chatId)) return res.status(400).json({ ok: false, error: 'invalid_chat_id' });
    try {
      const data = await callMaxApiSafe(`/chats/${encodeURIComponent(chatId)}/members`, { count: safePageCount(req.query && req.query.count), marker: safeMarker(req.query && req.query.marker) }, botToken);
      const members = normalizeMaxList(data, ['members', 'items', 'users', 'data']).map(sanitizeMember).filter((member) => member.userId);
      return res.json({ ok: true, chatId, members, marker: normalizeMarker(data) });
    } catch (error) {
      return sendSafeMaxError(res, error, 'max_bot_not_chat_admin_or_no_access');
    }
  });

  // Diagnostic/operator-only endpoint for /push/admin. The normal product UI publishes
  // through bot callbacks and groupPushAdminPublishingService, which verifies the
  // requester's admin/owner role in the selected chat. Never use this endpoint for
  // user-originated product actions or include personal join links/tokens in its payload.
  app.post('/internal/max/group-push-invite', requireAdminToken, async (req, res) => {
    const botToken = getMaxBotToken();
    if (!botToken) return res.status(503).json({ ok: false, error: 'max_bot_token_not_configured' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const chatId = clean(body.chatId);
    if (!isSafeChatId(chatId)) return res.status(400).json({ ok: false, error: 'invalid_chat_id' });
    try {
      await sendMessage({
        botToken,
        chatId,
        text: groupPush.buildGroupInviteText(body.title),
        attachments: groupPush.buildGroupInviteKeyboard()
      });
      return res.json({ ok: true, chatId, sent: true });
    } catch (error) {
      return sendSafeMaxError(res, error, 'max_group_push_invite_failed');
    }
  });

  app.get('/internal/push/status', requireAdminToken, async (req, res) => {
    res.json(await buildStatus({ admin: true }));
  });

  app.post('/api/push/subscribe', requireSubscribeAccess, async (req, res) => {
    const config = getConfig();
    if (!config.configured) return res.status(503).json({ ok: false, error: 'web_push_not_configured' });
    const extracted = extractPushSubscriptionFromBody(req.body);
    const requestShape = safePushRequestShape(req.body, extracted.source);
    try {
      const saved = await storage.saveSubscription(extracted.subscription, { userAgent: req.get('user-agent') });
      return res.json({ ok: true, id: saved.id.slice(0, 16), backend: saved.backend });
    } catch (error) {
      return res.status(400).json(invalidSubscriptionResponse(error, extracted.subscription, 'subscribe_failed', requestShape));
    }
  });

  app.post('/api/push/device/status', async (req, res) => {
    const config = getConfig();
    if (!config.configured) return res.status(503).json({ ok: false, error: 'web_push_not_configured' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      const extracted = extractPushSubscriptionFromBody(body);
      const requestShape = safePushRequestShape(body, extracted.source);
      const cleanSubscription = storage.sanitizeSubscription(extracted.subscription);
      const endpointHash = storage.subscriptionId(cleanSubscription);
      const device = await storage.findDeviceByEndpointHash(endpointHash);
      if (!device || device.disabled || !['active', 'pending'].includes(device.status)) {
        return res.status(404).json({ ok: false, error: 'push_device_not_paired', requestShape });
      }
      const chats = await storage.listChatBindingsForUser(device.maxUserId);
      return res.json(confirmation.safePublicResult({
        ok: true,
        status: device.status,
        confirmationRequired: device.status !== 'active',
        confirmationSent: false,
        confirmationDispatch: 'not_needed',
        deviceId: device.deviceId,
        chats
      }));
    } catch (error) {
      const extracted = extractPushSubscriptionFromBody(body);
      const requestShape = safePushRequestShape(body, extracted.source);
      return res.status(400).json(invalidSubscriptionResponse(error, extracted.subscription, 'push_device_status_failed', requestShape));
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
      const extracted = extractPushSubscriptionFromBody(body);
      const requestShape = safePushRequestShape(body, extracted.source);
      const cleanSubscription = storage.sanitizeSubscription(extracted.subscription);
      const endpointHash = storage.subscriptionId(cleanSubscription);
      const activeDevice = (await storage.listActiveDevicesForUser(verified.maxUserId)).find((device) => device.endpointHash === endpointHash || device.id === endpointHash);
      if (activeDevice) {
        await storage.upsertChatBindingForDevice({
          maxUserId: verified.maxUserId,
          chatId: verified.chatId,
          channelId: verified.channelId,
          deviceId: activeDevice.deviceId,
          endpointHash
        });
        const chats = await storage.listChatBindingsForUser(verified.maxUserId);
        return res.json(confirmation.safePublicResult({ ok: true, status: 'active', confirmationRequired: false, confirmationSent: false, chats }));
      }
      const saved = await storage.savePairedDevice(cleanSubscription, {
        maxUserId: verified.maxUserId,
        chatId: verified.chatId,
        channelId: verified.channelId,
        userAgent: req.get('user-agent'),
        status: 'pending'
      });
      const prompt = await confirmation.sendConfirmationPrompt({ maxUserId: verified.maxUserId, deviceId: saved.deviceId });
      const chats = await storage.listChatBindingsForUser(verified.maxUserId);
      return res.json(confirmation.safePublicResult({
        ok: true,
        status: saved.status,
        deviceId: saved.deviceId,
        confirmationSent: prompt.confirmationSent,
        confirmationDispatch: prompt.confirmationDispatch,
        chats
      }));
    } catch (error) {
      const extracted = extractPushSubscriptionFromBody(body);
      const requestShape = safePushRequestShape(body, extracted.source);
      return res.status(400).json(invalidSubscriptionResponse(error, extracted.subscription, 'push_pair_failed', requestShape));
    }
  });


  app.post('/api/push/link-chat', async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const token = clean(body.pairingToken) || getCookie(req, 'push_pairing_token');
    if (!token) return res.status(403).json({ ok: false, error: 'push_pairing_token_required', existingActiveDevicesFound: false, chatLinkMode: true });
    try {
      const verified = pairing.consumePairingToken(token);
      const activeDevices = await storage.listActiveDevicesForUser(verified.maxUserId);
      if (!activeDevices.length) {
        return res.status(409).json({ ok: false, error: 'push_active_device_not_found', existingActiveDevicesFound: false, chatLinkMode: true, linkedExistingDevicesCount: 0, chatBindingUpserted: false, chats: [] });
      }
      const binding = await storage.upsertChatBindingForUserDevices({
        maxUserId: verified.maxUserId,
        chatId: verified.chatId,
        channelId: verified.channelId,
        chatTitle: verified.chatTitle
      });
      const chats = await storage.listChatBindingsForUser(verified.maxUserId);
      return res.json({
        ok: true,
        existingActiveDevicesFound: true,
        chatLinkMode: true,
        linkedExistingDevicesCount: Number(binding && binding.devices) || 0,
        chatBindingUpserted: Number(binding && binding.bindings) > 0,
        chats: safePublicChats(chats)
      });
    } catch (error) {
      return res.status(400).json({ ok: false, error: safeErrorCode(error, 'push_link_chat_failed'), existingActiveDevicesFound: false, chatLinkMode: true, linkedExistingDevicesCount: 0, chatBindingUpserted: false });
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

  return { ok: true, routes: ['/push', '/push/admin', '/push/join', '/push/join/:token', '/push/manifest.json', '/push/manifest/:token', '/push/sw.js', '/api/push/status', '/internal/push/status', '/api/push/subscribe', '/api/push/device/status', '/api/push/pair', '/api/push/link-chat', '/api/push/test', '/internal/push/send', '/internal/push/invite', '/internal/push/invite-chat', '/internal/push/targeted', '/internal/max/chats', '/internal/max/chat-members', '/internal/max/group-push-invite'] };
}

module.exports = {
  install,
  getConfig,
  buildStatus,
  sendToAll: sendTestToAllAdminOnly,
  sendTestToAllAdminOnly,
  isHttpsRequest,
  extractPushSubscriptionFromBody
};
