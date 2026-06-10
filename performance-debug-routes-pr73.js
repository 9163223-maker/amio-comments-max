'use strict';

const express = require('express');
const timing = require('./v3-ui-timing-cc8');
const postPatcher = require('./services/postPatcher');
const config = require('./config');
const maxCommandRegistry = require('./services/maxCommandRegistryService');
const maxApiService = require('./services/maxApi');

const RUNTIME = 'CC8.3.57-PR191-PUSH-ADMIN-INVITE-TITLE-COMMANDS';
const MINI_LIMIT = 100;
const STRING_LIMIT = 160;
const NAME_LIMIT = 80;
const MAX_API_BASE_URL = 'https://platform-api.max.ru';
const miniEvents = [];

const ADMINKIT_MAX_COMMANDS = maxCommandRegistry.GLOBAL_COMMANDS;
const MAX_COMMAND_SCOPE_SUPPORT = maxCommandRegistry.SCOPE_SUPPORT;

function clean(value, maxLen = STRING_LIMIT) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function cleanName(value) {
  return clean(value, NAME_LIMIT).replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, NAME_LIMIT) || 'miniapp.event';
}

function boundedNumber(value, min = 0, max = 60 * 60 * 1000) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function boundedBytes(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), 100 * 1024 * 1024);
}

function boundedCount(value, max = 100000) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), max);
}

function nowIso() {
  return new Date().toISOString();
}

function noCache(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
}

function send(res, payload, status) {
  noCache(res);
  res.status(status || 200).type('application/json').send(JSON.stringify(payload, null, 2));
}

function isVersionedPublicJsCssRequest(req) {
  const path = String((req && (req.path || req.url)) || '').split('?')[0];
  const originalUrl = String((req && req.originalUrl) || '');
  const isJsCss = /\.(?:js|css)$/i.test(path);
  const hasVersionQuery = /[?&](?:v|ver|version|assetVersion)=/i.test(originalUrl);
  return isJsCss && hasVersionQuery;
}

function protectCacheControlHeader(res, value) {
  const originalSetHeader = res.setHeader.bind(res);
  res.setHeader = function setHeaderWithAdminkitCacheGuard(name, headerValue) {
    if (String(name || '').toLowerCase() === 'cache-control') {
      return originalSetHeader(name, value);
    }
    return originalSetHeader(name, headerValue);
  };
  return originalSetHeader;
}

function versionedPublicAssetCacheMiddleware(req, res, next) {
  if (!isVersionedPublicJsCssRequest(req)) return next();

  const cacheControl = 'public, max-age=31536000, immutable';
  protectCacheControlHeader(res, cacheControl);
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('X-Adminkit-Public-Asset-Cache', 'versioned-immutable');
  res.setHeader('Vary', 'Accept-Encoding');
  return next();
}

function requestToken(req) {
  const bearer = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return String(req.get('x-admin-token') || '').trim() ||
    bearer ||
    String(req.query?.adminToken || '').trim() ||
    String(req.body?.adminToken || '').trim();
}

function adminAllowed(req) {
  if (!config.giftAdminToken) return false;
  return requestToken(req) === config.giftAdminToken;
}

function normalizeCommands(commands) {
  if (!Array.isArray(commands)) return [];
  return commands
    .map((cmd) => ({
      name: clean(cmd?.name || cmd?.command || '', 64).replace(/^\//, ''),
      description: clean(cmd?.description || cmd?.desc || '', 160)
    }))
    .filter((cmd) => cmd.name)
    .slice(0, 32);
}

function commandPayloads() {
  const commands = normalizeCommands(ADMINKIT_MAX_COMMANDS);
  return {
    canonical: { commands },
    slashNameVariant: {
      commands: commands.map((cmd) => ({ ...cmd, name: '/' + cmd.name }))
    },
    telegramStyleVariant: {
      commands: commands.map((cmd) => ({ command: cmd.name, description: cmd.description }))
    }
  };
}

function sanitizeBotInfo(data) {
  const bot = data && typeof data === 'object' ? data : {};
  const commands = normalizeCommands(bot.commands || []);
  return {
    user_id: bot.user_id || bot.userId || null,
    first_name: clean(bot.first_name || bot.firstName || ''),
    username: clean(bot.username || ''),
    is_bot: Boolean(bot.is_bot ?? bot.isBot),
    description: clean(bot.description || '', 400),
    commands,
    commandsCount: commands.length,
    hasNativeCommands: commands.length > 0
  };
}

async function readMaxApiBody(response) {
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return { raw: clean(text, 1200) };
  }
}

