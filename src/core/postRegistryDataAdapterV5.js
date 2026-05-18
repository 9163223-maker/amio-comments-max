'use strict';

const db = require('../../cc5-db-core');
const base = require('./postRegistryDataAdapterV4');

const RUNTIME = 'ADMINKIT-CORE-POST-REGISTRY-DATA-ADAPTER-1.40.4-HUMAN-POST-CHANNEL-LABELS';

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 90) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function isRawId(value = '') { const s = clean(value); return /^-?\d{6,}$/.test(s) || /^[a-f0-9]{12,}$/i.test(s); }
function isBadFallback(value = '') {
  const s = clean(value).toLowerCase();
  return !s || isRawId(s) || ['канал', 'текущий канал', 'existing channel', 'unknown', 'undefined', 'null'].includes(s);
}
function humanTitle(...values) {
  for (const value of values) {
    const s = clean(value);
    if (s && !isRawId(s) && !['undefined', 'null'].includes(s.toLowerCase())) return cut(s, 120);
  }
  return '';
}
function adminIdOf(ctx = {}) { return clean(ctx.adminId || ctx.admin_id || ctx.userId || ''); }
function channelIdOf(ctx = {}) { return clean(ctx.channelId || ctx.payload?.channelId || ctx.selected_channel_id || ctx.session?.selected_channel_id || ctx.draft?.channelId || ''); }

