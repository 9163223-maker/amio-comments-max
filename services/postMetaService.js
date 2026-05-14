'use strict';

// CC7.4.0
// Comment open state resolver.
// Focus: posts created on the current architecture must keep resolving after the next deploy.
// Resolution order: self-contained ak_ payload -> Postgres ak_posts/ak_post_settings -> store handoff/posts fallback.

const db = require('../cc5-db-core');
const stateDb = require('../db-v3-state');
let storeApi = null;
try { storeApi = require('../store'); } catch (_) { storeApi = null; }

const RUNTIME = 'CC7.4.0-POST-META-STABLE-PAYLOAD-RESOLVE';

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

function isAdminUiTitle(value) {
  return /админкит|главное меню|выберите|статус:|комментарии|подарки|кнопки|модерация/i.test(clean(value));
}

function pickRawText(raw = {}, row = {}) {
  const candidates = [
    raw.originalText,
    raw.original_text,
    raw.text,
    raw.caption,
    raw.body && raw.body.text,
    raw.message && raw.message.text,
    raw.postText,
    raw.post_text,
    raw.title,
    row.title,
    row.postTitle,
    row.postText
  ];
  for (const candidate of candidates) {
    const title = cut(candidate, 2000);
    if (!isBadTitle(title) && !isAdminUiTitle(title)) return title;
  }
  return '';
}

function pickPostTitle(row = {}) {
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  const rawText = pickRawText(raw, row);
  if (rawText) return cut(rawText, 320);
  return clean(row.title) || clean(row.post_id || row.postId) || 'Пост';
}

