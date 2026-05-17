'use strict';

const menuRenderer = require('../core/menuRenderer');
const postAddonManager = require('../core/postAddonManager');
const flowEngine = require('../core/flowEngine');
const flowScreen = require('../core/flowScreen');

const RUNTIME = 'ADMINKIT-CORE-LEAD-MAGNETS-SECTION-1.37-ACTION-CENTER';

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
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
  if (c.keyword) return `кодовое слово: ${c.keyword}`;
  if (c.minComments) return `комментариев под постом: от ${c.minComments}`;
  if (c.minReactions) return `реакций на посте: от ${c.minReactions}`;
  if (c.id) return item.accessLabel || c.label || c.id;
  return 'только подписчикам текущего канала';
}

function firstLeadId(summary = {}) {
  return String(summary.leadMagnets?.[0]?.id || '');
}

function findLead(summary = {}, ctx = {}) {
  const id = String(ctx.payload?.leadMagnetId || ctx.payload?.id || ctx.leadMagnetId || firstLeadId(summary));
  return summary.leadMagnets.find((item) => String(item.id) === id) || summary.leadMagnets[0] || null;
}

function leadActionScreen({ title, lead, postKey, action, body = [], buttons = [] }) {
  return menuRenderer.renderScreen({
    title,
    body: [
      `Пост: ${postKey}`,
      lead ? `Лид-магнит: ${lead.title || lead.name || lead.id}` : '',
      action ? `Действие: ${action}` : '',
      '',
      ...body
    ],
    buttons: [
      ...buttons,
      { text: '↩️ К лид-магнитам', route: 'lead_magnets.home', data: { postId: postKey } }
    ],
    homeRoute: 'main.home'
  });
}