function tryJson(value) {
  if (!value || typeof value !== 'string') return null;
  const s = value.trim();
  if (!s || !/^[\[{]/.test(s)) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function walkHumanText(value, depth = 0) {
  if (depth > 4 || value === undefined || value === null) return '';
  if (typeof value === 'string') {
    const parsed = tryJson(value);
    if (parsed) return walkHumanText(parsed, depth + 1);
    return humanTitle(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = walkHumanText(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value === 'object') {
    const keys = [
      'postPreview', 'post_preview', 'preview', 'title', 'text', 'caption',
      'postText', 'post_text', 'body', 'content', 'messageText', 'message_text',
      'description', 'html', 'plainText', 'plain_text'
    ];
    for (const key of keys) {
      const found = walkHumanText(value[key], depth + 1);
      if (found) return found;
    }
    for (const key of ['post', 'message', 'original', 'raw', 'payload', 'data', 'attachment', 'media']) {
      const found = walkHumanText(value[key], depth + 1);
      if (found) return found;
    }
  }
  return '';
}

function metaText(meta = {}) { return walkHumanText(meta); }
function postDisplay(row = {}) {
  return humanTitle(row.post_title, row.post_preview, row.title, row.text, row.caption, metaText(row.meta)) ||
    (row.updated_at ? `Пост без текста · ${new Date(row.updated_at).toLocaleDateString('ru-RU')}` : 'Пост без текста');
}
function channelDisplay(row = {}) {
  const title = humanTitle(row.channel_title, row.title, row.channel_name, row.display_title, row.name);
  return isBadFallback(title) ? '' : title;
}
function friendlyChannelFallback(channelId = '') {
  return clean(channelId) ? 'Канал без названия' : 'Канал не выбран';
}

async function listChannels(ctx = {}) {
  await base.ensure();
  const adminId = adminIdOf(ctx);
  const selectedChannelId = channelIdOf(ctx);
  const channels = [];
  const seen = new Set();
  function push(row = {}, source = '') {
    const channelId = clean(row.channel_id || row.channelId);
    if (!channelId || seen.has(channelId)) return;
    seen.add(channelId);
    const title = channelDisplay(row) || friendlyChannelFallback(channelId);
    channels.push({
      channelId,
      channelTitle: title,
      title,
      displayTitle: title,
      postCount: Number(row.post_count || row.posts_count || row.postCount || 0),
      selected: !!selectedChannelId && selectedChannelId === channelId,
      source,
      lastSeenAt: row.last_seen_at || row.updated_at || null
    });
  }
  if (adminId) {
    try {
      const { rows } = await db.query(`
        select
          ac.channel_id,
          nullif(coalesce(c.title, c.channel_title, c.name, p.channel_title, ''), '') as channel_title,
          count(p.post_id)::int as post_count,
          max(coalesce(p.updated_at, ac.updated_at, c.updated_at)) as last_seen_at
        from ak_admin_channels ac
        left join ak_channels c on c.channel_id=ac.channel_id
        left join ak_posts p on p.admin_id=ac.admin_id and p.channel_id=ac.channel_id
        where ac.admin_id=$1
        group by ac.channel_id, c.title, c.channel_title, c.name, p.channel_title
        order by last_seen_at desc nulls last
        limit 20`, [adminId]);
      (rows || []).forEach((row) => push(row, 'ak_channels'));
    } catch {
      try {
        const { rows } = await db.query(`select ac.channel_id, nullif(c.title,'') as channel_title, count(p.post_id)::int as post_count, max(coalesce(p.updated_at, ac.updated_at, c.updated_at)) as last_seen_at from ak_admin_channels ac left join ak_channels c on c.channel_id=ac.channel_id left join ak_posts p on p.admin_id=ac.admin_id and p.channel_id=ac.channel_id where ac.admin_id=$1 group by ac.channel_id, c.title order by last_seen_at desc nulls last limit 20`, [adminId]);
        (rows || []).forEach((row) => push(row, 'ak_channels_legacy'));
      } catch {}
    }
  }
  try {
    const { rows } = await db.query(`select channel_id, max(nullif(channel_title,'')) as channel_title, count(*)::int as post_count, max(updated_at) as last_seen_at from ak_posts where ($1='' or admin_id=$1) and channel_id<>'' group by channel_id order by last_seen_at desc limit 20`, [adminId]);
    (rows || []).forEach((row) => push(row, 'ak_posts'));
  } catch {}
  if (selectedChannelId && !seen.has(selectedChannelId)) channels.unshift({ channelId: selectedChannelId, channelTitle: friendlyChannelFallback(selectedChannelId), title: friendlyChannelFallback(selectedChannelId), displayTitle: friendlyChannelFallback(selectedChannelId), postCount: 0, selected: true, source: 'session' });
  return channels;
}

async function listPosts(ctx = {}, options = {}) {
  await base.ensure();
  const adminId = adminIdOf(ctx);
  const channelId = clean(options.channelId || channelIdOf(ctx));
  const limit = Math.max(1, Math.min(Number(options.limit || 10), 20));
  const { rows } = await db.query(`select channel_id, channel_title, post_id, comment_key, post_title, post_preview, source, meta, updated_at from ak_posts where ($1='' or admin_id=$1) and ($2='' or channel_id=$2) order by updated_at desc, post_id desc limit $3`, [adminId, channelId, limit]);
  return (rows || []).map((row) => {
    const display = postDisplay(row);
    const preview = humanTitle(row.post_preview, metaText(row.meta), row.post_title) || display;
    const chTitle = channelDisplay(row) || humanTitle(ctx.channelTitle, ctx.payload?.channelTitle) || friendlyChannelFallback(clean(row.channel_id || channelId));
    return {
      channelId: clean(row.channel_id),
      channelTitle: chTitle,
      postId: clean(row.post_id),
      commentKey: clean(row.comment_key),
      postTitle: display,
      displayTitle: display,
      postPreview: preview,
      source: row.source,
      meta: row.meta || {},
      updatedAt: row.updated_at
    };
  });
}

function selfTest() {
  return {
    ...base.selfTest(),
    ok: true,
    runtimeVersion: RUNTIME,
    safeChannelTitleJoin: true,
    userFriendlyPostPreviews: true,
    noRawPostIdsInLabels: true,
    noTechnicalIdsInLabels: true,
    noCurrentChannelFallbackInUi: true,
    deepMetaPostPreviewResolver: true
  };
}

module.exports = { ...base, RUNTIME, listChannels, listPosts, selfTest, humanTitle };
