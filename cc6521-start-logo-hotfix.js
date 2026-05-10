'use strict';

// CC6.5.2.1: minimal hotfix over CC6.5.2 clean core.
// Scope: start/menu fallback and landing logo fit only. No comments/gifts/CTA/moderation logic changes.

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.5.2.1';
const SOURCE = 'adminkit-CC6.5.2.1-minimal-start-logo-hotfix';
const START_DEDUPE_TTL_MS = 3500;
const recentStartMenus = new Map();

function norm(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {} }
function parsePayload(value) { try { const parsed = JSON.parse(String(value || '')); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; } }
function getMessage(update = {}) { return update.message || update.data?.message || update.callback?.message || update.data?.callback?.message || null; }
function getMessageText(update = {}) { const message = getMessage(update) || {}; return norm(message.body?.text || message.text || message.message?.text || update.message?.text || ''); }
function getEventType(update = {}) { return norm(update.update_type || update.type || update.event_type || update.eventType || update.event || update.data?.update_type || update.data?.type || '').toLowerCase(); }
function getStartPayload(update = {}) { return norm([update.start_payload, update.payload, update.startParam, update.start_param, update.data?.start_payload, update.data?.payload, update.user?.start_payload, update.user?.start_param, getMessage(update)?.body?.payload, getMessage(update)?.payload].find((item) => norm(item)) || ''); }

function cleanupDedupe() {
  const now = Date.now();
  for (const [key, ts] of recentStartMenus.entries()) if (now - Number(ts || 0) > START_DEDUPE_TTL_MS) recentStartMenus.delete(key);
}
function shouldSkipStartMenu(key) {
  const normalized = String(key || '').trim();
  if (!normalized) return false;
  cleanupDedupe();
  if (recentStartMenus.has(normalized)) return true;
  recentStartMenus.set(normalized, Date.now());
  return false;
}

function isMenuStartUpdate(update = {}) {
  const eventType = getEventType(update);
  const text = getMessageText(update).toLowerCase();
  const payload = getStartPayload(update).toLowerCase();
  const cbPayload = parsePayload(update.callback?.payload || update.data?.callback?.payload || '');
  const action = norm(cbPayload.action).toLowerCase();
  if (eventType === 'bot_started' || eventType === 'bot_start' || eventType === 'bot_started_update') return true;
  if (['start', '/start', 'menu', '/menu', 'меню', 'главное меню'].includes(text)) return true;
  if (['menu', 'start', 'main', 'main_menu', 'ak_main_menu'].includes(payload)) return true;
  if (['start', 'menu', 'main_menu', 'ak_main_menu'].includes(action)) return true;
  return false;
}

function getUserId(update = {}) {
  const message = getMessage(update) || {};
  const callback = update.callback || update.data?.callback || {};
  return norm(update.user?.user_id || update.user?.id || update.sender?.user_id || update.sender?.id || callback.user?.user_id || callback.user?.id || callback.sender?.user_id || callback.sender?.id || message.sender?.user_id || message.sender?.id || message.user_id || message.from?.id || update.data?.user?.user_id || update.data?.user?.id || '');
}
function getChatId(update = {}) {
  const message = getMessage(update) || {};
  return norm(message.recipient?.chat_id || message.recipient?.id || message.chat_id || message.chat?.id || update.chat_id || update.chat?.id || update.data?.chat_id || update.data?.chat?.id || '');
}
function getTarget(update = {}) { const userId = getUserId(update); const chatId = getChatId(update); return { userId, chatId, key: userId || chatId }; }
function buildButton(text, action, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ action, ...extra }) }; }
function buildMainMenuKeyboard() {
  return [{ type: 'inline_keyboard', payload: { buttons: [
    [buildButton('💬 Комментарии', 'comments_menu'), buildButton('🎁 Подарки', 'gift_menu')],
    [buildButton('🔘 Кнопки', 'buttons_menu'), buildButton('🛡 Модерация', 'mod_start')],
    [buildButton('📊 Статистика', 'stats_menu'), buildButton('📣 Ваши каналы', 'channels_menu')],
    [buildButton('❓ Помощь', 'help_menu')]
  ] } }];
}

async function sendStartMenu(update = {}) {
  const config = require('./config');
  const { sendMessage } = require('./services/maxApi');
  const target = getTarget(update);
  if (!target.userId && !target.chatId) return { ok: false, reason: 'target_missing' };
  if (shouldSkipStartMenu(target.key)) return { ok: true, skipped: true, reason: 'dedupe' };
  await sendMessage({
    botToken: config.botToken,
    userId: target.userId || undefined,
    chatId: target.userId ? undefined : target.chatId,
    notify: false,
    text: ['АдминКИТ — главное меню', '', 'Выберите раздел управления каналом.'].join('\n'),
    attachments: buildMainMenuKeyboard()
  });
  return { ok: true, target: target.userId ? 'user' : 'chat' };
}

