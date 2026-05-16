'use strict';

const menuRenderer = require('../core/menuRenderer');
const postAddonManager = require('../core/postAddonManager');
const flowEngine = require('../core/flowEngine');
const flowScreen = require('../core/flowScreen');

function describeMaterial(item) {
  if (!item) return 'не задан';
  if (item.url) return `ссылка: ${item.url}`;
  if (item.type === 'text' && item.text) return `текст: ${item.text}`;
  if (item.fileName) return `файл: ${item.fileName}`;
  if (item.photo) return 'фото';
  return item.material || item.content || item.kind || 'материал задан';
}

function describeConditions(item) {
  const c = item?.conditions || item?.access || {};
  if (c.mode === 'all' || item?.accessMode === 'all') return 'доступ всем';
  if (c.channels?.length) return `подписка на каналы: ${c.channels.join(', ')}`;
  if (c.commentKeyword) return `кодовое слово в комментарии: ${c.commentKeyword}`;
  if (c.commentsMin) return `комментариев под постом: от ${c.commentsMin}`;
  return 'только подписчикам текущего канала';
}

module.exports = {
  id: 'lead_magnets',
  title: 'Подарки / Лид-магниты',
  shortTitle: 'Лид-магниты',
  icon: '🎁',
  order: 40,
  feature: 'lead_magnets.enabled',
  routes: { home: 'lead_magnets.home', add: 'lead_magnets.add', manage: 'lead_magnets.manage' },

  async renderHome(ctx = {}) {
    const summary = await postAddonManager.summarizePostAddons(ctx);
    const max = summary.limits.leadMagnetsMaxPerPost;
    const count = summary.leadMagnets.length;
    const body = [
      `Пост: ${summary.postKey}`,
      `Лид-магниты сейчас: ${count}`,
      `Лимит тарифа: ${max}`
    ];

    if (!count) {
      body.push('Лид-магнитов пока нет. Можно добавить первый подарок за действие.');
    } else {
      summary.leadMagnets.forEach((gift, index) => {
        body.push(`${index + 1}. ${gift.title || gift.name || 'Лид-магнит'}`);
        body.push(`   Материал: ${describeMaterial(gift)}`);
        body.push(`   Условия: ${describeConditions(gift)}`);
      });
    }

    const buttons = [];
    if (count < max) buttons.push({ text: '+ Добавить лид-магнит', route: 'lead_magnets.add', data: { postId: summary.postKey } });
    if (count) buttons.push({ text: '🎁 Управлять лид-магнитами', route: 'lead_magnets.manage', data: { postId: summary.postKey } });

    return menuRenderer.renderScreen({
      title: '🎁 Управление лид-магнитами поста',
      body,
      buttons,
      homeRoute: 'main.home'
    });
  },

  async startCreateFlow(ctx = {}) {
    const result = await flowEngine.start(ctx, 'lead_magnets.create', {
      postId: ctx.postId || ctx.payload?.postId || '',
      channelId: ctx.channelId || ctx.payload?.channelId || ''
    });
    if (!result.ok) {
      return menuRenderer.renderScreen({
        title: '⚠️ Не удалось начать сценарий',
        body: [`Ошибка: ${result.error || 'unknown'}`],
        buttons: [{ text: '↩️ Назад к лид-магнитам', route: 'lead_magnets.home' }],
        homeRoute: 'main.home'
      });
    }
    return flowScreen.renderFlowState(result, { icon: '🎁', backRoute: 'lead_magnets.home' });
  },

  async handleAction(ctx) {
    if (ctx.route === 'lead_magnets.add') return this.startCreateFlow(ctx);
    return this.renderHome(ctx);
  }
};
