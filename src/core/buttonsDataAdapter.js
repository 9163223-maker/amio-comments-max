'use strict';

const db = require('../../cc5-db-core');

const RUNTIME = 'ADMINKIT-CORE-BUTTONS-DATA-ADAPTER-1.1-READ-ONLY-LEGACY-RAW';
const CACHE_TTL_MS = 10 * 1000;
const cache = new Map();

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 46) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function cacheKey(adminId = '', channelId = '') { return `${clean(adminId) || 'debug-admin'}:${clean(channelId) || '*'}`; }
function getCached(adminId = '', channelId = '') { const item = cache.get(cacheKey(adminId, channelId)); if (!item || Date.now() - item.at > CACHE_TTL_MS) return null; return item.value; }
function setCached(adminId = '', channelId = '', value) { cache.set(cacheKey(adminId, channelId), { at: Date.now(), value }); if (cache.size > 100) cache.delete(cache.keys().next().value); return value; }
function safeJson(value) { if (!value) return {}; if (typeof value === 'object') return value; try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; } }
function isUrl(value = '') { return /^https?:\/\//i.test(clean(value)); }
function uniqByTitleUrl(items = []) { const seen = new Set(); const out = []; for (const item of items) { const key = `${clean(item.title).toLowerCase()}|${clean(item.url).toLowerCase()}|${clean(item.payload).toLowerCase()}`; if (!clean(item.title) || seen.has(key)) continue; seen.add(key); out.push(item); } return out; }

async function queryReadOnly(sql, params = []) {
  if (!db.pool) return { rows: [], error: 'database_url_missing' };
  const text = String(sql || '').trim();
  if (!/^select\b/i.test(text)) throw new Error('buttons_data_adapter_read_only_selects_only');
  try { return await db.pool.query(text, params); } catch (error) { return { rows: [], error: error?.message || String(error) }; }
}

function collectButtonsFromObject(value, out = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) => collectButtonsFromObject(item, out, seen));
    return out;
  }

  const type = clean(value.type || value.kind || value.intent).toLowerCase();
  const title = clean(value.text || value.title || value.label || value.caption || value.name);
  const url = clean(value.url || value.href || value.link || value.web_app?.url || value.webApp?.url || value.payload?.url);
  const payload = clean(value.payload || value.data || value.callback_data || value.callbackData || value.value);
  const looksLikeButton = !!title && (type.includes('button') || type === 'callback' || type === 'link' || isUrl(url) || payload || value.intent === 'default');
  if (looksLikeButton) out.push({ id: '', title, displayTitle: cut(title, 34), url, payload, source: 'legacy_raw', sortOrder: out.length + 1 });

  for (const child of Object.values(value)) collectButtonsFromObject(child, out, seen);
  return out;
}

