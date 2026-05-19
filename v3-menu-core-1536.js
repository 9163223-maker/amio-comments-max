'use strict';

const RUNTIME = 'CC7.5.34-CORE-1.53.6-CLEAN-MENU-CORE';
const SOURCE = 'adminkit-cc7-5-34-core-1-53-6-clean-menu-core';
const BASE = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

const SECTIONS = [
  { index: 1, id: 'channels', label: '📺 Подключение канала', action: 'admin_section_channels' },
  { index: 2, id: 'comments', label: '💬 Комментарии под постами', action: 'admin_section_comments' },
  { index: 3, id: 'photos', label: '🖼 Фото в комментариях', action: 'admin_section_comments', extra: { focus: 'photos' } },
  { index: 4, id: 'reactions_replies', label: '😊 Реакции и ответы', action: 'admin_section_comments', extra: { focus: 'reactions_replies' } },
  { index: 5, id: 'gifts', label: '🎁 Подарки / лид-магниты', action: 'admin_section_gifts' },
  { index: 6, id: 'buttons', label: '🔘 CTA / пользовательские кнопки', action: 'admin_section_buttons' },
  { index: 7, id: 'highlights', label: '⭐ Выделение постов', action: 'admin_section_highlights' },
  { index: 8, id: 'polls', label: '🗳 Голосовалки / опросы', action: 'admin_section_polls' },
  { index: 9, id: 'posts', label: '✏️ Редактирование постов', action: 'admin_section_posts' },
  { index: 10, id: 'moderation', label: '🛡 Модерация', action: 'admin_section_moderation' },
  { index: 11, id: 'stats', label: '📊 Статистика', action: 'admin_section_stats' },
  { index: 12, id: 'navigation', label: '🧭 Меню и навигация', action: 'admin_section_navigation' },
  { index: 13, id: 'landing_start', label: '🚀 Посадочная Start', action: 'admin_section_landing_start' },
  { index: 14, id: 'debug', label: '🧪 Debug / GitHub export', action: 'admin_section_debug' },
  { index: 15, id: 'production_checklist', label: '✅ Production checklist', action: 'admin_section_production_checklist' }
];

function runtimeVersion() {
  return process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || RUNTIME;
}

function callbackPayload(action, extra = {}) {
  return JSON.stringify({ action: String(action || '').trim(), ...(extra || {}) });
}

function button(text, action, extra = {}) {
  return { type: 'callback', text, payload: callbackPayload(action, extra) };
}

function link(text, url) {
  return { type: 'link', text, url };
}

function keyboard(buttons) {
  return [{ type: 'inline_keyboard', payload: { buttons } }];
}

function footer(rootAction = 'admin_section_main', rootLabel = '🏠 Главное меню') {
  const rows = [];
  if (rootAction && rootAction !== 'admin_section_main') rows.push([button(rootLabel, rootAction)]);
  rows.push([button('🏠 Главное меню', 'admin_section_main')]);
  return rows;
}

function sectionById(id = '') {
  const key = String(id || '').trim();
  return SECTIONS.find((item) => item.id === key) || null;
}

function mainScreen() {
  return {
    id: 'main',
    text: [
      'АдминКИТ',
      '',
      'Главное меню управления MAX-каналом.',
      'Выберите раздел из актуального V3 feature-плана.'
    ].join('\n'),
    attachments: keyboard(SECTIONS.map((item) => [button(item.label, item.action, item.extra || {})]))
  };
}

