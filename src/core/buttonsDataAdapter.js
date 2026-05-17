'use strict';

const db = require('../../cc5-db-core');

const RUNTIME = 'ADMINKIT-CORE-BUTTONS-DATA-ADAPTER-1.7-NO-POST-TEXT-COLUMN';
const CACHE_TTL_MS = 10 * 1000;
const cache = new Map();

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 46) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function isHuman(value = '') { const s = clean(value); return !!s && !/^-?\d{6,}$/.test(s) && !/^[a-f0-9]{12,}$/i.test(s); }
function cacheKey(adminId = '', channelId = '') { return `${clean(adminId) || 'debug-admin'}:${clean(channelId) || '*'}`; }
function getCached(adminId = '', channelId = '') { const item = cache.get(cacheKey(adminId, channelId)); if (!item || Date.now() - item.at > CACHE_TTL_MS) return null; return item.value; }
function setCached(adminId = '', channelId = '', value) { cache.set(cacheKey(adminId, channelId), { at: Date.now(), value }); if (cache.size > 100) cache.delete(cache.keys().next().value); return value; }
function uniqByTitleUrl(items = []) { const seen = new Set(); const out = []; for (const item of items) { const key = `${clean(item.title).toLowerCase()}|${clean(item.url).toLowerCase()}`; if (!clean(item.title) || seen.has(key)) continue; seen.add(key); out.push(item); } return out; }
function postDisplayTitle(post = {}) { return cut(post.title || post.postTitle || post.postId || post.id || 'Пост', 46); }
function channelDisplayTitle(post = {}) { const title = clean(post.channelTitle || post.channelName || post.channelDisplayName || ''); return isHuman(title) ? cut(title, 46) : ''; }

async function queryReadOnly(sql, params = []) {
  if (!db.pool) return { rows: [], error: 'database_url_missing' };
  const text = String(sql || '').trim();
  if (!/^select\b/i.test(text)) throw new Error('buttons_data_adapter_read_only_selects_only');
  try { return await db.pool.query(text, params); } catch (error) { return { rows: [], error: error?.message || String(error) }; }
}

async function selectedChannelForAdmin(adminId = '') {
  const id = clean(adminId);
  if (!id) return '';
  const result = await queryReadOnly('select selected_channel_id from ak_admin_sessions where admin_id=$1 limit 1', [id]);
  return clean(result.rows?.[0]?.selected_channel_id || '');
}

