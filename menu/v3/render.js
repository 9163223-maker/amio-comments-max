'use strict';

const { getScreen } = require('./tree');

function button(text, route) {
  return { type: 'callback', text, payload: JSON.stringify({ v: 3, route }) };
}

function rows2(items) {
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

function navRows(screen) {
  if (!screen || screen.route === 'main') return [];
  const rows = [];
  rows.push([button('❓ Помощь', `help.${screen.route}`), button('↩️ Раздел', screen.route)]);
  rows.push([button('🏠 Главное меню', 'main')]);
  return rows;
}

function render(route = 'main') {
  const screen = getScreen(route) || getScreen('main');
  const lines = [screen.title, '', screen.text];
  if (screen.status === 'development' && !/в разработке/i.test(screen.text || '')) lines.push('', 'Статус: в разработке.');
  const actionRows = rows2((screen.buttons || []).map(([nextRoute, title]) => button(title, nextRoute)));
  const buttons = [...actionRows, ...navRows(screen)];
  return {
    text: lines.join('\n'),
    attachments: [{ type: 'inline_keyboard', payload: { buttons } }]
  };
}

module.exports = { render, button };
