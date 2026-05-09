'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.5.3';
const SOURCE = 'adminkit-CC6.5.3-comments-router-guard-logo-fit';

function norm(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {} }

function getDb() { return require('./cc5-db-core'); }
function getAction(update = {}) { try { return norm(getDb().action(update)).toLowerCase(); } catch { return ''; } }
function isCallback(update = {}) { try { return Boolean(getDb().cb(update)); } catch { return false; } }

function isMainMenuAction(update = {}) {
  const a = getAction(update);
  return ['ak_main_menu', 'main_menu', 'menu_main', 'home', 'start', 'главное меню'].includes(a) || /главн.*меню/.test(a);
}

function isExplicitModerationAction(update = {}) {
  const a = getAction(update);
  if (!a) return false;
  if (a === 'модерация' || a === 'moderation') return true;
  if (a === 'mod_start' || a === 'ak_mod_start') return true;
  if (/^(mod_|ak_mod_)/i.test(a)) return true;
  return false;
}

function isCommentsAction(update = {}) {
  const a = getAction(update);
  if (!a) return false;
  return a === 'comments_menu' || a === 'comments' || a === 'comments_choose_post' || a === 'choose_post' || a === 'select_post' || /comment|коммент/i.test(a);
}

function patchModerationRouterGuard() {
  const router = require('./cc55-moderation-router');
  if (!router || router.__cc653Guarded) return router;
  const originalHandle = router.handle;
  router.handle = async function cc653GuardedModerationHandle(update = {}) {
    if (isCallback(update) && !isMainMenuAction(update) && !isExplicitModerationAction(update)) {
      return false;
    }
    return originalHandle.call(this, update);
  };
  const originalSelfTest = router.selfTest;
  router.selfTest = function cc653SelfTest() {
    const base = typeof originalSelfTest === 'function' ? originalSelfTest.call(this) : { ok: true };
    const fakeCommentsChoosePost = { callback: { payload: JSON.stringify({ action: 'choose_post', channelId: '-100', postId: 'p1' }) } };
    const fakeCommentsMenu = { callback: { payload: JSON.stringify({ action: 'comments_menu' }) } };
    const fakeModPost = { callback: { payload: JSON.stringify({ action: 'mod_post_rules', channelId: '-100', postId: 'p1' }) } };
    const checks = {
      baseRouter: !!base.ok,
      commentsChoosePostIsNotModeration: isCallback(fakeCommentsChoosePost) && !isExplicitModerationAction(fakeCommentsChoosePost) && isCommentsAction(fakeCommentsChoosePost),
      commentsMenuIsNotModeration: isCallback(fakeCommentsMenu) && !isExplicitModerationAction(fakeCommentsMenu) && isCommentsAction(fakeCommentsMenu),
      modPostStillModeration: isExplicitModerationAction(fakeModPost),
      mainMenuStillOwned: isMainMenuAction({ callback: { payload: JSON.stringify({ action: 'ak_main_menu' }) } })
    };
    return { ok: Object.values(checks).every(Boolean), runtime: RUNTIME, sourceMarker: SOURCE, checks, base };
  };
  router.__cc653Guarded = true;
  router.__cc653 = { runtimeVersion: RUNTIME, sourceMarker: SOURCE, policy: 'only_mod_callbacks_enter_moderation_router' };
  return router;
}

function clientLogoPatch() {
  return `\n;(() => {\n  if (window.__ADMINKIT_CC653_LOGO_FIT__) return;\n  window.__ADMINKIT_CC653_LOGO_FIT__ = true;\n  const css = ` + JSON.stringify(`
    .adminkit-logo,
    .admin-kit-logo,
    .brand-logo,
    .bot-logo,
    .miniapp-logo,
    .miniapp-start-logo,
    .miniapp-start-card img,
    img[src*="logo"],
    img[src*="Logo"],
    img[alt*="АдминКИТ"],
    img[alt*="AdminKit"] {
      display: block !important;
      width: auto !important;
      max-width: min(320px, 86vw) !important;
      max-height: 140px !important;
      height: auto !important;
      object-fit: contain !important;
      object-position: center !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }
    @media (min-width: 781px) {
      .adminkit-logo,
      .admin-kit-logo,
      .brand-logo,
      .bot-logo,
      .miniapp-logo,
      .miniapp-start-logo,
      .miniapp-start-card img,
      img[src*="logo"],
      img[src*="Logo"],
      img[alt*="АдминКИТ"],
      img[alt*="AdminKit"] {
        max-width: 300px !important;
        max-height: 120px !important;
      }
    }
  `) + `;\n  const style = document.createElement('style');\n  style.id = 'adminkit-cc653-logo-fit';\n  style.textContent = css;\n  document.head.appendChild(style);\n  const tune = () => {\n    document.querySelectorAll('img').forEach((img) => {\n      const key = String(img.src || '') + ' ' + String(img.alt || '') + ' ' + String(img.className || '');\n      if (/logo|админкит|adminkit|admin-kit/i.test(key)) {\n        img.decoding = 'async';\n        img.loading = 'eager';\n        img.style.objectFit = 'contain';\n      }\n    });\n  };\n  tune();\n  try { new MutationObserver(tune).observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}\n})();\n`;
}

function patchPublicAppRead() {
  if (fs.__cc653LogoReadPatch) return;
  fs.__cc653LogoReadPatch = true;
  const originalReadFileSync = fs.readFileSync.bind(fs);
  const appPath = path.resolve(__dirname, 'public', 'app.js');
  fs.readFileSync = function cc653ReadFileSync(filePath, options) {
    const content = originalReadFileSync(filePath, options);
    try {
      const resolved = path.resolve(String(filePath || ''));
      const wantsText = options === 'utf8' || options === 'utf-8' || (options && typeof options === 'object' && /utf-?8/i.test(String(options.encoding || '')));
      if (resolved === appPath && wantsText) {
        const text = String(content || '');
        if (!text.includes('__ADMINKIT_CC653_LOGO_FIT__')) return text + clientLogoPatch();
      }
    } catch {}
    return content;
  };
}

function patchExpressDebug() {
  if (Module._load.__cc653ExpressPatch) return;
  const oldLoad = Module._load;
  function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc653ExpressWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc653Debug) {
          app.__cc653Debug = true;
          app.use((req, res, next) => {
            const p = String(req.path || req.url || '').split('?')[0];
            if (p === '/debug/comments-routing-guard') {
              noCache(res);
              const router = require('./cc55-moderation-router');
              return res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, routerGuard: router.__cc653 || null, selfTest: router.selfTest ? router.selfTest() : null, logoFitPatch: true });
            }
            return next();
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc653ExpressWrap = true;
      return expressWrapper;
    }
    return loaded;
  }
  patchedLoad.__cc653ExpressPatch = true;
  Module._load = patchedLoad;
}

function install() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  patchModerationRouterGuard();
  patchPublicAppRead();
  patchExpressDebug();
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
}

module.exports = { RUNTIME, SOURCE, install, isExplicitModerationAction, isCommentsAction, isMainMenuAction };
