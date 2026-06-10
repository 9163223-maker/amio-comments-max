'use strict';

const path = require('path');
const storage = require('./services/webPushStorage');
const pairing = require('./services/pushPairingService');
const dispatch = require('./services/pushDispatchService');
const confirmation = require('./services/pushConfirmationService');
const pushPairingLog = require('./services/pushPairingLogService');
const pushPairingHandoff = require('./services/pushPairingHandoffService');
const connectedChats = require('./services/pushConnectedChatsService');
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

function appendCookie(res, cookie) {
  const current = res.getHeader && res.getHeader('Set-Cookie');
  const values = Array.isArray(current) ? current : (current ? [current] : []);
  res.set('Set-Cookie', [...values, cookie]);
}

function deviceProofCookie(req, device) {
  const proof = pairing.createDeviceProof({ deviceId: device.deviceId, endpointHash: device.endpointHash });
  const cookie = `push_device_proof=${encodeURIComponent(proof)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${365 * 24 * 60 * 60}`;
  return isHttpsRequest(req) ? `${cookie}; Secure` : cookie;
}

function handoffCookie(req, handoffId, maxAge = 15 * 60) {
  const cookie = `push_pairing_handoff=${encodeURIComponent(handoffId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  return isHttpsRequest(req) ? `${cookie}; Secure` : cookie;
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
  return clean(req && req.params && req.params.token) || clean(req && req.query && (req.query.t || req.query.token));
}

function pairingOpenedAs(req) {
  return clean(req && req.query && req.query.source) === 'manifest-start-url' ? 'standalone-pwa' : 'safari';
}

function recordPushPairingEvent(event) {
  pushPairingLog.record(event).catch(() => undefined);
}


function safeChatTitle(value) { return clean(value).slice(0, 120); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function safePublicChatItem(value) {
  const source = value && typeof value === 'object' ? value : {};
  const title = safeChatTitle(source.chatTitle || source.title);
  const chatId = clean(source.chatId).replace(/[^A-Za-z0-9_.:@-]/g, '').slice(0, 80);
  if (!title || !chatId || source.enabledOnThisDevice !== true) return null;
  return { chatId, title, enabledOnThisDevice: true, status: 'enabled', lastConnectedAt: clean(source.lastConnectedAt).slice(0, 40) };
}
function safePublicChats(value) { return Array.isArray(value) ? value.map(safePublicChatItem).filter(Boolean).slice(0, 20) : []; }

function sendPushPage(req, res, options = {}) {
  const file = path.join(__dirname, 'public', 'push.html');
  const fs = require('fs');
  let html = fs.readFileSync(file, 'utf8');
  const mode = options.mode === 'admin' ? 'admin' : 'client';
  const joinConfig = options.joinMode ? (options.informationalJoin ? {
    joinMode: true,
    informationalJoin: true,
    adminMode: false,
    chatTitle: safeChatTitle(options.chatTitle)
  } : {
    joinMode: true,
    tokenCookie: Boolean(options.tokenCookie),
    tokenStatus: options.tokenStatus || 'valid',
    token: clean(options.clientToken),
    handoffId: clean(options.handoffId),
    handoffStatus: clean(options.handoffStatus) || (options.handoffId ? 'found' : 'missing'),
    relaunchMode: options.tokenStatus === 'used' && !options.handoffId,
    adminMode: false,
    informationalJoin: false,
    chatTitle: safeChatTitle(options.chatTitle)
  }) : { joinMode: false, landingMode: mode === 'client', adminMode: mode === 'admin', handoffId: clean(options.handoffId), handoffStatus: clean(options.handoffStatus) };
  if (mode === 'admin') {
    html = html.replace('<link rel="manifest" href="/push/manifest.json">', '<link rel="manifest" href="/public/push-admin-manifest.json">');
  } else {
    const manifestHref = (options.informationalJoin || options.autoPairSuccess || options.linkChatMode) ? pushManifestHref('') : pushManifestHref(options.token);
    html = html.replace('<link rel="manifest" href="/push/manifest.json">', `<link rel="manifest" href="${manifestHref}">`);
    html = stripMarkedHtml(html, 'admin-diagnostics');
    html = stripMarkedHtml(html, 'raw-diagnostics');
    if (options.autoPairSuccess) {
      const title = safeChatTitle(options.chatTitle) || 'Чат MAX';
      html = stripMarkedHtml(html, 'functional-pwa');
      html = html.replace('id="browserInstructions" hidden', 'id="browserInstructions"');
      html = html.replace('<p id="introText">Откройте ссылку из MAX-чата, чтобы подключить уведомления.</p>', `<p id="introText"><strong>Готово.</strong><br>Чат «${escapeHtml(title)}» подключён к уведомлениям на этом устройстве.</p>`);
      html = html.replace(/<section class="card" id="browserInstructions"[^>]*>[\s\S]*?<\/section>/, '<section class="card" id="browserInstructions"><p>Можно закрыть эту страницу.</p></section>');
      html = html.replace(/\s*<script src="\/public\/push-client\.js"><\/script>/, '');
    } else if (options.informationalJoin) {
      const title = safeChatTitle(options.chatTitle) || 'Чат MAX';
      html = stripMarkedHtml(html, 'functional-pwa');
      html = html.replace('id="browserInstructions" hidden', 'id="browserInstructions"');
      html = html.replace('<p id="introText">Откройте ссылку из MAX-чата, чтобы подключить уведомления.</p>', `<p id="introText">Подключается чат:<br><strong>«${escapeHtml(title)}»</strong></p>`);
      html = html.replace(/<section class="card" id="browserInstructions"[^>]*>[\s\S]*?<\/section>/, '<section class="card" id="browserInstructions"><p>Откройте АдминКИТ PUSH с экрана Домой.<br>В приложении появится кнопка «Подключить этот чат».</p></section>');
    }
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
    title: clean(source.title).slice(0, 120) || 'АдминКИТ PUSH',
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
    const handoffId = getCookie(req, 'push_pairing_handoff');
    const recovered = pushPairingHandoff.resolve(handoffId);
    const hasHandoff = ['found', 'consumed'].includes(recovered.status);
    const result = recovered.status === 'expired' ? 'handoff_expired' : (hasHandoff ? (recovered.status === 'consumed' ? 'handoff_consumed' : 'handoff_found') : 'binding_missing');
    recordPushPairingEvent({ event: 'push_opened', route: '/push', result, tokenSource: hasHandoff ? 'handoff' : 'missing', hasPairingToken: false, handoffId, hasHandoff, hasPairingCookie: Boolean(getCookie(req, 'push_pairing_token')), hasHandoffCookie: Boolean(handoffId), openedAs: 'standalone-pwa' });
    if (hasHandoff) recordPushPairingEvent({ event: 'handoff_recovered', route: '/push', result, tokenSource: 'handoff', handoffId, hasHandoff: true, hasHandoffCookie: Boolean(handoffId), openedAs: 'standalone-pwa', maxUserId: recovered.context.maxUserId, chatId: recovered.context.chatId });
    sendPushPage(req, res, { mode: 'client', joinMode: hasHandoff, handoffId: hasHandoff ? handoffId : '', handoffStatus: recovered.status, tokenStatus: recovered.status === 'consumed' ? 'used' : 'valid', chatTitle: recovered.context && recovered.context.chatTitle });
  });

  app.get('/push/admin', (req, res) => {
    sendPushPage(req, res, { mode: 'admin', joinMode: false });
  });

  async function handlePushJoin(req, res) {
    const token = pairingTokenFromRequest(req);
    const fromManifest = clean(req.query && req.query.source) === 'manifest-start-url';
    try {
      const verified = pairing.verifyPairingToken(token);
      const logBase = { pairingToken: token, route: '/push/join', tokenSource: fromManifest ? 'manifest-start-url' : 'query', hasPairingToken: Boolean(token), hasPairingCookie: Boolean(getCookie(req, 'push_pairing_token')), openedAs: pairingOpenedAs(req), maxUserId: verified.maxUserId, chatId: verified.chatId, chatTitle: verified.chatTitle };
      recordPushPairingEvent({ ...logBase, event: fromManifest ? 'pwa_opened' : 'link_opened', result: fromManifest ? 'pwa_opened' : 'link_opened' });

      const rawDeviceProof = getCookie(req, 'push_device_proof');
      let proof = null;
      let device = null;
      let skipEvent = '';
      let skipReason = '';
      if (!rawDeviceProof) {
        skipEvent = 'auto_pair_skipped_no_device_proof';
        skipReason = 'no_device_proof';
      } else {
        try { proof = pairing.verifyDeviceProof(rawDeviceProof); } catch {
          skipEvent = 'auto_pair_skipped_device_mismatch';
          skipReason = 'invalid_device_proof';
        }
      }
      if (proof) {
        device = await storage.findDeviceByDeviceId(proof.deviceId);
        if (!device || clean(device.endpointHash) !== clean(proof.endpointHash)) {
          skipEvent = 'auto_pair_skipped_device_mismatch';
          skipReason = 'device_proof_mismatch';
        } else if (device.disabled || device.status !== 'active') {
          skipEvent = 'auto_pair_skipped_no_active_subscription';
          skipReason = 'no_active_subscription';
        } else if (clean(device.maxUserId) !== clean(verified.maxUserId)) {
          skipEvent = 'auto_pair_skipped_device_mismatch';
          skipReason = 'max_context_mismatch';
        } else {
          const handoff = pushPairingHandoff.create({ pairingToken: token, context: verified });
          await storage.upsertChatBindingForDevice({ maxUserId: verified.maxUserId, chatId: verified.chatId, channelId: verified.channelId, chatTitle: verified.chatTitle, deviceId: device.deviceId, endpointHash: device.endpointHash });
          pairing.consumePairingToken(token);
          pushPairingHandoff.consume(handoff.handoffId);
          appendCookie(res, deviceProofCookie(req, device));
          recordPushPairingEvent({ ...logBase, event: 'auto_pair_success', result: 'auto_pair_success', endpointHash: device.endpointHash, deviceId: device.deviceId, linkedToChat: true, consumed: true, handoffId: handoff.handoffId, hasHandoff: true });
          return sendPushPage(req, res, { mode: 'client', autoPairSuccess: true, chatTitle: verified.chatTitle });
        }
      }

      recordPushPairingEvent({ ...logBase, event: skipEvent, result: skipEvent, endpointHash: proof && proof.endpointHash, deviceId: proof && proof.deviceId, reason: skipReason });
      const maxAge = pairingCookieMaxAgeSeconds(verified.expiresAt);
      const cookie = `push_pairing_token=${encodeURIComponent(token)}; Path=/api/push; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
      appendCookie(res, isHttpsRequest(req) ? `${cookie}; Secure` : cookie);
      const handoff = pushPairingHandoff.create({ pairingToken: token, context: verified });
      appendCookie(res, handoffCookie(req, handoff.handoffId));
      recordPushPairingEvent({ ...logBase, event: 'handoff_created', result: 'handoff_created', handoffId: handoff.handoffId, flowId: handoff.flowId, hasHandoff: true, handoffPending: true, consumed: false, hasPairingCookie: true, hasHandoffCookie: true });
      recordPushPairingEvent({ ...logBase, event: 'auto_pair_fallback_pending', result: 'auto_pair_fallback_pending', handoffId: handoff.handoffId, hasHandoff: true, handoffPending: true, reason: skipReason });
      return sendPushPage(req, res, { mode: 'client', joinMode: true, tokenCookie: true, tokenStatus: 'valid', token, handoffId: handoff.handoffId, handoffStatus: 'found', informationalJoin: !fromManifest, chatTitle: verified.chatTitle });
    } catch (error) {
      const code = safeErrorCode(error, 'invalid_push_pairing_token');
      if (code === 'push_pairing_token_used') {
        const handoffId = getCookie(req, 'push_pairing_handoff');
        const recovered = pushPairingHandoff.resolve(handoffId);
        const hasHandoff = recovered.status === 'consumed';
        return sendPushPage(req, res, { mode: 'client', joinMode: true, tokenStatus: 'used', handoffId: hasHandoff ? handoffId : '', handoffStatus: recovered.status });
      }
      return res.status(400).send(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="apple-touch-icon" sizes="180x180" href="/public/adminkit-push-icon-192.png?v=pr167"><title>АдминКИТ PUSH</title></head><body><main><h1>АдминКИТ PUSH</h1><p>Ссылка истекла. Вернитесь в MAX и отправьте /push ещё раз.</p><p>Подключённые чаты появятся здесь после включения уведомлений.</p></main></body></html>`);
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
      name: 'АдминКИТ PUSH',
      short_name: 'АдминКИТ PUSH',
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
      const chatSnapshot = await connectedChats.resolveConnectedChats(device.maxUserId, { botToken: getMaxBotToken(), endpointHash, deviceId: device.deviceId });
      const chats = chatSnapshot.chats;
      recordPushPairingEvent({ event: 'device_status', route: '/api/push/device/status', result: chats.length ? 'status_success' : 'binding_missing', maxUserId: device.maxUserId, chatId: device.chatId, deviceId: device.deviceId, chatsCount: chats.length, rawBindingsCount: chatSnapshot.rawBindingsCount, uniqueChatsCount: chatSnapshot.uniqueChatsCount, missingTitleCount: chatSnapshot.missingTitleCount });
      appendCookie(res, deviceProofCookie(req, device));
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
          chatTitle: verified.chatTitle,
          deviceId: activeDevice.deviceId,
          endpointHash
        });
        const chats = (await connectedChats.resolveConnectedChats(verified.maxUserId, { botToken: getMaxBotToken(), endpointHash, deviceId: activeDevice && activeDevice.deviceId })).chats;
        appendCookie(res, deviceProofCookie(req, activeDevice));
        return res.json(confirmation.safePublicResult({ ok: true, status: 'active', confirmationRequired: false, confirmationSent: false, deviceId: activeDevice.deviceId, chats }));
      }
      const saved = await storage.savePairedDevice(cleanSubscription, {
        maxUserId: verified.maxUserId,
        chatId: verified.chatId,
        channelId: verified.channelId,
        chatTitle: verified.chatTitle,
        userAgent: req.get('user-agent'),
        status: 'pending'
      });
      const prompt = await confirmation.sendConfirmationPrompt({ maxUserId: verified.maxUserId, deviceId: saved.deviceId });
      const chats = (await connectedChats.resolveConnectedChats(verified.maxUserId, { botToken: getMaxBotToken(), endpointHash, deviceId: saved.deviceId })).chats;
      appendCookie(res, deviceProofCookie(req, saved));
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


  app.post('/api/push/unpair', async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      const extracted = extractPushSubscriptionFromBody(body);
      const subscription = storage.sanitizeSubscription(extracted.subscription);
      const endpointHash = storage.subscriptionId(subscription);
      const device = await storage.findDeviceByEndpointHash(endpointHash);
      const chatId = clean(body.chatId);
      if (!device || device.disabled || device.status !== 'active' || !chatId) {
        recordPushPairingEvent({ event: 'unpair_not_found', route: '/api/push/unpair', result: 'unpair_not_found', endpointHash, chatId, reason: !chatId ? 'chat_required' : 'device_not_active' });
        return res.status(404).json({ ok: false, error: 'push_chat_binding_not_found' });
      }
      const result = await storage.unpairChatForDevice({ deviceId: device.deviceId, endpointHash, chatId });
      if (!result.ok) {
        recordPushPairingEvent({ event: 'unpair_not_found', route: '/api/push/unpair', result: 'unpair_not_found', endpointHash, deviceId: device.deviceId, chatId, maxUserId: device.maxUserId });
        return res.status(404).json({ ok: false, error: 'push_chat_binding_not_found' });
      }
      const snapshot = await connectedChats.resolveConnectedChats(device.maxUserId, { botToken: getMaxBotToken(), endpointHash, deviceId: device.deviceId });
      recordPushPairingEvent({ event: 'unpair_success', route: '/api/push/unpair', result: 'unpair_success', endpointHash, deviceId: device.deviceId, chatId, maxUserId: device.maxUserId, chatsCount: snapshot.chats.length });
      appendCookie(res, deviceProofCookie(req, device));
      return res.json({ ok: true, chats: safePublicChats(snapshot.chats) });
    } catch (error) {
      return res.status(400).json({ ok: false, error: safeErrorCode(error, 'push_unpair_failed') });
    }
  });

  app.post('/api/push/link-chat', async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const token = clean(body.pairingToken) || getCookie(req, 'push_pairing_token');
    if (!token) return res.status(403).json({ ok: false, error: 'push_pairing_token_required' });
    try {
      const verified = pairing.verifyPairingToken(token);
      const extracted = extractPushSubscriptionFromBody(body);
      const currentSubscription = storage.sanitizeSubscription(extracted.subscription);
      const endpointHash = storage.subscriptionId(currentSubscription);
      const device = await storage.findDeviceByEndpointHash(endpointHash);
      if (!device || device.disabled || device.status !== 'active' || clean(device.maxUserId) !== clean(verified.maxUserId)) {
        return res.status(409).json({ ok: false, error: 'push_active_device_not_found', chats: [] });
      }
      pairing.consumePairingToken(token);
      const before = await storage.listChatBindingsSnapshotForDevice({ deviceId: device.deviceId, endpointHash });
      const alreadyConnected = before.chats.some((item) => clean(item.chatId) === clean(verified.chatId));
      await storage.upsertChatBindingForDevice({ maxUserId: verified.maxUserId, chatId: verified.chatId, channelId: verified.channelId, chatTitle: verified.chatTitle, deviceId: device.deviceId, endpointHash });
      const chatSnapshot = await connectedChats.resolveConnectedChats(verified.maxUserId, { botToken: getMaxBotToken(), endpointHash, deviceId: device.deviceId });
      const chats = chatSnapshot.chats;
      recordPushPairingEvent({ event: alreadyConnected ? 'binding_updated' : 'binding_created', route: '/api/push/link-chat', result: alreadyConnected ? 'binding_updated' : 'binding_created', maxUserId: verified.maxUserId, chatId: verified.chatId, endpointHash, deviceId: device.deviceId, chatsCount: chats.length, rawBindingsCount: chatSnapshot.rawBindingsCount, uniqueChatsCount: chatSnapshot.uniqueChatsCount, missingTitleCount: chatSnapshot.missingTitleCount });
      appendCookie(res, deviceProofCookie(req, device));
      return res.json({ ok: true, alreadyConnected, chats: safePublicChats(chats) });
    } catch (error) {
      return res.status(400).json({ ok: false, error: safeErrorCode(error, 'push_link_chat_failed') });
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
      title: 'АдминКИТ PUSH: тест',
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

  return { ok: true, routes: ['/push', '/push/admin', '/push/join', '/push/join/:token', '/push/manifest.json', '/push/manifest/:token', '/push/sw.js', '/api/push/status', '/api/push/pending', '/internal/push/status', '/api/push/subscribe', '/api/push/device/status', '/api/push/pair', '/api/push/link-chat', '/api/push/unpair', '/api/push/test', '/internal/push/send', '/internal/push/invite', '/internal/push/invite-chat', '/internal/push/targeted', '/internal/max/chats', '/internal/max/chat-members', '/internal/max/group-push-invite'] };
}

module.exports = {
  install,
  getConfig,
  buildStatus,
  sendToAll: sendTestToAllAdminOnly,
  sendTestToAllAdminOnly,
  isHttpsRequest,
  extractPushSubscriptionFromBody,
  sendPushPage
};
