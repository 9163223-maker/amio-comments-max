'use strict';

const menuRenderer = require('../../core/menuRenderer');
const channelData = require('../../core/channelDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-CHANNELS-SECTION-1.0-READ-ONLY-DATA';

async function renderHome(ctx = {}) {
  const data = await channelData.listChannels(ctx.adminId || ctx.admin_id || '', { limit: 20 });
  return menuRenderer.renderScreen({
    title: '📺 Каналы',
    body: channelData.formatChannelsForScreen(data),
    buttons: [
      { text: '🔄 Обновить список', route: 'channels.home', data: { sectionId: 'channels', refresh: 1 } },
      { text: '➕ Подключить канал', route: 'channels.connect_legacy', data: { sectionId: 'channels' } }
    ],
    homeRoute: 'main.home'
  });
}

async function handleAction(ctx = {}) {
  if (ctx.route === 'channels.connect_legacy') {
    return menuRenderer.renderScreen({
      title: '➕ Подключение канала',
      body: [
        'На этом шаге Core работает в read-only режиме.',
        'Подключение нового канала пока остаётся в текущем legacy-flow, чтобы не менять production-поведение.',
        'Следующий шаг миграции — перенести flow подключения канала в Core без monkeypatch-слоёв.'
      ],
      buttons: [{ text: '📺 К списку каналов', route: 'channels.home', data: { sectionId: 'channels' } }],
      homeRoute: 'main.home'
    });
  }
  return renderHome(ctx);
}

function selfTest() {
  return { ok: true, runtimeVersion: RUNTIME, dataAdapter: channelData.selfTest(), readOnlyRenderer: true };
}

module.exports = {
  id: 'channels',
  title: 'Каналы',
  shortTitle: 'Каналы',
  icon: '📺',
  order: 10,
  feature: 'channels.enabled',
  routes: { home: 'channels.home', connectLegacy: 'channels.connect_legacy' },
  renderHome,
  handleAction,
  selfTest
};