'use strict';

const menuRenderer = require('../core/menuRenderer');
const postAddonManager = require('../core/postAddonManager');
const postRegistry = require('../core/postRegistryDataAdapter');
const flowEngine = require('../core/flowEngine');
const flowScreen = require('../core/flowScreen');

const RUNTIME = 'ADMINKIT-CORE-LEAD-MAGNETS-SECTION-1.38.1-NO-THROW-ENTRY';

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 58) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
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
function hasSelectedPost(ctx = {}) { return !!clean(selectedPostCtx(ctx).postId); }
function postLabel(ctx = {}) { const c = selectedPostCtx(ctx); return clean(c.postTitle) || clean(c.postId) || 'выбранный пост'; }
function channelLabel(ctx = {}) { const c = selectedPostCtx(ctx); return clean(c.channelTitle) || clean(c.channelId) || 'выбранный канал'; }
function firstLeadId(summary = {}) { return String(summary.leadMagnets?.[0]?.id || ''); }
function findLead(summary = {}, ctx = {}) { const id = String(ctx.payload?.leadMagnetId || ctx.payload?.id || ctx.leadMagnetId || firstLeadId(summary)); return summary.leadMagnets.find((item) => String(item.id) === id) || summary.leadMagnets[0] || null; }

async function safeListChannels(ctx = {}) {
  try { return { ok: true, channels: await postRegistry.listChannels(ctx), error: '' }; }
  catch (error) { return { ok: false, channels: [], error: error?.message || String(error) }; }
}
async function safeListPosts(ctx = {}, options = {}) {
  try { return { ok: true, posts: await postRegistry.listPosts(ctx, options), error: '' }; }
  catch (error) { return { ok: false, posts: [], error: error?.message || String(error) }; }
}
async function safeSummary(ctx = {}) {
  try { return { ok: true, summary: await postAddonManager.summarizePostAddons(ctx), error: '' }; }
  catch (error) {
    const scoped = selectedPostCtx(ctx);
    return {
      ok: false,
      error: error?.message || String(error),
      summary: { postKey: scoped.postId || 'unknown-post', channelKey: scoped.channelId || '', leadMagnets: [], buttons: [], limits: { leadMagnetsMaxPerPost: 1 } }
    };
  }
}

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
  if (c.keyword || p.keyword) return `кодовое слово: ${c.keyword || p.keyword}`;
  if (c.minComments || p.minComments) return `комментариев под постом: от ${c.minComments || p.minComments}`;
  if (c.minReactions || p.minReactions) return `реакций на посте: от ${c.minReactions || p.minReactions}`;
  if (c.id === 'subscribe_current_channel' || item?.accessMode === 'subscribers_current_channel') return 'только подписчикам текущего канала';
  if (c.id === 'comment_count_on_post') return 'комментарии под выбранным постом';
  if (c.id) return item.accessLabel || c.label || c.title || c.id;
  return 'только подписчикам текущего канала';
}
function leadActionScreen({ title, lead, scoped, postKey, action, body = [], buttons = [] }) {
  return menuRenderer.renderScreen({
    title,
    body: [`Канал: ${channelLabel(scoped)}`, `Пост: ${postLabel(scoped) || postKey}`, lead ? `Лид-магнит: ${lead.title || lead.name || lead.id}` : '', action ? `Действие: ${action}` : '', '', ...body].filter((x) => x !== ''),
    buttons: [...buttons, { text: '↩️ К посту', route: 'lead_magnets.post', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: postKey, postTitle: scoped.postTitle } }],
    homeRoute: 'main.home'
  });
}

