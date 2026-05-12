'use strict';

// Hard safety net: if the legacy bot core tries to render the old one-column admin menu,
// replace only that outgoing packet with Clean Core V3 2x6 menu.
// This does not touch comments UI, post parser, or media logic.

const RUNTIME = 'CC6.6.6-V3-MAIN-MENU-HARD-OVERRIDE';
const SOURCE = 'adminkit-v3-main-menu-output-guard';

let installed = false;
let replacements = 0;
let lastReplacementAt = '';

const MAIN_ITEMS = [
  ['📺 Каналы', 'channels:home'],
  ['💬 Комментарии', 'comments:home'],
  ['🛡 Модерация', 'moderation:home'],
  ['✏️ Редактор', 'editor:home'],
  ['⚪ Кнопки', 'buttons:home'],
  ['🎁 Подарки', 'gifts:home'],
  ['📌 Выделение', 'highlight:home'],
  ['🗳 Опросы', 'polls:home'],
  ['📊 Статистика', 'stats:home'],
  ['🧾 Тарифы', 'billing:home'],
  ['🤝 Рефералы', 'referrals:home'],
  ['❓ Помощь', 'help:home']
];

function callbackButton(text, route) {
  return { type: 'callback', text, payload: JSON.stringify({ r: route }) };
}

function rows2(items) {
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

function cleanV3MenuPacket() {
  return {
    text: '🐋 АдминКИТ\n\nПанель управления MAX-каналом. Выберите раздел.',
    attachments: [{
      type: 'inline_keyboard',
      payload: { buttons: rows2(MAIN_ITEMS.map(([text, route]) => callbackButton(text, route))) }
    }]
  };
}

function buttonCount(attachments = []) {
  try {
    return (attachments || []).reduce((sum, att) => {
      const rows = att?.payload?.buttons;
      if (!Array.isArray(rows)) return sum;
      return sum + rows.reduce((n, row) => n + (Array.isArray(row) ? row.length : 0), 0);
    }, 0);
  } catch { return 0; }
}

function rowCount(attachments = []) {
  try {
    return (attachments || []).reduce((sum, att) => {
      const rows = att?.payload?.buttons;
      return sum + (Array.isArray(rows) ? rows.length : 0);
    }, 0);
  } catch { return 0; }
}

function isCleanV3Already(args = {}) {
  const text = String(args?.text || '');
  if (!text.includes('Панель управления MAX-каналом')) return false;
  return buttonCount(args?.attachments) >= 12 && rowCount(args?.attachments) <= 7;
}

function isLegacyMainMenuPacket(args = {}) {
  const text = String(args?.text || '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (isCleanV3Already(args)) return false;

  const looksMain =
    /АдминКИТ/i.test(text) &&
    (/панель управления MAX-каналом/i.test(text) || /Панель управления MAX-каналом/i.test(text)) &&
    (/Выберите раздел/i.test(text) || /выберите раздел/i.test(text));

  const oldList = /комментарии,\s*модерация,\s*редактор,\s*кнопки,\s*подарки/i.test(text);
  const oldRows = buttonCount(args?.attachments) >= 6 && rowCount(args?.attachments) >= 7;

  return Boolean(looksMain || oldList || oldRows);
}

function replaceIfNeeded(args = {}) {
  if (!isLegacyMainMenuPacket(args)) return args;
  const packet = cleanV3MenuPacket();
  replacements += 1;
  lastReplacementAt = new Date().toISOString();
  return { ...args, text: packet.text, attachments: packet.attachments };
}

function install() {
  if (installed) return { ok: true, runtimeVersion: RUNTIME, already: true };
  installed = true;
  const maxApi = require('./services/maxApi');
  if (!maxApi.__adminkitV3MainMenuHardOverride) {
    maxApi.__adminkitV3MainMenuHardOverride = true;
    const originalSend = maxApi.sendMessage;
    const originalEdit = maxApi.editMessage;
    if (typeof originalSend === 'function') {
      maxApi.sendMessage = async function patchedSendMessage(args = {}) {
        return originalSend.call(this, replaceIfNeeded(args));
      };
    }
    if (typeof originalEdit === 'function') {
      maxApi.editMessage = async function patchedEditMessage(args = {}) {
        return originalEdit.call(this, replaceIfNeeded(args));
      };
    }
  }
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
}

function status() {
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, installed, replacements, lastReplacementAt, policy: 'replace_only_legacy_main_menu_output_with_clean_v3_2x6' };
}

module.exports = { install, status, RUNTIME, SOURCE };
