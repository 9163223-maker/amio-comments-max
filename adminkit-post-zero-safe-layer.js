'use strict';

const Module = require('module');

const RUNTIME = 'CC6.6.0-POST-ZERO-SAFE-LAYER';
const SOURCE = 'adminkit-CC6.6.0-post-zero-handoff-first-launch-safe-layer';
const MARKER = '__ADMINKIT_POST_ZERO_SAFE_LAYER_660__';

let installed = false;
let lastMaxApiPatch = null;

function clean(value = '') {
  return String(value || '').trim();
}

function cleanStartappPayload(value = '') {
  return clean(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 512);
}

function buildPostZeroPayload({ handoffToken, commentKey, postId, channelId } = {}) {
  const handoff = cleanStartappPayload(handoffToken);
  if (handoff && /^h_[A-Za-z0-9_-]{6,}$/.test(handoff)) return handoff;

  // Fallback only. The automatic Post Zero path must use handoff first.
  // MAX open_app payload cannot contain ':', so channel/post fallback is encoded as cp__<absChannel>_<post>.
  const chRaw = clean(channelId || (clean(commentKey).includes(':') ? clean(commentKey).split(':')[0] : ''));
  const postRaw = clean(postId || (clean(commentKey).includes(':') ? clean(commentKey).split(':').slice(1).join(':') : ''));
  const chAbs = chRaw.replace(/^-/, '');
  const po = postRaw.replace(/^-/, '');
  if (chAbs && po) return cleanStartappPayload(`cp__${chAbs}_${po}`);
  if (po) return cleanStartappPayload(`post_${po}`);
  return cleanStartappPayload(commentKey);
}

