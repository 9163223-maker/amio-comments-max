'use strict';

const fs = require('fs');

const RUNTIME = 'CC7.5.34-CORE-1.52.9-CLEAN-RUNTIME-MAIN-MENU-V3-NORMALIZED';
const SOURCE = 'adminkit-cc7-5-34-core-1-52-9-clean-runtime-main-menu-v3-normalized';
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';
const ACTIVE_PRODUCTION_RUNTIME = './index';
const SAFE_ROLLBACK_RUNTIME = './clean-entrypoint-1.52.8';

function applyRuntimeEnv() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  process.env.ADMINKIT_DISABLE_MENU_LOGO_ATTACHMENT = '1';
  process.env.ADMINKIT_NORMALIZE_MAIN_MENU_V3 = '1';
  if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
    process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
  }
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
  if (global.__ADMINKIT_NATIVE_MENU_LOGO_GUARD_1529__) {
    return { ok: true, already: true, runtimeVersion: RUNTIME };
  }
  global.__ADMINKIT_NATIVE_MENU_LOGO_GUARD_1529__ = true;
  const originalExistsSync = fs.existsSync;
  fs.existsSync = function patchedExistsSync(targetPath) {
    const normalized = String(targetPath || '').replace(/\\/g, '/');
    if (process.env.ADMINKIT_DISABLE_MENU_LOGO_ATTACHMENT === '1' && /\/public\/adminkit_chat_logo\.png$/i.test(normalized)) {
      return false;
    }
    return originalExistsSync.apply(this, arguments);
  };
  return { ok: true, runtimeVersion: RUNTIME, disabledPathSuffix: '/public/adminkit_chat_logo.png' };
}

function findButton(rows, needle) {
  const flat = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const button of Array.isArray(row) ? row : []) flat.push(button);
  }
  return flat.find((button) => String(button && button.text || '').toLowerCase().includes(String(needle || '').toLowerCase())) || null;
}

function isMainMenuKeyboard(attachments) {
  const keyboard = Array.isArray(attachments) ? attachments.find((item) => item && item.type === 'inline_keyboard') : null;
  const rows = keyboard && keyboard.payload ? keyboard.payload.buttons : null;
  if (!Array.isArray(rows)) return false;
  const labels = rows.flat().map((button) => String(button && button.text || '').toLowerCase()).join(' | ');
  return labels.includes('комментар') && labels.includes('модерац') && labels.includes('кнопки') && labels.includes('подар') && labels.includes('статист') && labels.includes('канал');
}

function normalizeMainMenuAttachments(attachments) {
  if (!Array.isArray(attachments)) return attachments;
  const keyboard = attachments.find((item) => item && item.type === 'inline_keyboard');
  const rows = keyboard && keyboard.payload ? keyboard.payload.buttons : null;
  if (!Array.isArray(rows)) return attachments;
  const comments = findButton(rows, 'комментар');
  const moderation = findButton(rows, 'модерац');
  const posts = findButton(rows, 'редактор');
  const buttons = findButton(rows, 'кнопки');
  const gifts = findButton(rows, 'подар');
  const stats = findButton(rows, 'статист');
  const channels = findButton(rows, 'канал');
  const help = findButton(rows, 'помощ');
  const compactRows = [
    [comments, moderation].filter(Boolean),
    [posts, buttons].filter(Boolean),
    [gifts, stats].filter(Boolean),
    [channels, help].filter(Boolean)
  ].filter((row) => row.length);
  return [{ type: 'inline_keyboard', payload: { buttons: compactRows } }];
}

function normalizeMainMenuText(text) {
  const raw = String(text || '');
  if (!raw) return raw;
  if (/панель управления MAX-каналом/i.test(raw) || /выберите раздел/i.test(raw)) {
    return [
      'АдминКИТ',
      '',
      'Главное меню управления каналом.',
      'Выберите нужный раздел.'
    ].join('\n');
  }
  if (/Главное меню\./i.test(raw) && /Postgres/i.test(raw)) {
    return [
      'АдминКИТ',
      '',
      'Главное меню управления каналом.',
      'Выберите нужный раздел.'
    ].join('\n');
  }
  return raw;
}

function installMainMenuV3Normalizer() {
  if (global.__ADMINKIT_MAIN_MENU_V3_NORMALIZER_1529__) {
    return { ok: true, already: true, runtimeVersion: RUNTIME };
  }
  global.__ADMINKIT_MAIN_MENU_V3_NORMALIZER_1529__ = true;
  const maxApi = require('./services/maxApi');
  const originalSendMessage = maxApi.sendMessage;
  const originalEditMessage = maxApi.editMessage;
  const wrap = (fn) => async function normalizedMenuCall(args) {
    const next = { ...(args || {}) };
    if (process.env.ADMINKIT_NORMALIZE_MAIN_MENU_V3 === '1' && isMainMenuKeyboard(next.attachments)) {
      next.text = normalizeMainMenuText(next.text);
      next.attachments = normalizeMainMenuAttachments(next.attachments);
    }
    return fn(next);
  };
  if (typeof originalSendMessage === 'function') maxApi.sendMessage = wrap(originalSendMessage);
  if (typeof originalEditMessage === 'function') maxApi.editMessage = wrap(originalEditMessage);
  return { ok: true, runtimeVersion: RUNTIME, sendMessageWrapped: typeof originalSendMessage === 'function', editMessageWrapped: typeof originalEditMessage === 'function' };
}

function getCleanEntrypointInfo() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    canonicalPublicBaseUrl: CANONICAL_PUBLIC_BASE_URL,
    activeRuntimeEntrypoint: true,
    packageJsonSwitched: true,
    activeProductionRuntime: 'index.js',
    safeRollbackRuntime: 'clean-entrypoint-1.52.8.js',
    nativeMenuOnly: true,
    menuLogoAttachmentDisabled: true,
    mainMenuV3Normalized: true,
    startMenuExpected: 'short text + compact 2-column inline keyboard, no image attachment, no Postgres text',
    noDatabaseReadInEntrypoint: true,
    noStoreSnapshotInEntrypoint: true,
    noGithubExportInEntrypoint: true,
    noStressTestInEntrypoint: true,
    rollback: 'Set package.json start back to node clean-entrypoint-1.52.8.js'
  };
}

function start() {
  applyRuntimeEnv();
  const debugLite = installSafeDebugLiteLayer();
  const logoGuard = installNativeMenuLogoGuard();
  const menuNormalizer = installMainMenuV3Normalizer();
  process.env.ADMINKIT_DEBUG_LITE_LAYER_OK = debugLite && debugLite.ok !== false ? '1' : '0';
  process.env.ADMINKIT_DEBUG_LITE_LAYER_RUNTIME = debugLite && debugLite.runtimeVersion ? debugLite.runtimeVersion : '';
  process.env.ADMINKIT_MENU_LOGO_GUARD_OK = logoGuard && logoGuard.ok !== false ? '1' : '0';
  process.env.ADMINKIT_MAIN_MENU_V3_NORMALIZER_OK = menuNormalizer && menuNormalizer.ok !== false ? '1' : '0';
  return require(ACTIVE_PRODUCTION_RUNTIME);
}

if (require.main === module) {
  start();
}

module.exports = { RUNTIME, SOURCE, CANONICAL_PUBLIC_BASE_URL, ACTIVE_PRODUCTION_RUNTIME, SAFE_ROLLBACK_RUNTIME, applyRuntimeEnv, installSafeDebugLiteLayer, installNativeMenuLogoGuard, installMainMenuV3Normalizer, getCleanEntrypointInfo, start };