async function maxBotApi(path, { method = 'GET', body, timeoutMs = 9000 } = {}) {
  if (!config.botToken) {
    return {
      ok: false,
      status: 0,
      error: 'bot_token_missing',
      data: null
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, Number(timeoutMs || 9000)));
  let response;

  try {
    response = await fetch(`${MAX_API_BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: config.botToken,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    clearTimeout(timeout);
    return {
      ok: false,
      status: error?.name === 'AbortError' ? 408 : 0,
      error: error?.name === 'AbortError' ? 'max_api_timeout' : clean(error && error.message || error),
      data: null
    };
  }

  clearTimeout(timeout);
  const data = await readMaxApiBody(response);
  return {
    ok: Boolean(response.ok),
    status: response.status,
    statusText: clean(response.statusText || ''),
    data
  };
}

async function getMaxBotInfoPayload() {
  const result = await maxBotApi('/me', { method: 'GET', timeoutMs: 9000 });
  const bot = sanitizeBotInfo(result.data || {});
  return {
    ok: result.ok,
    runtimeVersion: RUNTIME,
    mode: 'max-bot-info',
    maxApi: {
      method: 'GET',
      path: '/me',
      status: result.status,
      statusText: result.statusText || '',
      error: result.error || ''
    },
    hasBotToken: Boolean(config.botToken),
    bot,
    commands: bot.commands,
    commandsCount: bot.commandsCount,
    hasNativeCommands: bot.hasNativeCommands,
    safe: true,
    noDatabaseRead: true,
    noMaxApiCall: false
  };
}

async function maxCommandsSyncPayload(req) {
  const mode = clean(req.query?.mode || 'probe', 40).toLowerCase();
  const desired = normalizeCommands(ADMINKIT_MAX_COMMANDS);
  const before = await getMaxBotInfoPayload();
  const payloads = commandPayloads();

  const base = {
    ok: true,
    runtimeVersion: RUNTIME,
    mode,
    hypothesis: 'MAX native slash button should appear if BotInfo.commands is filled for the bot',
    commandScopeSupport: MAX_COMMAND_SCOPE_SUPPORT,
    desiredCommands: desired,
    desiredCommandsCount: desired.length,
    currentCommands: before.commands || [],
    currentCommandsCount: before.commandsCount || 0,
    currentHasNativeCommands: Boolean(before.hasNativeCommands),
    candidateWrite: {
      method: 'PATCH',
      path: '/me',
      body: payloads.canonical,
      note: 'MAX has no public command scopes or documented setter. If PATCH /me is accepted, write only the client-safe global catalog.'
    },
    alternativePayloads: {
      slashNameVariant: payloads.slashNameVariant,
      telegramStyleVariant: payloads.telegramStyleVariant
    },
    safety: {
      probeModeDoesNotWrite: mode !== 'patch-me',
      patchRequiresConfirm: true,
      patchRequiresAdminToken: true,
      hasAdminTokenConfigured: Boolean(config.giftAdminToken)
    },
    before,
    safe: true,
    noDatabaseRead: true,
    noMaxApiCall: false
  };

  if (mode !== 'patch-me') return base;

  if (String(req.query?.confirm || '') !== '1') {
    return {
      ...base,
      ok: false,
      error: 'confirm_required',
      hint: 'Use mode=patch-me&confirm=1 and provide adminToken or X-Admin-Token. This write probe is intentionally guarded.'
    };
  }

  if (!adminAllowed(req)) {
    return {
      ...base,
      ok: false,
      error: config.giftAdminToken ? 'admin_forbidden' : 'admin_token_not_configured_for_write_probe',
      hint: config.giftAdminToken
        ? 'Provide adminToken query parameter or X-Admin-Token header.'
        : 'Set GIFT_ADMIN_TOKEN/ADMIN_TOKEN before allowing a MAX commands write probe.'
    };
  }

  const sync = await internalMaxCommandSyncPayload();
  return {
    ...base,
    ...sync,
    patchAttempted: sync.error !== maxCommandRegistry.UNSUPPORTED_ERROR,
    conclusion: sync.ok
      ? 'Command catalog synchronized and verified against GET /me.'
      : (sync.error === maxCommandRegistry.UNSUPPORTED_ERROR
        ? maxCommandRegistry.EXTERNAL_CATALOG_NOTE
        : 'Command catalog sync failed or could not be verified.')
  };
}

async function internalMaxCommandStatusPayload(options = {}) {
  return maxCommandRegistry.commandStatus({
    botToken: options.botToken || config.botToken,
    api: options.api || maxApiService
  });
}

async function internalMaxCommandSyncPayload(options = {}) {
  return maxCommandRegistry.syncCommands({
    botToken: options.botToken || config.botToken,
    api: options.api || maxApiService
  });
}

function requireOperator(req, res) {
  if (adminAllowed(req)) return true;
  send(res, { ok: false, error: config.giftAdminToken ? 'admin_forbidden' : 'admin_token_not_configured' }, config.giftAdminToken ? 403 : 503);
  return false;
}

function sanitizeMiniPayload(payload = {}) {
  const safe = payload && typeof payload === 'object' ? payload : {};

  return {
    name: cleanName(safe.name || safe.event || 'miniapp.event'),
    durationMs: boundedNumber(safe.durationMs ?? safe.elapsedMs ?? 0),

    route: clean(safe.route || safe.path || ''),
    appRuntime: clean(safe.appRuntime || safe.runtime || ''),
    assetVersion: clean(safe.assetVersion || ''),
    loaderRuntime: clean(safe.loaderRuntime || ''),

    scriptSrc: clean(safe.scriptSrc || '', 320),
    photoFlowRuntime: clean(safe.photoFlowRuntime || ''),
    stickersRuntime: clean(safe.stickersRuntime || ''),

    commentKey: clean(safe.commentKey || ''),
    postId: clean(safe.postId || ''),
    channelId: clean(safe.channelId || ''),
    status: clean(safe.status || ''),

    navStartMs: boundedNumber(safe.navStartMs || 0),
    sinceLoaderStartMs: boundedNumber(safe.sinceLoaderStartMs || 0),
    sinceScriptStartMs: boundedNumber(safe.sinceScriptStartMs || 0),

    resourceStartMs: boundedNumber(safe.resourceStartMs || 0),
    resourceDurationMs: boundedNumber(safe.resourceDurationMs || 0),
    resourceFetchStartMs: boundedNumber(safe.resourceFetchStartMs || 0),
    resourceRequestStartMs: boundedNumber(safe.resourceRequestStartMs || 0),
    resourceResponseStartMs: boundedNumber(safe.resourceResponseStartMs || 0),
    resourceResponseEndMs: boundedNumber(safe.resourceResponseEndMs || 0),

    resourceTransferSize: boundedBytes(safe.resourceTransferSize || 0),
    resourceEncodedBodySize: boundedBytes(safe.resourceEncodedBodySize || 0),
    resourceDecodedBodySize: boundedBytes(safe.resourceDecodedBodySize || 0),

    resourceCacheHint: clean(safe.resourceCacheHint || ''),
    resourceInitiatorType: clean(safe.resourceInitiatorType || ''),

    serverCount: boundedCount(safe.serverCount || 0),
    renderableCount: boundedCount(safe.renderableCount || 0),
    hiddenBrokenCount: boundedCount(safe.hiddenBrokenCount || 0),
    postMediaCount: boundedCount(safe.postMediaCount || 0),
    mediaThumbCount: boundedCount(safe.mediaThumbCount || 0),
    runtimeBrokenCount: boundedCount(safe.runtimeBrokenCount || 0),
    renderMs: boundedNumber(safe.renderMs || 0)
  };
}

function pushMiniEvent(payload = {}) {
  const safe = sanitizeMiniPayload(payload);

  const item = {
    seq: miniEvents.length ? miniEvents[miniEvents.length - 1].seq + 1 : 1,
    at: nowIso(),
    runtimeVersion: RUNTIME,

    name: safe.name,
    durationMs: safe.durationMs,
    route: safe.route,

    appRuntime: safe.appRuntime,
    assetVersion: safe.assetVersion,
    loaderRuntime: safe.loaderRuntime,

    scriptSrc: safe.scriptSrc,
    photoFlowRuntime: safe.photoFlowRuntime,
    stickersRuntime: safe.stickersRuntime,

    commentKey: safe.commentKey,
    postId: safe.postId,
    channelId: safe.channelId,
    status: safe.status,

    resource: {
      startMs: safe.resourceStartMs,
      durationMs: safe.resourceDurationMs,
      fetchStartMs: safe.resourceFetchStartMs,
      requestStartMs: safe.resourceRequestStartMs,
      responseStartMs: safe.resourceResponseStartMs,
      responseEndMs: safe.resourceResponseEndMs,
      transferSize: safe.resourceTransferSize,
      encodedBodySize: safe.resourceEncodedBodySize,
      decodedBodySize: safe.resourceDecodedBodySize,
      cacheHint: safe.resourceCacheHint,
      initiatorType: safe.resourceInitiatorType
    },

    details: {
      navStartMs: safe.navStartMs,
      sinceLoaderStartMs: safe.sinceLoaderStartMs,
      sinceScriptStartMs: safe.sinceScriptStartMs,

      scriptSrc: safe.scriptSrc,
      photoFlowRuntime: safe.photoFlowRuntime,
      stickersRuntime: safe.stickersRuntime,
      loaderRuntime: safe.loaderRuntime,

      resourceStartMs: safe.resourceStartMs,
      resourceDurationMs: safe.resourceDurationMs,
      resourceFetchStartMs: safe.resourceFetchStartMs,
      resourceRequestStartMs: safe.resourceRequestStartMs,
      resourceResponseStartMs: safe.resourceResponseStartMs,
      resourceResponseEndMs: safe.resourceResponseEndMs,

      resourceTransferSize: safe.resourceTransferSize,
      resourceEncodedBodySize: safe.resourceEncodedBodySize,
      resourceDecodedBodySize: safe.resourceDecodedBodySize,

      resourceCacheHint: safe.resourceCacheHint,
      resourceInitiatorType: safe.resourceInitiatorType,

      serverCount: safe.serverCount,
      renderableCount: safe.renderableCount,
      hiddenBrokenCount: safe.hiddenBrokenCount,
      postMediaCount: safe.postMediaCount,
      mediaThumbCount: safe.mediaThumbCount,
      runtimeBrokenCount: safe.runtimeBrokenCount,
      renderMs: safe.renderMs
    }
  };

  miniEvents.push(item);
  if (miniEvents.length > MINI_LIMIT) {
    miniEvents.splice(0, miniEvents.length - MINI_LIMIT);
  }

  timing.log('miniapp.' + safe.name, {
    durationMs: safe.durationMs,
    route: safe.route,
    appRuntime: safe.appRuntime,
    assetVersion: safe.assetVersion,
    loaderRuntime: safe.loaderRuntime,
    scriptSrc: safe.scriptSrc,
    photoFlowRuntime: safe.photoFlowRuntime,
    stickersRuntime: safe.stickersRuntime,
    commentKey: safe.commentKey,
    postId: safe.postId,
    channelId: safe.channelId,
    status: safe.status,
    resourceDurationMs: safe.resourceDurationMs,
    resourceTransferSize: safe.resourceTransferSize,
    resourceEncodedBodySize: safe.resourceEncodedBodySize,
    resourceDecodedBodySize: safe.resourceDecodedBodySize,
    resourceCacheHint: safe.resourceCacheHint,
    serverCount: safe.serverCount,
    renderableCount: safe.renderableCount,
    hiddenBrokenCount: safe.hiddenBrokenCount,
    postMediaCount: safe.postMediaCount,
    mediaThumbCount: safe.mediaThumbCount,
    runtimeBrokenCount: safe.runtimeBrokenCount,
    renderMs: safe.renderMs
  });

  return item;
}

function miniSummary() {
  const byName = {};

  for (const e of miniEvents) {
    const key = e.name || 'miniapp.event';

    if (!byName[key]) {
      byName[key] = {
        name: key,
        count: 0,
        totalMs: 0,
        maxMs: 0,
        lastMs: 0
      };
    }

    const row = byName[key];
    const ms = Number(e.durationMs || 0) || 0;

    row.count += 1;
    row.totalMs += ms;
    row.maxMs = Math.max(row.maxMs, ms);
    row.lastMs = ms;
  }

  return Object.values(byName)
    .map((row) => ({
      ...row,
      avgMs: row.count ? Math.round(row.totalMs / row.count) : 0
    }))
    .sort((a, b) => b.maxMs - a.maxMs);
}

function patchTimingInfo() {
  const patch = typeof postPatcher.getPatchCoalescingSnapshot === 'function'
    ? postPatcher.getPatchCoalescingSnapshot()
    : null;

  const events = timing
    .list()
    .filter((e) => /^(patch\.|edit_message_|webhook_total|delegate_legacy|posts_text_flow_guard)/.test(clean(e.name)))
    .slice(0, 80);

  return {
    ok: true,
    runtimeVersion: RUNTIME,
    mode: 'patch-timing-lite',
    patchCoalescingRuntime: postPatcher.PATCH_COALESCE_RUNTIME || '',
    patchCoalescing: patch,
    summary: timing
      .info()
      .summary
      .filter((row) => /^(patch\.|edit_message_|webhook_total|delegate_legacy|posts_text_flow_guard)/.test(clean(row.name))),
    recent: events,
    safe: true,
    noDatabaseRead: true,
    noMaxApiCall: true
  };
}

function miniappTimingInfo() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    mode: 'miniapp-client-timing-lite',
    total: miniEvents.length,
    limit: MINI_LIMIT,
    stringLimit: STRING_LIMIT,
    summary: miniSummary(),
    recent: miniEvents.slice().reverse().slice(0, MINI_LIMIT),
    safe: true,
    noDatabaseRead: true,
    noMaxApiCall: true
  };
}

function parseMiniTimingBody(req) {
  const body = req && req.body;

  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8') || '{}');
    } catch (_) {
      return {};
    }
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body || '{}');
    } catch (_) {
      return {};
    }
  }

  if (body && typeof body === 'object') {
    return body;
  }

  if (req && req.rawBody) {
    try {
      return JSON.parse(
        Buffer.isBuffer(req.rawBody)
          ? req.rawBody.toString('utf8')
          : String(req.rawBody || '{}')
      );
    } catch (_) {
      return {};
    }
  }

  return {};
}

function install(app) {
  if (!app || app.__adminkitPerformanceDebugRoutesPr73) return app;
  app.__adminkitPerformanceDebugRoutesPr73 = true;

  app.use('/public', versionedPublicAssetCacheMiddleware);

  const miniappTimingRawParser = express.raw({
    type: '*/*',
    limit: '256kb'
  });

  const timingHook = (name, payload = {}) => {
    const eventName = cleanName(name || 'patch.event');

    timing.log(eventName, {
      ...(payload || {}),
      source: 'postPatcher',
      durationMs: boundedNumber(payload.durationMs || 0)
    });
  };

  if (typeof postPatcher.addPostPatchTraceHook === 'function') {
    postPatcher.addPostPatchTraceHook(timingHook);
  } else if (typeof postPatcher.setPostPatchTraceHook === 'function') {
    postPatcher.setPostPatchTraceHook(timingHook);
  }

  app.get('/debug/patch-timing', (req, res) => {
    send(res, patchTimingInfo());
  });

  app.get('/debug/patch-timing/clear', (req, res) => {
    timing.clear();
    send(res, {
      ok: true,
      runtimeVersion: RUNTIME,
      mode: 'patch-timing-cleared',
      safe: true,
      noDatabaseRead: true,
      noMaxApiCall: true
    });
  });

  app.get('/debug/miniapp-timing', (req, res) => {
    send(res, miniappTimingInfo());
  });

  app.get('/debug/miniapp-timing/clear', (req, res) => {
    miniEvents.splice(0, miniEvents.length);
    send(res, {
      ok: true,
      runtimeVersion: RUNTIME,
      mode: 'miniapp-timing-cleared',
      safe: true
    });
  });

  app.get('/internal/max/commands/status', async (req, res) => {
    if (!requireOperator(req, res)) return;
    const payload = await internalMaxCommandStatusPayload();
    send(res, payload, payload.ok ? 200 : 502);
  });

  app.post('/internal/max/commands/sync', async (req, res) => {
    if (!requireOperator(req, res)) return;
    const payload = await internalMaxCommandSyncPayload();
    send(res, payload, payload.ok ? 200 : (payload.error === maxCommandRegistry.UNSUPPORTED_ERROR ? 501 : 502));
  });

  app.get('/debug/max-bot-info', async (req, res) => {
    try {
      send(res, await getMaxBotInfoPayload());
    } catch (error) {
      send(res, {
        ok: false,
        runtimeVersion: RUNTIME,
        mode: 'max-bot-info',
        error: clean(error && error.message || error),
        safe: true
      }, 500);
    }
  });

  app.get('/debug/max-commands-sync', async (req, res) => {
    try {
      const payload = await maxCommandsSyncPayload(req);
      send(res, payload, payload.ok ? 200 : 400);
    } catch (error) {
      send(res, {
        ok: false,
        runtimeVersion: RUNTIME,
        mode: 'max-commands-sync',
        error: clean(error && error.message || error),
        safe: true
      }, 500);
    }
  });

  app.post('/api/debug/miniapp-timing', miniappTimingRawParser, (req, res) => {
    try {
      const item = pushMiniEvent(parseMiniTimingBody(req));

      send(res, {
        ok: true,
        runtimeVersion: RUNTIME,
        accepted: true,
        seq: item.seq,
        name: item.name,
        safe: true
      });
    } catch (error) {
      send(res, {
        ok: false,
        runtimeVersion: RUNTIME,
        error: clean(error && error.message || error),
        safe: true
      }, 500);
    }
  });

  return app;
}

module.exports = {
  RUNTIME,
  install,
  patchTimingInfo,
  miniappTimingInfo,
  pushMiniEvent,
  sanitizeMiniPayload,
  versionedPublicAssetCacheMiddleware,
  isVersionedPublicJsCssRequest,
  normalizeCommands,
  commandPayloads,
  getMaxBotInfoPayload,
  maxCommandsSyncPayload,
  internalMaxCommandStatusPayload,
  internalMaxCommandSyncPayload
};
