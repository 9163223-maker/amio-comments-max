'use strict';

// PR178: runtime-safe patch for the AdminKIT Push client pairing flow.
// The patch is loaded before the production entrypoint and replaces only the
// /api/push/pair and /api/push/device/status route handlers while preserving
// the rest of web-push-routes.js unchanged.

const Module = require('module');
const path = require('path');

const storage = require('./services/webPushStorage');
const pairing = require('./services/pushPairingService');
const confirmation = require('./services/pushConfirmationService');

const originalLoad = Module._load;
let patched = false;

function clean(value) { return String(value || '').trim(); }

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

function expirePairingCookie(res, req) {
  const cookie = 'push_pairing_token=; Path=/api/push; HttpOnly; SameSite=Lax; Max-Age=0';
  res.set('Set-Cookie', isHttpsRequest(req) ? `${cookie}; Secure` : cookie);
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

      let chats = await storage.listChatBindingsForUser(device.maxUserId);
      // PR178 recovery for legacy active devices created before binding was upserted.
      if (device.status === 'active' && !chats.length && device.maxUserId && device.chatId) {
        await storage.upsertChatBindingForDevice({
          maxUserId: device.maxUserId,
          chatId: device.chatId,
          channelId: device.channelId,
          deviceId: device.deviceId,
          endpointHash: device.endpointHash
        });
        chats = await storage.listChatBindingsForUser(device.maxUserId);
      }

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
    const token = clean(body.pairingToken) || getCookie(req, 'push_pairing_token');
    if (!token) return res.status(403).json({ ok: false, error: 'push_pairing_token_required' });
    let extracted = { subscription: undefined, source: 'missing' };
    try {
      const verified = pairing.consumePairingToken(token);
      extracted = routes.extractPushSubscriptionFromBody(body);
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
        const chats = await storage.listChatBindingsForUser(verified.maxUserId);
        expirePairingCookie(res, req);
        return res.json(safePublicResult({ ok: true, status: 'active', confirmationRequired: false, confirmationSent: false, confirmationDispatch: 'not_needed', deviceId: activeDevice.deviceId, chats, requestShape }));
      }

      const saved = await storage.savePairedDevice(cleanSubscription, {
        maxUserId: verified.maxUserId,
        chatId: verified.chatId,
        channelId: verified.channelId,
        chatTitle: verified.chatTitle,
        userAgent: req.get('user-agent'),
        status: 'active'
      });
      await storage.upsertChatBindingForDevice({
        maxUserId: verified.maxUserId,
        chatId: verified.chatId,
        channelId: verified.channelId,
        chatTitle: verified.chatTitle,
        deviceId: saved.deviceId,
        endpointHash: saved.endpointHash || endpointHash
      });
      const chats = await storage.listChatBindingsForUser(verified.maxUserId);
      expirePairingCookie(res, req);
      return res.json(safePublicResult({ ok: true, status: 'active', deviceId: saved.deviceId, confirmationRequired: false, confirmationSent: false, confirmationDispatch: 'not_needed', chats }));
    } catch (error) {
      const requestShape = safePushRequestShape(body, extracted.source);
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

module.exports = { ok: true, marker: 'adminkit-pr178-push-pairing-binding' };