function buildPostSnapshot(row = {}) {
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  const attachments = raw.sourceAttachments || raw.source_attachments || raw.originalAttachments || raw.original_attachments || raw.attachments || [];
  const filteredAttachments = Array.isArray(attachments)
    ? attachments.filter((item) => clean(item && item.type) !== 'inline_keyboard')
    : [];
  return {
    text: pickRawText(raw, row) || pickPostTitle(row),
    title: pickPostTitle(row),
    format: raw.originalFormat || raw.original_format || raw.format || row.format || null,
    link: raw.originalLink || raw.original_link || raw.link || row.link || null,
    attachments: filteredAttachments,
    rawAvailable: Boolean(row.raw),
    source: 'ak_posts.raw/postMetaService'
  };
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
  if (!text || isBadTitle(text) || isAdminUiTitle(text)) return;

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

function base64UrlDecodeJson(value = '') {
  const text = clean(value).replace(/^ak_/i, '');
  if (!text || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (_) {
    return null;
  }
}

function parseStableOpenPayload(value = '') {
  const text = clean(safeDecode(value));
  const out = { commentKey: '', channelId: '', postId: '', messageId: '', rawPayload: '' };
  if (!text) return out;
  const match = text.match(/(?:^|[^A-Za-z0-9_-])(ak_[A-Za-z0-9_-]{8,})(?:$|[^A-Za-z0-9_-])/) || text.match(/^(ak_[A-Za-z0-9_-]{8,})$/);
  if (!match) return out;
  const payload = match[1];
  const data = base64UrlDecodeJson(payload);
  if (!data || typeof data !== 'object') return out;
  out.commentKey = clean(data.ck || data.commentKey || data.comment_key || '');
  out.channelId = clean(data.c || data.channelId || data.channel_id || '');
  out.postId = clean(data.p || data.postId || data.post_id || '');
  out.messageId = clean(data.m || data.messageId || data.message_id || out.postId || '');
  if (!out.commentKey && out.channelId && out.postId) out.commentKey = `${out.channelId}:${out.postId}`;
  if (out.commentKey && out.commentKey.includes(':')) {
    const [channelPart, postPart] = out.commentKey.split(':');
    if (!out.channelId && channelPart) out.channelId = clean(channelPart);
    if (!out.postId && postPart) out.postId = clean(postPart);
  }
  out.rawPayload = payload;
  return out;
}

function parseCompactPayload(value = {}) {
  const text = clean(safeDecode(value));
  const out = { commentKey: '', channelId: '', postId: '', messageId: '' };
  if (!text) return out;

  const stable = parseStableOpenPayload(text);
  if (stable.commentKey || stable.channelId || stable.postId) return stable;

  let m = text.match(/^cp_(-?\d{3,})_(-?\d{1,})$/i);
  if (m) {
    out.channelId = m[1];
    out.postId = m[2];
    out.messageId = m[2];
    out.commentKey = `${out.channelId}:${out.postId}`;
    return out;
  }

  m = text.match(/^ck_(-?\d{3,})_(-?\d{1,})$/i);
  if (m) {
    out.channelId = m[1];
    out.postId = m[2];
    out.messageId = m[2];
    out.commentKey = `${out.channelId}:${out.postId}`;
    return out;
  }

  m = text.match(/(-?\d{3,}):(-?\d{1,})/);
  if (m) {
    out.channelId = m[1];
    out.postId = m[2];
    out.messageId = m[2];
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
  let messageId = clean(input.messageId || '');
  let title = clean(input.title || input.postTitle || input.postText || '');
  let displayPostNumber = '';
  let stablePayload = '';

  const rawText = uniq([rawPieces.join(' '), ...rawPieces, commentKey, handoff, channelId, postId, messageId, title].map(safeDecode));

  for (const item of rawText) {
    const text = safeDecode(item);

    const compact = parseCompactPayload(text);
    if (!commentKey && compact.commentKey) commentKey = compact.commentKey;
    if (!channelId && compact.channelId) channelId = compact.channelId;
    if (!postId && compact.postId) postId = compact.postId;
    if (!messageId && compact.messageId) messageId = compact.messageId;
    if (!stablePayload && compact.rawPayload) stablePayload = compact.rawPayload;

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

    if (!messageId) {
      const match = text.match(/(?:messageId|message_id)[:=](-?\d{1,})/i);
      if (match) messageId = match[1];
    }

    if (!title) {
      const match = text.match(/\b(Post\s*new!!\s*\d+!|Post\s*new\s*\d+|Post\s*\d+|Post\s*zero\s*\d+|Пост\s*\d+)\b/i);
      if (match) title = match[1];
    }

    if (!displayPostNumber) displayPostNumber = extractDisplayPostNumber(text);
  }

  const normalizedHandoff = normalizeHandoffToken(handoff) || normalizeHandoffToken(rawText.join(' '));
  if (!handoff && normalizedHandoff) handoff = normalizedHandoff;
  const handoffCommentKey = resolveCommentKeyFromHandoffSafe(handoff || normalizedHandoff);
  if (!commentKey && handoffCommentKey) commentKey = handoffCommentKey;

  if (commentKey && commentKey.includes(':')) {
    const [channelPart, postPart] = commentKey.split(':');
    if (!channelId && channelPart) channelId = clean(channelPart);
    if (!postId && postPart) postId = clean(postPart);
    if (!messageId && postPart) messageId = clean(postPart);
  }

  if (!postId && displayPostNumber) postId = displayPostNumber;
  if (!messageId && postId && /^\d{5,}$/.test(postId)) messageId = postId;

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
    stablePayload,
    normalizedHandoff,
    handoff,
    postId && /^\d{5,}$/.test(postId) ? postId : '',
    messageId && /^\d{5,}$/.test(messageId) ? messageId : '',
    ...rawText
  ]);

  const likeKeys = uniq([...keys, ...titleCandidates])
    .filter((value) => value.length >= 4 && value.length <= 1024)
    .map(escapeLike);

  return {
    commentKey,
    handoff,
    normalizedHandoff,
    stablePayload,
    handoffResolvedCommentKey: handoffCommentKey,
    channelId,
    postId,
    messageId,
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

function rowToMeta(row = {}, source = 'Postgres ak_posts + ak_post_settings') {
  const customButtonText = clean(row.comments_banner_button || row.comments_banner_text || row.commentsBannerButton || row.commentsBannerText || '');
  return {
    adminId: row.admin_id || row.adminId || '',
    commentKey: row.comment_key || row.commentKey || '',
    channelId: row.channel_id || row.channelId || '',
    channelTitle: clean(row.channel_title || row.channelTitle) || 'Подключённый канал',
    postId: row.post_id || row.postId || '',
    messageId: row.message_id || row.messageId || '',
    postTitle: pickPostTitle(row),
    postSnapshot: buildPostSnapshot(row),
    commentsEnabled: row.comments_enabled !== false && row.commentsEnabled !== false,
    commentsPhoto: row.comments_photo !== false && row.commentsPhoto !== false,
    commentsReactions: row.comments_reactions !== false && row.commentsReactions !== false,
    banner: {
      enabled: row.comments_banner !== false && row.commentsBanner !== false,
      staticLabel: 'Начало обсуждения',
      text: customButtonText,
      button: customButtonText,
      link: clean(row.comments_banner_link || row.commentsBannerLink)
    },
    source,
    resolvedAt: new Date().toISOString()
  };
}

async function resolvePostMetaFromDb(params = {}) {
  await ensureSchema();

  const { keys, channelId, postId, messageId, titleCandidates, likeKeys } = params;
  const longPostId = postId && String(postId).length > 4 ? postId : '';
  const longMessageId = messageId && String(messageId).length > 4 ? messageId : '';
  const shortTitleCandidates = uniq([
    ...titleCandidates,
    params.displayPostNumber ? `Post ${params.displayPostNumber}` : '',
    postId && /^\d{1,4}$/.test(postId) ? `Post ${postId}` : ''
  ]);

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
      or ($2 <> '' and ($3 <> '' or $4 <> '') and p.channel_id = $2 and (p.post_id = $3 or p.message_id = $3 or p.post_id = $4 or p.message_id = $4))
      or ($3 <> '' and (p.post_id = $3 or p.message_id = $3))
      or ($4 <> '' and (p.post_id = $4 or p.message_id = $4))
      or (coalesce(array_length($5::text[], 1), 0) > 0 and lower(coalesce(p.title,'')) = any(select lower(x) from unnest($5::text[]) x))
      or (coalesce(array_length($6::text[], 1), 0) > 0 and p.raw::text ilike any($6::text[]))
    order by
      case
        when coalesce(array_length($1::text[], 1), 0) > 0 and p.comment_key = any($1::text[]) then 1
        when $2 <> '' and ($3 <> '' or $4 <> '') and p.channel_id = $2 and (p.post_id = $3 or p.message_id = $3 or p.post_id = $4 or p.message_id = $4) then 2
        when $3 <> '' and (p.post_id = $3 or p.message_id = $3) then 3
        when $4 <> '' and (p.post_id = $4 or p.message_id = $4) then 4
        when coalesce(array_length($5::text[], 1), 0) > 0 and lower(coalesce(p.title,'')) = any(select lower(x) from unnest($5::text[]) x) then 5
        when coalesce(array_length($6::text[], 1), 0) > 0 and p.raw::text ilike any($6::text[]) then 6
        else 9
      end,
      p.updated_at desc
    limit 1
  `, [keys, channelId, longPostId, longMessageId, shortTitleCandidates, likeKeys]);

  const row = rows[0];
  return row ? rowToMeta(row, 'Postgres ak_posts + ak_post_settings') : null;
}

function getStorePostByKey(key = '') {
  if (!storeApi || typeof storeApi.getPost !== 'function') return null;
  try { return storeApi.getPost(key); } catch (_) { return null; }
}

function getStorePostsList() {
  if (!storeApi || typeof storeApi.getPostsList !== 'function') return [];
  try {
    const list = storeApi.getPostsList();
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

function findStorePostByAnyId(value = '') {
  if (!storeApi || typeof storeApi.findPostByAnyId !== 'function') return null;
  try { return storeApi.findPostByAnyId(value); } catch (_) { return null; }
}

function safeGetChannel(channelId = '') {
  if (!storeApi || typeof storeApi.getChannel !== 'function') return null;
  try { return storeApi.getChannel(channelId); } catch (_) { return null; }
}

function titleMatchesPost(post = {}, titleCandidates = []) {
  const title = clean(post.title || post.postTitle || post.postText || pickPostTitle(post));
  if (!title) return false;
  const normalized = title.toLowerCase();
  return titleCandidates.some((item) => clean(item).toLowerCase() === normalized);
}

function numberMatchesPost(post = {}, displayPostNumber = '') {
  const n = clean(displayPostNumber);
  if (!n) return false;
  const title = clean(post.title || post.postTitle || post.postText || pickPostTitle(post));
  return new RegExp(`\\b(Post|Пост)\\s*${n}\\b`, 'i').test(title);
}

function postToMeta(post = {}, params = {}, source = 'store fallback') {
  const commentKey = clean(post.commentKey || params.commentKey || params.handoffResolvedCommentKey || (post.channelId && post.postId ? `${post.channelId}:${post.postId}` : ''));
  if (!commentKey) return null;

  const raw = post.raw && typeof post.raw === 'object' ? post.raw : {};
  const channelId = clean(post.channelId || post.channel_id || raw.channelId || params.channelId || (commentKey.includes(':') ? commentKey.split(':')[0] : ''));
  const postId = clean(post.postId || post.post_id || post.messageId || raw.postId || raw.messageId || params.postId || (commentKey.includes(':') ? commentKey.split(':')[1] : ''));
  const channel = safeGetChannel(channelId);
  const row = {
    adminId: post.adminId || post.admin_id || raw.adminId || '',
    channelId,
    postId,
    messageId: clean(post.messageId || post.message_id || raw.messageId || params.messageId || ''),
    commentKey,
    title: clean(post.title || post.postTitle || raw.title || raw.originalText || params.title || (params.displayPostNumber ? `Post ${params.displayPostNumber}` : '')),
    raw: { ...raw, originalText: raw.originalText || post.originalText || post.text || post.caption || '' },
    channelTitle: clean(post.channelTitle || raw.channelTitle || channel?.title || 'Подключённый канал'),
    commentsEnabled: post.commentsEnabled !== false && post.commentsDisabled !== true,
    commentsPhoto: post.commentsPhoto !== false,
    commentsReactions: post.commentsReactions !== false,
    commentsBanner: post.commentsBanner !== false,
    commentsBannerText: clean(post.commentsBannerText || post.bannerText || ''),
    commentsBannerButton: clean(post.commentsBannerButton || post.bannerButton || ''),
    commentsBannerLink: clean(post.commentsBannerLink || post.bannerLink || '')
  };
  return rowToMeta(row, source);
}

function resolvePostMetaFromStore(params = {}) {
  if (!storeApi) return null;

  const candidates = uniq([
    params.commentKey,
    params.handoffResolvedCommentKey,
    params.stablePayload,
    params.handoff,
    params.normalizedHandoff,
    params.postId,
    params.messageId,
    params.title,
    ...params.titleCandidates,
    ...params.rawText
  ]);

  for (const key of [params.commentKey, params.handoffResolvedCommentKey]) {
    const direct = getStorePostByKey(key);
    if (direct) return postToMeta(direct, params, 'store.getPost direct commentKey fallback');
  }

  for (const candidate of candidates) {
    const found = findStorePostByAnyId(candidate);
    if (found) return postToMeta(found, params, 'store.findPostByAnyId fallback');
  }

  const posts = getStorePostsList();
  const byTitle = posts.find((post) => titleMatchesPost(post, params.titleCandidates));
  if (byTitle) return postToMeta(byTitle, params, 'store title fallback');

  const byNumber = posts.find((post) => numberMatchesPost(post, params.displayPostNumber || params.postId));
  if (byNumber) return postToMeta(byNumber, params, 'store post-number title fallback');

  return null;
}

async function resolvePostMeta(input = {}) {
  const params = input && input.keys ? input : normalizeParams(input);
  const trace = { runtimeVersion: RUNTIME, stablePayload: params.stablePayload || '', attempts: [], dbError: '' };

  try {
    const meta = await resolvePostMetaFromDb(params);
    trace.attempts.push({ source: 'postgres', ok: Boolean(meta) });
    if (meta) {
      meta.resolutionTrace = trace;
      return meta;
    }
  } catch (error) {
    trace.dbError = error && error.message ? error.message : String(error);
    trace.attempts.push({ source: 'postgres', ok: false, error: trace.dbError });
  }

  const storeMeta = resolvePostMetaFromStore(params);
  trace.attempts.push({ source: 'store', ok: Boolean(storeMeta) });
  if (storeMeta) {
    storeMeta.resolutionTrace = trace;
    return storeMeta;
  }

  return null;
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
    postSnapshot: meta && meta.postSnapshot ? meta.postSnapshot : null,
    comments,
    commentsCount: comments.length,
    resolverTrace: meta && meta.resolutionTrace ? meta.resolutionTrace : null,
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
      'buildCommentOpenState',
      'parseStableOpenPayload'
    ],
    stablePayload: 'ak_base64url_supported',
    storeAvailable: Boolean(storeApi),
    storeHandoffResolver: Boolean(storeApi && typeof storeApi.resolveCommentKeyFromHandoff === 'function'),
    storeFindPostByAnyId: Boolean(storeApi && typeof storeApi.findPostByAnyId === 'function'),
    storeGetPostsList: Boolean(storeApi && typeof storeApi.getPostsList === 'function'),
    policy: 'stable_payload_first_postgres_first_store_fallback_keep_new_posts_stable_across_deploys'
  };
}

module.exports = {
  RUNTIME,
  normalizeParams,
  parseParamsFromRequest,
  parseStableOpenPayload,
  resolvePostMeta,
  buildCommentOpenState,
  selfTest
};
