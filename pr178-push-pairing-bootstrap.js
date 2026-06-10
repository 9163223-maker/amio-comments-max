'use strict';

// PR183: runtime-safe patch for the АдминКИТ PUSH client pairing flow.
// The patch is loaded before the production entrypoint and replaces only the
// /api/push/pair and /api/push/device/status route handlers while preserving
// the rest of web-push-routes.js unchanged.

const Module = require('module');
const path = require('path');

const storage = require('./services/webPushStorage');
const pairing = require('./services/pushPairingService');
const confirmation = require('./services/pushConfirmationService');
const pushPairingLog = require('./services/pushPairingLogService');
const pushPairingHandoff = require('./services/pushPairingHandoffService');
const connectedChats = require('./services/pushConnectedChatsService');

const originalLoad = Module._load;
let patched = false;

function clean(value) { return String(value || '').trim(); }
function logPairing(event) { pushPairingLog.record(event).catch(() => undefined); }
function pairingContext(req, body) {
  const bodyToken = clean(body && body.pairingToken);
  const cookieToken = getCookie(req, 'push_pairing_token');
  const bodyHandoff = clean(body && body.handoffId);
  const cookieHandoff = getCookie(req, 'push_pairing_handoff');
  const handoffId = bodyHandoff || cookieHandoff;
  if (bodyToken || cookieToken) return {
    token: bodyToken || cookieToken,
    verified: null,
    handoffId,
    handoffStatus: '',
    tokenSource: bodyToken ? 'body' : 'cookie',
    hasPairingCookie: Boolean(cookieToken),
    hasHandoffCookie: Boolean(cookieHandoff)
  };
  const recovered = pushPairingHandoff.resolve(handoffId);
  return {
    token: recovered.pairingToken || '',
    verified: recovered.context || null,
    handoffId,
    handoffStatus: recovered.status,
    tokenSource: ['found', 'consumed'].includes(recovered.status) ? 'handoff' : 'missing',
    hasPairingCookie: Boolean(cookieToken),
    hasHandoffCookie: Boolean(cookieHandoff)
  };
}
function getCookie(req, name) {
  const header = clean(req && req.get && req.get('cookie'));
  const prefix = `${name}=`;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return '';
}

function isHttpsRequest(req) {
  if (req && req.secure) return true;
  const forwardedProto = clean(req && req.get && req.get('x-forwarded-proto')).toLowerCase();
  if (forwardedProto.split(',').map((item) => item.trim()).includes('https')) return true;
  const forwardedSsl = clean(req && req.get && req.get('x-forwarded-ssl')).toLowerCase();
  if (['on', '1', 'true', 'yes'].includes(forwardedSsl)) return true;
  return false;
}

function expirePairingCookies(res, req) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  res.set('Set-Cookie', [
    `push_pairing_token=; Path=/api/push; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    `push_pairing_handoff=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  ]);
}

