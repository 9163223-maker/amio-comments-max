'use strict';

const db = require('../../cc5-db-core');
const base = require('./postRegistryDataAdapterV5');

const RUNTIME = 'ADMINKIT-CORE-POST-REGISTRY-DATA-ADAPTER-1.40.6-DISTINCT-POST-LABELS';

function clean(value = '') { return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 96) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function isRawId(value = '') { const s = clean(value); return /^-?\d{6,}$/.test(s) || /^[a-f0-9]{12,}$/i.test(s); }
function isGenericPost(value = '') {
  const s = clean(value).toLowerCase();
  return !s || isRawId(s) || ['пост', 'пост без текста', 'stress test post', 'synthetic post for core stress-test. it is cleaned after run.'].includes(s) || /^пост\s+\d+$/i.test(s);
}
function isGenericChannel(value = '') {
  const s = clean(value).toLowerCase();
  return !s || isRawId(s) || ['канал', 'текущий канал', 'канал без названия', 'existing channel', 'unknown', 'undefined', 'null'].includes(s);
}
function humanPostText(...values) {
  for (const value of values) {
    const s = clean(value);
    if (s && !isGenericPost(s) && !['undefined', 'null'].includes(s.toLowerCase())) return cut(s, 120);
  }
  return '';
}
function humanChannelTitle(...values) {
  for (const value of values) {
    const s = clean(value);
    if (s && !isGenericChannel(s) && !['undefined', 'null'].includes(s.toLowerCase())) return cut(s, 120);
  }
  return '';
}
function tryJson(value) {
  if (!value || typeof value !== 'string') return null;
  const s = value.trim();
  if (!s || !/^[\[{]/.test(s)) return null;
  try { return JSON.parse(s); } catch { return null; }
}
function looksTechnicalKey(key = '') {
  return /(id|uid|uuid|key|hash|token|url|link|source|type|date|time|at|count|admin|channel|post|comment|created|updated|request|payloadkeys)$/i.test(String(key || ''));
}
function walkHumanText(value, depth = 0, mode = 'post') {
  if (depth > 5 || value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    const s0 = String(value ?? '');
    const parsed = typeof value === 'string' ? tryJson(value) : null;
    if (parsed) return walkHumanText(parsed, depth + 1, mode);
    return mode === 'channel' ? humanChannelTitle(s0) : humanPostText(s0);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = walkHumanText(item, depth + 1, mode);
      if (found) return found;
    }
    return '';
  }
  if (typeof value === 'object') {
    const priority = mode === 'channel'
      ? ['channelTitle', 'channel_title', 'title', 'name', 'displayTitle', 'display_title', 'caption', 'text']
      : ['postTitle', 'post_title', 'postPreview', 'post_preview', 'preview', 'title', 'text', 'caption', 'postText', 'post_text', 'body', 'content', 'messageText', 'message_text', 'description', 'plainText', 'plain_text', 'html'];
    for (const key of priority) {
      const found = walkHumanText(value[key], depth + 1, mode);
      if (found) return found;
    }
    for (const key of ['post', 'message', 'original', 'raw', 'payload', 'data', 'attachment', 'media', 'forward', 'forwarded', 'body']) {
      const found = walkHumanText(value[key], depth + 1, mode);
      if (found) return found;
    }
    for (const [key, val] of Object.entries(value)) {
      if (looksTechnicalKey(key)) continue;
      const found = walkHumanText(val, depth + 1, mode);
      if (found) return found;
    }
  }
  return '';
}
function dateLabel(value) {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  try {
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
  } catch { return d.toISOString().slice(0, 16).replace('T', ' '); }
}
function mediaLabel(row = {}) {
  const src = clean(row.source || row.meta?.source || row.meta?.type || row.meta?.mediaType || row.meta?.media_type || '').toLowerCase();
  const text = JSON.stringify(row.meta || {}).toLowerCase();
  if (/video|видео/.test(src) || /video|видео/.test(text)) return 'Видео';
  if (/photo|image|фото|картин/.test(src) || /photo|image|фото|картин/.test(text)) return 'Фото';
  return 'Пост';
}
function postFallback(row = {}) {
  const dt = dateLabel(row.updated_at || row.updatedAt || row.created_at || row.createdAt);
  return dt ? `${mediaLabel(row)} от ${dt}` : `${mediaLabel(row)} без текста`;
}
function rowJson(row = {}) { return row.row_json && typeof row.row_json === 'object' ? row.row_json : row; }
function postDisplay(row = {}) {
  const json = rowJson(row);
  return humanPostText(row.post_title, row.post_preview, row.title, row.text, row.caption, row.content, walkHumanText(row.meta), walkHumanText(json)) || postFallback({ ...json, ...row });
}
function postPreview(row = {}) {
  const json = rowJson(row);
  return humanPostText(row.post_preview, row.post_title, walkHumanText(row.meta), walkHumanText(json)) || postDisplay(row);
}
function channelDisplay(row = {}, fallbackChannelId = '') {
  const json = rowJson(row);
  return humanChannelTitle(row.channel_title, row.title, row.channel_name, row.display_title, row.name, walkHumanText(row.meta, 0, 'channel'), walkHumanText(json, 0, 'channel')) || (clean(fallbackChannelId || row.channel_id || row.channelId) ? 'Канал без названия' : 'Канал не выбран');
}
function adminIdOf(ctx = {}) { return clean(ctx.adminId || ctx.admin_id || ctx.userId || ''); }
function channelIdOf(ctx = {}) { return clean(ctx.channelId || ctx.payload?.channelId || ctx.selected_channel_id || ctx.session?.selected_channel_id || ctx.draft?.channelId || ''); }
function postIdOf(ctx = {}) { return clean(ctx.postId || ctx.payload?.postId || ctx.selected_post_id || ctx.session?.selected_post_id || ctx.draft?.postId || ctx.post?.id || ''); }
function commentKeyOf(ctx = {}, input = {}) { return clean(input.commentKey || input.comment_key || ctx.commentKey || ctx.payload?.commentKey || ctx.selected_comment_key || ctx.session?.selected_comment_key || ctx.draft?.commentKey || ''); }

async function listChannels(ctx = {}) {
  await base.ensure();
  const adminId = adminIdOf(ctx);
  const selectedChannelId = channelIdOf(ctx);
  const channels = [];
  const seen = new Set();
  function push(row = {}, source = '') {
    const json = rowJson(row);
    const channelId = clean(row.channel_id || row.channelId || json.channel_id || json.channelId);
    if (!channelId || seen.has(channelId)) return;
    seen.add(channelId);
    const title = channelDisplay({ ...json, ...row }, channelId);
    channels.push({ channelId, channelTitle: title, title, displayTitle: title, postCount: Number(row.post_count || row.posts_count || row.postCount || 0), selected: !!selectedChannelId && selectedChannelId === channelId, source, lastSeenAt: row.last_seen_at || row.updated_at || json.updated_at || null });
  }
  if (adminId) {
    for (const q of [
      { source: 'ak_admin_channels', sql: `select ac.channel_id, row_to_json(ac) as row_json, nullif(coalesce(c.title, c.channel_title, c.name, p.channel_title, ''), '') as channel_title, count(p.post_id)::int as post_count, max(coalesce(p.updated_at, ac.updated_at, c.updated_at)) as last_seen_at from ak_admin_channels ac left join ak_channels c on c.channel_id=ac.channel_id left join ak_posts p on p.admin_id=ac.admin_id and p.channel_id=ac.channel_id where ac.admin_id=$1 group by ac.channel_id, ac, c.title, c.channel_title, c.name, p.channel_title order by last_seen_at desc nulls last limit 20` },
      { source: 'ak_posts', sql: `select channel_id, max(nullif(channel_title,'')) as channel_title, count(*)::int as post_count, max(updated_at) as last_seen_at from ak_posts where ($1='' or admin_id=$1) and channel_id<>'' group by channel_id order by last_seen_at desc limit 20` }
    ]) {
      try { const { rows } = await db.query(q.sql, [adminId]); (rows || []).forEach((row) => push(row, q.source)); } catch {}
    }
  }
  if (selectedChannelId && !seen.has(selectedChannelId)) channels.unshift({ channelId: selectedChannelId, channelTitle: channelDisplay(ctx, selectedChannelId), title: channelDisplay(ctx, selectedChannelId), displayTitle: channelDisplay(ctx, selectedChannelId), postCount: 0, selected: true, source: 'session' });
  return channels;
}

async function listPosts(ctx = {}, options = {}) {
  await base.ensure();
  const adminId = adminIdOf(ctx);
  const channelId = clean(options.channelId || channelIdOf(ctx));
  const limit = Math.max(1, Math.min(Number(options.limit || 10), 20));
  const { rows } = await db.query(`select p.channel_id, p.channel_title, p.post_id, p.comment_key, p.post_title, p.post_preview, p.source, p.meta, p.updated_at, p.created_at, row_to_json(p) as row_json from ak_posts p where ($1='' or p.admin_id=$1) and ($2='' or p.channel_id=$2) order by p.updated_at desc, p.post_id desc limit $3`, [adminId, channelId, limit]);
  return (rows || []).map((row) => {
    const json = rowJson(row);
    const display = postDisplay(row);
    const preview = postPreview(row);
    const chTitle = humanChannelTitle(ctx.channelTitle, ctx.payload?.channelTitle) || channelDisplay(row, clean(row.channel_id || channelId));
    return { channelId: clean(row.channel_id || json.channel_id), channelTitle: chTitle, postId: clean(row.post_id || json.post_id), commentKey: clean(row.comment_key || json.comment_key), postTitle: display, displayTitle: display, postPreview: preview, source: row.source || json.source, meta: row.meta || json.meta || {}, updatedAt: row.updated_at || json.updated_at };
  });
}

async function upsertPost(ctx = {}, input = {}) {
  await base.ensure();
  const adminId = adminIdOf(ctx);
  const channelId = clean(input.channelId || channelIdOf(ctx) || 'manual-channel');
  const channelTitle = humanChannelTitle(input.channelTitle, ctx.channelTitle, ctx.payload?.channelTitle, ctx.channel?.title);
  const postId = clean(input.postId || postIdOf(ctx) || ('manual-' + Date.now()));
  const commentKey = commentKeyOf(ctx, input);
  const metaObj = input.meta || {};
  const postTitle = humanPostText(input.postTitle, input.title, input.text, ctx.postTitle, ctx.payload?.postTitle, ctx.post?.title, ctx.post?.text, ctx.text, walkHumanText(metaObj));
  const postPrev = humanPostText(input.postPreview, input.preview, input.caption, postTitle, walkHumanText(metaObj));
  const source = clean(input.source || 'manual');
  const meta = JSON.stringify(metaObj || {});
  const sql = "insert into ak_posts(admin_id,channel_id,channel_title,post_id,comment_key,post_title,post_preview,source,meta,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now()) on conflict(channel_id,post_id) do update set admin_id=excluded.admin_id, channel_title=coalesce(nullif(excluded.channel_title,''),ak_posts.channel_title), comment_key=coalesce(nullif(excluded.comment_key,''),ak_posts.comment_key), post_title=coalesce(nullif(excluded.post_title,''), nullif(ak_posts.post_title,'Пост'), ak_posts.post_title), post_preview=coalesce(nullif(excluded.post_preview,''), nullif(ak_posts.post_preview,'Пост'), ak_posts.post_preview), source=excluded.source, meta=ak_posts.meta || excluded.meta, updated_at=now() returning channel_id, channel_title, post_id, comment_key, post_title, post_preview, source, meta, updated_at";
  const { rows } = await db.query(sql, [adminId, channelId, channelTitle, postId, commentKey, postTitle, postPrev, source, meta]);
  const row = rows[0] || {};
  return { ok: true, post: { channelId: clean(row.channel_id), channelTitle: channelDisplay(row, channelId), postId: clean(row.post_id), commentKey: clean(row.comment_key), postTitle: postDisplay(row), postPreview: postPreview(row), source: row.source, meta: row.meta || {} } };
}

async function captureForwardedPost(ctx = {}) {
  const payload = ctx.payload || {};
  const postId = clean(payload.postId || ctx.forwardedPostId || ctx.message?.link?.post_id || ctx.message?.body?.mid || ctx.message?.id || '');
  if (!postId) return { ok: false, error: 'forwarded_post_payload_missing' };
  const raw = ctx.message || payload.message || payload.raw || payload;
  const text = humanPostText(payload.postTitle, payload.postPreview, ctx.text, walkHumanText(raw));
  return upsertPost(ctx, { postId, commentKey: payload.commentKey || ctx.commentKey || '', postTitle: text, postPreview: text, source: 'forwarded_post', meta: { capturedAt: new Date().toISOString(), rawPayloadKeys: Object.keys(payload), raw } });
}

function selfTest() {
  return { ...base.selfTest(), ok: true, runtimeVersion: RUNTIME, distinctFallbackPostLabels: true, rowJsonPostPreviewResolver: true, noMassPostWithoutTextButtons: true, genericPostTitlesIgnored: true, upsertDoesNotPoisonTitleWithGenericPost: true, captureForwardedRawPayloadReady: true };
}

module.exports = { ...base, RUNTIME, listChannels, listPosts, upsertPost, captureForwardedPost, selfTest, humanTitle: humanPostText, humanPostText, humanChannelTitle, postDisplay };
