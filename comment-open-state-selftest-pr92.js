'use strict';

const store = require('./store');
const { listComments } = require('./services/commentService');

const RUNTIME = 'PR92-SELFTEST-COMMENT-OPEN-STATE';
const PREFIX = 'selftest_pr88_';

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function key(value) { return store.normalizeKey ? store.normalizeKey(value || '') : clean(value); }
function noCache(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store'
  });
}
function hasSelftestComments(commentKey) {
  const k = key(commentKey);
  return Boolean(k && k.startsWith(PREFIX) && store.store && store.store.comments && Array.isArray(store.store.comments[k]));
}
function meta(commentKey, query) {
  const title = clean(query && query.title) || 'Selftest comments';
  return {
    runtimeVersion: RUNTIME,
    resolveReason: 'selftest_comments_without_post',
    commentKey,
    channelId: '',
    postId: '',
    postTitle: title,
    postSnapshot: { title, text: title, originalText: '', messageId: '', stablePayload: '', handoffToken: '' },
    banner: { text: '🐋 АдминКИТ', button: '🐋 АдминКИТ', link: 'https://max.ru/id781310320690_bot?start=menu' }
  };
}
function install(app) {
  if (!app || app.__adminkitSelftestOpenStatePr92) return app;
  app.__adminkitSelftestOpenStatePr92 = true;
  app.get('/api/adminkit/comment-open-state', (req, res, next) => {
    const commentKey = key(req.query && (req.query.commentKey || req.query.key));
    if (!hasSelftestComments(commentKey)) return next();
    noCache(res);
    const comments = listComments(commentKey, clean(req.query && (req.query.userId || req.query.user_id))) || [];
    return res.json({ ok: true, runtimeVersion: RUNTIME, meta: meta(commentKey, req.query || {}), post: null, comments, commentsCount: comments.length, count: comments.length, safe: true });
  });
  return app;
}

module.exports = { RUNTIME, PREFIX, install, hasSelftestComments };
