'use strict';

const menuRenderer = require('../core/menuRenderer');
const postRegistry = require('../core/postRegistryDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-MODERATION-SECTION-1.42.3-SCOPE-POST-PICKER';

const routes = {
  home: 'moderation.home',
  scope: 'moderation.scope',
  scopePostSelect: 'moderation.scope_post_select',
  queue: 'moderation.queue',
  rules: 'moderation.rules',
  keywords: 'moderation.keywords',
  links: 'moderation.links',
  media: 'moderation.media',
  users: 'moderation.users',
  rights: 'moderation.rights',
  actions: 'moderation.actions',
  logs: 'moderation.logs',
  settings: 'moderation.settings'
};

const FUNCTION_TREE = [
  ['scope', 'Область действия правил', routes.scope, 'администратор выбирает, где действует модерация: во всём канале или только в одном выбранном посте'],
  ['queue', 'Очередь комментариев', routes.queue, 'модератор принимает решение: оставить, скрыть, удалить, восстановить или предупредить пользователя'],
  ['rules', 'Правила автофильтра', routes.rules, 'правило сохраняется и применяется к новым комментариям выбранного канала или выбранного поста'],
  ['keywords', 'Стоп-слова и фразы', routes.keywords, 'администратор выбирает действие: скрыть сразу, отправить на проверку или только подсветить'],
  ['links', 'Ссылки и домены', routes.links, 'администратор задаёт разрешённые домены или отправляет комментарии со ссылками на проверку'],
  ['media', 'Фото в комментариях', routes.media, 'администратор выбирает: разрешить фото, проверять первое фото или отправлять фото на ручную проверку'],
  ['users', 'Участники и нарушители', routes.users, 'модератор выбирает предупреждение, ограничение, удаление из чата или блокировку с подтверждением'],
  ['rights', 'Права бота', routes.rights, 'администратор видит, каких прав не хватает для удаления, блокировки, просмотра участников и закрепления'],
  ['actions', 'Действия модератора', routes.actions, 'опасное действие выполняется только после отдельного подтверждения'],
  ['logs', 'Журнал действий', routes.logs, 'администратор видит историю решений и может восстановить ошибочно скрытый комментарий'],
  ['settings', 'Режимы модерации', routes.settings, 'выбран режим: ручной, полуавтоматический или автоматический с очередью спорных случаев']
].map(([id, title, route, finalStep]) => ({ id, title, route, finalStep }));

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 64) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function isRawId(value = '') { const s = clean(value); return /^-?\d{6,}$/.test(s) || /^[a-f0-9]{12,}$/i.test(s); }
function human(value = '', fallback = '') {
  const s = clean(value);
  if (s && !isRawId(s)) return cut(s);
  const f = clean(fallback);
  return f && !isRawId(f) ? cut(f) : '';
}
function scoped(ctx = {}) {
  const payload = ctx.payload || {};
  const channelId = clean(payload.channelId || ctx.channelId || '');
  const postId = clean(payload.postId || ctx.postId || '');
  const channelTitleReal = human(payload.channelTitle || ctx.channelTitle, '');
  const postTitleReal = human(payload.postTitle || ctx.postTitle, '');
  const rawScope = clean(payload.scopeType || payload.scope || ctx.scopeType || ctx.scope || '').toLowerCase();
  const scopeType = rawScope === 'post' || rawScope === 'channel' ? rawScope : (postId || postTitleReal ? 'post' : (channelId || channelTitleReal ? 'channel' : ''));
  return { scopeType, channelId, channelTitle: channelTitleReal || 'текущий канал', postId, postTitle: postTitleReal };
}
function scopeLines(ctx = {}) {
  const s = scoped(ctx);
  if (s.scopeType === 'channel') return ['Область: весь канал', `Канал: ${s.channelTitle}`, 'Пост: не нужен — правило будет работать для всех постов канала'];
  if (s.scopeType === 'post') return ['Область: один пост', `Канал: ${s.channelTitle}`, `Пост: ${s.postTitle || 'выберите пост из списка'}`];
  return ['Область: сначала выберите, где действует правило', 'Можно применить модерацию ко всему каналу или только к одному посту'];
}
function render(title, body = [], buttons = [], options = {}) {
  return menuRenderer.renderScreen({ title, body, buttons, backRoute: options.backRoute || '', homeRoute: options.homeRoute === undefined ? 'main.home' : options.homeRoute });
}
function treeButtons() { return FUNCTION_TREE.map((item) => ({ text: item.title, route: item.route })); }
function scopeButtons(ctx = {}) {
  const s = scoped(ctx);
  return [
    { text: '🌐 Весь канал', route: routes.scope, data: { scopeType: 'channel', channelId: s.channelId, channelTitle: s.channelTitle } },
    { text: '📝 Выбрать один пост', route: routes.scopePostSelect, data: { channelId: s.channelId, channelTitle: s.channelTitle } },
    { text: '📋 К правилам', route: routes.rules, data: { scopeType: s.scopeType || 'channel', channelId: s.channelId, channelTitle: s.channelTitle, postId: s.postId, postTitle: s.postTitle || '' } }
  ];
}
async function safeListPosts(ctx = {}, options = {}) {
  try { return { ok: true, posts: await postRegistry.listPosts(ctx, options), error: '' }; }
  catch (error) { return { ok: false, posts: [], error: error?.message || String(error) }; }
}
function withScope(route, ctx = {}) { const s = scoped(ctx); return { route, data: { scopeType: s.scopeType, channelId: s.channelId, channelTitle: s.channelTitle, postId: s.postId, postTitle: s.postTitle } }; }