function safeErrorCode(error, fallback = 'request_failed') {
  return clean(error && (error.code || error.message)).slice(0, 80) || fallback;
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

function invalidSubscriptionResponse(error, subscriptionCandidate, fallback, requestShape) {
  const code = safeErrorCode(error, fallback);
  const body = { ok: false, error: code };
  if (code === 'invalid_push_subscription') {
    body.subscriptionShape = storage.subscriptionShape(subscriptionCandidate);
    if (requestShape) body.requestShape = requestShape;
  }
  return body;
}

function safePublicResult(result = {}) {
  return confirmation.safePublicResult({
    ok: Boolean(result.ok),
    status: clean(result.status) || 'active',
    confirmationRequired: result.confirmationRequired === true,
    confirmationSent: Boolean(result.confirmationSent),
    confirmationDispatch: clean(result.confirmationDispatch) || 'not_needed',
    deviceId: result.deviceId,
    chats: result.chats
  });
}

function buildHandlers(routes) {
  async function deviceStatus(req, res) {
    const config = routes.getConfig();
    if (!config.configured) return res.status(503).json({ ok: false, error: 'web_push_not_configured' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    let extracted = { subscription: undefined, source: 'missing' };
    try {
      extracted = routes.extractPushSubscriptionFromBody(body);
      const requestShape = safePushRequestShape(body, extracted.source);
      const cleanSubscription = storage.sanitizeSubscription(extracted.subscription);
      const endpointHash = storage.subscriptionId(cleanSubscription);
      const device = await storage.findDeviceByEndpointHash(endpointHash);
      if (!device || device.disabled || !['active', 'pending'].includes(device.status)) {
        return res.status(404).json({ ok: false, error: 'push_device_not_paired', requestShape });
      }

      let chatSnapshot = await connectedChats.resolveConnectedChats(device.maxUserId, { endpointHash, botToken: process.env.BOT_TOKEN || process.env.MAX_BOT_TOKEN });
      let chats = chatSnapshot.chats;
      let bindingCreated = false;
      // PR178 recovery for legacy active devices created before binding was upserted.
      if (device.status === 'active' && !chats.length && device.maxUserId && device.chatId) {
        await storage.upsertChatBindingForDevice({
          maxUserId: device.maxUserId,
          chatId: device.chatId,
          channelId: device.channelId,
          deviceId: device.deviceId,
          endpointHash: device.endpointHash
        });
        chatSnapshot = await connectedChats.resolveConnectedChats(device.maxUserId, { endpointHash, botToken: process.env.BOT_TOKEN || process.env.MAX_BOT_TOKEN });
        chats = chatSnapshot.chats;
        bindingCreated = chats.length > 0;
      }

      logPairing({ event: bindingCreated ? 'device_status_binding_recovered' : 'device_status', route: '/api/push/device/status', result: chats.length ? (bindingCreated ? 'binding_created' : 'status_success') : 'binding_missing', tokenSource: 'missing', hasPairingToken: false, hasPairingCookie: Boolean(getCookie(req, 'push_pairing_token')), hasHandoffCookie: Boolean(getCookie(req, 'push_pairing_handoff')), hasHandoff: Boolean(getCookie(req, 'push_pairing_handoff')), maxUserId: device.maxUserId, chatId: device.chatId, chatTitle: device.chatTitle, deviceId: device.deviceId, endpointHash, tokenFound: false, subscriptionCreated: false, linkedToChat: chats.some((chat) => chat.enabledOnThisDevice), chatsCount: chats.length, rawBindingsCount: chatSnapshot.rawBindingsCount, uniqueChatsCount: chatSnapshot.uniqueChatsCount, missingTitleCount: chatSnapshot.missingTitleCount });
      return res.json(safePublicResult({
        ok: true,
        status: device.status,
        confirmationRequired: device.status !== 'active',
        confirmationSent: false,
        confirmationDispatch: 'not_needed',
        deviceId: device.deviceId,
        chats
      }));
    } catch (error) {
      const requestShape = safePushRequestShape(body, extracted.source);
      return res.status(400).json(invalidSubscriptionResponse(error, extracted.subscription, 'push_device_status_failed', requestShape));
    }
  }

  async function pair(req, res) {
    const config = routes.getConfig();
    if (!config.configured) return res.status(503).json({ ok: false, error: 'web_push_not_configured' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const context = pairingContext(req, body);
    const logBase = {
      route: '/api/push/pair', tokenSource: context.tokenSource,
      pairingToken: context.tokenSource === 'handoff' ? '' : context.token,
      handoffId: context.handoffId,
      hasPairingToken: context.tokenSource !== 'handoff' && Boolean(context.token), hasHandoff: Boolean(context.handoffId),
      hasPairingCookie: context.hasPairingCookie, hasHandoffCookie: context.hasHandoffCookie
    };
    logPairing({ ...logBase, event: 'pair_started', result: 'pair_started' });
    if (!context.token) {
      const code = context.handoffStatus === 'expired' ? 'handoff_expired' : 'handoff_missing';
      logPairing({ ...logBase, event: code, result: code, errorCode: code });
      return res.status(403).json({ ok: false, error: code });
    }
    if (context.tokenSource === 'handoff') {
      logPairing({ ...logBase, event: 'handoff_recovered', result: context.handoffStatus === 'consumed' ? 'handoff_consumed' : 'handoff_found' });
    }
    let extracted = { subscription: undefined, source: 'missing' };
    try {
      const verified = context.verified && context.verified.maxUserId
        ? context.verified
        : pairing.verifyPairingToken(context.token, { allowUsed: context.handoffStatus === 'consumed' });
      extracted = routes.extractPushSubscriptionFromBody(body);
      const requestShape = safePushRequestShape(body, extracted.source);
      const cleanSubscription = storage.sanitizeSubscription(extracted.subscription);
      const endpointHash = storage.subscriptionId(cleanSubscription);
      const activeDevice = (await storage.listActiveDevicesForUser(verified.maxUserId)).find((device) => device.endpointHash === endpointHash || device.id === endpointHash);

      if (context.handoffStatus === 'consumed' && !activeDevice) {
        logPairing({ ...logBase, event: 'handoff_consumed', result: 'handoff_consumed', maxUserId: verified.maxUserId, chatId: verified.chatId, errorCode: 'handoff_consumed' });
        return res.status(409).json({ ok: false, error: 'handoff_consumed' });
      }

      let device = activeDevice;
      if (!device) {
        device = await storage.savePairedDevice(cleanSubscription, {
          maxUserId: verified.maxUserId,
          chatId: verified.chatId,
          channelId: verified.channelId,
          chatTitle: verified.chatTitle,
          userAgent: req.get('user-agent'),
          status: 'active'
        });
      }
      await storage.upsertChatBindingForDevice({
        maxUserId: verified.maxUserId,
        chatId: verified.chatId,
        channelId: verified.channelId,
        chatTitle: verified.chatTitle,
        deviceId: device.deviceId,
        endpointHash: device.endpointHash || endpointHash
      });
      const chatSnapshot = await connectedChats.resolveConnectedChats(verified.maxUserId, { endpointHash: device.endpointHash || endpointHash, botToken: process.env.BOT_TOKEN || process.env.MAX_BOT_TOKEN });
      const chats = chatSnapshot.chats;
      if (context.handoffStatus !== 'consumed') {
        try { pairing.consumePairingToken(context.token); } catch (error) {
          if (safeErrorCode(error) !== 'push_pairing_token_used') throw error;
        }
        if (context.tokenSource === 'handoff' && context.handoffId) pushPairingHandoff.consume(context.handoffId);
      }
      expirePairingCookies(res, req);
      logPairing({ ...logBase, event: 'pair_success', result: 'pair_success', maxUserId: verified.maxUserId, chatId: verified.chatId, chatTitle: verified.chatTitle, deviceId: device.deviceId, endpointHash: device.endpointHash || endpointHash, tokenFound: true, subscriptionCreated: !activeDevice, linkedToChat: chats.some((chat) => chat.enabledOnThisDevice && String(chat.chatId || '') === String(verified.chatId || '')), chatsCount: chats.length, rawBindingsCount: chatSnapshot.rawBindingsCount, uniqueChatsCount: chatSnapshot.uniqueChatsCount, missingTitleCount: chatSnapshot.missingTitleCount });
      logPairing({ ...logBase, event: 'binding_created', result: chats.length ? 'binding_created' : 'binding_missing', maxUserId: verified.maxUserId, chatId: verified.chatId, chatTitle: verified.chatTitle, deviceId: device.deviceId, endpointHash: device.endpointHash || endpointHash, tokenFound: true, subscriptionCreated: !activeDevice, linkedToChat: chats.some((chat) => chat.enabledOnThisDevice && String(chat.chatId || '') === String(verified.chatId || '')), chatsCount: chats.length, rawBindingsCount: chatSnapshot.rawBindingsCount, uniqueChatsCount: chatSnapshot.uniqueChatsCount, missingTitleCount: chatSnapshot.missingTitleCount });
      if (context.tokenSource === 'handoff' && context.handoffId) logPairing({ ...logBase, event: 'handoff_consumed', result: 'handoff_consumed', maxUserId: verified.maxUserId, chatId: verified.chatId, chatTitle: verified.chatTitle, deviceId: device.deviceId, endpointHash: device.endpointHash || endpointHash, tokenFound: true, subscriptionCreated: !activeDevice, linkedToChat: chats.some((chat) => chat.enabledOnThisDevice && String(chat.chatId || '') === String(verified.chatId || '')), chatsCount: chats.length, rawBindingsCount: chatSnapshot.rawBindingsCount, uniqueChatsCount: chatSnapshot.uniqueChatsCount, missingTitleCount: chatSnapshot.missingTitleCount });
      return res.json(safePublicResult({ ok: true, status: 'active', confirmationRequired: false, confirmationSent: false, confirmationDispatch: 'not_needed', deviceId: device.deviceId, chats, requestShape }));
    } catch (error) {
      const requestShape = safePushRequestShape(body, extracted.source);
      const code = safeErrorCode(error, 'push_pair_failed');
      logPairing({ ...logBase, event: code === 'push_pairing_token_expired' ? 'handoff_expired' : 'pair_failed', result: code === 'push_pairing_token_expired' ? 'handoff_expired' : 'pair_failed', errorCode: code });
      return res.status(400).json(invalidSubscriptionResponse(error, extracted.subscription, 'push_pair_failed', requestShape));
    }
  }

  return { deviceStatus, pair };
}

Module._load = function patchedModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.apply(this, arguments);
  try {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (!patched && /(?:^|[\\/])web-push-routes\.js$/.test(path.normalize(resolved)) && loaded && typeof loaded.install === 'function') {
      patched = true;
      const originalInstall = loaded.install;
      return {
        ...loaded,
        install(app) {
          const handlers = buildHandlers(loaded);
          const originalPost = app.post.bind(app);
          app.post = function patchedPost(route, ...routeHandlers) {
            if (route === '/api/push/device/status') return originalPost(route, handlers.deviceStatus);
            if (route === '/api/push/pair') return originalPost(route, handlers.pair);
            return originalPost(route, ...routeHandlers);
          };
          try {
            return originalInstall(app);
          } finally {
            app.post = originalPost;
          }
        }
      };
    }
  } catch {}
  return loaded;
};

module.exports = { ok: true, marker: 'adminkit-pr183-push-pairing-handoff' };
