'use strict';

const menuRenderer = require('../core/menuRenderer');
const highlightData = require('../core/postHighlightsDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-POST-HIGHLIGHTS-SECTION-1.45.0';

const routes = {
  home: 'post_highlights.home',
  channel: 'post_highlights.channel',
  post: 'post_highlights.post',
  type: 'post_highlights.type',
  preview: 'post_highlights.preview',
  apply: 'post_highlights.apply',
  list: 'post_highlights.list',
  removeConfirm: 'post_highlights.remove_confirm',
  remove: 'post_highlights.remove',
  stats: 'post_highlights.stats'
};

const FUNCTION_TREE = [
  ['select_channel', 'Выбрать канал', routes.channel, 'администратор выбирает канал с человеческим названием'],
  ['select_post', 'Выбрать пост', routes.post, 'показываем начало текста поста, а не технический id'],
  ['select_type', 'Выбрать тип выделения', routes.type, 'Важно, Новое, Подарок, Акция или Закрепить в списке'],
  ['preview', 'Предпросмотр выделения', routes.preview, 'перед применением показываем канал, пост и бейдж'],
  ['apply', 'Применить выделение', routes.apply, 'сохраняем выделение в базе АдминКИТ без прямого патча MAX-поста'],
  ['list', 'Список выделенных', routes.list, 'отдельный список важных/выделенных публикаций'],
  ['remove', 'Снять выделение', routes.removeConfirm, 'только через подтверждение, опубликованный пост не удаляем'],
  ['stats', 'Статистика выделений', routes.stats, 'счётчики по типам выделений']
].map(([id, title, route, finalStep]) => ({ id, title, route, finalStep }));

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 84) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function payload(ctx = {}, overrides = {}) { return { channelId: clean(ctx.payload?.channelId || ctx.channelId || ''), channelTitle: clean(ctx.payload?.channelTitle || ctx.channelTitle || 'Подключённый канал'), postId: clean(ctx.payload?.postId || ctx.postId || ''), postTitle: clean(ctx.payload?.postTitle || ctx.postTitle || ''), messageId: clean(ctx.payload?.messageId || ctx.messageId || ''), highlightType: clean(ctx.payload?.highlightType || 'important'), badgeText: clean(ctx.payload?.badgeText || ''), ...(overrides || {}) }; }
function render(title, body = [], buttons = [], options = {}) { return menuRenderer.renderScreen({ title, body, buttons, backRoute: options.backRoute || '', homeRoute: options.homeRoute === undefined ? 'main.home' : options.homeRoute }); }
function treeButtons() { return FUNCTION_TREE.map((item) => ({ text: item.title, route: item.route })); }

