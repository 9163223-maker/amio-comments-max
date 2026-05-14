'use strict';

// One-current-menu guard for V3 admin menu.
// Instead of always sending a new menu, admin menu messages are edited in place when a saved menu exists.

const RUNTIME = 'CC6.7.6-ONE-CURRENT-MENU-EDITOR';
const MARKER = '__ADMINKIT_ONE_CURRENT_MENU_EDITOR_676__';

function clean(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }

function hasRoutePayload(attachments = []) {
  try {
    return (Array.isArray(attachments) ? attachments : []).some((a) => {
      if (a?.type !== 'inline_keyboard') return false;
      const rows = Array.isArray(a?.payload?.buttons) ? a.payload.buttons : [];
      return rows.flat().some((b) => {
        if (b?.type !== 'callback') return false;
        const raw = b.payload || b.data || '';
        if (typeof raw === 'string') return /"r"\s*:|"route"\s*:/.test(raw) || /^[a-z]+:[a-z]/i.test(raw);
        return raw && typeof raw === 'object' && (raw.r || raw.route);
      });
    });
  } catch { return false; }
}

function looksLikeAdminMenu(args = {}) {
  const text = clean(args.text);
  if (!hasRoutePayload(args.attachments)) return false;
  return /АдминКИТ|Главное меню|Каналы|Комментарии|Подарки|Кнопки|Модерация|Выбрать пост|Баннер|Ввод|Сохранено/i.test(text);
}

async function getPreviousMenuId(args = {}) {
  const ids = [...new Set([args.userId, args.chatId, 'global'].map(clean).filter(Boolean))];
  try {
    const state = require('./db-v3-state');
    for (const id of ids) {
      const prev = clean(await state.getMenu(id));
      if (prev) return { ownerId: id, messageId: prev };
    }
  } catch {}
  return { ownerId: '', messageId: '' };
}

function normalizeEditResult(prevMessageId, result) {
  if (result && typeof result === 'object') {
    return {
      ...result,
      message_id: result.message_id || result.messageId || result.id || prevMessageId,
      messageId: result.messageId || result.message_id || result.id || prevMessageId,
      adminkitEditedCurrentMenu: true,
      runtimeVersion: RUNTIME
    };
  }
  return { ok: true, message_id: prevMessageId, messageId: prevMessageId, adminkitEditedCurrentMenu: true, runtimeVersion: RUNTIME };
}

function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;

  const api = require('./services/maxApi');
  if (!api || typeof api.sendMessage !== 'function' || typeof api.editMessage !== 'function') {
    return { ok: false, runtimeVersion: RUNTIME, marker: MARKER, error: 'max_api_missing' };
  }
  if (api.sendMessage.__adminkitOneCurrentMenuEditor) return selfTest(true);

  const originalSend = api.sendMessage.bind(api);
  const originalEdit = api.editMessage.bind(api);

  api.sendMessage = async function adminkitOneCurrentMenuSend(args = {}) {
    if (looksLikeAdminMenu(args)) {
      const prev = await getPreviousMenuId(args);
      if (prev.messageId) {
        try {
          const edited = await originalEdit({
            botToken: args.botToken,
            messageId: prev.messageId,
            text: args.text,
            attachments: args.attachments,
            format: args.format,
            link: args.link,
            notify: false
          });
          return normalizeEditResult(prev.messageId, edited);
        } catch (error) {
          // If MAX refuses edit for an old/deleted message, fall back to send and let existing cleanup try to delete stale menu.
        }
      }
    }
    return originalSend(args);
  };
  api.sendMessage.__adminkitOneCurrentMenuEditor = true;

  return selfTest(false);
}

function selfTest(already = false) {
  return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, already, policy: 'edit_saved_admin_menu_instead_of_sending_duplicate' };
}

module.exports = { RUNTIME, MARKER, install, selfTest };