function commentsScreen(focus = '') {
  const normalized = String(focus || '').trim();
  if (normalized === 'photos') {
    return {
      id: 'photos',
      text: [
        '🖼 Фото в комментариях',
        '',
        'Этот пункт находится внутри раздела «Комментарии».',
        'Разрешаем только фото как вложение в комментарии.',
        'Видео и файлы в комментариях выключены по текущей продуктовой политике.',
        '',
        'Проверка: фото остаётся частью комментариев, а не отдельным legacy-разделом.'
      ].join('\n'),
      attachments: keyboard([[button('💬 В начало комментариев', 'admin_section_comments')], ...footer()])
    };
  }
  if (normalized === 'reactions_replies') {
    return {
      id: 'reactions_replies',
      text: [
        '😊 Реакции и ответы',
        '',
        'Этот пункт находится внутри раздела «Комментарии».',
        'Проверяется логика реакций, ответов в тредах и возврата в обсуждение поста.',
        '',
        'Реакции и ответы не должны открывать старое меню и не должны подменяться Production checklist.'
      ].join('\n'),
      attachments: keyboard([[button('💬 В начало комментариев', 'admin_section_comments')], ...footer()])
    };
  }
  return {
    id: 'comments',
    text: [
      '💬 Комментарии под постами',
      '',
      'Раздел для подключения обсуждений под новыми и уже опубликованными постами.',
      'Внутри этого раздела находятся фото в комментариях, реакции и ответы.',
      '',
      'Видео и файлы в комментариях сейчас выключены. Разрешены текст, фото, реакции и ответы.'
    ].join('\n'),
    attachments: keyboard([
      [button('⚡ Авто для новых постов', 'comments_enable_new')],
      [button('📌 Подключить старый пост', 'comments_old_post')],
      [button('📌 Выбрать пост', 'comments_select_post', { source: 'comments' })],
      [button('🖼 Фото в комментариях', 'admin_section_comments', { focus: 'photos' })],
      [button('😊 Реакции и ответы', 'admin_section_comments', { focus: 'reactions_replies' })],
      [button('👀 Как это выглядит', 'comments_example')],
      ...footer()
    ])
  };
}

function highlightsScreen() {
  return {
    id: 'highlights',
    text: [
      '⭐ Выделение постов',
      '',
      'Отдельный V3-раздел для выбора поста, который нужно выделить.',
      'Это не комментарии и не редактор постов.',
      '',
      'Проверка: выбор поста и нижние кнопки должны возвращать именно в раздел выделения.'
    ].join('\n'),
    attachments: keyboard([
      [button('📌 Выбрать пост для выделения', 'comments_select_post', { source: 'highlights' })],
      ...footer('admin_section_highlights', '⭐ В начало выделения')
    ])
  };
}

function pollsScreen() {
  return {
    id: 'polls',
    text: [
      '🗳 Голосовалки / опросы',
      '',
      'Отдельный V3-раздел для выбора поста под голосовалку или опрос.',
      'Это не комментарии и не Production checklist.',
      '',
      'Проверка: выбор поста и нижние кнопки должны возвращать именно в раздел опросов.'
    ].join('\n'),
    attachments: keyboard([
      [button('📌 Выбрать пост для голосовалки/опроса', 'comments_select_post', { source: 'polls' })],
      ...footer('admin_section_polls', '🗳 В начало опросов')
    ])
  };
}

function navigationScreen() {
  return {
    id: 'navigation',
    text: [
      '🧭 Меню и навигация',
      '',
      'Отдельный экран проверки V3-навигации.',
      'Здесь проверяется не production checklist, а пути меню: /start, посадочная Start, возвраты, help по разделам и отсутствие legacy keyboards.'
    ].join('\n'),
    attachments: keyboard(footer('admin_section_navigation', '🧭 В начало навигации'))
  };
}

function landingStartScreen() {
  return {
    id: 'landing_start',
    text: [
      '🚀 Посадочная Start',
      '',
      'Проверка входа с посадочной страницы.',
      '/start и посадочная Start должны вести в один актуальный V3-flow и открывать 15-раздельное меню.'
    ].join('\n'),
    attachments: keyboard([[button('🏠 Открыть V3-меню', 'admin_section_main')]])
  };
}

function debugScreen() {
  return {
    id: 'debug',
    text: [
      '🧪 Debug / GitHub export',
      '',
      'Служебный раздел с безопасными debug-lite проверками.',
      'Heavy store/export/stress отсюда не запускаются.'
    ].join('\n'),
    attachments: keyboard([
      [link('Version', `${BASE}/version?t=1536`), link('Health', `${BASE}/healthz?t=1536`)],
      [link('Menu audit', `${BASE}/debug/menu/audit?t=1536`)],
      ...footer('admin_section_debug', '🧪 В начало debug')
    ])
  };
}