async function overview(adminId = '', options = {}) {
  const id = clean(adminId);
  const selectedChannelId = clean(options.channelId || await selectedChannelForAdmin(id));
  const limit = Math.max(1, Math.min(Number(options.limit || 10), 30));
  const cached = options.noCache ? null : getCached(id, selectedChannelId);
  if (cached) return { ...cached, cached: true };
  if (!id) return { ok: false, runtimeVersion: RUNTIME, error: 'admin_id_required', posts: [] };
  if (!db.pool) return { ok: false, runtimeVersion: RUNTIME, error: 'database_url_missing', posts: [] };

  const result = await queryReadOnly(`
    select
      p.channel_id as "channelId",
      coalesce(nullif(c.title, ''), '') as "channelTitle",
      p.post_id as "postId",
      coalesce(nullif(p.title, ''), p.post_id) as title,
      p.updated_at as "postUpdatedAt",
      count(b.id)::int as "buttonsCount",
      coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'url', b.url, 'sortOrder', b.sort_order) order by b.sort_order asc, b.id asc) filter (where b.id is not null), '[]'::jsonb) as buttons
    from ak_posts p
    left join ak_channels c on c.channel_id = p.channel_id
    left join ak_post_buttons b on b.admin_id = p.admin_id and b.channel_id = p.channel_id and b.post_id = p.post_id and b.is_enabled = true
    where p.admin_id=$1 and ($2::text = '' or p.channel_id=$2)
    group by p.channel_id, c.title, p.post_id, p.title, p.updated_at
    order by p.updated_at desc nulls last
    limit $3
  `, [id, selectedChannelId, limit]);

  if (result.error) return setCached(id, selectedChannelId, { ok: false, runtimeVersion: RUNTIME, error: result.error, selectedChannelId, posts: [] });

  const countResult = await queryReadOnly(`select count(*)::int as n from ak_posts where admin_id=$1 and ($2::text = '' or channel_id=$2)`, [id, selectedChannelId]);
  const postsCount = Number(countResult.rows?.[0]?.n || 0);

  const posts = (result.rows || []).map((post) => {
    const buttons = uniqByTitleUrl(Array.isArray(post.buttons) ? post.buttons.map((button) => ({
      id: button.id,
      title: clean(button.title || 'Кнопка'),
      displayTitle: cut(button.title || 'Кнопка', 34),
      url: clean(button.url || ''),
      source: 'ak_post_buttons',
      sortOrder: Number(button.sortOrder || 0)
    })) : []);
    const displayTitle = postDisplayTitle(post);
    const channelTitle = channelDisplayTitle(post);
    return {
      channelId: clean(post.channelId),
      channelTitle,
      channelDisplayTitle: channelTitle || 'выбранный канал',
      postId: clean(post.postId),
      title: clean(post.title || post.postId || 'Пост'),
      displayTitle,
      buttonsCount: buttons.length,
      buttons,
      postUpdatedAt: post.postUpdatedAt || null
    };
  });

  const buttonsCount = posts.reduce((sum, post) => sum + post.buttonsCount, 0);
  const postsWithButtons = posts.filter((post) => post.buttonsCount > 0).length;
  const selectedChannelTitle = channelDisplayTitle(posts.find((p) => p.channelId === selectedChannelId) || posts[0] || {});

  return setCached(id, selectedChannelId, {
    ok: true,
    runtimeVersion: RUNTIME,
    adminId: id,
    selectedChannelId,
    selectedChannelTitle,
    postsCount,
    buttonsCount,
    postsWithButtons,
    posts,
    limit,
    cleanStorageOnly: true,
    sourceTable: 'ak_post_buttons',
    ignoredLegacyTables: ['ak_comment_banners_v3'],
    note: 'Core buttons intentionally use only clean ak_post_buttons storage. Legacy banner/comment-button tables are not used as future architecture adapters.'
  });
}

function formatOverviewForScreen(data = {}) {
  if (!data.ok) return [`Не удалось прочитать кнопки: ${data.error || 'unknown_error'}.`, 'Production-данные не изменялись.'];
  const lines = [
    data.selectedChannelTitle ? `Канал: ${data.selectedChannelTitle}` : 'Канал: все доступные каналы',
    `Постов в базе: ${data.postsCount}`,
    `Постов с кнопками: ${data.postsWithButtons}`,
    `Активных кнопок: ${data.buttonsCount}`,
    'Источник: ak_post_buttons',
    'Legacy-хранилища не используются в Core.',
    ''
  ];
  if (!data.posts.length) {
    lines.push('Посты пока не найдены.');
  } else {
    lines.push('Последние посты:');
    data.posts.slice(0, 10).forEach((post, index) => {
      lines.push(`${index + 1}. ${post.displayTitle}`);
      lines.push(`   Кнопок: ${post.buttonsCount}`);
      post.buttons.slice(0, 3).forEach((button) => lines.push(`   • ${button.displayTitle}`));
      if (post.buttons.length > 3) lines.push(`   • …ещё ${post.buttons.length - 3}`);
    });
  }
  lines.push('', 'Режим: clean Core. Создание новых кнопок идёт в ak_post_buttons.');
  lines.push('Патч поста в MAX подключим отдельным чистым этапом.');
  return lines;
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    readOnly: true,
    selectsOnly: true,
    cleanStorageOnly: true,
    sourceTable: 'ak_post_buttons',
    legacyAdaptersDisabled: true,
    humanPostLabelsReady: true,
    humanChannelLabelsReady: true,
    safeSchemaColumnsOnly: true,
    noAkPostsTextColumnReference: true,
    rawChannelIdHiddenInUx: true,
    ignoredLegacyTables: ['ak_comment_banners_v3'],
    cacheTtlMs: CACHE_TTL_MS,
    cacheSize: cache.size
  };
}

module.exports = { RUNTIME, overview, formatOverviewForScreen, selfTest, postDisplayTitle, channelDisplayTitle };