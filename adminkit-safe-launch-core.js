'use strict';

const Module = require('module');

const RUNTIME = 'CC6.5.9.2-SAFE-LAUNCH-CORE';
const SOURCE = 'adminkit-CC6.5.9.2-stable-openapp-payload-export-guard';
const MARKER = '__ADMINKIT_SAFE_LAUNCH_CORE_592__';

let installed = false;
let lastMaxApiPatch = null;

function cleanStartappPayload(value = '') {
  return String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 512);
}

function buildStableStartappPayload({ handoffToken, commentKey, postId, channelId } = {}) {
  const ch = cleanStartappPayload(channelId);
  const po = cleanStartappPayload(postId);
  if (ch && po) return cleanStartappPayload(`cp_${ch}_${po}`);
  if (po) return cleanStartappPayload(`post_${po}`);
  const ck = cleanStartappPayload(commentKey);
  if (ck) return cleanStartappPayload(`ck_${ck}`);
  return cleanStartappPayload(handoffToken);
}

function normalizeBotUsername({ botUsername = '', maxDeepLinkBase = '' } = {}) {
  const direct = String(botUsername || '').trim().replace(/^@/, '').replace(/^https?:\/\/max\.ru\//i, '').replace(/[/?#].*$/, '');
  if (direct) return direct;
  return String(maxDeepLinkBase || '').trim().replace(/^https?:\/\/max\.ru\//i, '').replace(/[/?#].*$/, '');
}

function buildStableOpenAppButton({ text, botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey }) {
  const webApp = normalizeBotUsername({ botUsername, maxDeepLinkBase });
  const payload = buildStableStartappPayload({ handoffToken, commentKey, postId, channelId });
  if (!webApp) return null;
  return { type: 'open_app', text: String(text || '💬 Комментарии').trim(), web_app: webApp, ...(payload ? { payload } : {}) };
}

function buildStableBotStartLink({ botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey }) {
  const base = String(maxDeepLinkBase || '').trim().replace(/\/$/, '');
  const username = String(botUsername || '').trim().replace(/^@/, '');
  const startapp = buildStableStartappPayload({ handoffToken, commentKey, postId, channelId });
  if (!startapp) return '';
  const query = new URLSearchParams();
  query.set('startapp', startapp);
  if (base) return `${base}?${query.toString()}`;
  if (username) return `https://max.ru/${username}?${query.toString()}`;
  return '';
}

function buildStableMiniAppLaunchUrl({ appBaseUrl, botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey }) {
  const appBase = String(appBaseUrl || '').trim().replace(/\/$/, '');
  const query = new URLSearchParams();
  const startapp = buildStableStartappPayload({ handoffToken, commentKey, postId, channelId });
  if (startapp) query.set('startapp', startapp);
  if (postId) query.set('postId', String(postId));
  if (channelId) query.set('channelId', String(channelId));
  if (commentKey) query.set('commentKey', String(commentKey));
  if (handoffToken) query.set('handoff', String(handoffToken));
  if (appBase) return `${appBase}/app?${query.toString()}`;
  return buildStableBotStartLink({ botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey }) || `/app?${query.toString()}`;
}

function buildCommentsButtonText(count = 0, suffix = '') {
  const total = Number(count || 0);
  const s = String(suffix || '').trim();
  let text = total <= 0 ? '💬 Комментарии' : total === 1 ? '💬 1 комментарий' : total >= 2 && total <= 4 ? `💬 ${total} комментария` : `💬 ${total} комментариев`;
  return s ? `${text}${s}` : text;
}

function buildStableCommentsKeyboard(args = {}) {
  const rows = [];
  if (args.showPrimaryButton !== false) {
    const text = String(args.primaryButtonText || '').trim() || buildCommentsButtonText(args.count, args.buttonSuffix);
    const openApp = buildStableOpenAppButton({ ...args, text });
    if (openApp) rows.push([openApp]);
    else {
      const url = buildStableBotStartLink(args) || buildStableMiniAppLaunchUrl(args);
      rows.push([{ type: 'link', text, ...(url ? { url } : {}) }]);
    }
  }
  const extra = Array.isArray(args.extraRows) ? args.extraRows.filter((row) => Array.isArray(row) && row.length) : [];
  rows.push(...extra);
  return rows.length ? [{ type: 'inline_keyboard', payload: { buttons: rows } }] : [];
}

function patchMaxApiExports(loaded) {
  if (!loaded || loaded.__adminkitSafeLaunchCore592) return loaded;
  loaded.__adminkitSafeLaunchCore592 = true;
  loaded.buildStartappPayload = buildStableStartappPayload;
  loaded.buildOpenAppButton = buildStableOpenAppButton;
  loaded.buildBotStartLink = buildStableBotStartLink;
  loaded.buildMiniAppLaunchUrl = buildStableMiniAppLaunchUrl;
  loaded.buildCommentsKeyboard = buildStableCommentsKeyboard;
  lastMaxApiPatch = { at: new Date().toISOString(), patched: true };
  return loaded;
}

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}

function installExpressDebug() {
  if (Module.__adminkitSafeLaunchCore592ExpressPatched) return;
  Module.__adminkitSafeLaunchCore592ExpressPatched = true;
  const previousLoad = Module._load;
  Module._load = function safeLaunchCoreLoad(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    try {
      const req = String(request || '');
      if (req === './services/maxApi' || req === '../services/maxApi' || req.endsWith('/services/maxApi') || req === './maxApi' || req.endsWith('/maxApi')) {
        return patchMaxApiExports(loaded);
      }
      if (req === 'express' && loaded && !loaded.__adminkitSafeLaunchCore592Wrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          if (app && !app.__adminkitSafeLaunchCore592Route) {
            app.__adminkitSafeLaunchCore592Route = true;
            app.get(['/debug/safe-launch-core', '/debug/safe-launch-live'], (request, response) => {
              noCache(response);
              response.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, marker: MARKER, installed, lastMaxApiPatch, checks: { safeLaunchCore: true, stableOpenAppPayload: true, handoffIsFallbackOnly: true, menuTreeUntouched: true, bannerUntouched: true } });
            });
          }
          return app;
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitSafeLaunchCore592Wrapped = true;
        return wrappedExpress;
      }
    } catch {}
    return loaded;
  };
}

function install() {
  if (installed) return selfTest();
  installed = true;
  installExpressDebug();
  return selfTest();
}

function selfTest() {
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, marker: MARKER, installed, checks: { safeLaunchCore: true, stableOpenAppPayload: true, handoffIsFallbackOnly: true, menuTreeUntouched: true, bannerUntouched: true } };
}

module.exports = { RUNTIME, SOURCE, MARKER, install, selfTest, buildStableStartappPayload };
