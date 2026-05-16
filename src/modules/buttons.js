'use strict';

const menuRenderer = require('../core/menuRenderer');
const postAddonManager = require('../core/postAddonManager');

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

  async handleAction(ctx) {
    return this.renderHome(ctx);
  }
};
