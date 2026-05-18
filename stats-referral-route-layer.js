'use strict';

const Module = require('module');
const statsData = require('./src/core/statsDataAdapter');

const RUNTIME = 'ADMINKIT-STATS-REFERRAL-ROUTE-LAYER-1.43.0';
const MARKER = '__ADMINKIT_STATS_REFERRAL_ROUTE_LAYER_1_43_0__';

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}

function installRoutes(app) {
  if (!app || app.__adminkitStatsReferralRoutes1430) return app;
  app.__adminkitStatsReferralRoutes1430 = true;

  app.get('/r/:code', async (req, res) => {
    try {
      const result = await statsData.trackReferralHit(req.params.code, req);
      const target = result.targetUrl || statsData.defaultTargetUrl();
      res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
      return res.redirect(302, target);
    } catch (error) {
      return res.redirect(302, statsData.defaultTargetUrl());
    }
  });

  app.get('/debug/stats-referrals', async (req, res) => {
    noCache(res);
    const adminId = String(req.query?.adminId || '');
    const channelId = String(req.query?.channelId || '');
    const result = await statsData.referralFunnel({ adminId, channelId }, { limit: Number(req.query?.limit || 20) });
    res.json({ ok: result.ok !== false, runtimeVersion: RUNTIME, statsRuntimeVersion: statsData.RUNTIME, generatedAt: new Date().toISOString(), ...result });
  });

  app.get('/debug/stats-referral-create', async (req, res) => {
    noCache(res);
    const result = await statsData.createReferralCampaign({ adminId: String(req.query?.adminId || 'debug-admin'), channelId: String(req.query?.channelId || 'debug-channel'), channelTitle: String(req.query?.channelTitle || 'Подключённый канал') }, {
      source: String(req.query?.source || 'yandex_direct'),
      campaign: String(req.query?.campaign || 'майская реклама'),
      targetUrl: String(req.query?.targetUrl || statsData.defaultTargetUrl()),
      cost: Number(req.query?.cost || 0) || 0
    });
    res.json({ ok: result.ok !== false, runtimeVersion: RUNTIME, statsRuntimeVersion: statsData.RUNTIME, generatedAt: new Date().toISOString(), ...result });
  });

  return app;
}

function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;
  const previousLoad = Module._load;
  Module._load = function adminkitStatsReferralRouteLayerLoad(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    if (String(request) !== 'express' || !loaded || loaded.__adminkitStatsReferralWrapped) return loaded;
    function wrappedExpress(...args) {
      return installRoutes(loaded(...args));
    }
    Object.setPrototypeOf(wrappedExpress, loaded);
    Object.assign(wrappedExpress, loaded);
    wrappedExpress.__adminkitStatsReferralWrapped = true;
    return wrappedExpress;
  };
  return selfTest(false);
}

function selfTest(already = false) {
  const dataSelf = statsData.selfTest ? statsData.selfTest() : {};
  return {
    ok: dataSelf.ok !== false,
    runtimeVersion: RUNTIME,
    marker: MARKER,
    already,
    referralRedirectRouteReady: true,
    debugStatsReferralRoutesReady: true,
    statsDataAdapter: dataSelf,
    policy: 'GET /r/:code records an exact click and redirects to MAX or configured target URL'
  };
}

module.exports = { RUNTIME, MARKER, install, installRoutes, selfTest };