const section = {
  id: 'post_highlights',
  title: 'Выделение постов',
  icon: '⭐',
  order: 70,
  feature: 'post_highlights.enabled',
  routes,

  async renderHome(ctx = {}) {
    return render('⭐ Выделение постов', [
      'Этот раздел помогает отметить важные публикации: Важно, Новое, Подарок, Акция или Закрепить в списке.',
      'Выделение хранится в базе АдминКИТ и не меняет исходный MAX-пост без отдельного сценария редактирования.',
      'Обычный путь: выбрать канал, выбрать пост, выбрать тип выделения, посмотреть предпросмотр и применить.',
      '',
      'Дерево функций:',
      ...FUNCTION_TREE.map((item, index) => `${index + 1}. ${item.title} — ${item.finalStep}`)
    ], treeButtons(), { homeRoute: 'main.home' });
  },

  async renderChannel(ctx = {}) {
    const channels = await highlightData.listChannels(ctx);
    const body = ['Шаг 1 из 4. Выберите канал, где опубликован пост.', 'Дальше покажем последние посты с человеческими названиями.'];
    const buttons = channels.length ? channels.slice(0, 10).map((channel, index) => ({ text: `${index + 1}. ${cut(channel.displayTitle || channel.channelTitle || channel.title || 'Подключённый канал', 54)}`, route: routes.post, data: { channelId: channel.channelId, channelTitle: channel.displayTitle || channel.channelTitle || channel.title || 'Подключённый канал' } })) : [{ text: 'Подключённый канал', route: routes.post, data: payload(ctx, { channelId: 'manual-channel', channelTitle: 'Подключённый канал' }) }];
    buttons.push({ text: '📋 Список выделенных', route: routes.list, data: payload(ctx) });
    return render('⭐ Выбор канала', body, buttons, { backRoute: routes.home });
  },

  async renderPost(ctx = {}) {
    const p = payload(ctx);
    const posts = await highlightData.listPosts(ctx, { channelId: p.channelId, limit: 10 });
    const body = [`Канал: ${p.channelTitle || 'Подключённый канал'}`, 'Шаг 2 из 4. Выберите пост для выделения.', 'Показываем начало текста, а не технический id.'];
    const buttons = posts.length ? posts.map((post, index) => ({ text: `${index + 1}. ${cut(post.postTitle || post.postPreview || 'Пост без текста', 54)}`, route: routes.type, data: { channelId: post.channelId || p.channelId, channelTitle: post.channelTitle || p.channelTitle, postId: post.postId, messageId: post.messageId, postTitle: post.postTitle || post.postPreview } })) : [{ text: 'Пост пока не найден — вернуться', route: routes.channel, data: p }];
    buttons.push({ text: '↩️ Выбрать другой канал', route: routes.channel, data: p });
    return render('📝 Выберите пост', body, buttons, { backRoute: routes.channel });
  },

  async renderType(ctx = {}) {
    const p = payload(ctx);
    const types = highlightData.HIGHLIGHT_TYPES || {};
    return render('🏷 Тип выделения', [
      `Канал: ${p.channelTitle || 'Подключённый канал'}`,
      `Пост: ${p.postTitle || 'выбранный пост'}`,
      'Шаг 3 из 4. Выберите бейдж для этого поста.'
    ], Object.entries(types).map(([key, item]) => ({ text: `${item.icon} ${item.title}`, route: routes.preview, data: { ...p, highlightType: key, badgeText: item.badge } })), { backRoute: routes.post });
  },

  async renderPreview(ctx = {}) {
    const p = payload(ctx);
    const typeInfo = (highlightData.HIGHLIGHT_TYPES || {})[p.highlightType] || (highlightData.HIGHLIGHT_TYPES || {}).important || { icon: '⭐', title: 'Важно', badge: 'Важное' };
    const badgeText = p.badgeText || typeInfo.badge;
    return render('👁 Предпросмотр выделения', [
      `Канал: ${p.channelTitle || 'Подключённый канал'}`,
      `Пост: ${p.postTitle || 'выбранный пост'}`,
      `Бейдж: ${typeInfo.icon} ${badgeText}`,
      'После применения АдминКИТ сохранит выделение в базе и покажет пост в списке выделенных.',
      'Исходный MAX-пост этим действием не переписываем.'
    ], [
      { text: '✅ Применить выделение', route: routes.apply, data: { ...p, badgeText } },
      { text: '↩️ Изменить тип', route: routes.type, data: p }
    ], { backRoute: routes.type });
  },

  async renderApply(ctx = {}) {
    const p = payload(ctx);
    const saved = await highlightData.upsertHighlight(ctx, p);
    return render(saved.ok ? '✅ Пост выделен' : '⚠️ Не удалось выделить пост', [
      saved.ok ? `Пост: ${saved.postTitle}` : 'Не хватает канала или поста.',
      saved.ok ? `Бейдж: ${saved.typeInfo?.icon || '⭐'} ${saved.badgeText}` : '',
      'Выделение сохранено в базе АдминКИТ. Опубликованный пост не удалялся и не пересоздавался.'
    ], [
      { text: '📋 Список выделенных', route: routes.list, data: p },
      { text: '⭐ Выделить другой пост', route: routes.channel, data: p }
    ], { backRoute: routes.preview });
  },

  async renderList(ctx = {}) {
    const p = payload(ctx);
    const list = await highlightData.listHighlights(ctx, { channelId: p.channelId, limit: 10 });
    const lines = list.highlights.length ? list.highlights.map((item, index) => `${index + 1}. ${item.icon} ${item.postTitle} — ${item.badgeText}`) : ['Пока нет выделенных постов.'];
    const first = list.highlights[0] || {};
    const buttons = [];
    if (first.highlightId) buttons.push({ text: '🗑 Снять выделение с первого', route: routes.removeConfirm, data: { ...p, highlightId: first.highlightId } });
    buttons.push({ text: '📈 Статистика выделений', route: routes.stats, data: p });
    buttons.push({ text: '⭐ Выделить пост', route: routes.channel, data: p });
    return render('📋 Выделенные посты', ['Активные выделения:', ...lines], buttons, { backRoute: routes.home });
  },

  async renderRemoveConfirm(ctx = {}) {
    return render('🧾 Подтверждение снятия выделения', [
      'Снимаем только отметку в базе АдминКИТ.',
      'Опубликованный пост в MAX не удаляем и не редактируем.',
      'Нажмите финальное подтверждение, если отметка больше не нужна.'
    ], [
      { text: '✅ Да, снять выделение', route: routes.remove, data: payload(ctx, { highlightId: ctx.payload?.highlightId }) },
      { text: '↩️ Отменить', route: routes.list, data: payload(ctx) }
    ], { backRoute: routes.list });
  },

  async renderRemove(ctx = {}) {
    const removed = await highlightData.removeHighlight(ctx, { highlightId: ctx.payload?.highlightId });
    return render(removed.ok ? '✅ Выделение снято' : '⚠️ Не удалось снять выделение', [
      removed.ok ? 'Отметка удалена из активного списка выделений.' : 'Отметка не найдена или уже снята.',
      'Пост в канале не менялся.'
    ], [
      { text: '📋 Список выделенных', route: routes.list, data: payload(ctx) },
      { text: '⭐ Выделить пост', route: routes.channel, data: payload(ctx) }
    ], { backRoute: routes.list });
  },

  async renderStats(ctx = {}) {
    const p = payload(ctx);
    const result = await highlightData.stats(ctx, { channelId: p.channelId });
    const types = highlightData.HIGHLIGHT_TYPES || {};
    const lines = Object.entries(types).map(([key, item]) => `${item.icon} ${item.title}: ${Number(result.byType?.[key] || 0)}`);
    return render('📈 Статистика выделений', [`Всего активных выделений: ${result.total || 0}`, ...lines], [
      { text: '📋 Список выделенных', route: routes.list, data: p },
      { text: '⭐ Выделить пост', route: routes.channel, data: p }
    ], { backRoute: routes.list });
  },

  async handleAction(ctx = {}) {
    const route = String(ctx.route || routes.home);
    if (route === routes.channel) return this.renderChannel(ctx);
    if (route === routes.post) return this.renderPost(ctx);
    if (route === routes.type) return this.renderType(ctx);
    if (route === routes.preview) return this.renderPreview(ctx);
    if (route === routes.apply) return this.renderApply(ctx);
    if (route === routes.list) return this.renderList(ctx);
    if (route === routes.removeConfirm) return this.renderRemoveConfirm(ctx);
    if (route === routes.remove) return this.renderRemove(ctx);
    if (route === routes.stats) return this.renderStats(ctx);
    return this.renderHome(ctx);
  },

  selfTest() {
    const dataSelf = highlightData.selfTest ? highlightData.selfTest() : {};
    const routeValues = Object.values(routes);
    return {
      ok: routeValues.length >= 9 && FUNCTION_TREE.length >= 8 && dataSelf.ok !== false,
      runtimeVersion: RUNTIME,
      sectionId: 'post_highlights',
      feature: 'post_highlights.enabled',
      functionTreeReady: true,
      functionCount: FUNCTION_TREE.length,
      routeCount: routeValues.length,
      routes,
      channelPostBadgePreviewApplyReady: true,
      listReady: true,
      removeNeedsConfirmation: true,
      statsReady: true,
      noDirectMaxPostPatch: true,
      legacyAdaptersUsed: false,
      cleanCoreOnly: true,
      dataAdapter: dataSelf
    };
  }
};

module.exports = section;
module.exports.RUNTIME = RUNTIME;
module.exports.FUNCTION_TREE = FUNCTION_TREE;
module.exports.routes = routes;