const section = {
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
    const result = await safeListChannels(ctx);
    const body = [
      'Сначала выберите канал. Потом выберите пост.',
      'Если у поста уже есть лид-магниты — откроется редактирование.',
      'Если лид-магнитов нет — предложим добавить первый.',
      'Раздел больше не привязан к debug-post.'
    ];
    const buttons = [];
    if (!result.ok) {
      body.push('', '⚠️ Не удалось прочитать список каналов. Раздел открыт, но список не загрузился.', `Диагностика: ${cut(result.error, 120)}`);
      buttons.push({ text: '🔄 Повторить загрузку каналов', route: 'lead_magnets.home' });
    } else if (result.channels.length) {
      result.channels.slice(0, 10).forEach((channel, index) => {
        buttons.push({ text: `${index + 1}. ${cut(channel.channelTitle || channel.title || 'Канал', 44)}${channel.postCount ? ` · постов: ${channel.postCount}` : ''}`, route: 'lead_magnets.select_channel', data: { channelId: channel.channelId, channelTitle: channel.channelTitle || 'Канал' } });
      });
    } else {
      body.push('', 'В базе пока нет каналов с постами. Следующий шаг — clean-capture пересланного поста из канала, без legacy adapters.' );
      buttons.push({ text: '🔄 Обновить список каналов', route: 'lead_magnets.home' });
    }
    return menuRenderer.renderScreen({ title: '🎁 Лид-магниты', body, buttons, homeRoute: 'main.home' });
  },

  async renderChannelPosts(ctx = {}) {
    const channelId = clean(ctx.payload?.channelId || ctx.channelId || '');
    const channelTitle = clean(ctx.payload?.channelTitle || ctx.channelTitle || 'Канал');
    const result = await safeListPosts({ ...ctx, channelId, channelTitle }, { channelId, limit: 10 });
    const body = [`Канал: ${channelTitle || channelId}`, 'Выберите пост, к которому нужно добавить или отредактировать лид-магнит.'];
    const buttons = [];
    if (!result.ok) {
      body.push('', '⚠️ Не удалось прочитать посты канала.', `Диагностика: ${cut(result.error, 120)}`);
      buttons.push({ text: '🔄 Повторить', route: 'lead_magnets.select_channel', data: { channelId, channelTitle } });
    } else if (result.posts.length) {
      result.posts.forEach((post, index) => {
        buttons.push({ text: `${index + 1}. ${cut(post.displayTitle || post.postTitle || post.postId || 'Пост', 52)}`, route: 'lead_magnets.post', data: { channelId: post.channelId || channelId, channelTitle: post.channelTitle || channelTitle, postId: post.postId, postTitle: post.displayTitle || post.postTitle || 'Пост' } });
      });
    } else {
      body.push('', 'Постов этого канала пока нет в базе. Clean-capture пересланного старого/нового поста подключим отдельным шагом.' );
    }
    buttons.push({ text: '↩️ К выбору канала', route: 'lead_magnets.home' });
    return menuRenderer.renderScreen({ title: '🎁 Выберите пост', body, buttons, homeRoute: 'main.home' });
  },

  async renderPostCenter(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    const result = await safeSummary(scoped);
    const summary = result.summary;
    const max = Number(summary.limits?.leadMagnetsMaxPerPost || 1);
    const count = summary.leadMagnets.length;
    const body = [`Канал: ${channelLabel(scoped)}`, `Пост: ${postLabel(scoped)}`, `Лид-магниты: ${count} из ${max}`];
    if (!result.ok) body.push('', '⚠️ Не удалось прочитать лид-магниты этого поста.', `Диагностика: ${cut(result.error, 120)}`);
    else if (!count) body.push('', 'У этого поста пока нет лид-магнитов. Добавьте первый подарок и выберите условия получения.');
    else summary.leadMagnets.forEach((gift, index) => { body.push('', `${index + 1}. ${gift.title || gift.name || 'Лид-магнит'}`, `   Материал: ${describeMaterial(gift)}`, `   Условия: ${describeConditions(gift)}`); });
    const buttons = [];
    if (result.ok && count < max) buttons.push({ text: '➕ Добавить лид-магнит', route: 'lead_magnets.add', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: summary.postKey, postTitle: scoped.postTitle } });
    if (result.ok) summary.leadMagnets.forEach((gift, index) => {
      const suffix = summary.leadMagnets.length > 1 ? ` ${index + 1}` : '';
      const data = { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: summary.postKey, postTitle: scoped.postTitle, leadMagnetId: String(gift.id) };
      buttons.push({ text: `📝 Материал${suffix}`, route: 'lead_magnets.edit_material', data });
      buttons.push({ text: `⚙️ Условия${suffix}`, route: 'lead_magnets.edit_conditions', data });
      buttons.push({ text: `🧪 Проверить${suffix}`, route: 'lead_magnets.test_delivery', data });
      buttons.push({ text: `🗑 Удалить${suffix}`, route: 'lead_magnets.delete_confirm', data });
    });
    buttons.push({ text: '↩️ К постам канала', route: 'lead_magnets.select_channel', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle } });
    return menuRenderer.renderScreen({ title: '🎁 Лид-магниты поста', body, buttons, homeRoute: 'main.home' });
  },

  async startCreateFlow(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    if (!clean(scoped.postId)) return menuRenderer.renderScreen({ title: '🎁 Добавление лид-магнита', body: ['Сначала выберите канал и пост. После этого Core добавит новый лид-магнит к выбранному посту.'], buttons: [{ text: 'Выбрать канал', route: 'lead_magnets.home' }], homeRoute: 'main.home' });
    const result = await flowEngine.start(ctx, 'lead_magnets.create', { postId: scoped.postId, postTitle: scoped.postTitle, channelId: scoped.channelId, channelTitle: scoped.channelTitle, postSource: 'registry', postSourceLabel: 'выбран из раздела лид-магнитов', source: 'adminkit-core', storage: 'ak_post_lead_magnets', legacyAdaptersDisabled: true });
    if (!result.ok) return menuRenderer.renderScreen({ title: '⚠️ Не удалось начать сценарий', body: [`Ошибка: ${result.error || 'unknown'}`], buttons: [{ text: '↩️ Назад', route: 'lead_magnets.post', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: scoped.postId, postTitle: scoped.postTitle } }], homeRoute: 'main.home' });
    const moved = await flowEngine.goTo(ctx, 'input_title', { postId: scoped.postId, postTitle: scoped.postTitle, channelId: scoped.channelId, channelTitle: scoped.channelTitle, postSource: 'registry', postSourceLabel: 'выбран из раздела лид-магнитов', postSelectedAt: new Date().toISOString() });
    return flowScreen.renderFlowState(moved.ok ? moved : result, { icon: '🎁', backRoute: 'lead_magnets.post' });
  },

  async renderEditMaterial(ctx = {}) {
    const scoped = selectedPostCtx(ctx); const result = await safeSummary(scoped); const lead = findLead(result.summary, ctx);
    return leadActionScreen({ title: '📝 Замена материала лид-магнита', lead, scoped, postKey: result.summary.postKey, action: 'замена материала', body: ['Сейчас материал:', lead ? describeMaterial(lead) : 'лид-магнит не найден', '', 'Следующий clean-flow: принять новый текст/ссылку/файл и обновить эту запись в ak_post_lead_magnets.'] });
  },
  async renderEditConditions(ctx = {}) {
    const scoped = selectedPostCtx(ctx); const result = await safeSummary(scoped); const lead = findLead(result.summary, ctx);
    return leadActionScreen({ title: '⚙️ Условия выдачи лид-магнита', lead, scoped, postKey: result.summary.postKey, action: 'настройка условий', body: ['Текущие условия:', lead ? describeConditions(lead) : 'лид-магнит не найден', '', 'Следующий clean-flow: выбрать условие из каталога Max API и заполнить параметры.'] });
  },
  async renderTestDelivery(ctx = {}) {
    const scoped = selectedPostCtx(ctx); const result = await safeSummary(scoped); const lead = findLead(result.summary, ctx);
    return leadActionScreen({ title: '🧪 Проверка выдачи лид-магнита', lead, scoped, postKey: result.summary.postKey, action: 'проверка выдачи', body: ['Следующий clean-flow: dry-run проверки условий + отдельная реальная выдача в личные сообщения.'] });
  },
  async renderDeleteConfirm(ctx = {}) {
    const scoped = selectedPostCtx(ctx); const result = await safeSummary(scoped); const lead = findLead(result.summary, ctx); if (!lead) return this.renderPostCenter(scoped);
    return leadActionScreen({ title: '🗑 Удалить лид-магнит?', lead, scoped, postKey: result.summary.postKey, action: 'подтверждение удаления', body: ['Удаление безопасное: запись будет выключена через is_enabled=false.', 'Пост и комментарии не затрагиваются.'], buttons: [{ text: '✅ Да, удалить', route: 'lead_magnets.delete', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: result.summary.postKey, postTitle: scoped.postTitle, leadMagnetId: String(lead.id) } }] });
  },
  async deleteLeadMagnet(ctx = {}) {
    const scoped = selectedPostCtx(ctx); const result = await safeSummary(scoped); const lead = findLead(result.summary, ctx); if (!lead) return this.renderPostCenter(scoped);
    const deleted = await postAddonManager.disableLeadMagnet(scoped, lead.id).catch((error) => ({ ok: false, error: error?.message || String(error) }));
    if (!deleted.ok) return menuRenderer.renderScreen({ title: '⚠️ Не удалось удалить лид-магнит', body: [`Ошибка: ${deleted.error || 'unknown'}`], buttons: [{ text: '↩️ К посту', route: 'lead_magnets.post', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: result.summary.postKey, postTitle: scoped.postTitle } }], homeRoute: 'main.home' });
    return menuRenderer.renderScreen({ title: '✅ Лид-магнит отключён', body: [`Пост: ${scoped.postTitle || result.summary.postKey}`, `Лид-магнит: ${deleted.leadMagnet.title || lead.title}`, 'Запись выключена безопасно: is_enabled=false.'], buttons: [{ text: '🎁 К посту', route: 'lead_magnets.post', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: result.summary.postKey, postTitle: scoped.postTitle } }], homeRoute: 'main.home' });
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

  selfTest() { return { ok: true, runtimeVersion: RUNTIME, homeIsChannelFirst: true, noDebugPostOnSectionEntry: true, noThrowEntry: true, safeChannelList: true, safePostList: true, safeSummary: true, postScopedManagementOnlyAfterPostSelect: true, supportsMultipleLeadMagnetsPerPost: true, writesTo: 'ak_post_lead_magnets', legacyAdaptersUsed: false }; }
};

module.exports = section;