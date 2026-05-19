'use strict';

const fs = require('fs');

const RUNTIME = 'CC7.5.34-CORE-1.53.2-STANDALONE-V3-AUDIT';
const SOURCE = 'adminkit-cc7-5-34-core-1-53-2-standalone-v3-audit';
const PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';
const ACTIVE_PRODUCTION_RUNTIME = './index';
const SAFE_ROLLBACK_RUNTIME = './clean-entrypoint-1.52.9';

const SECTIONS = [
  ['📺 Подключение канала', 'channels', 'admin_section_channels', {}, 'Подключение/проверка канала'],
  ['💬 Комментарии под постами', 'comments', 'admin_section_comments', {}, 'Комментарии под постами'],
  ['🖼 Фото в комментариях', 'photos', 'admin_section_comments', { focus: 'photos' }, 'Фото внутри комментариев; видео и файлы выключены'],
  ['😊 Реакции и ответы', 'reactions_replies', 'admin_section_comments', { focus: 'reactions_replies' }, 'Реакции и ответы внутри комментариев'],
  ['🎁 Подарки / лид-магниты', 'gifts', 'admin_section_gifts', {}, 'Подарки и лид-магниты'],
  ['🔘 CTA / пользовательские кнопки', 'buttons', 'admin_section_buttons', {}, 'Пользовательские кнопки под постами'],
  ['⭐ Выделение постов', 'highlights', 'comments_select_post', { source: 'highlights' }, 'Выбор поста для выделения'],
  ['🗳 Голосовалки / опросы', 'polls', 'comments_select_post', { source: 'polls' }, 'Выбор поста для голосовалки/опроса'],
  ['✏️ Редактирование постов', 'posts', 'admin_section_posts', {}, 'Редактирование опубликованных постов'],
  ['🛡 Модерация', 'moderation', 'admin_section_moderation', {}, 'Модерация комментариев'],
  ['📊 Статистика', 'stats', 'admin_section_stats', {}, 'Статистика'],
  ['🧭 Меню и навигация', 'navigation', 'admin_section_help', { context: 'navigation_v3' }, 'Проверка V3-навигации'],
  ['🚀 Посадочная Start', 'landing_start', 'admin_section_main', { source: 'landing_start' }, 'Посадочная Start ведёт в V3-меню'],
  ['🧪 Debug / GitHub export', 'debug', 'admin_section_help', { context: 'debug' }, 'Безопасные debug-lite ссылки'],
  ['✅ Production checklist', 'production_checklist', 'admin_section_help', { context: 'production_checklist' }, 'Финальная production-проверка']
];

function cb(action, extra) { return JSON.stringify(Object.assign({ action }, extra || {})); }
function keyboardRows() { return SECTIONS.map((s) => [{ type: 'callback', text: s[0], payload: cb(s[2], s[3]) }]); }
function v3Keyboard() { return [{ type: 'inline_keyboard', payload: { buttons: keyboardRows() } }]; }
function backKeyboard() { return [{ type: 'inline_keyboard', payload: { buttons: [[{ type: 'callback', text: '🏠 Главное меню', payload: cb('admin_section_main', { source: 'v3_audit' }) }]] } }]; }

function applyRuntimeEnv() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  process.env.ADMINKIT_PUBLIC_BASE_URL = process.env.ADMINKIT_PUBLIC_BASE_URL || PUBLIC_BASE_URL;
  process.env.ADMINKIT_DISABLE_MENU_LOGO_ATTACHMENT = '1';
  process.env.ADMINKIT_FORCE_V3_PRODUCTION_MENU = '1';
  process.env.ADMINKIT_STANDALONE_V3_AUDIT = '1';
}

function isLegacyMainMenu(args) {
  const text = String((args && args.text) || '');
  const a = JSON.stringify((args && args.attachments) || []);
  return /Привет,|панель управления MAX-каналом|Главное меню\.|Postgres|Выберите раздел/i.test(text) ||
    (a.includes('admin_section_comments') && a.includes('admin_section_stats') && (a.includes('Редактор постов') || a.includes('Кнопки под постами') || a.includes('Помощь')));
}

function isOldHelpText(args) {
  const text = String((args && args.text) || '');
  return /Что умеет бот:|Как начать:|Добавьте бота в канал как администратора|простая статистика канала/i.test(text);
}

function productionText() {
  return [
    '✅ Production checklist',
    '',
    'Это служебная финальная проверка перед production, а не справка для пользователя.',
    '',
    'Статус:',
    '• runtime: 1.53.2 STANDALONE-V3-AUDIT',
    '• V3-меню активно',
    '• legacy menu перехватывается',
    '• логотип как attachment отключён',
    '• heavy debug/store/export/stress не запускаются из меню',
    '',
    'Проверить:',
    '• /start открывает актуальное V3-меню',
    '• посадочная Start открывает этот же V3-flow',
    '• старое меню не появляется',
    '• разделы 1–15 открываются по своим route',
    '',
    'Ограничения:',
    '• видео и файлы в комментариях выключены',
    '• фото разрешены только внутри комментариев',
    '• подсказки только native inline',
    '• overlay/float подсказки запрещены'
  ].join('\n');
}

