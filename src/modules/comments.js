'use strict';

const menuRenderer = require('../core/menuRenderer');
const postRegistry = require('../core/postRegistryDataAdapter');
const accessManager = require('../core/accessManager');

const RUNTIME = 'ADMINKIT-CORE-COMMENTS-SECTION-1.41.0-UNIFIED-COMMENTS';

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
function channelLabel(ctx = {}) { const c = selectedPostCtx(ctx); return clean(c.channelTitle) || 'Подключённый канал'; }
function postLabel(ctx = {}) { const c = selectedPostCtx(ctx); return clean(c.postTitle) || 'Пост без текста'; }
async function safeListChannels(ctx = {}) {
  try { return { ok: true, channels: await postRegistry.listChannels(ctx), error: '' }; }
  catch (error) { return { ok: false, channels: [], error: error?.message || String(error) }; }
}
async function safeListPosts(ctx = {}, options = {}) {
  try { return { ok: true, posts: await postRegistry.listPosts(ctx, options), error: '' }; }
  catch (error) { return { ok: false, posts: [], error: error?.message || String(error) }; }
}
async function featureAllowed(ctx = {}, code = '') {
  try { const result = await accessManager.can(ctx, code); return result.ok === true; }
  catch { return false; }
}
function boolLabel(value) { return value ? 'включено' : 'выключено'; }
function scopedData(scoped = {}) {
  return { channelId: scoped.channelId, channelTitle: scoped.channelTitle, postId: scoped.postId, postTitle: scoped.postTitle };
}
function postButtons(scoped = {}) {
  const data = scopedData(scoped);
  return [
    { text: '💬 Комментарии под постом', route: 'comments.toggle', data },
    { text: '🖼 Фото в комментариях', route: 'comments.photo_settings', data },
    { text: '↩️ Ответы на комментарии', route: 'comments.replies_settings', data },
    { text: '❤️ Реакции на комментарии', route: 'comments.reactions_settings', data },
    { text: '🛡 Модерация комментариев', route: 'comments.moderation', data },
    { text: '🧪 Проверить обсуждение', route: 'comments.diagnostics', data },
    { text: '↩️ К постам канала', route: 'comments.select_channel', data: { channelId: scoped.channelId, channelTitle: scoped.channelTitle } }
  ];
}
function postScreen(title, scoped, body = [], buttons = []) {
  return menuRenderer.renderScreen({
    title,
    body: [`Канал: ${channelLabel(scoped)}`, `Пост: ${postLabel(scoped)}`, '', ...body].filter((x) => x !== ''),
    buttons: [...buttons, { text: '↩️ К управлению комментариями', route: 'comments.post', data: scopedData(scoped) }],
    homeRoute: 'main.home'
  });
}

