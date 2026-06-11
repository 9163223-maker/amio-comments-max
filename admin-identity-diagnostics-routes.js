'use strict';

const db = require('./cc5-db-core');
const config = require('./config');

const RUNTIME = 'ADMIN-IDENTITY-DIAGNOSTICS-PR193B';
const SOURCE = 'adminkit-admin-identity-diagnostics-pr193b';
const MAX_SAMPLE = 8;

function clean(value, limit = 160) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? text.slice(0, Math.max(1, limit - 1)) + '…' : text;
}
function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store'
    });
  } catch {}
}
function headerToken(req) {
  const bearer = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return String(req.get('x-admin-token') || '').trim() || bearer;
}
function hasUnsafeTokenTransport(req) {
  return Boolean(clean(req.query && (req.query.adminToken || req.query.token || req.query.auth || req.query.authorization)) || clean(req.body && (req.body.adminToken || req.body.token || req.body.auth || req.body.authorization)));
}
function operatorAllowed(req) {
  return Boolean(config.giftAdminToken && headerToken(req) === config.giftAdminToken);
}
function send(res, payload, status = 200) {
  noCache(res);
  return res.status(status).type('application/json').send(JSON.stringify(payload, null, 2));
}
function guard(req, res) {
  if (hasUnsafeTokenTransport(req)) {
    send(res, { ok: false, error: 'token_must_be_header_only', allowed: ['Authorization: Bearer <token>', 'X-Admin-Token: <token>'] }, 400);
    return false;
  }
  if (!operatorAllowed(req)) {
    send(res, { ok: false, error: 'operator_token_required' }, 401);
    return false;
  }
  return true;
}
function maskId(value = '') {
  const text = clean(value, 120);
  if (!text) return '';
  if (process.env.ADMINKIT_IDENTITY_DEBUG_RAW_IDS === '1') return text;
  if (text.length <= 6) return `${text.slice(0, 1)}***${text.slice(-1)}`;
  return `${text.slice(0, 4)}…${text.slice(-3)}`;
}
function safeTitle(value = '') {
  return clean(value, 80).replace(/[\r\n\t]/g, ' ');
}
function maybeBuildInfo() {
  try {
    const info = require('./buildInfo');
    return typeof info.getBuildInfo === 'function' ? info.getBuildInfo() : (info.BUILD_INFO || {});
  } catch {
    return {};
  }
}
async function one(sql, params = [], fallback = null) {
  try {
    const result = await db.query(sql, params);
    return result.rows && result.rows[0] ? result.rows[0] : fallback;
  } catch (error) {
    return { error: clean(error && error.message || error, 240) };
  }
}
async function rows(sql, params = []) {
  try {
    const result = await db.query(sql, params);
    return result.rows || [];
  } catch (error) {
    return [{ error: clean(error && error.message || error, 240) }];
  }
}
async function count(sql, params = []) {
  const row = await one(sql, params, { n: 0 });
  if (row && row.error) return { count: 0, error: row.error };
  return { count: Number(row && row.n || 0) };
}
function clientAccessCount(adminId = '') {
  try {
    const access = require('./services/clientAccessService');
    if (!access || typeof access.getClientChannels !== 'function') return { count: 0, available: false };
    const list = access.getClientChannels(adminId);
    return { count: Array.isArray(list) ? list.length : 0, available: true };
  } catch (error) {
    return { count: 0, available: false, error: clean(error && error.message || error, 160) };
  }
}
async function adminCounts(adminId = '') {
  const id = clean(adminId, 120);
  if (!id) return { adminIdMasked: '', warning: 'admin_id_missing' };
  const [admin, channels, posts, rules, flow, menu, v3Events] = await Promise.all([
    count('select count(*)::int as n from ak_admins where admin_id=$1', [id]),
    count('select count(*)::int as n from ak_admin_channels where admin_id=$1', [id]),
    count('select count(*)::int as n from ak_posts where admin_id=$1', [id]),
    count('select count(*)::int as n from ak_moderation_rules where admin_id=$1', [id]),
    count('select count(*)::int as n from ak_flow_state where admin_id=$1', [id]),
    count('select count(*)::int as n from ak_menu_state where admin_id=$1', [id]),
    count('select count(*)::int as n from ak_menu_events_v3 where admin_id=$1', [id])
  ]);
  return {
    adminIdMasked: maskId(id),
    existsInAkAdmins: admin.count > 0,
    legacyAdminChannelsCount: channels.count,
    postsCount: posts.count,
    moderationRulesCount: rules.count,
    flowStateCount: flow.count,
    menuStateCount: menu.count,
    menuV3EventsCount: v3Events.count,
    clientAccessChannels: clientAccessCount(id),
    errors: [admin, channels, posts, rules, flow, menu, v3Events].filter((item) => item && item.error).map((item) => item.error)
  };
}
async function sampleChannels(adminId = '') {
  const id = clean(adminId, 120);
  if (!id) return [];
  const data = await rows(`select ac.channel_id as "channelId", coalesce(c.title, ac.channel_id) as title, ac.updated_at as "updatedAt" from ak_admin_channels ac left join ak_channels c on c.channel_id=ac.channel_id where ac.admin_id=$1 order by ac.updated_at desc limit $2`, [id, MAX_SAMPLE]);
  return data.map((item) => item.error ? item : ({ channelIdMasked: maskId(item.channelId), title: safeTitle(item.title), updatedAt: item.updatedAt }));
}
async function samplePosts(adminId = '') {
  const id = clean(adminId, 120);
  if (!id) return [];
  const data = await rows(`select channel_id as "channelId", post_id as "postId", title, updated_at as "updatedAt" from ak_posts where admin_id=$1 order by updated_at desc limit $2`, [id, MAX_SAMPLE]);
  return data.map((item) => item.error ? item : ({ channelIdMasked: maskId(item.channelId), postIdMasked: maskId(item.postId), title: safeTitle(item.title), updatedAt: item.updatedAt }));
}
async function latestMenuEvents() {
  const data = await rows(`select admin_id as "adminId", route, owner, event_type as "eventType", created_at as "createdAt" from ak_menu_events_v3 order by id desc limit 20`);
  return data.map((item) => item.error ? item : ({ adminIdMasked: maskId(item.adminId), route: clean(item.route, 100), owner: clean(item.owner, 60), eventType: clean(item.eventType, 40), createdAt: item.createdAt }));
}
async function dataSummaryByRecentAdmin() {
  const data = await rows(`select admin_id as "adminId", max(created_at) as "lastSeenAt", count(*)::int as events from ak_menu_events_v3 where admin_id <> '' group by admin_id order by max(created_at) desc limit 10`);
  const out = [];
  for (const item of data) {
    if (item.error) { out.push(item); continue; }
    const counts = await adminCounts(item.adminId);
    out.push({ ...counts, lastSeenAt: item.lastSeenAt, menuEventsInSample: item.events });
  }
  return out;
}
function rendererState() {
  const names = [
    './production-menu-v3-renderer',
    './clean-v3-menu-core',
    './cc6540-functional-canonical-router',
    './features/menu-v3/adapter'
  ];
  return names.map((name) => {
    try {
      const mod = require(name);
      return { module: name, runtime: clean(mod.RUNTIME || ''), sourceMarker: clean(mod.SOURCE || ''), loaded: true };
    } catch (error) {
      return { module: name, loaded: false, error: clean(error && error.message || error, 160) };
    }
  });
}
function explainUpdate(update = {}) {
  const payload = (() => { try { return db.payload(update) || {}; } catch { return {}; } })();
  const candidate = {
    adminId: db.adminId ? db.adminId(update) : '',
    chatId: db.chatId ? db.chatId(update) : '',
    messageId: db.messageId ? db.messageId(update) : '',
    callbackId: db.callbackId ? db.callbackId(update) : '',
    action: db.action ? db.action(update) : '',
    hasCallback: Boolean(db.cb && db.cb(update)),
    hasMessage: Boolean(db.msg && db.msg(update)),
    payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 20) : []
  };
  return {
    adminIdMasked: maskId(candidate.adminId),
    chatIdMasked: maskId(candidate.chatId),
    messageIdMasked: maskId(candidate.messageId),
    callbackIdMasked: maskId(candidate.callbackId),
    action: clean(candidate.action, 100),
    hasCallback: candidate.hasCallback,
    hasMessage: candidate.hasMessage,
    payloadKeys: candidate.payloadKeys,
    warnings: [
      candidate.adminId && candidate.adminId === candidate.chatId ? 'admin_id_equals_chat_id' : '',
      candidate.adminId && candidate.adminId === candidate.messageId ? 'admin_id_equals_message_id' : ''
    ].filter(Boolean)
  };
}
async function statusPayload() {
  const build = maybeBuildInfo();
  const stats = db.stats ? await db.stats().catch((error) => ({ error: clean(error && error.message || error, 240) })) : {};
  return {
    ok: true,
    runtimeVersion: clean(build.runtimeVersion || process.env.RUNTIME_VERSION || ''),
    sourceMarker: clean(build.sourceMarker || process.env.BUILD_SOURCE_MARKER || ''),
    diagnosticRuntime: RUNTIME,
    diagnosticSourceMarker: SOURCE,
    activeEntrypoint: clean(build.activeEntrypoint || ''),
    postgresConfigured: Boolean(stats.dbUrlPresent),
    postgresReachable: Boolean(stats.reachable),
    dbStats: stats,
    renderers: rendererState(),
    recentMenuEvents: await latestMenuEvents(),
    recentAdminDataSummary: await dataSummaryByRecentAdmin(),
    rawIdsEnabled: process.env.ADMINKIT_IDENTITY_DEBUG_RAW_IDS === '1'
  };
}
async function probePayload(adminId = '') {
  const id = clean(adminId, 120);
  return {
    ok: Boolean(id),
    diagnosticRuntime: RUNTIME,
    diagnosticSourceMarker: SOURCE,
    adminIdMasked: maskId(id),
    counts: await adminCounts(id),
    sampleChannels: await sampleChannels(id),
    samplePosts: await samplePosts(id)
  };
}
function install(app, expressInstance) {
  if (!app || app.__adminIdentityDiagnosticsInstalled) return { ok: true, alreadyInstalled: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
  const express = expressInstance || require('express');
  try { app.use('/internal/admin/identity', express.json({ limit: '128kb' })); } catch {}
  app.get('/internal/admin/identity/status', async (req, res) => {
    if (!guard(req, res)) return;
    try { return send(res, await statusPayload()); }
    catch (error) { return send(res, { ok: false, error: clean(error && error.message || error, 240), diagnosticRuntime: RUNTIME }, 500); }
  });
  app.post('/internal/admin/identity/probe', async (req, res) => {
    if (!guard(req, res)) return;
    const adminId = clean(req.body && (req.body.adminId || req.body.userId || req.body.maxUserId));
    if (!adminId) return send(res, { ok: false, error: 'admin_id_required' }, 400);
    try { return send(res, await probePayload(adminId)); }
    catch (error) { return send(res, { ok: false, error: clean(error && error.message || error, 240), diagnosticRuntime: RUNTIME }, 500); }
  });
  app.post('/internal/admin/identity/explain-update', async (req, res) => {
    if (!guard(req, res)) return;
    try { return send(res, { ok: true, diagnosticRuntime: RUNTIME, diagnosticSourceMarker: SOURCE, extraction: explainUpdate(req.body && (req.body.update || req.body)) }); }
    catch (error) { return send(res, { ok: false, error: clean(error && error.message || error, 240), diagnosticRuntime: RUNTIME }, 500); }
  });
  app.__adminIdentityDiagnosticsInstalled = true;
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, routes: ['/internal/admin/identity/status', '/internal/admin/identity/probe', '/internal/admin/identity/explain-update'] };
}

module.exports = { RUNTIME, SOURCE, install, statusPayload, probePayload, explainUpdate, maskId };