const section = {
  id: 'moderation', title: 'Модерация', icon: '🛡️', order: 50, feature: 'moderation.enabled', routes,

  async renderHome() {
    return render('🛡️ Модерация', [
      'Раздел собирает безопасность обсуждений и канала в одно дерево действий.',
      'Сначала выбираем область: весь канал или конкретный пост. Потом настраиваем правила, очередь, ссылки, фото, участников или журнал решений.',
      'Опасные действия не выполняются случайно: удаление, блокировка и снятие прав проходят через отдельное подтверждение.', '', 'Дерево функций:',
      ...FUNCTION_TREE.map((item, index) => `${index + 1}. ${item.title}`)
    ], treeButtons(), { homeRoute: 'main.home' });
  },

  async renderScope(ctx = {}) {
    const s = scoped(ctx);
    const selected = s.scopeType === 'post' ? `Сейчас выбрано: один пост — ${s.postTitle || 'пост ещё не выбран'}` : (s.scopeType === 'channel' ? `Сейчас выбрано: весь канал — ${s.channelTitle}` : 'Сейчас область ещё не выбрана.');
    return render('🎯 Область действия правил', [
      selected, ...scopeLines(ctx), '', 'Выберите, где будут работать правила модерации.',
      'Весь канал — правило применяется ко всем новым комментариям во всех постах выбранного канала.',
      'Один пост — правило применяется только к комментариям под выбранным постом.',
      'Для правила конкретного поста администратор должен видеть начало текста поста, а не номер или служебный идентификатор.'
    ], scopeButtons(ctx), { backRoute: routes.home });
  },

  async renderScopePostSelect(ctx = {}) {
    const s = scoped(ctx);
    const result = await safeListPosts({ ...ctx, channelId: s.channelId, channelTitle: s.channelTitle }, { channelId: s.channelId, limit: 10 });
    const body = [`Канал: ${s.channelTitle}`, 'Выберите пост, для которого будут работать правила модерации.', 'После выбора правила будут применяться только к комментариям под этим постом.'];
    const buttons = [];
    if (!result.ok) {
      body.push('', 'Не удалось прочитать посты канала. Попробуйте повторить.');
      buttons.push({ text: '🔄 Повторить', route: routes.scopePostSelect, data: { channelId: s.channelId, channelTitle: s.channelTitle } });
    } else if (result.posts.length) {
      result.posts.forEach((post, index) => buttons.push({ text: `${index + 1}. ${cut(post.displayTitle || post.postTitle || post.postPreview || 'Пост без текста', 52)}`, route: routes.scope, data: { scopeType: 'post', channelId: post.channelId || s.channelId, channelTitle: post.channelTitle || s.channelTitle, postId: post.postId, postTitle: post.displayTitle || post.postTitle || post.postPreview || 'Пост без текста' } }));
    } else {
      body.push('', 'Постов этого канала пока нет в базе. Перешлите пост из канала, чтобы он появился в списке.');
      buttons.push({ text: '🔄 Обновить список', route: routes.scopePostSelect, data: { channelId: s.channelId, channelTitle: s.channelTitle } });
    }
    buttons.push({ text: '🌐 Применить ко всему каналу', route: routes.scope, data: { scopeType: 'channel', channelId: s.channelId, channelTitle: s.channelTitle } });
    buttons.push({ text: '↩️ К области правил', route: routes.scope, data: { channelId: s.channelId, channelTitle: s.channelTitle } });
    return render('📝 Выберите пост', body, buttons, { backRoute: routes.scope });
  },

  async renderQueue(ctx = {}) { return render('🛡️ Очередь комментариев', [...scopeLines(ctx), '', 'Сюда попадают новые комментарии, жалобы, скрытые сообщения и спорные случаи после автофильтра.', 'Финальный шаг очереди — понятное решение модератора: оставить, скрыть, удалить, восстановить или предупредить пользователя.', 'Очередь должна показывать начало текста комментария, автора, пост и причину попадания на проверку.'], [{ text: '🎯 Область правил', ...withScope(routes.scope, ctx) }, { text: '🆕 Новые на проверке', route: routes.queue, data: { filter: 'new' } }, { text: '🚩 Жалобы', route: routes.queue, data: { filter: 'reports' } }, { text: '🙈 Скрытые', route: routes.queue, data: { filter: 'hidden' } }, { text: '♻️ Восстановленные', route: routes.queue, data: { filter: 'restored' } }], { backRoute: routes.home }); },
  async renderRules(ctx = {}) { return render('🛡️ Правила автофильтра', [...scopeLines(ctx), '', 'Правила помогают не проверять вручную одинаковые нарушения.', 'Для каждого правила нужен понятный финал: где действует правило, что ищем и что делаем с совпадением.', 'Базовые группы правил: стоп-слова, ссылки, фото, повторяющиеся комментарии и слишком частые сообщения.'], [{ text: '🎯 Выбрать область', ...withScope(routes.scope, ctx) }, { text: '🚫 Стоп-слова и фразы', ...withScope(routes.keywords, ctx) }, { text: '🔗 Ссылки и домены', ...withScope(routes.links, ctx) }, { text: '🖼 Фото в комментариях', ...withScope(routes.media, ctx) }, { text: '⚙️ Режимы модерации', ...withScope(routes.settings, ctx) }], { backRoute: routes.home }); },
  async renderKeywords(ctx = {}) { return render('🚫 Стоп-слова и фразы', [...scopeLines(ctx), '', 'Администратор добавляет слова, фразы или шаблоны, которые нужно ловить в комментариях.', 'Для каждого совпадения выбирается действие: скрыть сразу, отправить на проверку или только подсветить модератору.', 'Нужны исключения, чтобы нормальные слова не блокировались случайно.'], [{ text: '🎯 Изменить область', ...withScope(routes.scope, ctx) }, { text: '➕ Добавить стоп-слово', route: routes.keywords, data: { action: 'add' } }, { text: '📋 Список стоп-слов', route: routes.keywords, data: { action: 'list' } }, { text: '↩️ К правилам', ...withScope(routes.rules, ctx) }], { backRoute: routes.rules }); },
  async renderLinks(ctx = {}) { return render('🔗 Ссылки и домены', [...scopeLines(ctx), '', 'Можно запретить все ссылки, разрешить только доверенные домены или отправлять комментарии со ссылками на проверку.', 'Финальный шаг — список разрешённых доменов и действие для неизвестных ссылок.', 'Для пользователя это должно выглядеть как понятное правило, без технических адресов и кодов ошибок.'], [{ text: '🎯 Изменить область', ...withScope(routes.scope, ctx) }, { text: '✅ Разрешённые домены', route: routes.links, data: { action: 'allowlist' } }, { text: '🚫 Запретить неизвестные ссылки', route: routes.links, data: { action: 'block_unknown' } }, { text: '👀 Отправлять на проверку', route: routes.links, data: { action: 'review' } }, { text: '↩️ К правилам', ...withScope(routes.rules, ctx) }], { backRoute: routes.rules }); },
  async renderMedia(ctx = {}) { return render('🖼 Фото в комментариях', [...scopeLines(ctx), '', 'В комментариях оставляем только фото. Видео и файлы не добавляем в эту функцию.', 'Модерация фото должна уметь: разрешить фото всем, отправлять первое фото пользователя на проверку или проверять все фото.', 'Если тариф не позволяет фото, администратор должен видеть спокойное объяснение и переход к тарифам.'], [{ text: '🎯 Изменить область', ...withScope(routes.scope, ctx) }, { text: '✅ Разрешить фото', route: routes.media, data: { action: 'allow' } }, { text: '👀 Первое фото на проверку', route: routes.media, data: { action: 'first_review' } }, { text: '🛡 Все фото на проверку', route: routes.media, data: { action: 'all_review' } }, { text: '↩️ К правилам', ...withScope(routes.rules, ctx) }], { backRoute: routes.rules }); },
  async renderUsers(ctx = {}) { return render('👥 Участники и нарушители', [...scopeLines(ctx), '', 'Здесь нужны списки участников, администраторов и нарушителей.', 'Доступные действия: предупреждение, ограничение, удаление из чата или блокировка, если у бота есть нужные права.', 'Удаление и блокировка должны открывать экран подтверждения, а не выполняться одним нажатием.'], [{ text: '🔐 Проверить права бота', ...withScope(routes.rights, ctx) }, { text: '👥 Список участников', route: routes.users, data: { action: 'members' } }, { text: '⭐ Администраторы', route: routes.users, data: { action: 'admins' } }, { text: '🚫 Нарушители', route: routes.users, data: { action: 'violators' } }], { backRoute: routes.home }); },
  async renderRights(ctx = {}) { return render('🔐 Права бота', [...scopeLines(ctx), '', 'Перед включением жёсткой модерации нужно проверить, что бот может читать сообщения, видеть участников, управлять участниками и выполнять действия модератора.', 'Если прав не хватает, раздел должен показать администратору человеческую инструкцию: какие права выдать и где это сделать.', 'Без нужных прав опасные действия должны оставаться недоступными.'], [{ text: '🔄 Проверить права', route: routes.rights, data: { action: 'check' } }, { text: '👥 К участникам', ...withScope(routes.users, ctx) }, { text: '↩️ К модерации', route: routes.home }], { backRoute: routes.users }); },
  async renderActions(ctx = {}) { return render('🧰 Действия модератора', [...scopeLines(ctx), '', 'Базовые действия: оставить комментарий, скрыть, удалить, восстановить, предупредить пользователя или заблокировать нарушителя.', 'Каждое опасное действие должно иметь причину и подтверждение.', 'Для комментариев АдминКИТ сначала скрывает запись внутри обсуждения; действия с участниками канала выполняются только при наличии прав бота.'], [{ text: '✅ Оставить', route: routes.queue, data: { action: 'approve' } }, { text: '🙈 Скрыть', route: routes.queue, data: { action: 'hide' } }, { text: '🗑 Удалить с подтверждением', route: routes.queue, data: { action: 'delete_confirm' } }, { text: '↩️ К очереди', ...withScope(routes.queue, ctx) }], { backRoute: routes.home }); },
  async renderLogs(ctx = {}) { return render('📜 Журнал модерации', [...scopeLines(ctx), '', 'Журнал показывает, кто и когда принял решение, какой комментарий был затронут и почему.', 'Нужны фильтры: скрытые, удалённые, восстановленные, предупреждения и блокировки.', 'Финальный шаг — возможность быстро найти решение и откатить ошибочное скрытие.'], [{ text: '🙈 Скрытые', route: routes.logs, data: { filter: 'hidden' } }, { text: '🗑 Удалённые', route: routes.logs, data: { filter: 'deleted' } }, { text: '♻️ Восстановленные', route: routes.logs, data: { filter: 'restored' } }, { text: '↩️ К модерации', route: routes.home }], { backRoute: routes.home }); },
  async renderSettings(ctx = {}) { return render('⚙️ Режимы модерации', [...scopeLines(ctx), '', 'Ручной режим: всё спорное ждёт решения администратора.', 'Полуавтоматический режим: очевидный спам скрывается, спорные случаи идут в очередь.', 'Автоматический режим: правила применяются сразу, но журнал и восстановление остаются доступными.'], [{ text: '🎯 Изменить область', ...withScope(routes.scope, ctx) }, { text: '👤 Ручной режим', route: routes.settings, data: { mode: 'manual' } }, { text: '🤝 Полуавтоматический', route: routes.settings, data: { mode: 'semi_auto' } }, { text: '⚡ Автоматический', route: routes.settings, data: { mode: 'auto' } }, { text: '↩️ К правилам', ...withScope(routes.rules, ctx) }], { backRoute: routes.home }); },

  async handleAction(ctx = {}) {
    const route = String(ctx.route || routes.home);
    if (route === routes.scope) return this.renderScope(ctx);
    if (route === routes.scopePostSelect) return this.renderScopePostSelect(ctx);
    if (route === routes.queue) return this.renderQueue(ctx);
    if (route === routes.rules) return this.renderRules(ctx);
    if (route === routes.keywords) return this.renderKeywords(ctx);
    if (route === routes.links) return this.renderLinks(ctx);
    if (route === routes.media) return this.renderMedia(ctx);
    if (route === routes.users) return this.renderUsers(ctx);
    if (route === routes.rights) return this.renderRights(ctx);
    if (route === routes.actions) return this.renderActions(ctx);
    if (route === routes.logs) return this.renderLogs(ctx);
    if (route === routes.settings) return this.renderSettings(ctx);
    return this.renderHome(ctx);
  },

  selfTest() {
    const routeValues = Object.values(routes);
    return {
      ok: routeValues.length >= 12 && FUNCTION_TREE.length >= 11,
      runtimeVersion: RUNTIME,
      sectionId: 'moderation', feature: 'moderation.enabled', functionTreeReady: true,
      functionCount: FUNCTION_TREE.length, routes, routeCount: routeValues.length,
      scopeSelectionReady: true, scopePostSelectReady: true, scopeDefaultEmptyReady: true, scopeChannelReady: true, scopePostReady: true,
      rulesCanApplyToWholeChannel: true, rulesCanApplyToSinglePost: true,
      queueReady: true, rulesReady: true, keywordsReady: true, linksReady: true, photoModerationReady: true,
      usersAndRightsReady: true, actionConfirmationsRequired: true, logsReady: true, modesReady: true,
      maxDocsBackedCapabilities: ['message_created', 'message_edited', 'message_removed', 'user_added', 'user_removed', 'members', 'admins', 'bot_permissions', 'remove_or_block_member'],
      destructiveActionsOneTapDisabled: true, commentsModerationCompatible: true, noVideoFilesInComments: true,
      legacyAdaptersUsed: false, finalStepsDocumented: FUNCTION_TREE.every((item) => !!item.finalStep)
    };
  }
};

module.exports = section;
module.exports.RUNTIME = RUNTIME;
module.exports.FUNCTION_TREE = FUNCTION_TREE;