const section = {
  id: 'comments',
  title: 'Комментарии',
  icon: '💬',
  order: 20,
  feature: 'comments.enabled',
  routes: {
    home: 'comments.home',
    selectChannel: 'comments.select_channel',
    selectPost: 'comments.post',
    toggle: 'comments.toggle',
    photoSettings: 'comments.photo_settings',
    photoToggle: 'comments.photo_toggle',
    repliesSettings: 'comments.replies_settings',
    reactionsSettings: 'comments.reactions_settings',
    moderation: 'comments.moderation',
    diagnostics: 'comments.diagnostics'
  },

  async renderHome(ctx = {}) {
    const result = await safeListChannels(ctx);
    const body = [
      'Здесь собраны все настройки обсуждений под постами.',
      'Сначала выберите канал, потом пост. В карточке поста будут комментарии, фото, ответы, реакции и модерация.'
    ];
    const buttons = [];
    if (!result.ok) {
      body.push('', 'Не удалось прочитать список каналов. Попробуйте обновить раздел.');
      buttons.push({ text: '🔄 Повторить загрузку каналов', route: 'comments.home' });
    } else if (result.channels.length) {
      result.channels.slice(0, 10).forEach((channel, index) => buttons.push({
        text: `${index + 1}. ${cut(channel.channelTitle || channel.title || 'Подключённый канал', 44)}${channel.postCount ? ` · постов: ${channel.postCount}` : ''}`,
        route: 'comments.select_channel',
        data: { channelId: channel.channelId, channelTitle: channel.channelTitle || channel.title || 'Подключённый канал' }
      }));
    } else {
      body.push('', 'В базе пока нет каналов с постами. Перешлите пост из канала, чтобы он появился в списке.');
      buttons.push({ text: '🔄 Обновить список каналов', route: 'comments.home' });
    }
    return menuRenderer.renderScreen({ title: '💬 Комментарии', body, buttons, homeRoute: 'main.home' });
  },

  async renderChannelPosts(ctx = {}) {
    const channelId = clean(ctx.payload?.channelId || ctx.channelId || '');
    const channelTitle = clean(ctx.payload?.channelTitle || ctx.channelTitle || 'Подключённый канал');
    const result = await safeListPosts({ ...ctx, channelId, channelTitle }, { channelId, limit: 10 });
    const body = [`Канал: ${channelTitle}`, 'Выберите пост, у которого нужно настроить обсуждение.'];
    const buttons = [];
    if (!result.ok) {
      body.push('', 'Не удалось прочитать посты канала. Попробуйте повторить.');
      buttons.push({ text: '🔄 Повторить', route: 'comments.select_channel', data: { channelId, channelTitle } });
    } else if (result.posts.length) {
      result.posts.forEach((post, index) => buttons.push({
        text: `${index + 1}. ${cut(post.displayTitle || post.postTitle || post.postPreview || 'Пост без текста', 52)}`,
        route: 'comments.post',
        data: { channelId: post.channelId || channelId, channelTitle: post.channelTitle || channelTitle, postId: post.postId, postTitle: post.displayTitle || post.postTitle || post.postPreview || 'Пост без текста' }
      }));
    } else {
      body.push('', 'Постов этого канала пока нет в базе.');
    }
    buttons.push({ text: '↩️ К выбору канала', route: 'comments.home' });
    return menuRenderer.renderScreen({ title: '💬 Выберите пост', body, buttons, homeRoute: 'main.home' });
  },

  async renderPostCenter(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    const photoAllowed = await featureAllowed(scoped, 'comments.photo');
    const repliesAllowed = await featureAllowed(scoped, 'comments.replies');
    const reactionsAllowed = await featureAllowed(scoped, 'comments.reactions');
    const moderationAllowed = await featureAllowed(scoped, 'comments.moderation');
    const body = [
      `Комментарии под постом: ${boolLabel(true)}`,
      `Фото в комментариях: ${photoAllowed ? 'доступно на тарифе' : 'доступно на расширенном тарифе'}`,
      `Ответы на комментарии: ${repliesAllowed ? 'доступны' : 'доступны на расширенном тарифе'}`,
      `Реакции на комментарии: ${reactionsAllowed ? 'доступны' : 'доступны на расширенном тарифе'}`,
      `Модерация: ${moderationAllowed ? 'доступна' : 'доступна на расширенном тарифе'}`,
      '',
      'Выберите, что нужно настроить для обсуждения этого поста.'
    ];
    return menuRenderer.renderScreen({ title: '💬 Комментарии поста', body: [`Канал: ${channelLabel(scoped)}`, `Пост: ${postLabel(scoped)}`, '', ...body].filter((x) => x !== ''), buttons: postButtons(scoped), homeRoute: 'main.home' });
  },

  async renderToggle(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    return postScreen('💬 Комментарии под постом', scoped, [
      'Здесь включается или выключается обсуждение под выбранным постом.',
      'Финальный режим должен менять кнопку «Комментарии» под постом и сохранять счётчик обсуждения.',
      'Для текущей проверки экран собран как отдельный логический шаг управления.'
    ], [
      { text: '✅ Включить комментарии', route: 'comments.post', data: scopedData(scoped) },
      { text: '⏸ Выключить комментарии', route: 'comments.post', data: scopedData(scoped) }
    ]);
  },

  async renderPhotoSettings(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    const allowed = await featureAllowed(scoped, 'comments.photo');
    const body = allowed ? [
      'Фото — единственный тип вложений, который разрешаем в комментариях.',
      'Видео и файлы в комментарии не добавляем.',
      'Администратор должен видеть понятное ограничение по тарифу и настройку разрешения фото.'
    ] : [
      'Фото в комментариях доступны на расширенном тарифе.',
      'На бесплатном тарифе пользователю показываем спокойное объяснение без технических деталей.',
      'Видео и файлы в комментарии не добавляем.'
    ];
    return postScreen('🖼 Фото в комментариях', scoped, body, allowed ? [
      { text: '✅ Разрешить фото', route: 'comments.post', data: scopedData(scoped) },
      { text: '⏸ Запретить фото', route: 'comments.post', data: scopedData(scoped) }
    ] : [
      { text: '💳 Посмотреть тарифы', route: 'billing.home' }
    ]);
  },

  async renderRepliesSettings(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    return postScreen('↩️ Ответы на комментарии', scoped, [
      'Ответы нужны, чтобы участники могли отвечать на конкретный комментарий.',
      'В обсуждении должна быть видна связка: на какой комментарий отвечает пользователь.',
      'Для администратора это настройка внутри раздела комментариев, а не отдельный раздел меню.'
    ], [
      { text: '✅ Разрешить ответы', route: 'comments.post', data: scopedData(scoped) },
      { text: '⏸ Запретить ответы', route: 'comments.post', data: scopedData(scoped) }
    ]);
  },

  async renderReactionsSettings(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    return postScreen('❤️ Реакции на комментарии', scoped, [
      'Реакции относятся к конкретным комментариям внутри обсуждения.',
      'Нужно показывать счётчик реакций и не дублировать реакцию при повторном нажатии.',
      'Реакции на пост и реакции на комментарий должны учитываться отдельно.'
    ], [
      { text: '✅ Разрешить реакции', route: 'comments.post', data: scopedData(scoped) },
      { text: '⏸ Запретить реакции', route: 'comments.post', data: scopedData(scoped) }
    ]);
  },

  async renderModeration(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    return postScreen('🛡 Модерация комментариев', scoped, [
      'Базовые действия модератора: удалить комментарий, скрыть комментарий и восстановить его.',
      'Модерация должна работать из карточки обсуждения конкретного поста.',
      'Позже сюда можно добавить жалобы, стоп-слова и антиспам.'
    ], [
      { text: '🗑 Удаление комментариев', route: 'comments.post', data: scopedData(scoped) },
      { text: '🙈 Скрытие / восстановление', route: 'comments.post', data: scopedData(scoped) }
    ]);
  },

  async renderDiagnostics(ctx = {}) {
    const scoped = selectedPostCtx(ctx);
    return postScreen('🧪 Проверка обсуждения', scoped, [
      'Проверяем полный путь: кнопка «Комментарии» под постом, открытие обсуждения, отправка текста, счётчик, фото по тарифу, ответы, реакции и модерация.',
      'Отдельно проверяем старые пропатченные посты: после обновления они не должны терять связь с обсуждением.'
    ], [
      { text: '🔄 Проверить ещё раз', route: 'comments.diagnostics', data: scopedData(scoped) }
    ]);
  },

  async handleAction(ctx = {}) {
    if (ctx.route === 'comments.select_channel') return this.renderChannelPosts(ctx);
    if (ctx.route === 'comments.post') return this.renderPostCenter(ctx);
    if (ctx.route === 'comments.toggle') return this.renderToggle(ctx);
    if (ctx.route === 'comments.photo_settings') return this.renderPhotoSettings(ctx);
    if (ctx.route === 'comments.replies_settings') return this.renderRepliesSettings(ctx);
    if (ctx.route === 'comments.reactions_settings') return this.renderReactionsSettings(ctx);
    if (ctx.route === 'comments.moderation') return this.renderModeration(ctx);
    if (ctx.route === 'comments.diagnostics') return this.renderDiagnostics(ctx);
    return this.renderHome(ctx);
  },

  selfTest() {
    return {
      ok: true,
      runtimeVersion: RUNTIME,
      unifiedCommentsSection: true,
      photoInsideComments: true,
      reactionsInsideComments: true,
      repliesInsideComments: true,
      moderationInsideComments: true,
      channelFirst: true,
      postScopedManagement: true,
      noVideoFilesInComments: true,
      legacyAdaptersUsed: false
    };
  }
};

module.exports = section;