function landingClientPatch() {
  return `\n;(() => {\n  if (window.__ADMINKIT_CC6521_START_LOGO__) return;\n  window.__ADMINKIT_CC6521_START_LOGO__ = true;\n  const css = ` + JSON.stringify(`
    .miniapp-start-card img,
    .miniapp-start-logo,
    .adminkit-logo,
    .admin-kit-logo,
    .brand-logo,
    img[src*="adminkit_chat_logo"],
    img[src*="adminkit"][src*="logo"] {
      display: block !important;
      width: auto !important;
      height: auto !important;
      max-width: min(320px, 86vw) !important;
      max-height: 128px !important;
      object-fit: contain !important;
      object-position: center center !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }
    .miniapp-start-card,
    .miniapp-start-logo-wrap,
    .brand-logo-wrap {
      overflow: visible !important;
    }
  `) + `;\n  const style = document.createElement('style');\n  style.id = 'adminkit-cc6521-logo-fit';\n  style.textContent = css;\n  document.head.appendChild(style);\n  const tune = () => {\n    document.querySelectorAll('img').forEach((img) => {\n      const key = String(img.src || '') + ' ' + String(img.alt || '') + ' ' + String(img.className || '');\n      if (/adminkit|админкит|logo/i.test(key)) {\n        img.decoding = 'async';\n        img.loading = 'eager';\n        img.style.objectFit = 'contain';\n        img.style.objectPosition = 'center center';\n      }\n    });\n  };\n  tune();\n  try { new MutationObserver(tune).observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}\n})();\n`;
}

function patchPublicAppRead() {
  if (fs.__cc6521StartLogoReadPatch) return;
  fs.__cc6521StartLogoReadPatch = true;
  const originalReadFileSync = fs.readFileSync.bind(fs);
  const appPath = path.resolve(__dirname, 'public', 'app.js');
  fs.readFileSync = function cc6521ReadFileSync(filePath, options) {
    const content = originalReadFileSync(filePath, options);
    try {
      const resolved = path.resolve(String(filePath || ''));
      const wantsText = options === 'utf8' || options === 'utf-8' || (options && typeof options === 'object' && /utf-?8/i.test(String(options.encoding || '')));
      if (resolved === appPath && wantsText) {
        const text = String(content || '');
        if (!text.includes('__ADMINKIT_CC6521_START_LOGO__')) return text + landingClientPatch();
      }
    } catch {}
    return content;
  };
}

function sendDebug(res) {
  noCache(res);
  return res.type('text/plain').send([
    'OK: CC6521_READY',
    'runtime: ' + RUNTIME,
    'sourceMarker: ' + SOURCE,
    'base: CC6.5.2 clean core',
    'scope: start_menu_fallback_and_landing_logo_fit_only',
    'commentsChanged: false',
    'giftsChanged: false',
    'ctaChanged: false',
    'moderationChanged: false',
    'logoRuntimeAssetOverlay: false',
    'startMenuFallback: enabled',
    'webhookPatchMode: app_post_after_json_parser'
  ].join('\n') + '\n');
}

function installExpressPatch() {
  if (Module._load.__cc6521ExpressPatch) return;
  const oldLoad = Module._load;
  function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc6521Wrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc6521StartMenu) {
          app.__cc6521StartMenu = true;
          app.use((req, res, next) => {
            const route = String(req.path || req.url || '').split('?')[0].toLowerCase();
            if (route === '/debug/cc6521') return sendDebug(res);
            return next();
          });
          const oldPost = app.post.bind(app);
          app.post = (route, ...handlers) => {
            const routeText = String(route || '').toLowerCase();
            if (!routeText.includes('/webhook')) return oldPost(route, ...handlers);
            return oldPost(route, async (req, res, next) => {
              try {
                if (!isMenuStartUpdate(req.body || {})) return next();
                const result = await sendStartMenu(req.body || {});
                return res.json({ ok: true, handledBy: RUNTIME, result });
              } catch (error) {
                console.error('[CC6.5.2.1 start menu fallback]', error && error.message ? error.message : error);
                return next();
              }
            }, ...handlers);
          };
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc6521Wrap = true;
      return expressWrapper;
    }
    return loaded;
  }
  patchedLoad.__cc6521ExpressPatch = true;
  Module._load = patchedLoad;
}

function install() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  patchPublicAppRead();
  installExpressPatch();
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
}

module.exports = { RUNTIME, SOURCE, install, isMenuStartUpdate, buildMainMenuKeyboard };