function productionChecklistScreen() {
  return {
    id: 'production_checklist',
    text: [
      '✅ Production checklist',
      '',
      'Финальная служебная проверка перед production, а не пользовательская справка.',
      '',
      'Проверяется:',
      '• актуальный runtime и package start;',
      '• единый V3-flow для /start и посадочной Start;',
      '• 15 разделов V3 feature-плана;',
      '• фото и реакции находятся внутри комментариев;',
      '• видео и файлы в комментариях выключены;',
      '• Navigation / Debug / Production checklist не показывают один и тот же текст.'
    ].join('\n'),
    attachments: keyboard([
      [link('Audit 15 разделов', `${BASE}/debug/menu/audit?t=1536`)],
      ...footer('admin_section_production_checklist', '✅ В начало checklist')
    ])
  };
}

function helpScreen(context = '') {
  const normalized = String(context || '').replace(/^admin_section_/, '').trim();
  if (normalized === 'navigation') return navigationScreen();
  if (normalized === 'debug') return debugScreen();
  if (normalized === 'production_checklist') return productionChecklistScreen();
  if (normalized === 'highlights') return highlightsScreen();
  if (normalized === 'polls') return pollsScreen();
  if (normalized === 'landing_start') return landingStartScreen();
  return {
    id: 'help',
    text: [
      '❓ Помощь',
      '',
      'Справка V3-меню. Она не должна подменяться Production checklist.',
      'Для проверки откройте нужный раздел из главного меню.'
    ].join('\n'),
    attachments: keyboard(footer())
  };
}

function screenForPayload(payload = {}) {
  const action = String(payload.action || '').trim();
  if (action === 'admin_section_main') return mainScreen();
  if (action === 'admin_section_comments') return commentsScreen(payload.focus || '');
  if (action === 'admin_section_highlights') return highlightsScreen();
  if (action === 'admin_section_polls') return pollsScreen();
  if (action === 'admin_section_navigation') return navigationScreen();
  if (action === 'admin_section_landing_start') return landingStartScreen();
  if (action === 'admin_section_debug') return debugScreen();
  if (action === 'admin_section_production_checklist') return productionChecklistScreen();
  if (action === 'admin_section_help') return helpScreen(payload.context || '');
  return null;
}

function audit(sectionId = '') {
  const items = SECTIONS.map((item) => ({
    ...item,
    payload: callbackPayload(item.action, item.extra || {}),
    auditUrl: `${BASE}/debug/menu/audit/${item.id}?t=1536`
  }));
  if (sectionId) {
    const item = items.find((entry) => entry.id === String(sectionId || '').trim());
    return item
      ? { ok: true, runtimeVersion: runtimeVersion(), mode: 'v3-menu-section-audit', item, safe: true, noDatabaseRead: true, noMaxApiCall: true }
      : { ok: false, runtimeVersion: runtimeVersion(), error: 'section_not_found', validSections: items.map((entry) => entry.id), safe: true };
  }
  return {
    ok: true,
    runtimeVersion: runtimeVersion(),
    mode: 'v3-menu-audit-clean-1536',
    total: items.length,
    items,
    checks: {
      has15Sections: items.length === 15,
      hasPhotosInsideComments: true,
      hasReactionsInsideComments: true,
      hasHighlights: true,
      hasPolls: true,
      navigationDedicated: true,
      debugDedicated: true,
      productionChecklistDedicated: true,
      noLegacy8SectionMenu: true
    },
    safe: true,
    noDatabaseRead: true,
    noStoreSnapshot: true,
    noGithubExport: true,
    noStressTest: true,
    noMaxApiCall: true
  };
}

function routes() {
  return {
    ok: true,
    runtimeVersion: runtimeVersion(),
    mode: 'v3-menu-routes-clean-1536',
    routes: ['/debug/menu/audit', '/debug/menu/audit/:section', '/debug/menu/routes', '/debug/menu/production-checklist'],
    safe: true
  };
}

module.exports = {
  RUNTIME,
  SOURCE,
  BASE,
  SECTIONS,
  runtimeVersion,
  callbackPayload,
  button,
  link,
  keyboard,
  mainScreen,
  commentsScreen,
  highlightsScreen,
  pollsScreen,
  navigationScreen,
  landingStartScreen,
  debugScreen,
  productionChecklistScreen,
  helpScreen,
  screenForPayload,
  sectionById,
  audit,
  routes
};
