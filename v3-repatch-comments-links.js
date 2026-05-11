'use strict';

const Module = require('module');

const RUNTIME = 'CC6.5.6.2-REPATCH-COMMENTS-LINKS';
const SOURCE = 'adminkit-CC6.5.6.2-restore-native-comments-links';

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}

function adminOk(req, res) {
  const expected = String(process.env.GIFT_ADMIN_TOKEN || process.env.ADMIN_TOKEN || '').trim();
  if (!expected) return true;
  const bearer = String(req.get && req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const token = String(req.query?.token || req.query?.adminToken || req.get?.('x-admin-token') || bearer || '').trim();
  if (token === expected) return true;
  noCache(res);
  res.status(403).json({ ok: false, runtimeVersion: RUNTIME, error: 'admin_forbidden' });
  return false;
}

async function runRepatch({ dryRun = false, limit = 50 } = {}) {
  const config = require('./config');
  const store = require('./store');
  const { patchStoredPost } = require('./services/postPatcher');
  const posts = typeof store.getPostsList === 'function' ? store.getPostsList() : [];
  const items = posts
    .filter((post) => post && post.commentKey && post.messageId)
    .filter((post) => !String(post.commentKey || '').startsWith('-stress:'))
    .slice(0, Math.max(1, Math.min(Number(limit || 50), 200)));

  const results = [];
  for (const post of items) {
    if (dryRun) {
      results.push({ ok: true, dryRun: true, commentKey: post.commentKey, postId: post.postId || '', messageId: post.messageId || '' });
      continue;
    }
    try {
      if (post.lastPatchedFingerprint) {
        // Force recomputation because CC6.5.6.1 wrote wrong direct https links into some posts.
        store.savePost(post.commentKey, { patchedAttachments: [], lastPatchedFingerprint: '' });
      }
      const result = await patchStoredPost({
        botToken: config.botToken,
        appBaseUrl: config.appBaseUrl,
        botUsername: config.botUsername,
        maxDeepLinkBase: config.maxDeepLinkBase,
        commentKey: post.commentKey
      });
      results.push({ ok: !!result.ok, commentKey: post.commentKey, postId: post.postId || '', messageId: post.messageId || '', result });
    } catch (error) {
      results.push({ ok: false, commentKey: post.commentKey, postId: post.postId || '', messageId: post.messageId || '', error: error && error.message ? error.message : String(error || 'repatch_failed') });
    }
  }
  return {
    ok: results.every((item) => item.ok),
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    dryRun,
    totalPostsSeen: posts.length,
    selected: items.length,
    patched: results.filter((item) => item.ok && !item.dryRun).length,
    failed: results.filter((item) => !item.ok).length,
    results
  };
}

function install() {
  if (Module._load.__adminkitV3RepatchCommentsLinks) return selfTest();
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__adminkitV3RepatchCommentsLinksWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__adminkitV3RepatchCommentsLinks) {
          app.__adminkitV3RepatchCommentsLinks = true;
          app.get('/debug/repatch-comments-links', async (req, res) => {
            if (!adminOk(req, res)) return;
            noCache(res);
            const dryRun = ['1', 'true', 'yes'].includes(String(req.query?.dryRun || '').toLowerCase());
            const limit = Number(req.query?.limit || 50);
            const result = await runRepatch({ dryRun, limit });
            res.status(result.ok ? 200 : 207).json(result);
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__adminkitV3RepatchCommentsLinksWrap = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__adminkitV3RepatchCommentsLinks = true;
  return selfTest();
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    endpoint: '/debug/repatch-comments-links?token=admin&limit=50',
    purpose: 'force repatch existing posts after rollback of wrong direct https /app links'
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, runRepatch };
