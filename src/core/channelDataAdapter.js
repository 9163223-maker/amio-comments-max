'use strict';

const db = require('../../cc5-db-core');

const RUNTIME = 'ADMINKIT-CORE-CHANNEL-DATA-ADAPTER-1.0-READ-ONLY';
const CACHE_TTL_MS = 10 * 1000;
const cache = new Map();

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 42) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function key(adminId = '') { return clean(adminId) || 'debug-admin'; }
function getCached(adminId = '') {
  const item = cache.get(key(adminId));
  if (!item || Date.now() - item.at > CACHE_TTL_MS) return null;
  return item.value;
}
function setCached(adminId = '', value) {
  cache.set(key(adminId), { at: Date.now(), value });
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  return value;
}

async function queryReadOnly(sql, params = []) {
  if (!db.pool) return { rows: [], error: 'database_url_missing' };
  const text = String(sql || '').trim();
  if (!/^select\b/i.test(text)) throw new Error('channel_data_adapter_read_only_selects_only');
  try { return await db.pool.query(text, params); }
  catch (error) { return { rows: [], error: error?.message || String(error) }; }
}

async function listChannels(adminId = '', options = {}) {
  const id = clean(adminId);
  const limit = Math.max(1, Math.min(Number(options.limit || 20), 50));
  const cached = options.noCache ? null : getCached(id);
  if (cached) return { ...cached, cached: true };

  if (!id) return { ok: false, runtimeVersion: RUNTIME, error: 'admin_id_required', channels: [] };
  if (!db.pool) return { ok: false, runtimeVersion: RUNTIME, error: 'database_url_missing', channels: [] };

  const sessionResult = await queryReadOnly(`select selected_channel_id from ak_admin_sessions where admin_id=$1 limit 1`, [id]);
  const selectedChannelId = clean(sessionResult.rows?.[0]?.selected_channel_id || '');

  const result = await queryReadOnly(`
    select
      c.channel_id as "channelId",
      coalesce(nullif(c.title, ''), c.channel_id) as title,
      coalesce(ac.role, 'admin') as role,
      ac.updated_at as "linkedAt",
      c.updated_at as "channelUpdatedAt",
      count(p.post_id)::int as "postsCount",
      max(p.updated_at) as "lastPostAt"
    from ak_admin_channels ac
    join ak_channels c on c.channel_id = ac.channel_id
    left join ak_posts p on p.admin_id = ac.admin_id and p.channel_id = ac.channel_id
    where ac.admin_id = $1
    group by c.channel_id, c.title, ac.role, ac.updated_at, c.updated_at
    order by coalesce(max(p.updated_at), ac.updated_at, c.updated_at) desc nulls last
    limit $2
  `, [id, limit]);

  if (result.error) return setCached(id, { ok: false, runtimeVersion: RUNTIME, error: result.error, selectedChannelId, channels: [] });

  const channels = (result.rows || []).map((row) => {
    const channelId = clean(row.channelId);
    return {
      channelId,
      title: clean(row.title || channelId || 'Канал'),
      displayTitle: cut(row.title || channelId || 'Канал', 42),
      role: clean(row.role || 'admin'),
      postsCount: Number(row.postsCount || 0),
      selected: !!selectedChannelId && selectedChannelId === channelId,
      linkedAt: row.linkedAt || null,
      lastPostAt: row.lastPostAt || null
    };
  });

  return setCached(id, { ok: true, runtimeVersion: RUNTIME, adminId: id, selectedChannelId, channels, count: channels.length, limit });
}

function formatChannelsForScreen(data = {}) {
  if (!data.ok) return [`Не удалось прочитать список каналов: ${data.error || 'unknown_error'}.`, 'Production-данные не изменялись.'];
  if (!data.channels || !data.channels.length) return ['Подключённые каналы пока не найдены.', 'Подключение канала остаётся в текущем legacy-flow. Core сейчас только читает уже накопленные данные.'];
  const lines = [`Найдено каналов: ${data.count}.`, ''];
  data.channels.slice(0, 10).forEach((channel, index) => {
    const selected = channel.selected ? ' · выбран' : '';
    lines.push(`${index + 1}. ${channel.displayTitle}${selected}`);
    lines.push(`   Постов в базе: ${channel.postsCount} · роль: ${channel.role}`);
  });
  if (data.channels.length > 10) lines.push(`…и ещё ${data.channels.length - 10}.`);
  lines.push('', 'Режим: read-only. Core не изменяет каналы на этом шаге.');
  return lines;
}

function selfTest() {
  return { ok: true, runtimeVersion: RUNTIME, readOnly: true, selectsOnly: true, cacheTtlMs: CACHE_TTL_MS, cacheSize: cache.size };
}

module.exports = { RUNTIME, listChannels, formatChannelsForScreen, selfTest };
