'use strict';

const fs = require('fs');

const RUNTIME = 'CC7.5.34-CORE-1.53.0-RESTORE-V3-PRODUCTION-MENU';
const SOURCE = 'adminkit-cc7-5-34-core-1-53-0-restore-v3-production-menu';
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';
const ACTIVE_PRODUCTION_RUNTIME = './index';
const SAFE_ROLLBACK_RUNTIME = './clean-entrypoint-1.52.9';

function applyRuntimeEnv() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  process.env.ADMINKIT_DISABLE_MENU_LOGO_ATTACHMENT = '1';
  process.env.ADMINKIT_FORCE_V3_PRODUCTION_MENU = '1';
  if (!process.env.ADMINKIT_PUBLIC_BASE_URL) process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
}

function cb(action, extra) {
  return JSON.stringify(Object.assign({ action: action }, extra || {}));
}

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

function isLegacyOrAdminMainMenu(args) {
  const text = String((args && args.text) || '');
  const serialized = JSON.stringify((args && args.attachments) || []);
  if (/Привет,|панель управления MAX-каналом|Главное меню\.|Postgres|Выберите раздел/i.test(text)) return true;
  if (serialized.indexOf('admin_section_comments') >= 0 && serialized.indexOf('admin_section_stats') >= 0 && (serialized.indexOf('Редактор постов') >= 0 || serialized.indexOf('Кнопки под постами') >= 0 || serialized.indexOf('Помощь') >= 0)) return true;
  return false;
}

function normalizeMainMenuArgs(args) {
  const next = Object.assign({}, args || {});
  if (!isLegacyOrAdminMainMenu(next)) return next;
  next.text = ['АдминКИТ', '', 'Главное меню управления MAX-каналом.', 'Выберите раздел из актуального V3 feature-плана.'].join('\n');
  next.attachments = v3MainMenuKeyboard();
  return next;
}

function installSafeDebugLiteLayer() {
  try {
    const layer = require('./debug-lite-route-layer');
    if (layer && typeof layer.install === 'function') return layer.install();
    return { ok: false, error: 'debug_lite_layer_install_missing' };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

function installNativeMenuLogoGuard() {
  if (global.__ADMINKIT_NATIVE_MENU_LOGO_GUARD_1530__) return { ok: true, already: true, runtimeVersion: RUNTIME };
  global.__ADMINKIT_NATIVE_MENU_LOGO_GUARD_1530__ = true;
  const originalExistsSync = fs.existsSync;
  fs.existsSync = function patchedExistsSync(targetPath) {
    const normalized = String(targetPath || '').replace(/\\/g, '/');
    if (process.env.ADMINKIT_DISABLE_MENU_LOGO_ATTACHMENT === '1' && normalized.endsWith('/public/adminkit_chat_logo.png')) return false;
    return originalExistsSync.apply(this, arguments);
  };
  return { ok: true, runtimeVersion: RUNTIME };
}

function installV3ProductionMenuGuard() {
  if (global.__ADMINKIT_RESTORE_V3_MENU_1530__) return { ok: true, already: true, runtimeVersion: RUNTIME };
  global.__ADMINKIT_RESTORE_V3_MENU_1530__ = true;
  const maxApi = require('./services/maxApi');
  const wrap = function(fn) { return async function wrappedSend(args) { return fn(normalizeMainMenuArgs(args)); }; };
  if (typeof maxApi.sendMessage === 'function') maxApi.sendMessage = wrap(maxApi.sendMessage);
  if (typeof maxApi.editMessage === 'function') maxApi.editMessage = wrap(maxApi.editMessage);
  return { ok: true, runtimeVersion: RUNTIME, visibleSections: 15, menu: 'V3 feature-plan' };
}

function getCleanEntrypointInfo() {
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, canonicalPublicBaseUrl: CANONICAL_PUBLIC_BASE_URL, activeProductionRuntime: 'index.js', safeRollbackRuntime: 'clean-entrypoint-1.52.9.js', restoredV3ProductionMenu: true, visibleSections: 15, safe: true };
}

function start() {
  applyRuntimeEnv();
  const debugLite = installSafeDebugLiteLayer();
  const logoGuard = installNativeMenuLogoGuard();
  const menuGuard = installV3ProductionMenuGuard();
  process.env.ADMINKIT_DEBUG_LITE_LAYER_OK = debugLite && debugLite.ok !== false ? '1' : '0';
  process.env.ADMINKIT_MENU_LOGO_GUARD_OK = logoGuard && logoGuard.ok !== false ? '1' : '0';
  process.env.ADMINKIT_RESTORE_V3_MENU_OK = menuGuard && menuGuard.ok !== false ? '1' : '0';
  return require(ACTIVE_PRODUCTION_RUNTIME);
}

if (require.main === module) start();

module.exports = { RUNTIME, SOURCE, CANONICAL_PUBLIC_BASE_URL, ACTIVE_PRODUCTION_RUNTIME, SAFE_ROLLBACK_RUNTIME, applyRuntimeEnv, installSafeDebugLiteLayer, installNativeMenuLogoGuard, installV3ProductionMenuGuard, getCleanEntrypointInfo, start };
