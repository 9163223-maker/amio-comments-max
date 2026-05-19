'use strict';

const fs = require('fs');

const RUNTIME = 'CC7.5.34-CORE-1.53.3-EARLY-V3-MENU-AUDIT';
const SOURCE = 'adminkit-cc7-5-34-core-1-53-3-early-v3-menu-audit';
const PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';
const ACTIVE_PRODUCTION_RUNTIME = './index';
const SAFE_ROLLBACK_RUNTIME = './clean-entrypoint-1.52.9';

function applyRuntimeEnv() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  process.env.ADMINKIT_PUBLIC_BASE_URL = process.env.ADMINKIT_PUBLIC_BASE_URL || PUBLIC_BASE_URL;
  process.env.ADMINKIT_DISABLE_MENU_LOGO_ATTACHMENT = '1';
  process.env.ADMINKIT_FORCE_V3_PRODUCTION_MENU = '1';
  process.env.ADMINKIT_EARLY_V3_MENU_AUDIT = '1';
}

function cb(action, extra) { return JSON.stringify(Object.assign({ action: action }, extra || {})); }
function v3MainMenuKeyboard() {
  const rows = [
    ['📺 Подключение канала', 'admin_section_channels'],
    ['💬 Комментарии под постами', 'admin_section_comments'],
    ['🖼 Фото в комментариях', 'admin_section_comments', { focus: 'photos' }],
    ['😊 Реакции и ответы', 'admin_section_comments', { focus: 'reactions_replies' }],
    ['🎁 Подарки / лид-магниты', 'admin_section_gifts'],
    ['🔘 CTA / пользовательские кнопки', 'admin_section_buttons'],
    ['⭐ Выделение постов', 'comments_select_post', { source: 'highlights' }],
    ['🗳 Голосовалки / опросы', 'comments_select_post', { source: 'polls' }],
    ['✏️ Редактирование постов', 'admin_section_posts'],
    ['🛡 Модерация', 'admin_section_moderation'],
    ['📊 Статистика', 'admin_section_stats'],
    ['🧭 Меню и навигация', 'admin_section_help', { context: 'navigation_v3' }],
    ['🚀 Посадочная Start', 'admin_section_main', { source: 'landing_start' }],
    ['🧪 Debug / GitHub export', 'admin_section_help', { context: 'debug' }],
    ['✅ Production checklist', 'admin_section_help', { context: 'production_checklist' }]
  ];
  return [{ type: 'inline_keyboard', payload: { buttons: rows.map(function(row) {
    return [{ type: 'callback', text: row[0], payload: cb(row[1], row[2] || {}) }];
  }) } }];
}
function backKeyboard() { return [{ type: 'inline_keyboard', payload: { buttons: [[{ type: 'callback', text: '🏠 Главное меню', payload: cb('admin_section_main', { source: 'v3_guard' }) }]] } }]; }
function productionText() {
  return [
    '✅ Production checklist',
    '',
    'Это служебная финальная проверка перед production, а не пользовательская справка.',
    '',
    'Проверяется:',
    '• актуальный runtime и package start;',
    '• /start и посадочная Start ведут в один V3-flow;',
    '• старые legacy keyboards не используются;',
    '• 15 разделов V3 feature-плана доступны;',
    '• heavy debug/store/export/stress не запускаются;',
    '• фото остаются внутри раздела комментариев;',
    '• видео и файлы в комментариях выключены;',
    '• подсказки только native inline, без overlay/float.',
    '',
    'Дальше: пройти каждый раздел V3-меню и подтвердить, что старое меню не всплывает.'
  ].join('\n');
}
function isLegacyMainMenu(args) {
  const text = String((args && args.text) || '');
  const a = JSON.stringify((args && args.attachments) || []);
  return /Привет,|панель управления MAX-каналом|Главное меню\.|Postgres|Выберите раздел/i.test(text) ||
    (a.includes('admin_section_comments') && a.includes('admin_section_stats') && (a.includes('Редактор постов') || a.includes('Кнопки под постами') || a.includes('Помощь')));
}
function isOldHelpText(args) {
  return /Что умеет бот:|Как начать:|Добавьте бота в канал как администратора|простая статистика канала/i.test(String((args && args.text) || ''));
}
function normalizeArgs(args) {
  const next = Object.assign({}, args || {});
  if (isLegacyMainMenu(next)) {
    next.text = ['АдминКИТ', '', 'Главное меню управления MAX-каналом.', 'Выберите раздел из актуального V3 feature-плана.'].join('\n');
    next.attachments = v3MainMenuKeyboard();
    return next;
  }
  if (isOldHelpText(next)) {
    next.text = productionText();
    next.attachments = backKeyboard();
    return next;
  }
  return next;
}

