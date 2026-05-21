'use strict';

const postArchive = require('./postgres-post-archive');

const RUNTIME = 'CC8.0.5-STATS-CLEAN-CORE';

function clean(value) { return String(value || '').trim(); }
function n(value) { const num = Number(value || 0); return Number.isFinite(num) ? num : 0; }

async function cachedCounts() {
  try {
    const status = await postArchive.status();
    const counts = status && status.counts || {};
    return {
      ok: Boolean(status && status.ok),
      configured: Boolean(status && status.configured),
      lastError: clean(status && status.lastError),
      counts: {
        channels: n(counts.channels),
        posts: n(counts.posts),
        snapshots: n(counts.snapshots),
        archive: n(counts.archive)
      }
    };
  } catch (error) {
    return {
      ok: false,
      configured: postArchive.isConfigured ? postArchive.isConfigured() : false,
      lastError: clean(error && error.message || error),
      counts: { channels: 0, posts: 0, snapshots: 0, archive: 0 }
    };
  }
}

function footer(menu) {
  return [[menu.button('📊 В начало статистики', 'admin_section_stats')], [menu.button('🏠 Главное меню', 'admin_section_main')]];
}

function screen(menu, id, title, lines, rows) {
  return {
    id,
    text: [title, '', ...(lines || [])].filter(Boolean).join('\n'),
    attachments: menu.keyboard(rows || footer(menu))
  };
}

function statusLine(data) {
  if (data.ok) return 'Источник: быстрый Postgres/cache, без тяжёлых live-запросов к MAX.';
  if (!data.configured) return 'Источник: Postgres не настроен для статистики.';
  return 'Источник: Postgres/cache. Последняя ошибка: ' + (data.lastError || 'unknown');
}

function homeRows(menu) {
  return [
    [menu.button('👥 Подписчики за день', 'admin_stats_subscribers_day')],
    [menu.button('📝 Посты и архив', 'admin_stats_posts_cache')],
    [menu.button('💬 Комментарии', 'admin_stats_comments_cache')],
    [menu.button('🔄 Обновить статистику', 'admin_section_stats')],
    [menu.button('🏠 Главное меню', 'admin_section_main')]
  ];
}

async function home(menu) {
  const data = await cachedCounts();
  const c = data.counts;
  return screen(menu, 'stats_clean_home', '📊 Статистика', [
    'Быстрый Clean Core экран. Он не вызывает тяжёлый legacy runtime и не делает live-запросы к MAX при открытии.',
    '',
    'Кэш / Postgres сейчас:',
    '• каналов: ' + c.channels,
    '• постов: ' + c.posts,
    '• снимков постов: ' + c.snapshots,
    '• архивных записей: ' + c.archive,
    '',
    statusLine(data),
    '',
    'Live-метрики подписчиков и дневные графики подключим отдельным adapter-слоем, чтобы не тормозить открытие раздела.'
  ], homeRows(menu));
}

async function subscribersDay(menu) {
  const data = await cachedCounts();
  return screen(menu, 'stats_subscribers_day_clean', '👥 Подписчики за день', [
    'Этот экран переведён в Clean Core fast path.',
    '',
    'Сейчас он открывается из cache/Postgres без тяжёлого legacy-запроса.',
    'Live-дельта подписчиков за день будет подключена отдельным MAX/channel stats adapter, когда закрепим быстрый канал/tenant link.',
    '',
    'Доступные данные сейчас:',
    '• подключённых каналов в кэше: ' + data.counts.channels,
    '',
    statusLine(data)
  ], [[menu.button('🔄 Обновить', 'admin_stats_subscribers_day')], ...footer(menu)]);
}

async function postsCache(menu) {
  const data = await cachedCounts();
  const c = data.counts;
  return screen(menu, 'stats_posts_cache_clean', '📝 Посты и архив', [
    'Быстрая статистика по Postgres-архиву.',
    '',
    '• постов: ' + c.posts,
    '• снимков: ' + c.snapshots,
    '• архивных записей: ' + c.archive,
    '',
    statusLine(data)
  ], [[menu.button('🔄 Обновить', 'admin_stats_posts_cache')], ...footer(menu)]);
}

async function commentsCache(menu) {
  return screen(menu, 'stats_comments_cache_clean', '💬 Комментарии', [
    'Экран переведён в Clean Core fast path.',
    '',
    'Счётчики комментариев будут брать данные из единой Postgres-модели комментариев после переноса comment runtime.',
    'Сейчас этот экран не уходит в legacy и не тормозит открытие раздела.'
  ], footer(menu));
}

async function screenForPayload(menu, payload = {}) {
  const action = clean(payload.action);
  if (action === 'admin_section_stats') return home(menu);
  if (action === 'admin_stats_subscribers_day') return subscribersDay(menu);
  if (action === 'admin_stats_posts_cache') return postsCache(menu);
  if (action === 'admin_stats_comments_cache') return commentsCache(menu);
  return null;
}

module.exports = { RUNTIME, screenForPayload, cachedCounts };
