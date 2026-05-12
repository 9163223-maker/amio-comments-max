'use strict';

const RUNTIME = 'CC6.7.2-V3-ONE-ACTIVE-MENU-EDIT';
let installed = false;
let wrapped = false;
let edited = 0;
let sent = 0;
let saved = 0;
let lastError = '';

function norm(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function hasKeyboard(list) { return Array.isArray(list) && list.some((a) => a && a.type === 'inline_keyboard'); }
function isMenu(text) { return /АдминКИТ|Выберите раздел|Выберите действие|Комментарии|Модерация|Редактор|Кнопки|Подарки|Статистика|Каналы|Тарифы|Рефералы|Опросы|Выделение/.test(norm(text)); }
function resultMessageId(result) {
  const raw = JSON.stringify(result || {});
  const m1 = raw.match(/\"(?:message_id|messageId|id)\"\s*:\s*\"([^\"{}]+)\"/);
  if (m1) return m1[1];
  const m2 = raw.match(/\"(?:message_id|messageId|id)\"\s*:\s*(\d+)/);
  return m2 ? m2[1] : '';
}

function install() {
  if (installed) return selfTest();
  installed = true;
  try {
    const api = require('./services/maxApi');
    const db = require('./cc5-db-core');
    const cfg = require('./config');
    if (api.__adminkitOneActiveMenuEdit) { wrapped = true; return selfTest(); }
    const originalSend = api.sendMessage.bind(api);
    api.sendMessage = async function guardedSend(args = {}) {
      const userId = norm(args.userId || args.user_id || '');
      const menuLike = userId && hasKeyboard(args.attachments) && isMenu(args.text);
      if (menuLike && typeof db.getMenu === 'function') {
        try {
          const oldId = await db.getMenu(userId);
          if (oldId) {
            await api.editMessage({ botToken: cfg.botToken, messageId: oldId, text: args.text, attachments: args.attachments || [], notify: false });
            edited += 1;
            return { message_id: oldId, reused: true, runtimeVersion: RUNTIME };
          }
        } catch (error) {
          lastError = error && error.message ? error.message : String(error || 'old_menu_edit_failed');
        }
      }
      const result = await originalSend(args);
      sent += 1;
      if (menuLike && typeof db.setMenu === 'function') {
        const mid = resultMessageId(result);
        if (mid) { try { await db.setMenu(userId, mid); saved += 1; } catch (error) { lastError = error && error.message ? error.message : String(error); } }
      }
      return result;
    };
    api.__adminkitOneActiveMenuEdit = { runtimeVersion: RUNTIME };
    wrapped = true;
  } catch (error) {
    lastError = error && error.message ? error.message : String(error || 'install_failed');
  }
  return selfTest();
}
function selfTest() { return { ok: installed && wrapped, runtimeVersion: RUNTIME, installed, wrapped, edited, sent, saved, lastError, policy: { editExistingMenuInsteadOfSendingDuplicate: true, onlyInlineKeyboardMenus: true, doesNotPatchPosts: true } }; }
module.exports = { RUNTIME, install, selfTest };