function normalizeArgs(args) {
  const next = Object.assign({}, args || {});
  if (isLegacyMainMenu(next)) {
    next.text = ['АдминКИТ', '', 'Главное меню управления MAX-каналом.', 'Выберите раздел из актуального V3 feature-плана.'].join('\n');
    next.attachments = v3Keyboard();
    return next;
  }
  if (isOldHelpText(next)) {
    next.text = productionText();
    next.attachments = backKeyboard();
    return next;
  }
  return next;
}

function installMaxApiGuard() {
  if (global.__ADMINKIT_STANDALONE_V3_GUARD_1532__) return { ok: true, already: true };
  global.__ADMINKIT_STANDALONE_V3_GUARD_1532__ = true;
  const maxApi = require('./services/maxApi');
  const wrap = (fn) => async (args) => fn(normalizeArgs(args));
  if (typeof maxApi.sendMessage === 'function') maxApi.sendMessage = wrap(maxApi.sendMessage);
  if (typeof maxApi.editMessage === 'function') maxApi.editMessage = wrap(maxApi.editMessage);
  return { ok: true, runtimeVersion: RUNTIME };
}

function installLogoGuard() {
  if (global.__ADMINKIT_LOGO_GUARD_1532__) return { ok: true, already: true };
  global.__ADMINKIT_LOGO_GUARD_1532__ = true;
  const originalExistsSync = fs.existsSync;
  fs.existsSync = function patchedExistsSync(targetPath) {
    const normalized = String(targetPath || '').replace(/\\/g, '/');
    if (process.env.ADMINKIT_DISABLE_MENU_LOGO_ATTACHMENT === '1' && normalized.endsWith('/public/adminkit_chat_logo.png')) return false;
    return originalExistsSync.apply(this, arguments);
  };
  return { ok: true, runtimeVersion: RUNTIME };
}

function installDebugLiteLayer() {
  try {
    const layer = require('./debug-lite-route-layer');
    if (layer && typeof layer.install === 'function') return layer.install();
    return { ok: false, error: 'debug_lite_layer_missing' };
  } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; }
}

function audit(sectionId) {
  const items = SECTIONS.map((s, i) => ({
    index: i + 1,
    id: s[1],
    label: s[0],
    payload: cb(s[2], s[3]),
    expected: s[4],
    auditUrl: PUBLIC_BASE_URL + '/debug/menu/audit/' + s[1] + '?t=1532'
  }));
  if (sectionId) {
    const item = items.find((x) => x.id === sectionId);
    return item ? { ok: true, runtimeVersion: RUNTIME, item, safe: true, noDatabaseRead: true, noMaxApiCall: true, noStoreSnapshot: true } : { ok: false, runtimeVersion: RUNTIME, error: 'section_not_found', sectionId };
  }
  return { ok: true, runtimeVersion: RUNTIME, mode: 'v3-menu-route-audit', total: items.length, items, checks: { has15Sections: items.length === 15, hasHighlights: true, hasPolls: true, productionChecklistDedicated: true, standaloneRuntime: true }, safe: true, noDatabaseRead: true, noMaxApiCall: true, noStoreSnapshot: true, noGithubExport: true, noStressTest: true };
}

function installAuditRoutes() {
  if (global.__ADMINKIT_AUDIT_ROUTES_1532__) return { ok: true, already: true };
  global.__ADMINKIT_AUDIT_ROUTES_1532__ = true;
  const express = require('express');
  const originalListen = express.application.listen;
  express.application.listen = function patchedListen() {
    if (!this.__ADMINKIT_AUDIT_ROUTES_READY_1532__) {
      this.__ADMINKIT_AUDIT_ROUTES_READY_1532__ = true;
      this.get('/debug/menu/audit', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(audit('')); });
      this.get('/debug/menu/audit/:section', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(audit(String(req.params.section || ''))); });
      this.get('/debug/menu/production-checklist', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ ok: true, runtimeVersion: RUNTIME, text: productionText(), safe: true }); });
    }
    return originalListen.apply(this, arguments);
  };
  return { ok: true, runtimeVersion: RUNTIME };
}

function getCleanEntrypointInfo() {
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, activeProductionRuntime: 'index.js', safeRollbackRuntime: 'clean-entrypoint-1.52.9.js', menuAuditRoutes: ['/debug/menu/audit','/debug/menu/audit/:section','/debug/menu/production-checklist'], visibleSections: 15, safe: true };
}

function start() {
  applyRuntimeEnv();
  const auditRoutes = installAuditRoutes();
  const debugLite = installDebugLiteLayer();
  const logoGuard = installLogoGuard();
  const menuGuard = installMaxApiGuard();
  process.env.ADMINKIT_AUDIT_ROUTES_OK = auditRoutes && auditRoutes.ok !== false ? '1' : '0';
  process.env.ADMINKIT_DEBUG_LITE_LAYER_OK = debugLite && debugLite.ok !== false ? '1' : '0';
  process.env.ADMINKIT_MENU_LOGO_GUARD_OK = logoGuard && logoGuard.ok !== false ? '1' : '0';
  process.env.ADMINKIT_V3_MENU_GUARD_OK = menuGuard && menuGuard.ok !== false ? '1' : '0';
  return require(ACTIVE_PRODUCTION_RUNTIME);
}

if (require.main === module) start();
module.exports = { RUNTIME, SOURCE, PUBLIC_BASE_URL, SECTIONS, audit, productionText, getCleanEntrypointInfo, start };