function installMenuGuard() {
  if (global.__ADMINKIT_EARLY_V3_MENU_GUARD_1533__) return { ok: true, already: true, runtimeVersion: RUNTIME };
  global.__ADMINKIT_EARLY_V3_MENU_GUARD_1533__ = true;
  const maxApi = require('./services/maxApi');
  const wrap = (fn) => async (args) => fn(normalizeArgs(args));
  if (typeof maxApi.sendMessage === 'function') maxApi.sendMessage = wrap(maxApi.sendMessage);
  if (typeof maxApi.editMessage === 'function') maxApi.editMessage = wrap(maxApi.editMessage);
  return { ok: true, runtimeVersion: RUNTIME, menu: 'V3 feature-plan', visibleSections: 15 };
}
function installLogoGuard() {
  if (global.__ADMINKIT_LOGO_GUARD_1533__) return { ok: true, already: true, runtimeVersion: RUNTIME };
  global.__ADMINKIT_LOGO_GUARD_1533__ = true;
  const originalExistsSync = fs.existsSync;
  fs.existsSync = function patchedExistsSync(targetPath) {
    const normalized = String(targetPath || '').replace(/\\/g, '/');
    if (process.env.ADMINKIT_DISABLE_MENU_LOGO_ATTACHMENT === '1' && normalized.endsWith('/public/adminkit_chat_logo.png')) return false;
    return originalExistsSync.apply(this, arguments);
  };
  return { ok: true, runtimeVersion: RUNTIME };
}
function installEarlyMenuAuditRoutes() {
  try {
    const layer = require('./debug-menu-audit-route-layer');
    if (layer && typeof layer.install === 'function') return layer.install();
    return { ok: false, error: 'debug_menu_audit_layer_missing' };
  } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; }
}
function installDebugLiteLayer() {
  try {
    const layer = require('./debug-lite-route-layer');
    if (layer && typeof layer.install === 'function') return layer.install();
    return { ok: false, error: 'debug_lite_layer_missing' };
  } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; }
}
function getCleanEntrypointInfo() {
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, activeProductionRuntime: 'index.js', safeRollbackRuntime: SAFE_ROLLBACK_RUNTIME + '.js', menuAuditRoutes: ['/debug/menu/audit','/debug/menu/audit/:section','/debug/menu/production-checklist','/debug/menu/routes'], visibleSections: 15, safe: true };
}
function start() {
  applyRuntimeEnv();
  const menuAudit = installEarlyMenuAuditRoutes();
  const debugLite = installDebugLiteLayer();
  const logoGuard = installLogoGuard();
  const menuGuard = installMenuGuard();
  process.env.ADMINKIT_EARLY_MENU_AUDIT_OK = menuAudit && menuAudit.ok !== false ? '1' : '0';
  process.env.ADMINKIT_DEBUG_LITE_LAYER_OK = debugLite && debugLite.ok !== false ? '1' : '0';
  process.env.ADMINKIT_MENU_LOGO_GUARD_OK = logoGuard && logoGuard.ok !== false ? '1' : '0';
  process.env.ADMINKIT_V3_MENU_GUARD_OK = menuGuard && menuGuard.ok !== false ? '1' : '0';
  return require(ACTIVE_PRODUCTION_RUNTIME);
}

if (require.main === module) start();
module.exports = { RUNTIME, SOURCE, PUBLIC_BASE_URL, applyRuntimeEnv, installEarlyMenuAuditRoutes, installDebugLiteLayer, installLogoGuard, installMenuGuard, getCleanEntrypointInfo, start };
