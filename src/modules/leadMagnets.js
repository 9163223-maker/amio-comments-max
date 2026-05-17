'use strict';

const menuRenderer = require('../core/menuRenderer');
const postAddonManager = require('../core/postAddonManager');
const postRegistry = require('../core/postRegistryDataAdapter');
const flowEngine = require('../core/flowEngine');
const flowScreen = require('../core/flowScreen');

const RUNTIME = 'ADMINKIT-CORE-LEAD-MAGNETS-SECTION-1.38-CHANNEL-FIRST';

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 58) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
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
  const p = c.params || {};
  if (c.mode === 'all' || item?.accessMode === 'all') return 'доступ всем';
  if (c.channels?.length) return `подписка на каналы: ${c.channels.join(', ')}`;
  if (c.commentKeyword) return `кодовое слово в комментарии: ${c.commentKeyword}`;
  if (c.commentsMin) return `комментариев под постом: от ${c.commentsMin}`;
  if (c.keyword || p.keyword) return `кодовое слово: ${c.keyword || p.keyword}`;
  if (c.minComments || p.minComments) return `комментариев под постом: от ${c.minComments || p.minComments}`;
  if (c.minReactions || p.minReactions) return `реакций на посте: от ${c.minReactions || p.minReactions}`;
  if (c.id === 'subscribe_current_channel' || item?.accessMode === 'subscribe_current_channel' || item?.accessMode === 'subscribers_current_channel') return 'только подписчикам текущего канала';
  if (c.id === 'comment_count_on_post') return 'комментарии под выбранным постом';
  if (c.id) return item.accessLabel || c.label || c.title || c.id;
  return 'только подписчикам текущего канала';
}

function firstLeadId(summary = {}) { return String(summary.leadMagnets?.[0]?.id || ''); }
function selectedPostCtx(ctx = {}) {
  const payload = ctx.payload || {};
  return {
    ...ctx,
    channelId: payload.channelId || ctx.channelId || ctx.selected_channel_id || ctx.session?.selected_channel_id || '',
    channelTitle: payload.channelTitle || ctx.channelTitle || ctx.session?.draft?.channelTitle || '',
    postId: payload.postId || ctx.postId || ctx.selected_post_id || ctx.session?.selected_post_id || '',
    postTitle: payload.postTitle || ctx.postTitle || ctx.session?.draft?.postTitle || ''
  };
}
function hasSelectedPost(ctx = {}) { const c = selectedPostCtx(ctx); return !!clean(c.postId); }
function findLead(summary = {}, ctx = {}) { const id = String(ctx.payload?.leadMagnetId || ctx.payload?.id || ctx.leadMagnetId || firstLeadId(summary)); return summary.leadMagnets.find((item) => String(item.id) === id) || summary.leadMagnets[0] || null; }
function postLabel(ctx = {}) { const c = selectedPostCtx(ctx); return clean(c.postTitle) || clean(c.postId) || 'выбранный пост'; }
function channelLabel(ctx = {}) { const c = selectedPostCtx(ctx); return clean(c.channelTitle) || clean(c.channelId) || 'выбранный канал'; }

