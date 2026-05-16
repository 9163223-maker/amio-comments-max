'use strict';

const menuRenderer = require('../core/menuRenderer');
const postAddonManager = require('../core/postAddonManager');
const flowEngine = require('../core/flowEngine');
const flowScreen = require('../core/flowScreen');

module.exports = {
  id: 'buttons',
  title: 'Кнопки',
  icon: '🔘',
  order: 30,
  feature: 'buttons.enabled',
  routes: { home: 'buttons.home', add: 'buttons.add', manage: 'buttons.manage' },

  async renderHome(ctx = {}) {
    const summary = await postAddonManager.summarizePostAddons(ctx);
    const max = summary.limits.buttonsMaxPerPost;
    const count = summary.buttons.length;
    const body = [
      `Пост: ${summary.postKey}`,
      `Кнопки сейчас: ${count}`,
      `Лимит тарифа: ${max}`
    ];

    if (!count) {
      body.push('Кнопок пока нет. Можно добавить первую CTA-кнопку.');
    } else {
      summary.buttons.forEach((button, index) => {
        body.push(`${index + 1}. ${button.title || button.text || 'Кнопка'}`);
        if (button.url) body.push(`   Ссылка: ${button.url}`);
      });
    }

    const buttons = [];
    if (count < max) buttons.push({ text: '+ Добавить кнопку', route: 'buttons.add', data: { postId: summary.postKey } });
    if (count) buttons.push({ text: '⚙️ Управлять кнопками', route: 'buttons.manage', data: { postId: summary.postKey } });

    return menuRenderer.renderScreen({
      title: '🔘 Управление кнопками поста',
      body,
      buttons,
      homeRoute: 'main.home'
    });
  },

  async startCreateFlow(ctx = {}) {
    const result = await flowEngine.start(ctx, 'buttons.create', {
      postId: ctx.postId || ctx.payload?.postId || '',
      channelId: ctx.channelId || ctx.payload?.channelId || ''
    });
    if (!result.ok) {
      return menuRenderer.renderScreen({
        title: '⚠️ Не удалось начать сценарий',
        body: [`Ошибка: ${result.error || 'unknown'}`],
        buttons: [{ text: '↩️ Назад к кнопкам', route: 'buttons.home' }],
        homeRoute: 'main.home'
      });
    }
    return flowScreen.renderFlowState(result, { icon: '🔘', backRoute: 'buttons.home' });
  },

  async handleAction(ctx) {
    if (ctx.route === 'buttons.add') return this.startCreateFlow(ctx);
    return this.renderHome(ctx);
  }
};
