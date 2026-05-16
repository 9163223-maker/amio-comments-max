'use strict';

const menuRenderer = require('../core/menuRenderer');
const buttonsData = require('../core/buttonsDataAdapter');
const flowEngine = require('../core/flowEngine');
const flowScreen = require('../core/flowScreen');

const RUNTIME = 'ADMINKIT-CORE-BUTTONS-SECTION-1.2-CLEAN-CREATE-FLOW-SELFTEST';

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
      limit: 10,
      noCache: ctx.payload?.refresh === 1 || ctx.payload?.refresh === '1'
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
    if (ctx.route === 'buttons.add') {
      const adminId = ctx.adminId || ctx.admin_id || '';
      const data = await buttonsData.overview(adminId, {
        channelId: ctx.channelId || ctx.payload?.channelId || ctx.session?.selected_channel_id || '',
        limit: 10,
        noCache: true
      });
      const started = await flowEngine.start(ctx, 'buttons.create', {
        source: 'adminkit-core',
        storage: 'ak_post_buttons',
        legacyAdaptersDisabled: true
      });
      return flowScreen.renderFlowState(started, {
        icon: '🔘',
        backRoute: 'buttons.home',
        posts: data.ok ? data.posts : []
      });
    }

    if (ctx.route === 'buttons.manage') {
      return menuRenderer.renderScreen({
        title: '⚙️ Управление кнопками',
        body: [
          'Core уже читает только чистое хранилище ak_post_buttons.',
          'Отключение и редактирование кнопок перенесём отдельным шагом после проверки создания.',
          'Legacy-таблицы не подключаются как рабочие adapters.'
        ],
        buttons: [{ text: '🔘 К списку кнопок', route: 'buttons.home', data: { sectionId: 'buttons' } }],
        homeRoute: 'main.home'
      });
    }
    return this.renderHome(ctx);
  },

  selfTest() {
    return {
      ok: true,
      runtimeVersion: RUNTIME,
      dataAdapter: buttonsData.selfTest(),
      readOnlyRenderer: true,
      cleanCreateFlow: true,
      writesTo: 'ak_post_buttons',
      legacyAdaptersUsed: false
    };
  }
};