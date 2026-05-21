'use strict';

const timing = require('./v3-ui-timing-cc8');
const menu = require('./v3-menu-core-1539');

const RUNTIME = 'CC8.0.5-STATS-CLEAN-CORE-MAP';
const SLOW_MS = 900;

const LABELS = {
  admin_section_channels: 'Подключение канала',
  admin_section_gifts: 'Подарки / лид-магниты',
  admin_section_buttons: 'CTA / пользовательские кнопки',
  admin_section_posts: 'Редактирование постов',
  admin_section_moderation: 'Модерация',
  admin_section_stats: 'Статистика',
  admin_stats_subscribers_day: 'Статистика: подписчики за день',
  admin_stats_posts_cache: 'Статистика: посты и архив',
  admin_stats_comments_cache: 'Статистика: комментарии',
  admin_section_main: 'Главное меню',
  admin_section_highlights: 'Выделение постов',
  admin_section_polls: 'Голосовалки / опросы',
  admin_section_tariffs: 'Личный кабинет',
  admin_section_archive: 'Архив / восстановление'
};

function clean(value) {
  return String(value || '').trim();
}

function isLegacyAction(action) {
  return menu.LEGACY_FUNCTIONAL_ACTIONS instanceof Set && menu.LEGACY_FUNCTIONAL_ACTIONS.has(clean(action));
}

function isCleanOwnedAction(action) {
  return menu.CLEAN_OWNED_ACTIONS instanceof Set && menu.CLEAN_OWNED_ACTIONS.has(clean(action));
}

function timingEvents() {
  return (timing.list ? timing.list() : []).slice().reverse();
}

function routeTypeFromEvent(action, event = {}) {
  const path = clean(event.path);
  if (path.startsWith('delegate_legacy')) return isCleanOwnedAction(action) ? 'clean_delegated' : 'legacy';
  if (path === 'highlight_adapter') return 'clean_adapter';
  if (path === 'account_runtime') return 'clean_core';
  if (path === 'poll_screen' || path === 'poll_vote' || path === 'poll_text_flow') return 'clean_core';
  if (path.startsWith('channel_')) return 'channel_guard';
  if (event.name === 'highlight_adapter') return 'clean_adapter';
  if (event.name === 'account_screen_build') return 'clean_core';
  return path || 'unknown';
}

function aggregate() {
  const rows = {};
  for (const event of timingEvents()) {
    if (event.name !== 'webhook_total') continue;
    const action = clean(event.action || 'unknown');
    const path = clean(event.path || '');
    const routeType = routeTypeFromEvent(action, event);
    const key = `${action}|${routeType}|${path}`;
    const ms = Number(event.durationMs || 0);
    if (!rows[key]) {
      rows[key] = {
        action,
        label: LABELS[action] || action,
        routeType,
        path,
        count: 0,
        slowCount: 0,
        totalMs: 0,
        maxMs: 0,
        lastMs: 0,
        legacyListed: isLegacyAction(action),
        cleanOwned: isCleanOwnedAction(action),
        samples: []
      };
    }
    const row = rows[key];
    row.count += 1;
    row.totalMs += ms;
    row.maxMs = Math.max(row.maxMs, ms);
    row.lastMs = ms;
    if (ms >= SLOW_MS || event.slow) row.slowCount += 1;
    row.samples.push({
      at: event.at,
      durationMs: ms,
      slow: Boolean(event.slow || ms >= SLOW_MS),
      screenId: clean(event.screenId),
      updateType: clean(event.updateType)
    });
  }
  return Object.values(rows).map((row) => ({
    ...row,
    avgMs: row.count ? Math.round(row.totalMs / row.count) : 0,
    samples: row.samples.slice(-5)
  })).sort((a, b) => b.maxMs - a.maxMs);
}

function plannedMigrationOrder(rows) {
  const slowLegacy = rows.filter((row) => row.routeType === 'legacy' && row.maxMs >= SLOW_MS);
  const byAction = {};
  for (const row of slowLegacy) {
    if (!byAction[row.action]) byAction[row.action] = { action: row.action, label: row.label, maxMs: 0, avgMs: 0, count: 0, slowCount: 0, paths: [] };
    const target = byAction[row.action];
    target.maxMs = Math.max(target.maxMs, row.maxMs);
    target.count += row.count;
    target.slowCount += row.slowCount;
    target.avgMs = Math.max(target.avgMs, row.avgMs);
    target.paths.push(row.path);
  }
  return Object.values(byAction).sort((a, b) => b.maxMs - a.maxMs).map((row, index) => ({
    order: index + 1,
    ...row,
    nextStep: nextStepFor(row.action)
  }));
}

function nextStepFor(action) {
  if (action === 'admin_section_channels') return 'migrate_channel_binding_and_tenant_channel_link';
  if (action === 'admin_section_buttons') return 'migrate_cta_post_picker_and_button_manager';
  if (action === 'admin_section_posts') return 'migrate_post_editor_picker_and_save_flow';
  if (action === 'admin_section_gifts') return 'migrate_gift_flow_as_clean_core_wizard';
  if (action === 'admin_section_stats') return 'migrate_stats_cached_postgres_screen';
  if (action === 'admin_section_moderation') return 'migrate_moderation_queue_and_settings';
  return 'inspect_action_before_migration';
}

function unmigratedFunctionalActions(rows) {
  const seen = new Set(rows.map((row) => row.action));
  return Array.from(menu.LEGACY_FUNCTIONAL_ACTIONS || []).map((action) => ({
    action,
    label: LABELS[action] || action,
    seenInTiming: seen.has(action),
    nextStep: nextStepFor(action)
  }));
}

function info() {
  const rows = aggregate();
  return {
    ok: true,
    runtimeVersion: process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || RUNTIME,
    diagnosticRuntimeVersion: RUNTIME,
    mode: 'legacy-action-level-timing-map',
    slowThresholdMs: SLOW_MS,
    totalTimingEvents: timing.list ? timing.list().length : 0,
    rows,
    migrationOrder: plannedMigrationOrder(rows),
    unmigratedFunctionalActions: unmigratedFunctionalActions(rows),
    policy: 'Do not mask legacy delays with fast placeholders. Migrate full action paths from legacy to Clean Core step by step.',
    safe: true,
    noDatabaseRead: true,
    noMaxApiCall: true
  };
}

module.exports = { RUNTIME, info, aggregate, plannedMigrationOrder, unmigratedFunctionalActions, isLegacyAction, isCleanOwnedAction };
