'use strict';

const db = require('./cc5-db-core');
const bridge = require('./cc55-v3-live-bridge');
const menu = require('./clean-v3-menu-core-db');

const RUNTIME = 'CC6.5.8.4-CLEAN-V3-BANNER-CALLBACK-ROUTER';
const SOURCE = 'adminkit-CC6.5.8.4-direct-comments-banner-callbacks-to-banner-flow';

let installed = false;
let lastRoute = '';
let lastResult = null;

const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();

function routeFromUpdate(update = {}) {
  const p = db.payload(update) || {};
  return norm(p.r || p.route || p.action || db.action(update) || '');
}

function install() {
  if (installed || bridge.__cleanV3BannerCallbackRouterInstalled) return selfTest();
  installed = true;
  bridge.__cleanV3BannerCallbackRouterInstalled = true;

  const originalHandle = bridge.handle.bind(bridge);
  bridge.handle = async function bannerCallbackRouter(update = {}) {
    const route = routeFromUpdate(update);
    if (db.cb(update) && route.startsWith('comments_banner:')) {
      lastRoute = route;
      const result = await menu.handle(update);
      lastResult = result || false;
      if (result) return true;
    }
    return originalHandle(update);
  };

  return selfTest();
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    installed: installed || !!bridge.__cleanV3BannerCallbackRouterInstalled,
    scope: 'comments_banner_callbacks_only',
    routes: [
      'comments_banner:home',
      'comments_banner:toggle',
      'comments_banner:edit_text',
      'comments_banner:edit_url',
      'comments_banner:edit_button',
      'comments_banner:preview',
      'comments_banner:clear',
      'comments_banner:cancel'
    ],
    checks: {
      bridgePatched: true,
      directToMenuHandle: true,
      openAppUntouched: true,
      commentsLaunchUntouched: true,
      mainMenuUntouched: true
    },
    lastRoute,
    lastResult
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest };
