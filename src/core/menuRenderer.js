'use strict';

function btn(text, route, data = {}) {
  return { type: 'callback', text, payload: JSON.stringify({ r: route, ...data }) };
}

function inlineKeyboard(rows) {
  return [{ type: 'inline_keyboard', payload: { source: 'adminkit-core', version: 1, buttons: rows } }];
}

function renderScreen({ title, body = [], buttons = [], backRoute = '', homeRoute = 'main.home' }) {
  const lines = Array.isArray(body) ? body : [String(body || '')];
  const rows = buttons.map((item) => [btn(item.text, item.route, item.data || {})]);
  const nav = [];
  if (backRoute) nav.push(btn('↩️ Назад', backRoute));
  if (homeRoute) nav.push(btn('🏠 Главное меню', homeRoute));
  if (nav.length) rows.push(nav);
  return { text: [title, '', ...lines.filter(Boolean)].join('\n'), attachments: inlineKeyboard(rows) };
}

function renderMain(sections = []) {
  const rows = [];
  for (let i = 0; i < sections.length; i += 2) {
    rows.push(sections.slice(i, i + 2).map((section) => {
      const title = `${section.icon || ''} ${section.title || section.id}${section.locked ? ' 🔒' : ''}`.trim();
      return btn(title, section.locked ? 'billing.locked' : (section.routes?.home || `${section.id}.home`), { sectionId: section.id });
    }));
  }
  return {
    text: ['🐋 АдминКИТ Core', '', 'Главное меню собрано из sectionRegistry. Старые adminkit-admin-flows здесь не используются.'].join('\n'),
    attachments: inlineKeyboard(rows)
  };
}

module.exports = { btn, inlineKeyboard, renderScreen, renderMain };
