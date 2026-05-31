'use strict';

const config = require('./config');
const channelService = require('./services/channelService');
const titleResolver = require('./channel-title-resolver-cc8340');

const RUNTIME = 'CC8.3.42-CHANNEL-TITLE-REFRESH-ROUTE';

function clean(value) { return String(value || '').trim(); }
function arr(value) { return Array.isArray(value) ? value : []; }
function noCache(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
}
function send(res, payload, status = 200) {
  noCache(res);
  res.status(status).type('application/json').send(JSON.stringify(payload, null, 2));
}
function channelIdOf(item = {}) { return clean(item.channelId || item.id || item.chatId || item.chat_id); }
function titleOf(item = {}) { return clean(item.resolvedChannelTitle || item.channelTitle || item.title || item.channelName || item.chatTitle); }
function needsRefresh(item = {}) {
  const title = titleOf(item);
  return !title || title === 'Канал без названия';
}
async function refreshChannels({ force = false, limit = 30 } = {}) {
  const botToken = config.botToken;
  const channels = arr(channelService.listChannels ? channelService.listChannels() : [])
    .filter((item) => channelIdOf(item))
    .slice(0, Math.max(1, Math.min(Number(limit || 30), 100)));
  const targets = channels.filter((item) => force || needsRefresh(item));
  const results = [];
  for (const item of targets) {
    const channelId = channelIdOf(item);
    const beforeTitle = titleOf(item) || 'Канал без названия';
    try {
      const result = await titleResolver.resolveTitle({
        botToken,
        channelId,
        tenantUserId: clean(item.linkedByUserId || item.ownerUserId || ''),
        tenantName: clean(item.linkedByName || ''),
        force: true
      });
      results.push({ channelId, beforeTitle, afterTitle: result && result.title, source: result && result.source, ok: Boolean(result && result.ok), error: result && result.error || '' });
    } catch (error) {
      results.push({ channelId, beforeTitle, afterTitle: beforeTitle, source: 'error', ok: false, error: String(error && error.message || error).slice(0, 240) });
    }
  }
  const after = arr(channelService.listChannels ? channelService.listChannels() : []).map((item) => ({
    channelId: channelIdOf(item),
    title: titleOf(item) || 'Канал без названия',
    hasPosts: Boolean(item.hasPosts),
    linkedByUserId: clean(item.linkedByUserId || item.ownerUserId || '')
  }));
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    botTokenConfigured: Boolean(botToken),
    scannedChannels: channels.length,
    refreshedChannels: results.length,
    results,
    channelsAfter: after,
    safe: true,
    noCache: true
  };
}
function install(app) {
  if (!app || app.__adminkitChannelTitleRefreshRoutes) return app;
  app.__adminkitChannelTitleRefreshRoutes = true;
  app.get('/debug/channel-title-refresh', async (req, res) => {
    const payload = await refreshChannels({ force: clean(req.query.force) === '1', limit: Number(req.query.limit || 30) });
    send(res, payload);
  });
  app.get('/debug/channel-title-refresh-live', async (req, res) => {
    const payload = await refreshChannels({ force: true, limit: Number(req.query.limit || 30) });
    send(res, payload);
  });
  return app;
}

module.exports = { RUNTIME, install, refreshChannels };
