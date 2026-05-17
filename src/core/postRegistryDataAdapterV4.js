'use strict';

const db = require('../../cc5-db-core');
const base = require('./postRegistryDataAdapterV3');

const RUNTIME = 'ADMINKIT-CORE-POST-REGISTRY-DATA-ADAPTER-1.38.8-USER-TITLES';

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 90) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function isRawId(value = '') { const s = clean(value); return /^-?\d{6,}$/.test(s) || /^[a-f0-9]{12,}$/i.test(s); }
function humanTitle(...values) { for (const value of values) { const s = clean(value); if (s && !isRawId(s)) return cut(s, 120); } return ''; }
function adminIdOf(ctx = {}) { return clean(ctx.adminId || ctx.admin_id || ctx.userId || ''); }
function channelIdOf(ctx = {}) { return clean(ctx.channelId || ctx.payload?.channelId || ctx.selected_channel_id || ctx.session?.selected_channel_id || ctx.draft?.channelId || ''); }

function metaText(meta = {}) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const direct = humanTitle(m.title, m.text, m.caption, m.preview, m.postText, m.post_text, m.body, m.content, m.messageText, m.message_text);
  if (direct) return direct;
  const nested = m.post || m.message || m.original || m.raw || {};
  if (nested && typeof nested === 'object') return humanTitle(nested.title, nested.text, nested.caption, nested.preview, nested.body, nested.content);
  return '';
}
function postDisplay(row = {}) {
  return humanTitle(row.post_title, row.post_preview, metaText(row.meta)) || 'Пост без текста';
}
function channelDisplay(row = {}) {
  return humanTitle(row.channel_title, row.title, row.channel_name, row.display_title) || 'Текущий канал';
}

async function listChannels(ctx = {}) {
  await base.ensure();
  const adminId = adminIdOf(ctx);
  const selectedChannelId = channelIdOf(ctx);
  const channels = [];
  const seen = new Set();
  async function addFrom(sql, params, source) {
    try {
      const { rows } = await db.query(sql, params);
      for (const row of rows || []) {
        const channelId = clean(row.channel_id || row.channelId);
        if (!channelId || seen.has(channelId)) continue;
        seen.add(channelId);
        channels.push({
          channelId,
          channelTitle: channelDisplay(row),
          title: channelDisplay(row),
          displayTitle: channelDisplay(row),
          postCount: Number(row.post_count || row.posts_count || row.postCount || 0),
          selected: selectedChannelId && selectedChannelId === channelId,
          source,
          lastSeenAt: row.last_seen_at || row.updated_at || null
        });
      }
    } catch {}
  }
  if (adminId) {
    await addFrom(`select ac.channel_id, coalesce(nullif(c.title,''), nullif(ac.channel_title,''), nullif(ac.title,''), 'Текущий канал') as channel_title, count(p.post_id)::int as post_count, max(coalesce(p.updated_at, ac.updated_at, c.updated_at)) as last_seen_at from ak_admin_channels ac left join ak_channels c on c.channel_id=ac.channel_id left join ak_posts p on p.admin_id=ac.admin_id and p.channel_id=ac.channel_id where ac.admin_id=$1 group by ac.channel_id, c.title, ac.channel_title, ac.title order by last_seen_at desc nulls last limit 20`, [adminId], 'ak_admin_channels');
  }
  await addFrom(`select channel_id, max(channel_title) as channel_title, count(*)::int as post_count, max(updated_at) as last_seen_at from ak_posts where ($1='' or admin_id=$1) and channel_id<>'' group by channel_id order by last_seen_at desc limit 20`, [adminId], 'ak_posts');
  if (selectedChannelId && !seen.has(selectedChannelId)) channels.unshift({ channelId: selectedChannelId, channelTitle: 'Текущий канал', title: 'Текущий канал', displayTitle: 'Текущий канал', postCount: 0, selected: true, source: 'session' });
  return channels;
}

async function listPosts(ctx = {}, options = {}) {
  await base.ensure();
  const adminId = adminIdOf(ctx);
  const channelId = clean(options.channelId || channelIdOf(ctx));
  const limit = Math.max(1, Math.min(Number(options.limit || 10), 20));
  const sql = `select channel_id, channel_title, post_id, comment_key, post_title, post_preview, source, meta, updated_at from ak_posts where ($1='' or admin_id=$1) and ($2='' or channel_id=$2) order by updated_at desc, post_id desc limit $3`;
  const { rows } = await db.query(sql, [adminId, channelId, limit]);
  return (rows || []).map((row) => {
    const display = postDisplay(row);
    const preview = humanTitle(row.post_preview, metaText(row.meta), row.post_title) || display;
    return {
      channelId: clean(row.channel_id),
      channelTitle: channelDisplay(row),
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
  return { ...base.selfTest(), ok: true, runtimeVersion: RUNTIME, userFriendlyChannelTitles: true, userFriendlyPostPreviews: true, noRawPostIdsInLabels: true, noIdColumnRequired: true };
}

module.exports = { ...base, RUNTIME, listChannels, listPosts, selfTest, humanTitle };
