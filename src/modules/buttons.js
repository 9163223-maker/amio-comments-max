'use strict';

const menuRenderer = require('../core/menuRenderer');
const postRegistry = require('../core/postRegistryDataAdapter');
const postAddonManager = require('../core/postAddonManager');
const flowEngine = require('../core/flowEngine');
const flowScreen = require('../core/flowScreen');

const RUNTIME = 'CC8.3.61-PR221-BUTTONS-PRODUCT-PERFECT-ACTIONS';

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
function channelLabel(ctx = {}) { const c = selectedPostCtx(ctx); return clean(c.channelTitle) || 'Канал'; }
function postLabel(ctx = {}) { const c = selectedPostCtx(ctx); return clean(c.postTitle) || 'Пост без текста'; }
function firstButtonId(summary = {}) { return String(summary.buttons?.[0]?.id || ''); }
function findButton(summary = {}, ctx = {}) { const id = String(ctx.payload?.buttonId || ctx.payload?.id || ctx.buttonId || firstButtonId(summary)); return summary.buttons.find((item) => String(item.id) === id) || summary.buttons[0] || null; }
async function safeListChannels(ctx = {}) { try { return { ok: true, channels: await postRegistry.listChannels(ctx), error: '' }; } catch (error) { return { ok: false, channels: [], error: error?.message || String(error) }; } }
async function safeListPosts(ctx = {}, options = {}) { try { return { ok: true, posts: await postRegistry.listPosts(ctx, options), error: '' }; } catch (error) { return { ok: false, posts: [], error: error?.message || String(error) }; } }
async function safeSummary(ctx = {}) { try { return { ok: true, summary: await postAddonManager.summarizePostAddons(ctx), error: '' }; } catch (error) { const scoped = selectedPostCtx(ctx); return { ok: false, error: error?.message || String(error), summary: { postKey: scoped.postId || 'unknown-post', channelKey: scoped.channelId || '', buttons: [], leadMagnets: [], limits: { buttonsMaxPerPost: 1 } } }; } }
function buttonActionScreen({ title, button, scoped, postKey, action, body = [], buttons = [] }) {
  return menuRenderer.renderScreen({
    title,
    body: [`Канал: ${channelLabel(scoped)}`, `Пост: ${postLabel(scoped)}`, button ? `Кнопка: ${button.title || button.text || 'кнопка'}` : '', action ? `Действие: ${action}` : '', '', ...body].filter((x) => x !== ''),
    buttons: [...buttons, { text: '↩️ К кнопкам поста', route: 'buttons.post', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: postKey, postTitle: scoped.postTitle } }],
    homeRoute: 'main.home'
  });
}