function legacyButtonsFromRaw(rawValue) {
  const raw = safeJson(rawValue);
  const found = collectButtonsFromObject(raw, []);
  return uniqByTitleUrl(found).filter((button) => {
    const title = clean(button.title).toLowerCase();
    if (!title) return false;
    if (title.includes('главное меню')) return false;
    if (title.includes('обновить список')) return false;
    return true;
  });
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
      coalesce(nullif(c.title, ''), p.channel_id) as "channelTitle",
      p.post_id as "postId",
      coalesce(nullif(p.title, ''), p.post_id) as title,
      p.raw as raw,
      p.updated_at as "postUpdatedAt",
      count(b.id)::int as "coreButtonsCount",
      coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'url', b.url, 'sortOrder', b.sort_order, 'source', 'core_table') order by b.sort_order asc, b.id asc) filter (where b.id is not null), '[]'::jsonb) as "coreButtons"
    from ak_posts p
    left join ak_channels c on c.channel_id = p.channel_id
    left join ak_post_buttons b on b.admin_id = p.admin_id and b.channel_id = p.channel_id and b.post_id = p.post_id and b.is_enabled = true
    where p.admin_id=$1 and ($2::text = '' or p.channel_id=$2)
    group by p.channel_id, c.title, p.post_id, p.title, p.raw, p.updated_at
    order by p.updated_at desc nulls last
    limit $3
  `, [id, selectedChannelId, limit]);

  if (result.error) return setCached(id, selectedChannelId, { ok: false, runtimeVersion: RUNTIME, error: result.error, selectedChannelId, posts: [] });

  const countResult = await queryReadOnly(`select count(*)::int as n from ak_posts where admin_id=$1 and ($2::text = '' or channel_id=$2)`, [id, selectedChannelId]);
  const postsCount = Number(countResult.rows?.[0]?.n || 0);

  const posts = (result.rows || []).map((post) => {
    const coreButtons = Array.isArray(post.coreButtons) ? post.coreButtons.map((button) => ({
      id: button.id,
      title: clean(button.title || 'Кнопка'),
      displayTitle: cut(button.title || 'Кнопка', 34),
      url: clean(button.url || ''),
      payload: '',
      source: 'core_table',
      sortOrder: Number(button.sortOrder || 0)
    })) : [];
    const legacyButtons = legacyButtonsFromRaw(post.raw);
    const buttons = uniqByTitleUrl([...coreButtons, ...legacyButtons]);
    return {
      channelId: clean(post.channelId),
      channelTitle: clean(post.channelTitle || post.channelId),
      postId: clean(post.postId),
      title: clean(post.title || post.postId || 'Пост'),
      displayTitle: cut(post.title || post.postId || 'Пост', 46),
      buttonsCount: buttons.length,
      coreButtonsCount: Number(post.coreButtonsCount || 0),
      legacyButtonsCount: legacyButtons.length,
      buttons,
      postUpdatedAt: post.postUpdatedAt || null
    };
  });

  const buttonsCount = posts.reduce((sum, post) => sum + post.buttonsCount, 0);
  const coreButtonsCount = posts.reduce((sum, post) => sum + post.coreButtonsCount, 0);
  const legacyButtonsCount = posts.reduce((sum, post) => sum + post.legacyButtonsCount, 0);
  const postsWithButtons = posts.filter((post) => post.buttonsCount > 0).length;

  return setCached(id, selectedChannelId, { ok: true, runtimeVersion: RUNTIME, adminId: id, selectedChannelId, postsCount, buttonsCount, coreButtonsCount, legacyButtonsCount, postsWithButtons, posts, limit, sources: { coreTable: coreButtonsCount, legacyRaw: legacyButtonsCount } });
}

function formatOverviewForScreen(data = {}) {
  if (!data.ok) return [`Не удалось прочитать кнопки: ${data.error || 'unknown_error'}.`, 'Production-данные не изменялись.'];
  const lines = [data.selectedChannelId ? `Канал: ${data.selectedChannelId}` : 'Канал: все доступные каналы', `Постов в базе: ${data.postsCount}`, `Постов с кнопками: ${data.postsWithButtons}`, `Активных кнопок: ${data.buttonsCount}`, `Источник: core=${data.coreButtonsCount || 0}, legacy=${data.legacyButtonsCount || 0}`, ''];
  if (!data.posts.length) {
    lines.push('Посты пока не найдены.', 'Сначала подключите канал и пропатчите посты через текущий production-flow.');
  } else {
    lines.push('Последние посты:');
    data.posts.slice(0, 10).forEach((post, index) => {
      lines.push(`${index + 1}. ${post.displayTitle}`);
      lines.push(`   Кнопок: ${post.buttonsCount}`);
      post.buttons.slice(0, 3).forEach((button) => lines.push(`   • ${button.displayTitle}${button.source === 'legacy_raw' ? ' · legacy' : ''}`));
      if (post.buttons.length > 3) lines.push(`   • …ещё ${post.buttons.length - 3}`);
    });
  }
  lines.push('', 'Режим: read-only. Core пока не создаёт и не меняет кнопки.');
  return lines;
}

function selfTest() { return { ok: true, runtimeVersion: RUNTIME, readOnly: true, selectsOnly: true, legacyRawScan: true, cacheTtlMs: CACHE_TTL_MS, cacheSize: cache.size }; }

module.exports = { RUNTIME, overview, formatOverviewForScreen, legacyButtonsFromRaw, selfTest };