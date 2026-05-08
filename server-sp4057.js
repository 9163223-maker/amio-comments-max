'use strict';

const RUNTIME = 'SP40.5.7-clear-core';
const SOURCE = 'adminkit-SP40.5.7-clear-core-post-moderation-cta';

console.log(`[${RUNTIME}] clear core overlay: post moderation scopes + CTA restore`);
process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;

const fs = require('fs');
const path = require('path');
const Module = require('module');

function normalizeKey(value) {
  return String(value || '')
    .replace(/^:+/, '')
    .replace(/^['\"]+|['\"]+$/g, '')
    .trim();
}

function postScopeKey(commentKey = '') {
  const key = normalizeKey(String(commentKey || '').replace(/^post:/i, ''));
  return key ? `post:${key}` : '';
}

function shortText(value = '', limit = 84) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function noCache(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store'
  });
}

function getAdminToken(req) {
  const bearer = String(req.get?.('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return String(req.get?.('x-admin-token') || bearer || req.query?.token || req.query?.adminToken || req.body?.token || req.body?.adminToken || '').trim();
}

function adminAllowed(req) {
  try {
    const config = require('./config');
    const expected = String(config.moderationAdminToken || config.giftAdminToken || process.env.MODERATION_ADMIN_TOKEN || process.env.GIFT_ADMIN_TOKEN || process.env.ADMIN_TOKEN || '').trim();
    return !expected || getAdminToken(req) === expected;
  } catch {
    return true;
  }
}

function requireAdmin(req, res) {
  if (adminAllowed(req)) return true;
  noCache(res);
  res.status(403).json({ ok: false, error: 'admin_forbidden', runtimeVersion: RUNTIME });
  return false;
}

function getStoreRoot(storeMod) {
  return storeMod && storeMod.store && typeof storeMod.store === 'object' ? storeMod.store : null;
}

function ensureModerationRoot(root) {
  if (!root.moderation || typeof root.moderation !== 'object') root.moderation = { byChannel: {}, logs: [] };
  if (!root.moderation.byChannel || typeof root.moderation.byChannel !== 'object') root.moderation.byChannel = {};
  if (!root.moderation.byPost || typeof root.moderation.byPost !== 'object') root.moderation.byPost = {};
  if (!Array.isArray(root.moderation.logs)) root.moderation.logs = [];
  return root.moderation;
}

function getPostChannelId(storeMod, commentKey = '') {
  const key = normalizeKey(String(commentKey || '').replace(/^post:/i, ''));
  if (!key) return '';
  try {
    const post = typeof storeMod.getPost === 'function' ? storeMod.getPost(key) : null;
    if (post?.channelId) return String(post.channelId || '').trim();
  } catch {}
  const fromKey = key.includes(':') ? key.split(':')[0] : '';
  return String(fromKey || '').trim();
}

function patchStoreModule(storeMod) {
  if (!storeMod || storeMod.__adminkitClearCorePatched) return storeMod;
  storeMod.__adminkitClearCorePatched = true;

  const originalGetModerationSettings = typeof storeMod.getModerationSettings === 'function'
    ? storeMod.getModerationSettings.bind(storeMod)
    : (() => ({}));
  const originalSaveModerationSettings = typeof storeMod.saveModerationSettings === 'function'
    ? storeMod.saveModerationSettings.bind(storeMod)
    : null;

  function getPostModerationSettings(commentKey = '') {
    const key = normalizeKey(String(commentKey || '').replace(/^post:/i, ''));
    if (!key) return null;
    const root = getStoreRoot(storeMod);
    const channelId = getPostChannelId(storeMod, key);
    const base = originalGetModerationSettings(channelId) || {};
    const moderation = root ? ensureModerationRoot(root) : { byPost: {} };
    const saved = moderation.byPost[key] || moderation.byPost[`post:${key}`] || null;
    if (!saved) return null;
    return {
      ...base,
      ...saved,
      scope: 'post',
      scopeKey: postScopeKey(key),
      commentKey: key,
      channelId,
      inheritedChannelId: channelId,
      inheritedFromChannel: true
    };
  }

  function savePostModerationSettings(commentKey = '', nextSettings = {}) {
    const key = normalizeKey(String(commentKey || '').replace(/^post:/i, ''));
    if (!key) return null;
    const root = getStoreRoot(storeMod);
    if (!root) return null;
    const moderation = ensureModerationRoot(root);
    const channelId = String(nextSettings.channelId || getPostChannelId(storeMod, key) || '').trim();
    const previous = moderation.byPost[key] || moderation.byPost[`post:${key}`] || {};
    const cleaned = { ...nextSettings };
    delete cleaned.token;
    delete cleaned.adminToken;
    delete cleaned.scopeKey;
    moderation.byPost[key] = {
      ...previous,
      ...cleaned,
      scope: 'post',
      commentKey: key,
      channelId,
      updatedAt: Date.now(),
      updatedAtIso: new Date().toISOString(),
      runtimeVersion: RUNTIME
    };
    delete moderation.byPost[`post:${key}`];
    if (typeof storeMod.saveStore === 'function') storeMod.saveStore(root);
    return getPostModerationSettings(key);
  }

  function listModerationScopeOptions(channelId = '', limit = 30) {
    const normalizedChannelId = String(channelId || '').trim();
    const posts = typeof storeMod.listPostsByChannel === 'function'
      ? storeMod.listPostsByChannel(normalizedChannelId, limit)
      : (typeof storeMod.getPostsList === 'function' ? storeMod.getPostsList().filter((post) => !normalizedChannelId || String(post.channelId || '') === normalizedChannelId).slice(0, limit) : []);
    const root = getStoreRoot(storeMod);
    const moderation = root ? ensureModerationRoot(root) : { byPost: {} };
    return {
      channel: normalizedChannelId ? {
        scope: 'channel',
        scopeKey: `channel:${normalizedChannelId}`,
        channelId: normalizedChannelId,
        title: 'Весь канал',
        configured: Boolean(moderation.byChannel?.[normalizedChannelId])
      } : null,
      posts: posts.map((post) => {
        const key = normalizeKey(post.commentKey || `${post.channelId || ''}:${post.postId || ''}`);
        return {
          scope: 'post',
          scopeKey: postScopeKey(key),
          commentKey: key,
          channelId: String(post.channelId || '').trim(),
          postId: String(post.postId || post.messageId || '').trim(),
          title: shortText(post.originalText || post.text || post.caption || 'Пост без текста'),
          configured: Boolean(moderation.byPost?.[key] || moderation.byPost?.[`post:${key}`]),
          updatedAt: Number(post.updatedAt || 0) || 0
        };
      })
    };
  }

  storeMod.getPostModerationSettings = getPostModerationSettings;
  storeMod.savePostModerationSettings = savePostModerationSettings;
  storeMod.listModerationScopeOptions = listModerationScopeOptions;

  storeMod.getModerationSettings = function patchedGetModerationSettings(scopeId = '') {
    const scope = String(scopeId || '').trim();
    if (/^post:/i.test(scope)) {
      return getPostModerationSettings(scope) || originalGetModerationSettings(getPostChannelId(storeMod, scope));
    }
    return originalGetModerationSettings(scope);
  };

  storeMod.saveModerationSettings = function patchedSaveModerationSettings(scopeId = '', settings = {}) {
    const scope = String(settings?.scopeKey || settings?.scope || scopeId || '').trim();
    const commentKey = normalizeKey(settings?.commentKey || (/^post:/i.test(scope) ? scope.replace(/^post:/i, '') : ''));
    if (commentKey || /^post:/i.test(scope)) {
      return savePostModerationSettings(commentKey || scope, settings);
    }
    return originalSaveModerationSettings
      ? originalSaveModerationSettings(scopeId, settings)
      : null;
  };

  return storeMod;
}

function patchModerationService(serviceMod) {
  if (!serviceMod || serviceMod.__adminkitClearCorePatched) return serviceMod;
  if (typeof serviceMod.moderateComment !== 'function') return serviceMod;
  serviceMod.__adminkitClearCorePatched = true;
  const originalModerateComment = serviceMod.moderateComment.bind(serviceMod);
  serviceMod.moderateComment = async function patchedModerateComment(args = {}) {
    const commentKey = normalizeKey(args.commentKey || '');
    if (commentKey) {
      try {
        const storeMod = patchStoreModule(require('./store'));
        const postSettings = storeMod.getPostModerationSettings?.(commentKey);
        if (postSettings) {
          return originalModerateComment({ ...args, channelId: postScopeKey(commentKey) });
        }
      } catch {}
    }
    return originalModerateComment(args);
  };
  return serviceMod;
}

function patchGrowthService(growthMod) {
  if (!growthMod || growthMod.__adminkitClearCorePatched) return growthMod;
  if (typeof growthMod.getPublicGrowthData !== 'function') return growthMod;
  growthMod.__adminkitClearCorePatched = true;
  const originalGetPublicGrowthData = growthMod.getPublicGrowthData.bind(growthMod);
  growthMod.getPublicGrowthData = function patchedGetPublicGrowthData(args = {}) {
    const data = originalGetPublicGrowthData(args) || {};
    const lead = data.leadMagnet && typeof data.leadMagnet === 'object' ? data.leadMagnet : {};
    const branding = data.branding && typeof data.branding === 'object' ? data.branding : {};
    const targetUrl = String(lead.targetUrl || args?.config?.maxDeepLinkBase || args?.config?.appBaseUrl || '').trim();
    if (branding.showBranding && targetUrl) {
      data.leadMagnet = {
        ...lead,
        enabled: true,
        text: String(lead.text || 'Подключить такие же комментарии').trim(),
        targetUrl,
        trackedUrl: String(lead.trackedUrl || targetUrl).trim()
      };
    }
    data.clearCore = { runtimeVersion: RUNTIME, ctaRestored: Boolean(data.leadMagnet?.enabled || data.trackedButtons?.length) };
    return data;
  };
  return growthMod;
}

function buildClientPatch() {
  return `\n;(() => {\n  if (window.__ADMINKIT_SP4057_CLEAR_CORE__) return;\n  window.__ADMINKIT_SP4057_CLEAR_CORE__ = true;\n  const escape = (value) => String(value || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');\n  const openTarget = (url) => {\n    const target = String(url || '').trim();\n    if (!target) return;\n    const controller = (typeof getBridgeController === 'function' ? getBridgeController() : null);\n    try {\n      if (/^https:\\/\\/max\\.ru\\//i.test(target) && controller && typeof controller.openMaxLink === 'function') { controller.openMaxLink(target); return; }\n      if (controller && typeof controller.openLink === 'function') { controller.openLink(target); return; }\n    } catch (_) {}\n    window.location.href = target;\n  };\n  window.__adminkitRenderCta = function(growth) {\n    try {\n      const leadCard = document.getElementById('growthLeadCard');\n      const buttonsCard = document.getElementById('trackedButtonsCard');\n      const lead = growth && growth.leadMagnet ? growth.leadMagnet : null;\n      if (leadCard) {\n        const leadUrl = String((lead && (lead.trackedUrl || lead.targetUrl)) || '').trim();\n        if (lead && lead.enabled !== false && leadUrl) {\n          leadCard.innerHTML = '<div class="growth-section-head"><strong>Полезная ссылка</strong><span>CTA для этого обсуждения</span></div><button type="button" class="growth-button growth-button-secondary" data-ak-cta-url="'+escape(leadUrl)+'">'+escape(lead.text || 'Перейти')+'</button>';\n          leadCard.classList.remove('hidden');\n          leadCard.querySelector('[data-ak-cta-url]')?.addEventListener('click', (event) => { event.preventDefault(); openTarget(event.currentTarget.getAttribute('data-ak-cta-url')); });\n        } else {\n          leadCard.innerHTML = '';\n          leadCard.classList.add('hidden');\n        }\n      }\n      const buttons = Array.isArray(growth && growth.trackedButtons) ? growth.trackedButtons : [];\n      if (buttonsCard) {\n        if (buttons.length) {\n          buttonsCard.innerHTML = '<div class="growth-section-head"><strong>Кнопки поста</strong><span>Действия для читателя</span></div><div class="growth-button-grid">' + buttons.map((button) => '<button type="button" class="growth-button growth-button-'+escape(button.style || 'primary')+'" data-ak-cta-url="'+escape(button.trackedUrl || button.url || '')+'">'+escape(button.text || 'Перейти')+'</button>').join('') + '</div>';\n          buttonsCard.classList.remove('hidden');\n          buttonsCard.querySelectorAll('[data-ak-cta-url]').forEach((btn) => btn.addEventListener('click', (event) => { event.preventDefault(); openTarget(event.currentTarget.getAttribute('data-ak-cta-url')); }));\n        } else {\n          buttonsCard.innerHTML = '';\n          buttonsCard.classList.add('hidden');\n        }\n      }\n    } catch (error) { console.warn('Adminkit CTA render failed', error); }\n  };\n  try {\n    if (typeof renderLeadMagnet === 'function') renderLeadMagnet = function patchedRenderLeadMagnet(growth) { window.__adminkitRenderCta(growth || (typeof state !== 'undefined' ? state.growth : null)); };\n    if (typeof renderTrackedButtons === 'function') renderTrackedButtons = function patchedRenderTrackedButtons(growth) { window.__adminkitRenderCta(growth || (typeof state !== 'undefined' ? state.growth : null)); };\n  } catch (_) {}\n  const mo = new MutationObserver(() => { try { if (typeof state !== 'undefined' && state.growth) window.__adminkitRenderCta(state.growth); } catch (_) {} });\n  try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}\n})();\n`;
}

function patchPublicAppRead() {
  if (fs.__adminkitSp4057ReadPatched) return;
  fs.__adminkitSp4057ReadPatched = true;
  const originalReadFileSync = fs.readFileSync.bind(fs);
  const publicAppPath = path.join(__dirname, 'public', 'app.js');
  fs.readFileSync = function patchedReadFileSync(filePath, options) {
    const content = originalReadFileSync(filePath, options);
    try {
      const resolved = path.resolve(String(filePath || ''));
      const wantsText = options === 'utf8' || options === 'utf-8' || (options && typeof options === 'object' && /utf-?8/i.test(String(options.encoding || '')));
      if (resolved === path.resolve(publicAppPath) && wantsText) {
        const text = String(content || '');
        if (!text.includes('__ADMINKIT_SP4057_CLEAR_CORE__')) return text + buildClientPatch();
      }
    } catch {}
    return content;
  };
}

function installClearCoreRoutes(app, expressLib) {
  if (!app || app.__adminkitClearCoreRoutesInstalled) return app;
  app.__adminkitClearCoreRoutesInstalled = true;
  try { app.use('/api/admin/moderation', expressLib.json({ limit: '1mb' })); } catch {}

  app.get('/debug/clear-core', (req, res) => {
    if (!requireAdmin(req, res)) return;
    noCache(res);
    let scopeCounts = { postScopes: 0, channels: 0 };
    try {
      const storeMod = patchStoreModule(require('./store'));
      const root = getStoreRoot(storeMod);
      const moderation = root ? ensureModerationRoot(root) : { byPost: {}, byChannel: {} };
      scopeCounts = { postScopes: Object.keys(moderation.byPost || {}).length, channels: Object.keys(moderation.byChannel || {}).length };
    } catch {}
    res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, generatedAt: Date.now(), fixes: ['post_moderation_scope', 'comments_cta_restore'], scopeCounts });
  });

  app.get('/api/admin/moderation/scopes', (req, res) => {
    if (!requireAdmin(req, res)) return;
    noCache(res);
    const storeMod = patchStoreModule(require('./store'));
    const channelId = String(req.query?.channelId || req.query?.channel || '').trim();
    res.json({ ok: true, runtimeVersion: RUNTIME, ...storeMod.listModerationScopeOptions(channelId, Number(req.query?.limit || 30) || 30) });
  });

  app.get('/api/admin/moderation/settings', (req, res) => {
    if (!requireAdmin(req, res)) return;
    noCache(res);
    const storeMod = patchStoreModule(require('./store'));
    const commentKey = normalizeKey(req.query?.commentKey || '');
    const scope = String(req.query?.scope || req.query?.scopeKey || '').trim();
    const channelId = String(req.query?.channelId || req.query?.channel || '').trim();
    const settings = commentKey || /^post:/i.test(scope)
      ? (storeMod.getPostModerationSettings(commentKey || scope) || storeMod.getModerationSettings(postScopeKey(commentKey || scope)))
      : storeMod.getModerationSettings(channelId);
    res.json({ ok: true, runtimeVersion: RUNTIME, settings });
  });

  app.post('/api/admin/moderation/settings', (req, res) => {
    if (!requireAdmin(req, res)) return;
    noCache(res);
    const storeMod = patchStoreModule(require('./store'));
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const commentKey = normalizeKey(body.commentKey || '');
    const scope = String(body.scope || body.scopeKey || '').trim();
    const channelId = String(body.channelId || body.channel || '').trim();
    const settings = commentKey || /^post:/i.test(scope)
      ? storeMod.savePostModerationSettings(commentKey || scope, body.settings && typeof body.settings === 'object' ? { ...body.settings, channelId } : body)
      : storeMod.saveModerationSettings(channelId, body.settings && typeof body.settings === 'object' ? body.settings : body);
    res.json({ ok: true, runtimeVersion: RUNTIME, settings });
  });

  return app;
}

patchPublicAppRead();

const previousLoad = Module._load;
Module._load = function adminkitClearCoreLoad(request, parent, isMain) {
  const loaded = previousLoad.apply(this, arguments);
  const req = String(request || '');
  try {
    if ((req === './store' || req.endsWith('/store') || req.endsWith('store.js')) && loaded) return patchStoreModule(loaded);
    if (req.includes('services/moderationService') && loaded) return patchModerationService(loaded);
    if (req.includes('services/growthService') && loaded) return patchGrowthService(loaded);
    if (req === 'express' && loaded && !loaded.__adminkitClearCoreWrapped) {
      function wrappedExpress(...args) {
        return installClearCoreRoutes(loaded(...args), loaded);
      }
      Object.setPrototypeOf(wrappedExpress, loaded);
      Object.assign(wrappedExpress, loaded);
      wrappedExpress.__adminkitClearCoreWrapped = true;
      return wrappedExpress;
    }
  } catch (error) {
    console.warn(`[${RUNTIME}] overlay patch skipped for ${req}:`, error?.message || error);
  }
  return loaded;
};

require('./media-core-sp39.txt');