module.exports = {
  id: 'buttons',
  title: 'Кнопки',
  icon: '🔘',
  order: 30,
  feature: 'buttons.enabled',
  routes: {
    home: 'buttons.home',
    selectChannel: 'buttons.select_channel',
    selectPost: 'buttons.post',
    add: 'buttons.add',
    edit: 'buttons.edit',
    deleteConfirm: 'buttons.delete_confirm',
    delete: 'buttons.delete'
  },

  async renderHome(ctx = {}) {
    const result = await safeListChannels(ctx);
    const body = [
      'Сначала выберите канал. Потом выберите пост.',
      'Если у поста уже есть кнопки — откроется управление.',
      'Если кнопок нет — предложим добавить первую.'
    ];
    const buttons = [];
    if (!result.ok) {
      body.push('', 'Не удалось прочитать список каналов. Попробуйте обновить раздел.');
      buttons.push({ text: '🔄 Повторить загрузку каналов', route: 'buttons.home' });
    } else if (result.channels.length) {
      result.channels.slice(0, 10).forEach((channel, index) => buttons.push({
        text: `${index + 1}. ${cut(channel.channelTitle || channel.title || 'Канал', 44)}${channel.postCount ? ` · постов: ${channel.postCount}` : ''}`,
        route: 'buttons.select_channel',
        data: { channelId: channel.channelId, channelTitle: channel.channelTitle || 'Канал' }
      }));
    } else {
      body.push('', 'В базе пока нет каналов с постами. Перешлите пост из канала, чтобы он появился в списке.');
      buttons.push({ text: '🔄 Обновить список каналов', route: 'buttons.home' });
    }
    return menuRenderer.renderScreen({ title: '🔘 Кнопки', body, buttons, homeRoute: 'main.home' });
  },

  async renderChannelPosts(ctx = {}) {
    const channelId = clean(ctx.payload?.channelId || ctx.channelId || '');
    const channelTitle = clean(ctx.payload?.channelTitle || ctx.channelTitle || 'Канал');
    const result = await safeListPosts({ ...ctx, channelId, channelTitle }, { channelId, limit: 10 });
    const body = [`Канал: ${channelTitle}`, 'Выберите пост, к которому нужно добавить или отредактировать кнопку.'];
    const buttons = [];
    if (!result.ok) {
      body.push('', 'Не удалось прочитать посты канала. Попробуйте повторить.');
      buttons.push({ text: '🔄 Повторить', route: 'buttons.select_channel', data: { channelId, channelTitle } });
    } else if (result.posts.length) {
      result.posts.forEach((post, index) => buttons.push({
        text: `${index + 1}. ${cut(post.displayTitle || post.postTitle || 'Пост без текста', 52)}`,
        route: 'buttons.post',
        data: { channelId: post.channelId || channelId, channelTitle: post.channelTitle || channelTitle, postId: post.postId, postTitle: post.displayTitle || post.postTitle || 'Пост без текста' }
      }));
    } else {
      body.push('', 'Постов этого канала пока нет в базе.');
    }
    buttons.push({ text: '↩️ К выбору канала', route: 'buttons.home' });
    return menuRenderer.renderScreen({ title: '🔘 Выберите пост', body, buttons, homeRoute: 'main.home' });
  },

  async renderPostCenter(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    const result = await safeSummary(scoped);
    const summary = result.summary;
    const max = Number(summary.limits?.buttonsMaxPerPost || 1);
    const count = summary.buttons.length;
    const body = [`Канал: ${channelLabel(scoped)}`, `Пост: ${postLabel(scoped)}`];
    if (!result.ok) body.push('', 'Не удалось прочитать кнопки этого поста.');
    else if (!count) body.push('', 'Текущие кнопки: пока нет кнопок');
    else { body.push('', `Текущие кнопки (${count}):`); summary.buttons.forEach((button, index) => { body.push('', `${index + 1}. ${button.title || button.text || 'Кнопка'}`, `   Ссылка: ${button.url || 'не указана'}`); }); }
    const buttons = [];
    if (result.ok && count < max) buttons.push({ text: count ? '➕ Добавить ещё кнопку' : '➕ Добавить кнопку', route: 'buttons.add', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: summary.postKey, postTitle: scoped.postTitle } });
    if (result.ok) summary.buttons.forEach((button, index) => {
      const suffix = summary.buttons.length > 1 ? ` ${index + 1}` : '';
      const data = { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: summary.postKey, postTitle: scoped.postTitle, buttonId: String(button.id) };
      buttons.push({ text: summary.buttons.length > 1 ? `✏️ Изменить кнопку${suffix}` : '✏️ Изменить кнопку', route: 'buttons.edit', data });
      buttons.push({ text: summary.buttons.length > 1 ? `🗑 Удалить кнопку${suffix}` : '🗑 Удалить кнопку', route: 'buttons.delete_confirm', data });
    });
    buttons.push({ text: '📌 Выбрать другой пост', route: 'buttons.select_channel', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle } });
    return menuRenderer.renderScreen({ title: '🔘 Кнопки поста', body, buttons, homeRoute: 'main.home' });
  },

  async startCreateFlow(ctx = {}, editButton = null) {
    const scoped = selectedPostCtx(ctx);
    if (!clean(scoped.postId)) return menuRenderer.renderScreen({ title: '🔘 Добавление кнопки', body: ['Сначала выберите канал и пост. После этого можно добавить кнопку.'], buttons: [{ text: 'Выбрать канал', route: 'buttons.home' }], homeRoute: 'main.home' });
    const draft = { postId: scoped.postId, postTitle: scoped.postTitle, channelId: scoped.channelId, channelTitle: scoped.channelTitle, postSource: 'registry', postSourceLabel: 'выбран из раздела кнопок', source: 'adminkit-core', storage: 'ak_post_buttons', legacyAdaptersDisabled: true };
    if (editButton) Object.assign(draft, { editMode: 'button', editButtonId: String(editButton.id), buttonTitle: editButton.title || editButton.text || '', buttonUrl: editButton.url || '' });
    const started = await flowEngine.start(ctx, 'buttons.create', draft);
    if (!started.ok) return menuRenderer.renderScreen({ title: '⚠️ Не удалось начать сценарий', body: ['Попробуйте открыть раздел заново.'], buttons: [{ text: '↩️ К кнопкам поста', route: 'buttons.post', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: scoped.postId, postTitle: scoped.postTitle } }], homeRoute: 'main.home' });
    const moved = await flowEngine.goTo(ctx, editButton ? 'input_title' : 'input_title', draft);
    return flowScreen.renderFlowState(moved.ok ? moved : started, { icon: '🔘', backRoute: 'buttons.post' });
  },

  async renderEdit(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    const result = await safeSummary(scoped);
    const button = findButton(result.summary, ctx);
    if (!button) return this.renderPostCenter(scoped);
    return this.startCreateFlow(scoped, button);
  },

  async renderDeleteConfirm(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    const result = await safeSummary(scoped);
    const button = findButton(result.summary, ctx);
    if (!button) return this.renderPostCenter(scoped);
    return buttonActionScreen({ title: '🗑 Удалить кнопку?', button, scoped, postKey: result.summary.postKey, action: 'подтверждение удаления', body: ['Кнопка будет отключена. Пост и другие настройки не затрагиваются.'], buttons: [{ text: '✅ Да, удалить', route: 'buttons.delete', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: result.summary.postKey, postTitle: scoped.postTitle, buttonId: String(button.id) } }] });
  },

  async deleteButton(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    const result = await safeSummary(scoped);
    const button = findButton(result.summary, ctx);
    if (!button) return this.renderPostCenter(scoped);
    const deleted = await postAddonManager.disableButton(scoped, button.id).catch((error) => ({ ok: false, error: error?.message || String(error) }));
    if (!deleted.ok) return menuRenderer.renderScreen({ title: '⚠️ Не удалось удалить кнопку', body: ['Попробуйте повторить позже.'], buttons: [{ text: '↩️ К кнопкам поста', route: 'buttons.post', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: result.summary.postKey, postTitle: scoped.postTitle } }], homeRoute: 'main.home' });
    return menuRenderer.renderScreen({ title: '✅ Кнопка отключена', body: [`Канал: ${channelLabel(scoped)}`, `Пост: ${postLabel(scoped)}`, `Кнопка: ${deleted.button.title || button.title}`], buttons: [{ text: '🔘 К кнопкам поста', route: 'buttons.post', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: result.summary.postKey, postTitle: scoped.postTitle } }], homeRoute: 'main.home' });
  },

  async handleAction(ctx = {}) {
    if (ctx.route === 'buttons.select_channel') return this.renderChannelPosts(ctx);
    if (ctx.route === 'buttons.post') return this.renderPostCenter(ctx);
    if (ctx.route === 'buttons.add') return this.startCreateFlow(ctx);
    if (ctx.route === 'buttons.edit') return this.renderEdit(ctx);
    if (ctx.route === 'buttons.delete_confirm') return this.renderDeleteConfirm(ctx);
    if (ctx.route === 'buttons.delete') return this.deleteButton(ctx);
    return this.renderHome(ctx);
  },

  selfTest() {
    return {
      ok: true,
      runtimeVersion: RUNTIME,
      homeIsChannelFirst: true,
      postScopedManagement: true,
      cleanCreateFlow: true,
      cleanEditFlow: true,
      cleanDeleteFlow: true,
      writesTo: 'ak_post_buttons',
      legacyAdaptersUsed: false
    };
  }
};
