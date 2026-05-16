'use strict';

const menuRenderer = require('../core/menuRenderer');
const buttonsData = require('../core/buttonsDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-BUTTONS-SECTION-1.0-READ-ONLY-DATA';

module.exports = {
  id: 'buttons',
  title: 'Кнопки',
  icon: '🔘',
  order: 30,
  feature: 'buttons.enabled',
  routes: { home: 'buttons.home', add: 'buttons.add', manage: 'buttons.manage' },

  async renderHome(ctx = {}) {
    const data = await buttonsData.overview(ctx.adminId || ctx.admin_id || '', {
      channelId: ctx.channelId || ctx.payload?.channelId || ctx.session?.selected_channel_id || '',
      limit: 10
    });

    return menuRenderer.renderScreen({
      title: '🔘 Кнопки',
      body: buttonsData.formatOverviewForScreen(data),
      buttons: [
        { text: '🔄 Обновить список', route: 'buttons.home', data: { sectionId: 'buttons', refresh: 1 } },
        { text: '➕ Добавить кнопку', route: 'buttons.add', data: { sectionId: 'buttons' } }
      ],
      homeRoute: 'main.home'
    });
  },

  async handleAction(ctx = {}) {
    if (ctx.route === 'buttons.add' || ctx.route === 'buttons.manage') {
      return menuRenderer.renderScreen({
        title: ctx.route === 'buttons.add' ? '➕ Добавить кнопку' : '⚙️ Управление кнопками',
        body: [
          'На этом шаге Core работает в read-only режиме.',
          'Реальное создание, изменение и удаление кнопок пока остаётся в текущем legacy-flow, чтобы не менять production-поведение.',
          'Следующий шаг миграции — перенести выбор поста и создание CTA-кнопки в Core без monkeypatch-слоёв.'
        ],
        buttons: [{ text: '🔘 К списку кнопок', route: 'buttons.home', data: { sectionId: 'buttons' } }],
        homeRoute: 'main.home'
      });
    }
    return this.renderHome(ctx);
  },

  selfTest() {
    return { ok: true, runtimeVersion: RUNTIME, dataAdapter: buttonsData.selfTest(), readOnlyRenderer: true };
  }
};