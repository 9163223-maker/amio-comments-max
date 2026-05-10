'use strict';

// CC6.5.3.4 legacy moderation bypass.
// Problem: cc5-bootstrap-lite prepends cc55-moderation-router before newer UI routers.
// Result: old moderation menu is shown and new toggle callbacks do not update the message.
// Fix: cc55 stays for old non-modern callbacks, but modern moderation:* routes are passed to newer routers.

const Module = require('module');
const RUNTIME = 'CC6.5.3.4';
const SOURCE = 'adminkit-CC6.5.3.4-legacy-moderation-bypass';
let patched = false;
let bypassCount = 0;

function norm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function tryJson(value) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function callback(update = {}) {
  return update.callback || update.data?.callback || update.message?.callback || update.data?.message?.callback || null;
}

function payloadRaw(update = {}) {
  const cb = callback(update) || {};
  return norm(cb.payload || cb.body?.payload || update.payload || update.data?.payload || '');
}

function action(update = {}) {
  const raw = payloadRaw(update);
  const parsed = tryJson(raw) || {};
  return norm(parsed.action || parsed.cmd || parsed.route || (/^[a-z0-9_:.\-]+$/i.test(raw) ? raw : '')).toLowerCase();
}

function isModernModerationAction(update = {}) {
  const route = action(update);
  if (!route) return false;
  if (route === 'help:moderation') return true;
  if (route.startsWith('moderation:')) return true;
  return [
    'mod_start',
    'moderation_menu',
    'help_moderation',
    'moderation',
    'mod_choose_post',
    'mod_post_rules'
  ].includes(route);
}

function applyBypass() {
  if (patched) return { ok: true, alreadyPatched: true, runtimeVersion: RUNTIME };
  const router = require('./cc55-moderation-router');
  if (!router || typeof router.handle !== 'function') {
    return { ok: false, reason: 'cc55_handle_missing', runtimeVersion: RUNTIME };
  }
  const originalHandle = router.handle.bind(router);
  router.handle = async function modernModerationBypass(update = {}) {
    if (isModernModerationAction(update)) {
      bypassCount += 1;
      return false;
    }
    return originalHandle(update);
  };
  router.__cc6534Bypass = true;
  patched = true;
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
}

function noCache(res) {
  try {
    res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' });
  } catch {}
}

function installExpressPatch() {
  if (Module._load.__cc6534BypassDebug) return;
  const oldLoad = Module._load;
  function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc6534BypassWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc6534BypassDebug) {
          app.__cc6534BypassDebug = true;
          app.use((req, res, next) => {
            const route = String(req.path || req.url || '').split('?')[0].toLowerCase();
            if (route === '/debug/legacy-moderation-bypass') {
              noCache(res);
              return res.type('text/plain').send([
                'OK: LEGACY_MODERATION_BYPASS_READY',
                'runtime: ' + RUNTIME,
                'sourceMarker: ' + SOURCE,
                'cc55ModernModerationBypass: ' + (patched ? 'enabled' : 'not_enabled'),
                'modernRoutesPassedToNewRouter: moderation_colon_routes_and_help_moderation',
                'bypassCount: ' + bypassCount,
                'reason: old_router_must_not_render_old_moderation_menu'
              ].join('\n') + '\n');
            }
            return next();
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc6534BypassWrap = true;
      return expressWrapper;
    }
    return loaded;
  }
  patchedLoad.__cc6534BypassDebug = true;
  Module._load = patchedLoad;
}

function install() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  installExpressPatch();
  return applyBypass();
}

module.exports = { RUNTIME, SOURCE, install, applyBypass, isModernModerationAction };
