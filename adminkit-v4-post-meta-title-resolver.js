'use strict';

// CC6.8.3: direct Postgres post-meta resolver with numeric startapp/display-title fallback.
// Important:
// - display text like "Post 22" is NOT the real MAX post_id;
// - MAX may open the mini-app with startapp=22 instead of postId/commentKey;
// - DB remains the only source of truth; store/history are not decision sources.

const RUNTIME = 'CC6.8.3-V4-POST-META-NUMERIC-STARTAPP-FALLBACK';
const MARKER = '__ADMINKIT_V4_POST_META_NUMERIC_STARTAPP_FALLBACK_683__';

const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 320) => { const s = clean(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}

function safeDecode(v) {
  let s = String(v || '');
  for (let i = 0; i < 5; i += 1) {
    try {
      const d = decodeURIComponent(s.replace(/\+/g, '%20'));
      if (d === s) break;
      s = d;
    } catch {
      break;
    }
  }
  return s;
}

function uniq(list) {
  return [...new Set((list || []).map(clean).filter(Boolean))];
}

function escLike(v) {
  return `%${clean(v).replace(/[%_]/g, '\\$&')}%`;
}

function isBadTitle(v) {
  const s = clean(v);
  return !s || /^загрузка/i.test(s) || /^loading/i.test(s) || /^-?\d{8,}$/.test(s) || /^[a-f0-9]{16,}$/i.test(s);
}

function pickTitle(row = {}) {
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  const candidates = [
    raw.originalText,
    raw.original_text,
    raw.text,
    raw.caption,
    raw.body && raw.body.text,
    raw.message && raw.message.text,
    raw.postText,
    raw.post_text,
    row.title,
    raw.title
  ];
  for (const item of candidates) {
    const s = cut(item, 320);
    if (!isBadTitle(s) && !/админкит|главное меню|выберите|статус:/i.test(s)) return s;
  }
  return clean(row.title) || clean(row.post_id) || 'Пост';
}

function extractDisplayPostNumber(value) {
  const s = clean(safeDecode(value));
  if (!s) return '';
  let m = s.match(/^\d{1,4}$/);
  if (m) return m[0];
  m = s.match(/(?:^|[?&#\s])(startapp|start_param|WebAppStartParam|post|postId|post_id|title)=(?:Post\s*)?(\d{1,4})(?:$|[&#\s])/i);
  if (m) return m[2];
  m = s.match(/\bPost\s*(\d{1,4})\b/i);
  if (m) return m[1];
  m = s.match(/\bПост\s*(\d{1,4})\b/i);
  if (m) return m[1];
  return '';
}

function pushTitleVariants(out, value) {
  const s = clean(safeDecode(value));
  if (!s || isBadTitle(s)) return;
  out.push(s);
  const n = extractDisplayPostNumber(s);
  if (n) {
    out.push(`Post ${n}`, `Пост ${n}`, `post ${n}`);
  }
}

function parseParams(req) {
  const q = req.query || {};
  const rawPieces = [
    req.url,
    req.originalUrl,
    q.raw,
    q.title,
    q.postTitle,
    q.postText,
    q.startapp,
    q.start_param,
    q.WebAppStartParam,
    q.handoff,
    q.postId,
    q.post_id,
    q.messageId,
    q.commentKey,
    q.key,
    q.channelId,
    q.channel
  ].filter(Boolean).map(safeDecode);

  let commentKey = clean(q.commentKey || q.key || '');
  let handoff = clean(q.handoff || q.startapp || q.start_param || q.WebAppStartParam || '');
  let channelId = clean(q.channelId || q.channel || '');
  let postId = clean(q.postId || q.post_id || q.messageId || '');
  let title = clean(q.title || q.postTitle || q.postText || '');
  let displayPostNumber = '';

  const raws = uniq([rawPieces.join(' '), ...rawPieces, commentKey, handoff, channelId, postId, title].map(safeDecode));
  for (const s0 of raws) {
    const s = safeDecode(s0);
    if (!commentKey) {
      const m = s.match(/-?\d{6,}:-?\d{3,}/);
      if (m) commentKey = m[0];
    }
    if (!handoff) {
      const m = s.match(/h_[A-Za-z0-9_-]{6,}/);
      if (m) handoff = m[0];
    }
    if (!postId) {
      const m = s.match(/(?:postId|post_id|messageId)[:=](-?\d{1,})/i);
      if (m) postId = m[1];
    }
    if (!title) {
      const m = s.match(/\b(Post\s*new!!\s*\d+!|Post\s*new\s*\d+|Post\s*\d+|Post\s*zero\s*\d+|Пост\s*\d+)\b/i);
      if (m) title = m[1];
    }
    if (!displayPostNumber) displayPostNumber = extractDisplayPostNumber(s);
  }

  if (commentKey && commentKey.includes(':')) {
    const [ch, p] = commentKey.split(':');
    if (!channelId && ch) channelId = clean(ch);
    if (!postId && p) postId = clean(p);
  }

  if (!postId && displayPostNumber) postId = displayPostNumber;

  const titleCandidates = [];
  pushTitleVariants(titleCandidates, title);
  if (displayPostNumber) pushTitleVariants(titleCandidates, `Post ${displayPostNumber}`);
  if (postId && /^\d{1,4}$/.test(postId)) pushTitleVariants(titleCandidates, `Post ${postId}`);
  for (const s of raws) {
    const m = s.match(/\b(Post\s*new!!\s*\d+!|Post\s*new\s*\d+|Post\s*\d+|Post\s*zero\s*\d+|Пост\s*\d+)\b/i);
    if (m) pushTitleVariants(titleCandidates, m[1]);
  }

  const keys = uniq([commentKey, handoff, postId && /^\d{5,}$/.test(postId) ? postId : '', ...raws]);
  const likeKeys = uniq([...keys, ...titleCandidates]).filter(v => v.length >= 4).map(escLike);

  return {
    commentKey,
    handoff,
    channelId,
    postId,
    displayPostNumber,
    title,
    titleCandidates: uniq(titleCandidates),
    keys,
    likeKeys
  };
}

async function resolveMeta(params) {
  const db = require('./cc5-db-core');
  const state = require('./db-v3-state');
  await state.ensure();

  const { keys, channelId, postId, titleCandidates, likeKeys } = params;
  const { rows } = await db.query(`
    select
      p.channel_id, p.post_id, p.message_id, p.comment_key, p.title, p.raw, p.updated_at,
      c.title as channel_title,
      coalesce(s.comments_enabled, true) as comments_enabled,
      coalesce(s.comments_photo, true) as comments_photo,
      coalesce(s.comments_reactions, true) as comments_reactions,
      coalesce(s.comments_banner, true) as comments_banner,
      coalesce(nullif(s.comments_banner_text,''), '') as comments_banner_text,
      coalesce(nullif(s.comments_banner_button,''), '') as comments_banner_button,
      coalesce(nullif(s.comments_banner_link,''), '') as comments_banner_link
    from ak_posts p
    left join ak_channels c on c.channel_id = p.channel_id
    left join lateral (
      select * from ak_post_settings s0
      where s0.comment_key = p.comment_key or (s0.channel_id = p.channel_id and s0.post_id = p.post_id)
      order by s0.updated_at desc limit 1
    ) s on true
    where
      (coalesce(array_length($1::text[], 1), 0) > 0 and p.comment_key = any($1::text[]))
      or ($2 <> '' and $3 <> '' and length($3) > 4 and p.channel_id = $2 and (p.post_id = $3 or p.message_id = $3))
      or ($3 <> '' and length($3) > 4 and (p.post_id = $3 or p.message_id = $3))
      or (coalesce(array_length($4::text[], 1), 0) > 0 and lower(coalesce(p.title,'')) = any(select lower(x) from unnest($4::text[]) x))
      or (coalesce(array_length($5::text[], 1), 0) > 0 and p.raw::text ilike any($5::text[]))
    order by
      case
        when coalesce(array_length($1::text[], 1), 0) > 0 and p.comment_key = any($1::text[]) then 1
        when $2 <> '' and $3 <> '' and length($3) > 4 and p.channel_id = $2 and (p.post_id = $3 or p.message_id = $3) then 2
        when $3 <> '' and length($3) > 4 and (p.post_id = $3 or p.message_id = $3) then 3
        when coalesce(array_length($4::text[], 1), 0) > 0 and lower(coalesce(p.title,'')) = any(select lower(x) from unnest($4::text[]) x) then 4
        when coalesce(array_length($5::text[], 1), 0) > 0 and p.raw::text ilike any($5::text[]) then 5
        else 9
      end,
      p.updated_at desc
    limit 1
  `, [keys, channelId, postId, titleCandidates, likeKeys]);

  const row = rows[0];
  if (!row) return null;
  const customButtonText = clean(row.comments_banner_button || row.comments_banner_text || '');
  return {
    commentKey: row.comment_key,
    channelId: row.channel_id,
    channelTitle: clean(row.channel_title) || 'Подключённый канал',
    postId: row.post_id,
    messageId: row.message_id,
    postTitle: pickTitle(row),
    commentsEnabled: row.comments_enabled !== false,
    commentsPhoto: row.comments_photo !== false,
    commentsReactions: row.comments_reactions !== false,
    banner: {
      enabled: row.comments_banner !== false,
      text: customButtonText,
      button: customButtonText,
      link: clean(row.comments_banner_link)
    },
    source: 'Postgres ak_posts direct + numeric startapp/title fallback'
  };
}

function installRoutes(app) {
  if (!app || app.__adminkitV4PostMetaNumericStartFallbackRoutes) return app;
  app.__adminkitV4PostMetaNumericStartFallbackRoutes = true;

  const handler = async (req, res) => {
    noCache(res);
    const params = parseParams(req);
    try {
      const meta = await resolveMeta(params);
      return res.json({ ok: Boolean(meta), runtimeVersion: RUNTIME, params, meta, error: '' });
    } catch (e) {
      return res.json({ ok: false, runtimeVersion: RUNTIME, params, meta: null, error: e?.message || String(e) });
    }
  };

  app.get('/api/adminkit/post-meta', handler);
  app.get('/debug/post-meta', handler);
  return app;
}

function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;
  const Module = require('module');
  if (!Module.__adminkitV4PostMetaNumericStartFallbackExpressWrap) {
    Module.__adminkitV4PostMetaNumericStartFallbackExpressWrap = true;
    const oldLoad = Module._load;
    Module._load = function adminkitV4PostMetaNumericStartFallbackLoad(request, parent, isMain) {
      const loaded = oldLoad.apply(this, arguments);
      if (String(request) !== 'express' || !loaded || loaded.__adminkitV4PostMetaNumericStartFallbackWrapped) return loaded;
      function wrappedExpress(...args) {
        const app = loaded(...args);
        return installRoutes(app);
      }
      Object.setPrototypeOf(wrappedExpress, loaded);
      Object.assign(wrappedExpress, loaded);
      wrappedExpress.__adminkitV4PostMetaNumericStartFallbackWrapped = true;
      return wrappedExpress;
    };
  }
  return selfTest(false);
}

function selfTest(already = false) {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    marker: MARKER,
    already,
    endpoints: ['/api/adminkit/post-meta', '/debug/post-meta'],
    policy: 'db_only_comment_key_then_real_post_id_then_display_title_from_numeric_startapp_no_store_history'
  };
}

module.exports = { RUNTIME, MARKER, install, selfTest, parseParams, resolveMeta };
