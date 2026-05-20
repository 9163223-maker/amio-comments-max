'use strict';

const store = require('./store');
const { listComments } = require('./services/commentService');

const RUNTIME = 'CC7.5.46-COMMENT-OPEN-STATE-CANONICAL';

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function key(value) { return store.normalizeKey ? store.normalizeKey(value || '') : clean(value); }
function safeDecode(value) {
  let current = String(value || '');
  for (let i = 0; i < 5; i += 1) {
    try {
      const decoded = decodeURIComponent(current.replace(/\+/g, '%20'));
      if (decoded === current) break;
      current = decoded;
    } catch (_) { break; }
  }
  return current;
}
function noCache(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store'
  });
}
function add(set, value) {
  const v = key(value);
  if (v) set.add(v);
}
function collectCandidates(query = {}) {
  const candidates = new Set();
  const rawValues = [];
  for (const name of ['commentKey','key','handoff','startapp','start_param','WebAppStartParam','payload','raw','postId','post_id','messageId','message_id','channelId','channel_id','title']) {
    const value = query[name];
    if (value !== undefined && value !== null && String(value) !== '') rawValues.push(String(value));
  }
  rawValues.push(Object.entries(query || {}).map(([k, v]) => `${k}=${v}`).join('&'));
  for (const raw of rawValues) {
    const variants = [raw, safeDecode(raw)];
    for (const variant of variants) {
      add(candidates, variant);
      const compact = variant.match(/(?:cp|ck)_-?\d{3,}_-?\d{1,}/gi) || [];
      compact.forEach((item) => add(candidates, item));
      const explicitKeys = variant.match(/-?\d{3,}:-?\d{1,}/g) || [];
      explicitKeys.forEach((item) => add(candidates, item));
      const handoffs = variant.match(/h_[A-Za-z0-9_-]{6,}/g) || [];
      handoffs.forEach((item) => add(candidates, item));
      const longNumbers = variant.match(/-?\d{8,}/g) || [];
      longNumbers.forEach((item) => add(candidates, item));
      try {
        const params = new URLSearchParams(variant.replace(/^[^?#]*[?#]/, '').replace(/^#|^\?/, ''));
        for (const [, value] of params.entries()) add(candidates, value);
      } catch (_) {}
    }
  }
  return [...candidates];
}
function compactToCommentKey(value = '') {
  const s = clean(safeDecode(value));
  let m = s.match(/^(?:cp|ck)_(-?\d{3,})_(-?\d{1,})$/i);
  if (m) return `${m[1]}:${m[2]}`;
  m = s.match(/(?:^|[^A-Za-z0-9_-])(?:cp|ck)_(-?\d{3,})_(-?\d{1,})(?:$|[^A-Za-z0-9_-])/i);
  if (m) return `${m[1]}:${m[2]}`;
  return '';
}
function postMatchesCandidate(post = {}, candidate = '') {
  const c = key(candidate);
  if (!c || !post) return false;
  const postId = clean(post.postId || '');
  const messageId = clean(post.messageId || '');
  const commentKey = key(post.commentKey || '');
  const stable = clean(post.stablePayload || '');
  const handoff = clean(post.handoffToken || '');
  return Boolean(
    c === commentKey ||
    c === postId ||
    c === messageId ||
    c === stable ||
    c === handoff ||
    commentKey.endsWith(':' + c) ||
    stable.includes(c) ||
    handoff.includes(c)
  );
}
function resolvePost(query = {}) {
  const candidates = collectCandidates(query);
  const directCommentKey = key(query.commentKey || query.key || '');
  if (directCommentKey && store.getPost(directCommentKey)) return { post: store.getPost(directCommentKey), commentKey: directCommentKey, reason: 'commentKey' };

  for (const candidate of candidates) {
    const ck = compactToCommentKey(candidate);
    if (ck && store.getPost(ck)) return { post: store.getPost(ck), commentKey: ck, reason: 'compact_comment_key' };
    if (candidate.includes(':') && store.getPost(candidate)) return { post: store.getPost(candidate), commentKey: key(candidate), reason: 'explicit_comment_key' };
    const handoffKey = store.resolveCommentKeyFromHandoff ? store.resolveCommentKeyFromHandoff(candidate) : '';
    if (handoffKey && store.getPost(handoffKey)) return { post: store.getPost(handoffKey), commentKey: key(handoffKey), reason: 'handoff' };
    if (store.findPostByAnyId) {
      const found = store.findPostByAnyId(candidate);
      if (found) return { post: found, commentKey: key(found.commentKey || ''), reason: 'findPostByAnyId' };
    }
  }

  const channelId = clean(query.channelId || query.channel_id || '');
  const postId = clean(query.postId || query.post_id || query.messageId || query.message_id || '');
  if (channelId && postId && store.findPostByChannelAndPost) {
    const found = store.findPostByChannelAndPost(channelId, postId);
    if (found) return { post: found, commentKey: key(found.commentKey || `${channelId}:${postId}`), reason: 'channel_post' };
  }

  const posts = typeof store.getPostsList === 'function' ? store.getPostsList() : [];
  for (const candidate of candidates) {
    const found = posts.find((post) => postMatchesCandidate(post, candidate));
    if (found) return { post: found, commentKey: key(found.commentKey || ''), reason: 'scan_posts' };
  }

  const fallbackKey = directCommentKey || (channelId && postId ? `${channelId}:${postId}` : '');
  if (fallbackKey && store.store && store.store.comments && Array.isArray(store.store.comments[fallbackKey])) {
    return { post: null, commentKey: key(fallbackKey), reason: 'comments_without_post' };
  }

  return { post: null, commentKey: fallbackKey, reason: 'not_found' };
}
function postTitle(post = {}, fallback = '') {
  return clean(post.originalText || post.postText || post.title || post.postTitle || post.text || fallback || post.postId || 'Пост');
}
function buildMeta(post, commentKey, query, reason) {
  const channelId = clean(post && post.channelId || query.channelId || query.channel_id || (commentKey.includes(':') ? commentKey.split(':')[0] : ''));
  const postId = clean(post && post.postId || query.postId || query.post_id || query.messageId || query.message_id || (commentKey.includes(':') ? commentKey.split(':').slice(1).join(':') : ''));
  const title = postTitle(post || {}, clean(query.title || (postId ? 'Post ' + postId : '')));
  return {
    runtimeVersion: RUNTIME,
    resolveReason: reason,
    commentKey,
    channelId,
    postId,
    postTitle: title,
    postSnapshot: {
      title,
      text: title,
      originalText: post && post.originalText || '',
      messageId: post && post.messageId || '',
      stablePayload: post && post.stablePayload || '',
      handoffToken: post && post.handoffToken || ''
    },
    banner: {
      text: '🐋 АдминКИТ',
      button: '🐋 АдминКИТ',
      link: process.env.MAX_DEEP_LINK_BASE ? String(process.env.MAX_DEEP_LINK_BASE).replace(/\/$/, '') + '?start=menu' : 'https://max.ru/id781310320690_bot?start=menu'
    }
  };
}
function install(app) {
  if (!app || app.__adminkitCommentOpenState1546) return app;
  app.__adminkitCommentOpenState1546 = true;
  app.get('/api/adminkit/comment-open-state', (req, res) => {
    noCache(res);
    try {
      const resolved = resolvePost(req.query || {});
      const commentKey = key(resolved.commentKey || (resolved.post && resolved.post.commentKey) || '');
      if (!commentKey) {
        return res.status(404).json({ ok: false, error: 'post_not_found', runtimeVersion: RUNTIME, reason: resolved.reason, requested: req.query || {} });
      }
      const comments = listComments(commentKey, clean(req.query.userId || req.query.user_id || '')) || [];
      const meta = buildMeta(resolved.post || null, commentKey, req.query || {}, resolved.reason);
      return res.json({ ok: true, runtimeVersion: RUNTIME, meta, post: resolved.post || null, comments, commentsCount: comments.length, count: comments.length, safe: true });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error && error.message || 'comment_open_state_failed', runtimeVersion: RUNTIME });
    }
  });
  return app;
}
module.exports = { RUNTIME, install, resolvePost, buildMeta };