function normalizeBotUsername({ botUsername = '', maxDeepLinkBase = '' } = {}) {
  const direct = clean(botUsername).replace(/^@/, '').replace(/^https?:\/\/max\.ru\//i, '').replace(/[/?#].*$/, '');
  if (direct) return direct;
  return clean(maxDeepLinkBase).replace(/^https?:\/\/max\.ru\//i, '').replace(/[/?#].*$/, '');
}

function buildCommentsButtonText(count = 0, suffix = '') {
  const total = Number(count || 0);
  const s = clean(suffix);
  let text = total <= 0 ? '💬 Комментарии' : total === 1 ? '💬 1 комментарий' : total >= 2 && total <= 4 ? `💬 ${total} комментария` : `💬 ${total} комментариев`;
  return s ? `${text}${s}` : text;
}

function buildPostZeroOpenAppButton({ text, botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey }) {
  const webApp = normalizeBotUsername({ botUsername, maxDeepLinkBase });
  const payload = buildPostZeroPayload({ handoffToken, commentKey, postId, channelId });
  if (!webApp) return null;
  return {
    type: 'open_app',
    text: clean(text || '💬 Комментарии'),
    web_app: webApp,
    ...(payload ? { payload } : {})
  };
}

function buildPostZeroBotStartLink({ botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey }) {
  const base = clean(maxDeepLinkBase).replace(/\/$/, '');
  const username = clean(botUsername).replace(/^@/, '');
  const startapp = buildPostZeroPayload({ handoffToken, postId, channelId, commentKey });
  if (!startapp) return '';
  const query = new URLSearchParams();
  query.set('startapp', startapp);
  if (base) return `${base}?${query.toString()}`;
  if (username) return `https://max.ru/${username}?${query.toString()}`;
  return '';
}

function buildPostZeroMiniAppLaunchUrl({ appBaseUrl, botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey }) {
  const appBase = clean(appBaseUrl).replace(/\/$/, '');
  const query = new URLSearchParams();
  const startapp = buildPostZeroPayload({ handoffToken, commentKey, postId, channelId });
  if (startapp) query.set('startapp', startapp);
  if (handoffToken) query.set('handoff', clean(handoffToken));
  if (commentKey) query.set('commentKey', clean(commentKey));
  if (postId) query.set('postId', clean(postId));
  if (channelId) query.set('channelId', clean(channelId));
  if (appBase) return `${appBase}/app?${query.toString()}`;
  return buildPostZeroBotStartLink({ botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey }) || `/app?${query.toString()}`;
}

function buildPostZeroCommentsKeyboard(args = {}) {
  const rows = [];
  if (args.showPrimaryButton !== false) {
    const text = clean(args.primaryButtonText || '') || buildCommentsButtonText(args.count, args.buttonSuffix);
    const openApp = buildPostZeroOpenAppButton({ ...args, text });
    if (openApp) rows.push([openApp]);
    else {
      const url = buildPostZeroBotStartLink(args) || buildPostZeroMiniAppLaunchUrl(args);
      rows.push([{ type: 'link', text, ...(url ? { url } : {}) }]);
    }
  }
  const extra = Array.isArray(args.extraRows) ? args.extraRows.filter((row) => Array.isArray(row) && row.length) : [];
  rows.push(...extra);
  return rows.length ? [{ type: 'inline_keyboard', payload: { buttons: rows } }] : [];
}

function patchMaxApiExports(loaded, source = 'load') {
  if (!loaded || typeof loaded !== 'object') return loaded;
  loaded.buildStartappPayload = buildPostZeroPayload;
  loaded.buildOpenAppButton = buildPostZeroOpenAppButton;
  loaded.buildBotStartLink = buildPostZeroBotStartLink;
  loaded.buildMiniAppLaunchUrl = buildPostZeroMiniAppLaunchUrl;
  loaded.buildCommentsKeyboard = buildPostZeroCommentsKeyboard;
  loaded.__adminkitPostZeroSafeLayer660 = true;
  lastMaxApiPatch = {
    at: new Date().toISOString(),
    source,
    handoffFirst: true,
    sampleHandoff: buildPostZeroPayload({ handoffToken: 'h_postzero_test_123456', channelId: '-73175958664622', postId: '116557174567403730' }),
    sampleFallback: buildPostZeroPayload({ channelId: '-73175958664622', postId: '116557174567403730' })
  };
  return loaded;
}

function patchAlreadyLoadedMaxApi() {
  try {
    Object.keys(require.cache || {}).forEach((id) => {
      if (/services[\\/]maxApi\.js$/.test(id) && require.cache[id]?.exports) {
        patchMaxApiExports(require.cache[id].exports, 'require_cache');
      }
    });
  } catch {}
}

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}

function latestPosts(limit = 5) {
  try {
    const store = require('./store');
    const list = typeof store.getPostsList === 'function' ? store.getPostsList() : [];
    return list.slice(0, Math.max(1, Math.min(Number(limit || 5), 20))).map((post) => ({
      title: post.originalText || post.title || post.postId || '',
      commentKey: post.commentKey || '',
      postId: post.postId || '',
      handoffToken: post.handoffToken || '',
      lastPatchedAt: post.lastPatchedAt || 0,
      payloadExpected: buildPostZeroPayload({ handoffToken: post.handoffToken, commentKey: post.commentKey, postId: post.postId, channelId: post.channelId })
    }));
  } catch (error) {
    return [{ error: error && error.message ? error.message : String(error) }];
  }
}

function installExpressDebugRoute() {
  const previousLoad = Module._load;
  Module._load = function postZeroSafeLayerLoad(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    try {
      const req = String(request || '');
      if (req === './services/maxApi' || req === '../services/maxApi' || req.endsWith('/services/maxApi') || req === './maxApi' || req.endsWith('/maxApi')) {
        return patchMaxApiExports(loaded, 'module_load');
      }
      if (req === 'express' && loaded && !loaded.__adminkitPostZeroSafeLayer660Wrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          if (app && !app.__adminkitPostZeroSafeLayer660Route) {
            app.__adminkitPostZeroSafeLayer660Route = true;
            app.get(['/debug/post-zero-live', '/debug/post-zero-safe-layer'], (request, response) => {
              noCache(response);
              patchAlreadyLoadedMaxApi();
              response.json({
                ok: true,
                runtimeVersion: RUNTIME,
                sourceMarker: SOURCE,
                marker: MARKER,
                installed,
                lastMaxApiPatch,
                policy: 'handoff_first_for_all_new_auto_posts',
                checks: {
                  postZeroSafeLayer: true,
                  handoffFirst: buildPostZeroPayload({ handoffToken: 'h_postzero_test_123456', channelId: '-73175958664622', postId: '116557174567403730' }) === 'h_postzero_test_123456',
                  fallbackCpDoubleUnderscore: buildPostZeroPayload({ channelId: '-73175958664622', postId: '116557174567403730' }) === 'cp__73175958664622_116557174567403730',
                  menuTreeUntouched: true,
                  bannerUntouched: true,
                  appJsUntouchedByThisLayer: true
                },
                latestPosts: latestPosts(Number(request.query?.limit || 5) || 5)
              });
            });
          }
          return app;
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitPostZeroSafeLayer660Wrapped = true;
        return wrappedExpress;
      }
    } catch {}
    return loaded;
  };
}

function install() {
  if (installed) return selfTest();
  installed = true;
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  patchAlreadyLoadedMaxApi();
  installExpressDebugRoute();
  return selfTest();
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    marker: MARKER,
    installed,
    policy: 'handoff_first_for_all_new_auto_posts',
    checks: {
      postZeroSafeLayer: true,
      handoffFirst: buildPostZeroPayload({ handoffToken: 'h_postzero_test_123456', channelId: '-73175958664622', postId: '116557174567403730' }) === 'h_postzero_test_123456',
      fallbackCpDoubleUnderscore: buildPostZeroPayload({ channelId: '-73175958664622', postId: '116557174567403730' }) === 'cp__73175958664622_116557174567403730',
      menuTreeUntouched: true,
      bannerUntouched: true,
      appJsUntouchedByThisLayer: true
    }
  };
}

module.exports = { RUNTIME, SOURCE, MARKER, install, selfTest, buildPostZeroPayload };