function leadActionScreen({ title, lead, postKey, channelId = '', channelTitle = '', postTitle = '', action, body = [], buttons = [] }) {
  return menuRenderer.renderScreen({
    title,
    body: [
      channelTitle || channelId ? `Канал: ${channelTitle || channelId}` : '',
      `Пост: ${postTitle || postKey}`,
      lead ? `Лид-магнит: ${lead.title || lead.name || lead.id}` : '',
      action ? `Действие: ${action}` : '',
      '',
      ...body
    ].filter((line) => line !== ''),
    buttons: [
      ...buttons,
      { text: '↩️ К посту', route: 'lead_magnets.post', data: { postId: postKey, postTitle, channelId, channelTitle } }
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
    selectChannel: 'lead_magnets.select_channel',
    selectPost: 'lead_magnets.post',
    add: 'lead_magnets.add',
    editMaterial: 'lead_magnets.edit_material',
    editConditions: 'lead_magnets.edit_conditions',
    testDelivery: 'lead_magnets.test_delivery',
    deleteConfirm: 'lead_magnets.delete_confirm',
    delete: 'lead_magnets.delete'
  },

  async renderHome(ctx = {}) {
    const channels = await postRegistry.listChannels(ctx);
    const body = [
      'Сначала выберите канал. Потом выберите пост.',
      'Если у поста уже есть лид-магниты — откроется редактирование.',
      'Если лид-магнитов нет — предложим добавить первый.',
      'Так раздел не привязан к debug-post и не открывает случайный пост.'
    ];
    const buttons = [];
    if (channels.length) {
      channels.slice(0, 10).forEach((channel, index) => {
        buttons.push({ text: `${index + 1}. ${cut(channel.channelTitle || channel.title || 'Канал', 48)}${channel.postCount ? ` · постов: ${channel.postCount}` : ''}`, route: 'lead_magnets.select_channel', data: { channelId: channel.channelId, channelTitle: channel.channelTitle || 'Канал' } });
      });
    } else {
      body.push('', 'В базе пока нет каналов с постами. Следующий clean-flow — переслать пост из канала, чтобы Core добавил его в registry.');
      buttons.push({ text: '📨 Добавить пост через пересылку', route: 'flow.capture_post', data: { flowId: 'lead_magnets.create', captureMode: 'forwarded_post' } });
    }
    return menuRenderer.renderScreen({ title: '🎁 Лид-магниты', body, buttons, homeRoute: 'main.home' });
  },

  async renderChannelPosts(ctx = {}) {
    const channelId = clean(ctx.payload?.channelId || ctx.channelId || '');
    const channelTitle = clean(ctx.payload?.channelTitle || ctx.channelTitle || 'Канал');
    const posts = await postRegistry.listPosts({ ...ctx, channelId, channelTitle }, { channelId, limit: 10 });
    const body = [`Канал: ${channelTitle || channelId}`, 'Выберите пост, к которому нужно добавить или отредактировать лид-магнит.'];
    const buttons = [];
    if (posts.length) {
      posts.forEach((post, index) => {
        buttons.push({ text: `${index + 1}. ${cut(post.displayTitle || post.postTitle || post.postId || 'Пост', 52)}`, route: 'lead_magnets.post', data: { channelId: post.channelId || channelId, channelTitle: post.channelTitle || channelTitle, postId: post.postId, postTitle: post.displayTitle || post.postTitle || 'Пост' } });
      });
    } else {
      body.push('', 'Постов этого канала пока нет в базе. Можно переслать новый или старый пост из канала.');
    }
    buttons.push({ text: '📨 Переслать новый/старый пост', route: 'flow.capture_post', data: { flowId: 'lead_magnets.create', channelId, channelTitle, captureMode: 'forwarded_post' } });
    buttons.push({ text: '↩️ К выбору канала', route: 'lead_magnets.home' });
    return menuRenderer.renderScreen({ title: '🎁 Выберите пост', body, buttons, homeRoute: 'main.home' });
  },

  async renderPostCenter(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    const summary = await postAddonManager.summarizePostAddons(scoped);
    const max = summary.limits.leadMagnetsMaxPerPost;
    const count = summary.leadMagnets.length;
    const body = [
      `Канал: ${channelLabel(scoped)}`,
      `Пост: ${postLabel(scoped)}`,
      `Лид-магниты: ${count} из ${max}`
    ];
    if (!count) {
      body.push('', 'У этого поста пока нет лид-магнитов. Добавьте первый подарок и выберите условия получения.');
    } else {
      summary.leadMagnets.forEach((gift, index) => {
        body.push('', `${index + 1}. ${gift.title || gift.name || 'Лид-магнит'}`);
        body.push(`   Материал: ${describeMaterial(gift)}`);
        body.push(`   Условия: ${describeConditions(gift)}`);
      });
    }
    const buttons = [];
    if (count < max) buttons.push({ text: '➕ Добавить лид-магнит', route: 'lead_magnets.add', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: summary.postKey, postTitle: scoped.postTitle } });
    summary.leadMagnets.forEach((gift, index) => {
      const suffix = summary.leadMagnets.length > 1 ? ` ${index + 1}` : '';
      buttons.push({ text: `📝 Материал${suffix}`, route: 'lead_magnets.edit_material', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: summary.postKey, postTitle: scoped.postTitle, leadMagnetId: String(gift.id) } });
      buttons.push({ text: `⚙️ Условия${suffix}`, route: 'lead_magnets.edit_conditions', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: summary.postKey, postTitle: scoped.postTitle, leadMagnetId: String(gift.id) } });
      buttons.push({ text: `🧪 Проверить${suffix}`, route: 'lead_magnets.test_delivery', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: summary.postKey, postTitle: scoped.postTitle, leadMagnetId: String(gift.id) } });
      buttons.push({ text: `🗑 Удалить${suffix}`, route: 'lead_magnets.delete_confirm', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: summary.postKey, postTitle: scoped.postTitle, leadMagnetId: String(gift.id) } });
    });
    buttons.push({ text: '↩️ К постам канала', route: 'lead_magnets.select_channel', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle } });
    return menuRenderer.renderScreen({ title: '🎁 Лид-магниты поста', body, buttons, homeRoute: 'main.home' });
  },

  async startCreateFlow(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    if (!clean(scoped.postId)) {
      return menuRenderer.renderScreen({ title: '🎁 Добавление лид-магнита', body: ['Сначала выберите канал и пост. После этого Core поймёт: добавлять новый лид-магнит или работать с существующими.'], buttons: [{ text: 'Выбрать канал', route: 'lead_magnets.home' }], homeRoute: 'main.home' });
    }
    const result = await flowEngine.start(ctx, 'lead_magnets.create', {
      postId: scoped.postId,
      postTitle: scoped.postTitle,
      channelId: scoped.channelId,
      channelTitle: scoped.channelTitle,
      postSource: 'registry',
      postSourceLabel: 'выбран из раздела лид-магнитов',
      source: 'adminkit-core',
      storage: 'ak_post_lead_magnets',
      legacyAdaptersDisabled: true
    });
    if (!result.ok) {
      return menuRenderer.renderScreen({ title: '⚠️ Не удалось начать сценарий', body: [`Ошибка: ${result.error || 'unknown'}`], buttons: [{ text: '↩️ Назад к лид-магнитам', route: 'lead_magnets.home' }], homeRoute: 'main.home' });
    }
    const moved = await flowEngine.goTo(ctx, 'input_title', {
      postId: scoped.postId,
      postTitle: scoped.postTitle,
      channelId: scoped.channelId,
      channelTitle: scoped.channelTitle,
      postSource: 'registry',
      postSourceLabel: 'выбран из раздела лид-магнитов',
      postSelectedAt: new Date().toISOString()
    });
    return flowScreen.renderFlowState(moved.ok ? moved : result, { icon: '🎁', backRoute: 'lead_magnets.post' });
  },

  async renderEditMaterial(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    const summary = await postAddonManager.summarizePostAddons(scoped);
    const lead = findLead(summary, ctx);
    return leadActionScreen({ title: '📝 Замена материала лид-магнита', lead, postKey: summary.postKey, channelId: scoped.channelId, channelTitle: scoped.channelTitle, postTitle: scoped.postTitle, action: 'замена материала', body: ['Сейчас материал:', lead ? describeMaterial(lead) : 'лид-магнит не найден', '', 'Следующий clean-flow: принять новый текст/ссылку/файл и обновить эту запись в ak_post_lead_magnets.'] });
  },

  async renderEditConditions(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    const summary = await postAddonManager.summarizePostAddons(scoped);
    const lead = findLead(summary, ctx);
    return leadActionScreen({ title: '⚙️ Условия выдачи лид-магнита', lead, postKey: summary.postKey, channelId: scoped.channelId, channelTitle: scoped.channelTitle, postTitle: scoped.postTitle, action: 'настройка условий', body: ['Текущие условия:', lead ? describeConditions(lead) : 'лид-магнит не найден', '', 'Следующий clean-flow: выбрать условие из каталога Max API и заполнить параметры: канал, пост, число комментариев/реакций, ключевую фразу или квиз.'] });
  },

  async renderTestDelivery(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    const summary = await postAddonManager.summarizePostAddons(scoped);
    const lead = findLead(summary, ctx);
    return leadActionScreen({ title: '🧪 Проверка выдачи лид-магнита', lead, postKey: summary.postKey, channelId: scoped.channelId, channelTitle: scoped.channelTitle, postTitle: scoped.postTitle, action: 'проверка выдачи', body: ['Проверка выдачи должна симулировать пользователя: подписка, комментарий, реакция, кодовая фраза, квиз.', 'Следующий clean-flow: dry-run проверки условий + отдельная реальная выдача в личные сообщения.'] });
  },

  async renderDeleteConfirm(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    const summary = await postAddonManager.summarizePostAddons(scoped);
    const lead = findLead(summary, ctx);
    if (!lead) return this.renderPostCenter(scoped);
    return leadActionScreen({ title: '🗑 Удалить лид-магнит?', lead, postKey: summary.postKey, channelId: scoped.channelId, channelTitle: scoped.channelTitle, postTitle: scoped.postTitle, action: 'подтверждение удаления', body: ['Удаление безопасное: запись будет выключена через is_enabled=false, без физического удаления из базы.', 'Пост и комментарии не затрагиваются.'], buttons: [{ text: '✅ Да, удалить', route: 'lead_magnets.delete', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: summary.postKey, postTitle: scoped.postTitle, leadMagnetId: String(lead.id) } }] });
  },

  async deleteLeadMagnet(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    const summary = await postAddonManager.summarizePostAddons(scoped);
    const lead = findLead(summary, ctx);
    if (!lead) return this.renderPostCenter(scoped);
    const result = await postAddonManager.disableLeadMagnet(scoped, lead.id);
    if (!result.ok) return menuRenderer.renderScreen({ title: '⚠️ Не удалось удалить лид-магнит', body: [`Ошибка: ${result.error || 'unknown'}`], buttons: [{ text: '↩️ К посту', route: 'lead_magnets.post', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: summary.postKey, postTitle: scoped.postTitle } }], homeRoute: 'main.home' });
    return menuRenderer.renderScreen({ title: '✅ Лид-магнит отключён', body: [`Пост: ${scoped.postTitle || summary.postKey}`, `Лид-магнит: ${result.leadMagnet.title || lead.title}`, 'Запись выключена безопасно: is_enabled=false.'], buttons: [{ text: '🎁 К посту', route: 'lead_magnets.post', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: summary.postKey, postTitle: scoped.postTitle } }], homeRoute: 'main.home' });
  },

  async handleAction(ctx) {
    if (ctx.route === 'lead_magnets.select_channel') return this.renderChannelPosts(ctx);
    if (ctx.route === 'lead_magnets.post') return this.renderPostCenter(ctx);
    if (ctx.route === 'lead_magnets.add') return this.startCreateFlow(ctx);
    if (ctx.route === 'lead_magnets.edit_material') return hasSelectedPost(ctx) ? this.renderEditMaterial(ctx) : this.renderHome(ctx);
    if (ctx.route === 'lead_magnets.edit_conditions') return hasSelectedPost(ctx) ? this.renderEditConditions(ctx) : this.renderHome(ctx);
    if (ctx.route === 'lead_magnets.test_delivery') return hasSelectedPost(ctx) ? this.renderTestDelivery(ctx) : this.renderHome(ctx);
    if (ctx.route === 'lead_magnets.delete_confirm') return hasSelectedPost(ctx) ? this.renderDeleteConfirm(ctx) : this.renderHome(ctx);
    if (ctx.route === 'lead_magnets.delete') return hasSelectedPost(ctx) ? this.deleteLeadMagnet(ctx) : this.renderHome(ctx);
    return this.renderHome(ctx);
  },

  selfTest() {
    return {
      ok: true,
      runtimeVersion: RUNTIME,
      homeIsChannelFirst: true,
      noDebugPostOnSectionEntry: true,
      postScopedManagementOnlyAfterPostSelect: true,
      supportsMultipleLeadMagnetsPerPost: true,
      addFlowStartsAfterPostSelected: true,
      safeDisableRouteReady: true,
      cleanCreateFlow: true,
      writesTo: 'ak_post_lead_magnets',
      legacyAdaptersUsed: false,
      dangerousActionsDisabled: true,
      nextStep: 'реализовать clean update-flow для материала и условий существующего лид-магнита'
    };
  }
};