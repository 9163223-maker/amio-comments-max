'use strict';

// CC7.2.4
// Comment open state resolver.
// Important fix: open_app in MAX passes start_param/startapp payload (usually h_<token>).
// The previous clean Postgres-only resolver could not translate that handoff token to commentKey,
// so both old and new posts opened without a post context.

const db = require('../cc5-db-core');
const stateDb = require('../db-v3-state');
let storeApi = null;
try { storeApi = require('../store'); } catch (_) { storeApi = null; }

const RUNTIME = 'CC7.2.4-POST-META-HANDOFF-RESOLVE';

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cut(value, limit = 320) {
  const text = clean(value);
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
}

function safeDecode(value) {
  let current = String(value || '');
  for (let i = 0; i < 5; i += 1) {
    try {
      const decoded = decodeURIComponent(current.replace(/\+/g, '%20'));
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

function uniq(list) {
  return [...new Set((list || []).map(clean).filter(Boolean))];
}

function escapeLike(value) {
  return `%${clean(value).replace(/[%_]/g, '\\$&')}%`;
}

function isBadTitle(value) {
  const text = clean(value);
  return !text ||
    /^загрузка/i.test(text) ||
    /^loading/i.test(text) ||
    /^-?\d{8,}$/.test(text) ||
    /^[a-f0-9]{16,}$/i.test(text);
}

function pickPostTitle(row = {}) {
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

  for (const candidate of candidates) {
    const title = cut(candidate, 320);
    if (!isBadTitle(title) && !/админкит|главное меню|выберите|статус:/i.test(title)) return title;
  }

  return clean(row.title) || clean(row.post_id) || 'Пост';
}

function extractDisplayPostNumber(value) {
  const text = clean(safeDecode(value));
  if (!text) return '';

  let match = text.match(/^\d{1,4}$/);
  if (match) return match[0];

  match = text.match(/(?:^|[?&#\s])(startapp|start_param|WebAppStartParam|post|postId|post_id|title)=(?:Post\s*)?(\d{1,4})(?:$|[&#\s])/i);
  if (match) return match[2];

  match = text.match(/\bPost\s*(\d{1,4})\b/i);
  if (match) return match[1];

  match = text.match(/\bПост\s*(\d{1,4})\b/i);
  if (match) return match[1];

  return '';
}

function pushTitleVariants(target, value) {
  const text = clean(safeDecode(value));
  if (!text || isBadTitle(text)) return;

  target.push(text);
  const number = extractDisplayPostNumber(text);
  if (number) {
    target.push(`Post ${number}`, `Пост ${number}`, `post ${number}`);
  }
}

function normalizeHandoffToken(value = '') {
  const text = clean(safeDecode(value));
  const match = text.match(/(?:^|[^\w-])(h_[A-Za-z0-9_-]{6,})(?:$|[^\w-])/) || text.match(/^(h_[A-Za-z0-9_-]{6,})$/);
  return match ? match[1] : '';
}

function resolveCommentKeyFromHandoffSafe(token = '') {
  const handoff = normalizeHandoffToken(token);
  if (!handoff || !storeApi || typeof storeApi.resolveCommentKeyFromHandoff !== 'function') return '';
  try { return clean(storeApi.resolveCommentKeyFromHandoff(handoff)); } catch (_) { return ''; }
}

function parseCompactPayload(value = {}) {
  const text = clean(safeDecode(value));
  const out = { commentKey: '', channelId: '', postId: '' };
  if (!text) return out;

  let m = text.match(/^cp_(-?\d{3,})_(-?\d{1,})$/i);
  if (m) {
    out.channelId = m[1];
    out.postId = m[2];
    out.commentKey = `${out.channelId}:${out.postId}`;
    return out;
  }

  m = text.match(/^ck_(-?\d{3,})_(-?\d{1,})$/i);
  if (m) {
    out.channelId = m[1];
    out.postId = m[2];
    out.commentKey = `${out.channelId}:${out.postId}`;
    return out;
  }

  m = text.match(/(-?\d{3,}):(-?\d{1,})/);
  if (m) {
    out.channelId = m[1];
    out.postId = m[2];
    out.commentKey = `${out.channelId}:${out.postId}`;
  }
  return out;
}

function normalizeParams(input = {}) {
  const rawPieces = [
    input.url,
    input.originalUrl,
    input.raw,
    input.title,
    input.postTitle,
    input.postText,
    input.startapp,
    input.start_param,
    input.WebAppStartParam,
    input.handoff,
    input.postId,
    input.post_id,
    input.messageId,
    input.commentKey,
    input.key,
    input.channelId,
    input.channel
  ].filter(Boolean).map(safeDecode);

  let commentKey = clean(input.commentKey || input.key || '');
  let handoff = clean(input.handoff || input.startapp || input.start_param || input.WebAppStartParam || '');
  let channelId = clean(input.channelId || input.channel || '');
  let postId = clean(input.postId || input.post_id || input.messageId || '');
  let title = clean(input.title || input.postTitle || input.postText || '');
  let displayPostNumber = '';

  const rawText = uniq([rawPieces.join(' '), ...rawPieces, commentKey, handoff, channelId, postId, title].map(safeDecode));

  for (const item of rawText) {
    const text = safeDecode(item);

    const compact = parseCompactPayload(text);
    if (!commentKey && compact.commentKey) commentKey = compact.commentKey;
    if (!channelId && compact.channelId) channelId = compact.channelId;
    if (!postId && compact.postId) postId = compact.postId;

    if (!commentKey) {
      const match = text.match(/-?\d{3,}:-?\d{1,}/);
      if (match) commentKey = match[0];
    }

    if (!handoff) {
      const match = text.match(/h_[A-Za-z0-9_-]{6,}/);
      if (match) handoff = match[0];
    }

    if (!postId) {
      const match = text.match(/(?:postId|post_id|messageId|post)[:=](-?\d{1,})/i);
      if (match) postId = match[1];
    }

    if (!title) {
      const match = text.match(/\b(Post\s*new!!\s*\d+!|Post\s*new\s*\d+|Post\s*\d+|Post\s*zero\s*\d+|Пост\s*\d+)\b/i);
      if (match) title = match[1];
    }

    if (!displayPostNumber) displayPostNumber = extractDisplayPostNumber(text);
  }

  const handoffCommentKey = resolveCommentKeyFromHandoffSafe(handoff);
  if (!commentKey && handoffCommentKey) commentKey = handoffCommentKey;

  if (commentKey && commentKey.includes(':')) {
    const [channelPart, postPart] = commentKey.split(':');
    if (!channelId && channelPart) channelId = clean(channelPart);
    if (!postId && postPart) postId = clean(postPart);
  }

  if (!postId && displayPostNumber) postId = displayPostNumber;

  const titleCandidates = [];
  pushTitleVariants(titleCandidates, title);
  if (displayPostNumber) pushTitleVariants(titleCandidates, `Post ${displayPostNumber}`);
  if (postId && /^\d{1,4}$/.test(postId)) pushTitleVariants(titleCandidates, `Post ${postId}`);

  for (const item of rawText) {
    const match = item.match(/\b(Post\s*new!!\s*\d+!|Post\s*new\s*\d+|Post\s*\d+|Post\s*zero\s*\d+|Пост\s*\d+)\b/i);
    if (match) pushTitleVariants(titleCandidates, match[1]);
  }

  const keys = uniq([
    commentKey,
    handoffCommentKey,
    handoff,
    postId && /^\d{5,}$/.test(postId) ? postId : '',
    ...rawText
  ]);

  const likeKeys = uniq([...keys, ...titleCandidates])
    .filter((value) => value.length >= 4)
    .map(escapeLike);

  return {
    commentKey,
    handoff,
    handoffResolvedCommentKey: handoffCommentKey,
    channelId,
    postId,
    displayPostNumber,
    title,
    titleCandidates: uniq(titleCandidates),
    keys,
    likeKeys,
    rawText
  };
}

function parseParamsFromRequest(req = {}) {
  const query = req.query || {};
  return normalizeParams({
    url: req.url,
    originalUrl: req.originalUrl,
    raw: query.raw,
    title: query.title,
    postTitle: query.postTitle,
    postText: query.postText,
    startapp: query.startapp,
    start_param: query.start_param,
    WebAppStartParam: query.WebAppStartParam,
    handoff: query.handoff,
    postId: query.postId,
    post_id: query.post_id,
    messageId: query.messageId,
    commentKey: query.commentKey,
    key: query.key,
    channelId: query.channelId,
    channel: query.channel
  });
}

async function ensureSchema() {
  await stateDb.ensure();
}

async function resolvePostMeta(input = {}) {
  const params = input && input.keys ? input : normalizeParams(input);
  await ensureSchema();

  const { keys, channelId, postId, titleCandidates, likeKeys } = params;

  const { rows } = await db.query(`
    select
      p.admin_id,
      p.channel_id,
      p.post_id,
      p.message_id,
      p.comment_key,
      p.title,
      p.raw,
      p.updated_at,
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
      where s0.comment_key = p.comment_key
         or (s0.channel_id = p.channel_id and s0.post_id = p.post_id)
      order by s0.updated_at desc
      limit 1
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
    adminId: row.admin_id,
    commentKey: row.comment_key,
    channelId: row.channel_id,
    channelTitle: clean(row.channel_title) || 'Подключённый канал',
    postId: row.post_id,
    messageId: row.message_id,
    postTitle: pickPostTitle(row),
    commentsEnabled: row.comments_enabled !== false,
    commentsPhoto: row.comments_photo !== false,
    commentsReactions: row.comments_reactions !== false,
    banner: {
      enabled: row.comments_banner !== false,
      staticLabel: 'Начало обсуждения',
      text: customButtonText,
      button: customButtonText,
      link: clean(row.comments_banner_link)
    },
    source: 'Postgres ak_posts + ak_post_settings + store handoff resolver',
    resolvedAt: new Date().toISOString()
  };
}

async function buildCommentOpenState(input = {}, options = {}) {
  const params = input && input.keys ? input : normalizeParams(input);
  const meta = await resolvePostMeta(params);
  const includeComments = options.includeComments !== false;
  let comments = [];

  if (includeComments && meta && meta.commentKey) {
    try {
      const commentService = require('./commentService');
      if (typeof commentService.listComments === 'function') {
        comments = await commentService.listComments(meta.commentKey);
      }
    } catch {
      comments = [];
    }
  }

  if (!Array.isArray(comments)) comments = [];

  return {
    ok: Boolean(meta),
    runtimeVersion: RUNTIME,
    params,
    meta,
    comments,
    commentsCount: comments.length,
    error: meta ? '' : 'post_meta_not_found'
  };
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    exports: [
      'normalizeParams',
      'parseParamsFromRequest',
      'resolvePostMeta',
      'buildCommentOpenState'
    ],
    storeHandoffResolver: Boolean(storeApi && typeof storeApi.resolveCommentKeyFromHandoff === 'function'),
    policy: 'postgres_meta_plus_store_handoff_resolve_for_max_open_app_start_param'
  };
}

module.exports = {
  RUNTIME,
  normalizeParams,
  parseParamsFromRequest,
  resolvePostMeta,
  buildCommentOpenState,
  selfTest
};