module.exports = {
  id: 'lead_magnets',
  title: 'Подарки / Лид-магниты',
  shortTitle: 'Лид-магниты',
  icon: '🎁',
  order: 40,
  feature: 'lead_magnets.enabled',
  routes: {
    home: 'lead_magnets.home',
    add: 'lead_magnets.add',
    editMaterial: 'lead_magnets.edit_material',
    editConditions: 'lead_magnets.edit_conditions',
    testDelivery: 'lead_magnets.test_delivery',
    deleteConfirm: 'lead_magnets.delete_confirm',
    delete: 'lead_magnets.delete'
  },

  async renderHome(ctx = {}) {
    const summary = await postAddonManager.summarizePostAddons(ctx);
    const max = summary.limits.leadMagnetsMaxPerPost;
    const count = summary.leadMagnets.length;
    const body = [
      `Пост: ${summary.postKey}`,
      `Лид-магниты сейчас: ${count}`,
      `Лимит тарифа: ${max}`,
      'Раздел открыт. Это уже экран управления — без промежуточной кнопки «Управлять».'
    ];

    if (!count) {
      body.push('', 'Лид-магнитов пока нет. Добавьте первый подарок и выберите условия получения.');
    } else {
      summary.leadMagnets.forEach((gift, index) => {
        body.push('', `${index + 1}. ${gift.title || gift.name || 'Лид-магнит'}`);
        body.push(`   Материал: ${describeMaterial(gift)}`);
        body.push(`   Условия: ${describeConditions(gift)}`);
      });
    }

    const buttons = [];
    if (count < max) buttons.push({ text: '➕ Добавить лид-магнит', route: 'lead_magnets.add', data: { postId: summary.postKey } });
    if (count) {
      const id = firstLeadId(summary);
      buttons.push({ text: '📝 Заменить материал', route: 'lead_magnets.edit_material', data: { postId: summary.postKey, leadMagnetId: id } });
      buttons.push({ text: '⚙️ Настроить условия', route: 'lead_magnets.edit_conditions', data: { postId: summary.postKey, leadMagnetId: id } });
      buttons.push({ text: '🧪 Проверить выдачу', route: 'lead_magnets.test_delivery', data: { postId: summary.postKey, leadMagnetId: id } });
      buttons.push({ text: '🗑 Удалить лид-магнит', route: 'lead_magnets.delete_confirm', data: { postId: summary.postKey, leadMagnetId: id } });
    }

    return menuRenderer.renderScreen({
      title: '🎁 Лид-магниты поста',
      body,
      buttons,
      homeRoute: 'main.home'
    });
  },

  async startCreateFlow(ctx = {}) {
    const result = await flowEngine.start(ctx, 'lead_magnets.create', {
      postId: ctx.postId || ctx.payload?.postId || '',
      channelId: ctx.channelId || ctx.payload?.channelId || '',
      source: 'adminkit-core',
      storage: 'ak_post_lead_magnets',
      legacyAdaptersDisabled: true
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

  async renderEditMaterial(ctx = {}) {
    const summary = await postAddonManager.summarizePostAddons(ctx);
    const lead = findLead(summary, ctx);
    return leadActionScreen({
      title: '📝 Замена материала лид-магнита',
      lead,
      postKey: summary.postKey,
      action: 'замена материала',
      body: [
        'Сейчас материал:',
        lead ? describeMaterial(lead) : 'лид-магнит не найден',
        '',
        'Следующий clean-flow: принять новый текст/ссылку/файл, сохранить в ak_post_lead_magnets и не трогать legacy adapters.',
        'Пока этот экран не должен молча ничего делать — он показывает, что операция выделена отдельным flow.'
      ]
    });
  },

  async renderEditConditions(ctx = {}) {
    const summary = await postAddonManager.summarizePostAddons(ctx);
    const lead = findLead(summary, ctx);
    return leadActionScreen({
      title: '⚙️ Условия выдачи лид-магнита',
      lead,
      postKey: summary.postKey,
      action: 'настройка условий',
      body: [
        'Текущие условия:',
        lead ? describeConditions(lead) : 'лид-магнит не найден',
        '',
        'Следующий clean-flow: выбрать условие из каталога Max API и заполнить параметры: канал, пост, число комментариев/реакций, ключевую фразу или квиз.',
        'Для новых лид-магнитов этот каталог уже используется в create-flow.'
      ]
    });
  },

  async renderTestDelivery(ctx = {}) {
    const summary = await postAddonManager.summarizePostAddons(ctx);
    const lead = findLead(summary, ctx);
    return leadActionScreen({
      title: '🧪 Проверка выдачи лид-магнита',
      lead,
      postKey: summary.postKey,
      action: 'проверка выдачи',
      body: [
        'Проверка выдачи должна симулировать пользователя: подписка, комментарий, реакция, кодовая фраза, квиз.',
        'Сейчас delivery-flow ещё не включён в production, поэтому этот экран не делает фальшивую отправку подарка.',
        'Следующий clean-flow: dry-run проверки условий + отдельная реальная выдача в личные сообщения.'
      ]
    });
  },

  async renderDeleteConfirm(ctx = {}) {
    const summary = await postAddonManager.summarizePostAddons(ctx);
    const lead = findLead(summary, ctx);
    if (!lead) return this.renderHome(ctx);
    return leadActionScreen({
      title: '🗑 Удалить лид-магнит?',
      lead,
      postKey: summary.postKey,
      action: 'подтверждение удаления',
      body: [
        'Удаление безопасное: запись будет выключена через is_enabled=false, без физического удаления из базы.',
        'Пост и комментарии не затрагиваются.'
      ],
      buttons: [{ text: '✅ Да, удалить', route: 'lead_magnets.delete', data: { postId: summary.postKey, leadMagnetId: String(lead.id) } }]
    });
  },

  async deleteLeadMagnet(ctx = {}) {
    const summary = await postAddonManager.summarizePostAddons(ctx);
    const lead = findLead(summary, ctx);
    if (!lead) return this.renderHome(ctx);
    const result = await postAddonManager.disableLeadMagnet(ctx, lead.id);
    if (!result.ok) {
      return menuRenderer.renderScreen({
        title: '⚠️ Не удалось удалить лид-магнит',
        body: [`Ошибка: ${result.error || 'unknown'}`],
        buttons: [{ text: '↩️ К лид-магнитам', route: 'lead_magnets.home', data: { postId: summary.postKey } }],
        homeRoute: 'main.home'
      });
    }
    return menuRenderer.renderScreen({
      title: '✅ Лид-магнит отключён',
      body: [`Пост: ${summary.postKey}`, `Лид-магнит: ${result.leadMagnet.title || lead.title}`, 'Запись выключена безопасно: is_enabled=false.'],
      buttons: [{ text: '🎁 К лид-магнитам', route: 'lead_magnets.home', data: { postId: summary.postKey } }],
      homeRoute: 'main.home'
    });
  },

  async handleAction(ctx) {
    if (ctx.route === 'lead_magnets.add') return this.startCreateFlow(ctx);
    if (ctx.route === 'lead_magnets.edit_material') return this.renderEditMaterial(ctx);
    if (ctx.route === 'lead_magnets.edit_conditions') return this.renderEditConditions(ctx);
    if (ctx.route === 'lead_magnets.test_delivery') return this.renderTestDelivery(ctx);
    if (ctx.route === 'lead_magnets.delete_confirm') return this.renderDeleteConfirm(ctx);
    if (ctx.route === 'lead_magnets.delete') return this.deleteLeadMagnet(ctx);
    return this.renderHome(ctx);
  },

  selfTest() {
    return {
      ok: true,
      runtimeVersion: RUNTIME,
      actionCenterReady: true,
      zeroManageStepRemoved: true,
      deadManageRouteRemoved: true,
      addFlowReady: true,
      editMaterialRouteReady: true,
      editConditionsRouteReady: true,
      testDeliveryRouteReady: true,
      safeDisableRouteReady: true,
      cleanCreateFlow: true,
      writesTo: 'ak_post_lead_magnets',
      legacyAdaptersUsed: false,
      dangerousActionsDisabled: true,
      nextStep: 'реализовать clean update-flow для материала и условий существующего лид-магнита'
    };
  }
};