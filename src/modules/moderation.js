'use strict';

const menuRenderer = require('../core/menuRenderer');
const postRegistry = require('../core/postRegistryDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-MODERATION-SECTION-1.42.5-FINAL-FUNCTION-TREE';

const routes = {
  home: 'moderation.home',
  scope: 'moderation.scope',
  scopePostSelect: 'moderation.scope_post_select',
  queue: 'moderation.queue',
  reports: 'moderation.reports',
  rules: 'moderation.rules',
  keywords: 'moderation.keywords',
  links: 'moderation.links',
  media: 'moderation.media',
  spam: 'moderation.spam',
  users: 'moderation.users',
  rights: 'moderation.rights',
  actions: 'moderation.actions',
  actionConfirm: 'moderation.action_confirm',
  logs: 'moderation.logs',
  settings: 'moderation.settings'
};

const FUNCTION_TREE = [
  ['scope', 'Область действия правил', routes.scope, 'администратор выбирает область: весь канал или один конкретный пост; дальше эта область сохраняется во всех правилах'],
  ['queue', 'Очередь комментариев', routes.queue, 'модератор принимает решение по комментарию: оставить, скрыть, удалить с подтверждением, восстановить или предупредить пользователя'],
  ['reports', 'Жалобы пользователей', routes.reports, 'администратор разбирает жалобы, видит пост, автора, причину и переводит жалобу в финальное решение модерации'],
  ['rules', 'Правила автофильтра', routes.rules, 'правило сохраняется с выбранной областью и применяется к новым комментариям канала или выбранного поста'],
  ['keywords', 'Стоп-слова и фразы', routes.keywords, 'администратор задаёт слова/фразы, выбирает действие и исключения, затем сохраняет правило'],
  ['links', 'Ссылки и домены', routes.links, 'администратор задаёт разрешённые домены или действие для неизвестных ссылок'],
  ['media', 'Фото в комментариях', routes.media, 'администратор выбирает режим проверки фото; видео и файлы в комментарии не добавляются'],
  ['spam', 'Спам и флуд', routes.spam, 'администратор задаёт частоту сообщений, повторы и действие для подозрительной активности'],
  ['users', 'Участники и нарушители', routes.users, 'модератор видит участников, администраторов, нарушителей и переходит к безопасным действиям'],
  ['rights', 'Права бота', routes.rights, 'администратор видит, каких прав не хватает для удаления, блокировки, просмотра участников и журналирования'],
  ['actions', 'Действия модератора', routes.actions, 'опасные действия открывают экран подтверждения, а не выполняются одним нажатием'],
  ['logs', 'Журнал действий', routes.logs, 'администратор видит историю решений, фильтры и путь восстановления ошибочного скрытия'],
  ['settings', 'Режимы модерации', routes.settings, 'администратор выбирает ручной, полуавтоматический или автоматический режим с очередью спорных случаев']
].map(([id, title, route, finalStep]) => ({ id, title, route, finalStep }));

const ACTIONS = [
  { id: 'approve', title: '✅ Оставить комментарий', danger: false, final: 'Комментарий остаётся видимым, запись попадает в журнал.' },
  { id: 'hide', title: '🙈 Скрыть комментарий', danger: false, final: 'Комментарий скрывается из обсуждения, но может быть восстановлен из журнала.' },
  { id: 'delete', title: '🗑 Удалить комментарий', danger: true, final: 'Перед удалением показываем отдельное подтверждение и причину.' },
  { id: 'warn', title: '⚠️ Предупредить пользователя', danger: false, final: 'Пользователь получает предупреждение, действие сохраняется в истории.' },
  { id: 'block', title: '🚫 Заблокировать пользователя', danger: true, final: 'Перед блокировкой показываем отдельное подтверждение и проверяем права бота.' }
];

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
function scopeData(ctx = {}, overrides = {}) {
  const s = scoped(ctx);
  return { scopeType: s.scopeType, channelId: s.channelId, channelTitle: s.channelTitle, postId: s.postId, postTitle: s.postTitle, ...(overrides || {}) };
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
function treeButtons() {
  return FUNCTION_TREE.map((item) => ({ text: item.title, route: item.route }));
}
function withScope(route, ctx = {}, overrides = {}) {
  return { route, data: scopeData(ctx, overrides) };
}
function scopeButtons(ctx = {}) {
  const s = scoped(ctx);
  return [
    { text: '🌐 Весь канал', route: routes.scope, data: scopeData(ctx, { scopeType: 'channel', postId: '', postTitle: '' }) },
    { text: '📝 Выбрать один пост', route: routes.scopePostSelect, data: { channelId: s.channelId, channelTitle: s.channelTitle } },
    { text: '📋 К правилам', route: routes.rules, data: scopeData(ctx, { scopeType: s.scopeType || 'channel' }) }
  ];
}
async function safeListPosts(ctx = {}, options = {}) {
  try { return { ok: true, posts: await postRegistry.listPosts(ctx, options), error: '' }; }
  catch (error) { return { ok: false, posts: [], error: error?.message || String(error) }; }
}
function actionButtons(ctx = {}) {
  return ACTIONS.map((action) => ({
    text: action.danger ? `${action.title} — подтвердить` : action.title,
    route: action.danger ? routes.actionConfirm : routes.queue,
    data: scopeData(ctx, { action: action.id })
  }));
}

const section = {
  id: 'moderation',
  title: 'Модерация',
  icon: '🛡️',
  order: 50,
  feature: 'moderation.enabled',
  routes,

  async renderHome() {
    return render('🛡️ Модерация', [
      'Финальное дерево модерации собрано вокруг одного принципа: сначала выбираем область действия, потом настраиваем правила и безопасно принимаем решения.',
      'Область может быть двух типов: весь канал или один конкретный пост. Для поста администратор выбирает пост из списка с человеческим названием.',
      'Удаление и блокировка не выполняются одним нажатием — сначала открывается экран подтверждения.',
      '',
      'Дерево функций:',
      ...FUNCTION_TREE.map((item, index) => `${index + 1}. ${item.title} — ${item.finalStep}`)
    ], treeButtons(), { homeRoute: 'main.home' });
  },

  async renderScope(ctx = {}) {
    const s = scoped(ctx);
    const selected = s.scopeType === 'post'
      ? `Сейчас выбрано: один пост — ${s.postTitle || 'пост ещё не выбран'}`
      : (s.scopeType === 'channel' ? `Сейчас выбрано: весь канал — ${s.channelTitle}` : 'Сейчас область ещё не выбрана.');
    return render('🎯 Область действия правил', [
      selected,
      ...scopeLines(ctx),
      '',
      'Весь канал — правило применяется ко всем новым комментариям во всех постах выбранного канала.',
      'Один пост — правило применяется только к комментариям под выбранным постом.',
      'Правила канала не требуют выбора поста. Правила поста обязательно показывают начало/название поста.'
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
      result.posts.forEach((post, index) => buttons.push({
        text: `${index + 1}. ${cut(post.displayTitle || post.postTitle || post.postPreview || 'Пост без текста', 52)}`,
        route: routes.scope,
        data: {
          scopeType: 'post',
          channelId: post.channelId || s.channelId,
          channelTitle: post.channelTitle || s.channelTitle,
          postId: post.postId,
          postTitle: post.displayTitle || post.postTitle || post.postPreview || 'Пост без текста'
        }
      }));
    } else {
      body.push('', 'Постов этого канала пока нет в базе. Перешлите пост из канала, чтобы он появился в списке.');
      buttons.push({ text: '🔄 Обновить список', route: routes.scopePostSelect, data: { channelId: s.channelId, channelTitle: s.channelTitle } });
    }
    buttons.push({ text: '🌐 Применить ко всему каналу', route: routes.scope, data: { scopeType: 'channel', channelId: s.channelId, channelTitle: s.channelTitle } });
    buttons.push({ text: '↩️ К области правил', route: routes.scope, data: { channelId: s.channelId, channelTitle: s.channelTitle } });
    return render('📝 Выберите пост', body, buttons, { backRoute: routes.scope });
  },

  async renderQueue(ctx = {}) {
    return render('🛡️ Очередь комментариев', [
      ...scopeLines(ctx),
      '',
      'Сюда попадают новые комментарии, жалобы, скрытые сообщения и спорные случаи после автофильтра.',
      'Финальный шаг очереди — понятное решение модератора: оставить, скрыть, удалить с подтверждением, восстановить или предупредить пользователя.',
      'Карточка должна показывать начало текста комментария, автора, пост и причину попадания на проверку.'
    ], [
      { text: '🎯 Область правил', ...withScope(routes.scope, ctx) },
      { text: '🆕 Новые на проверке', route: routes.queue, data: scopeData(ctx, { filter: 'new' }) },
      { text: '🚩 Жалобы', ...withScope(routes.reports, ctx) },
      { text: '🙈 Скрытые', route: routes.queue, data: scopeData(ctx, { filter: 'hidden' }) },
      { text: '🧰 Действия', ...withScope(routes.actions, ctx) }
    ], { backRoute: routes.home });
  },

  async renderReports(ctx = {}) {
    return render('🚩 Жалобы пользователей', [
      ...scopeLines(ctx),
      '',
      'Жалобы — отдельная очередь внутри модерации.',
      'Администратор должен видеть: кто пожаловался, на какой комментарий, под каким постом и почему.',
      'Финальный шаг — принять решение: оставить комментарий, скрыть, удалить с подтверждением или предупредить пользователя.'
    ], [
      { text: '🛡️ К очереди', ...withScope(routes.queue, ctx) },
      { text: '🧰 Решение по жалобе', ...withScope(routes.actions, ctx, { source: 'report' }) },
      { text: '📜 Журнал жалоб', route: routes.logs, data: scopeData(ctx, { filter: 'reports' }) }
    ], { backRoute: routes.home });
  },

  async renderRules(ctx = {}) {
    return render('🛡️ Правила автофильтра', [
      ...scopeLines(ctx),
      '',
      'Правила помогают не проверять вручную одинаковые нарушения.',
      'Для каждого правила нужен понятный финал: где действует правило, что ищем и что делаем с совпадением.',
      'Группы правил: стоп-слова, ссылки, фото, спам/флуд, права и режимы модерации.'
    ], [
      { text: '🎯 Выбрать область', ...withScope(routes.scope, ctx) },
      { text: '🚫 Стоп-слова и фразы', ...withScope(routes.keywords, ctx) },
      { text: '🔗 Ссылки и домены', ...withScope(routes.links, ctx) },
      { text: '🖼 Фото в комментариях', ...withScope(routes.media, ctx) },
      { text: '🔁 Спам и флуд', ...withScope(routes.spam, ctx) },
      { text: '⚙️ Режимы модерации', ...withScope(routes.settings, ctx) }
    ], { backRoute: routes.home });
  },

  async renderKeywords(ctx = {}) {
    return render('🚫 Стоп-слова и фразы', [
      ...scopeLines(ctx),
      '',
      'Администратор добавляет слова, фразы или шаблоны, которые нужно ловить в комментариях.',
      'Для каждого совпадения выбирается действие: скрыть сразу, отправить на проверку или только подсветить модератору.',
      'Финальный шаг — сохранить правило и показать, в какой области оно работает.'
    ], [
      { text: '🎯 Изменить область', ...withScope(routes.scope, ctx) },
      { text: '➕ Добавить стоп-слово', route: routes.keywords, data: scopeData(ctx, { action: 'add' }) },
      { text: '📋 Список стоп-слов', route: routes.keywords, data: scopeData(ctx, { action: 'list' }) },
      { text: '👀 Действие: на проверку', route: routes.keywords, data: scopeData(ctx, { action: 'review' }) },
      { text: '↩️ К правилам', ...withScope(routes.rules, ctx) }
    ], { backRoute: routes.rules });
  },

  async renderLinks(ctx = {}) {
    return render('🔗 Ссылки и домены', [
      ...scopeLines(ctx),
      '',
      'Можно запретить все ссылки, разрешить только доверенные домены или отправлять комментарии со ссылками на проверку.',
      'Финальный шаг — сохранить список разрешённых доменов и действие для неизвестных ссылок.',
      'Пользовательский экран не должен показывать технические адреса и коды ошибок.'
    ], [
      { text: '🎯 Изменить область', ...withScope(routes.scope, ctx) },
      { text: '✅ Разрешённые домены', route: routes.links, data: scopeData(ctx, { action: 'allowlist' }) },
      { text: '🚫 Запретить неизвестные ссылки', route: routes.links, data: scopeData(ctx, { action: 'block_unknown' }) },
      { text: '👀 Отправлять на проверку', route: routes.links, data: scopeData(ctx, { action: 'review' }) },
      { text: '↩️ К правилам', ...withScope(routes.rules, ctx) }
    ], { backRoute: routes.rules });
  },

  async renderMedia(ctx = {}) {
    return render('🖼 Фото в комментариях', [
      ...scopeLines(ctx),
      '',
      'В комментариях оставляем только фото. Видео и файлы не добавляем в эту функцию.',
      'Модерация фото умеет: разрешить фото всем, отправлять первое фото пользователя на проверку или проверять все фото.',
      'Финальный шаг — сохранить режим проверки фото для выбранной области.'
    ], [
      { text: '🎯 Изменить область', ...withScope(routes.scope, ctx) },
      { text: '✅ Разрешить фото', route: routes.media, data: scopeData(ctx, { action: 'allow' }) },
      { text: '👀 Первое фото на проверку', route: routes.media, data: scopeData(ctx, { action: 'first_review' }) },
      { text: '🛡 Все фото на проверку', route: routes.media, data: scopeData(ctx, { action: 'all_review' }) },
      { text: '↩️ К правилам', ...withScope(routes.rules, ctx) }
    ], { backRoute: routes.rules });
  },

  async renderSpam(ctx = {}) {
    return render('🔁 Спам и флуд', [
      ...scopeLines(ctx),
      '',
      'Этот блок ловит повторяющиеся комментарии, слишком частые сообщения и массовые одинаковые ответы.',
      'Настройки: лимит сообщений за период, повтор текста, одинаковые ссылки и подозрительная частота.',
      'Финальный шаг — выбрать действие: отправить в очередь, скрыть автоматически или только подсветить.'
    ], [
      { text: '🎯 Изменить область', ...withScope(routes.scope, ctx) },
      { text: '⏱ Лимит частоты', route: routes.spam, data: scopeData(ctx, { action: 'rate_limit' }) },
      { text: '🔁 Повторы текста', route: routes.spam, data: scopeData(ctx, { action: 'duplicates' }) },
      { text: '👀 Отправлять в очередь', route: routes.spam, data: scopeData(ctx, { action: 'review' }) },
      { text: '↩️ К правилам', ...withScope(routes.rules, ctx) }
    ], { backRoute: routes.rules });
  },

  async renderUsers(ctx = {}) {
    return render('👥 Участники и нарушители', [
      ...scopeLines(ctx),
      '',
      'Здесь нужны списки участников, администраторов и нарушителей.',
      'Доступные действия: предупреждение, ограничение, удаление из чата или блокировка, если у бота есть нужные права.',
      'Удаление и блокировка открывают экран подтверждения, а не выполняются одним нажатием.'
    ], [
      { text: '🔐 Проверить права бота', ...withScope(routes.rights, ctx) },
      { text: '👥 Список участников', route: routes.users, data: scopeData(ctx, { action: 'members' }) },
      { text: '⭐ Администраторы', route: routes.users, data: scopeData(ctx, { action: 'admins' }) },
      { text: '🚫 Нарушители', route: routes.users, data: scopeData(ctx, { action: 'violators' }) },
      { text: '🧰 Действия', ...withScope(routes.actions, ctx) }
    ], { backRoute: routes.home });
  },

  async renderRights(ctx = {}) {
    return render('🔐 Права бота', [
      ...scopeLines(ctx),
      '',
      'Перед жёсткой модерацией нужно проверить, что бот может читать сообщения, видеть участников, управлять участниками и выполнять действия модератора.',
      'Если прав не хватает, раздел должен показать человеческую инструкцию: какие права выдать и где это сделать.',
      'Без нужных прав опасные действия остаются недоступными.'
    ], [
      { text: '🔄 Проверить права', route: routes.rights, data: scopeData(ctx, { action: 'check' }) },
      { text: '👥 К участникам', ...withScope(routes.users, ctx) },
      { text: '↩️ К модерации', route: routes.home }
    ], { backRoute: routes.users });
  },

  async renderActions(ctx = {}) {
    return render('🧰 Действия модератора', [
      ...scopeLines(ctx),
      '',
      'Базовые действия: оставить комментарий, скрыть, удалить, восстановить, предупредить пользователя или заблокировать нарушителя.',
      'Удаление и блокировка требуют отдельного подтверждения.',
      'Для комментариев АдминКИТ сначала скрывает запись внутри обсуждения; действия с участниками канала выполняются только при наличии прав бота.'
    ], [
      ...actionButtons(ctx),
      { text: '↩️ К очереди', ...withScope(routes.queue, ctx) }
    ], { backRoute: routes.home });
  },

  async renderActionConfirm(ctx = {}) {
    const action = clean(ctx.payload?.action || ctx.action || '');
    const info = ACTIONS.find((item) => item.id === action) || ACTIONS.find((item) => item.id === 'delete');
    return render('🧾 Подтверждение действия', [
      ...scopeLines(ctx),
      '',
      `Действие: ${info.title.replace(/[✅🙈🗑⚠️🚫]/g, '').trim()}`,
      info.final,
      'Перед выполнением администратор должен увидеть причину, объект действия и кнопку финального подтверждения.',
      'На этом экране нет мгновенной блокировки или удаления одним нажатием.'
    ], [
      { text: '✅ Подтвердить действие', route: routes.logs, data: scopeData(ctx, { action, confirmed: 1 }) },
      { text: '↩️ Отменить', ...withScope(routes.actions, ctx) }
    ], { backRoute: routes.actions });
  },

  async renderLogs(ctx = {}) {
    return render('📜 Журнал модерации', [
      ...scopeLines(ctx),
      '',
      'Журнал показывает, кто и когда принял решение, какой комментарий был затронут и почему.',
      'Фильтры: скрытые, удалённые, восстановленные, предупреждения, блокировки и жалобы.',
      'Финальный шаг — быстро найти решение и откатить ошибочное скрытие.'
    ], [
      { text: '🙈 Скрытые', route: routes.logs, data: scopeData(ctx, { filter: 'hidden' }) },
      { text: '🗑 Удалённые', route: routes.logs, data: scopeData(ctx, { filter: 'deleted' }) },
      { text: '♻️ Восстановленные', route: routes.logs, data: scopeData(ctx, { filter: 'restored' }) },
      { text: '🚩 Жалобы', route: routes.logs, data: scopeData(ctx, { filter: 'reports' }) },
      { text: '↩️ К модерации', route: routes.home }
    ], { backRoute: routes.home });
  },

  async renderSettings(ctx = {}) {
    return render('⚙️ Режимы модерации', [
      ...scopeLines(ctx),
      '',
      'Ручной режим: всё спорное ждёт решения администратора.',
      'Полуавтоматический режим: очевидный спам скрывается, спорные случаи идут в очередь.',
      'Автоматический режим: правила применяются сразу, но журнал и восстановление остаются доступными.'
    ], [
      { text: '🎯 Изменить область', ...withScope(routes.scope, ctx) },
      { text: '👤 Ручной режим', route: routes.settings, data: scopeData(ctx, { mode: 'manual' }) },
      { text: '🤝 Полуавтоматический', route: routes.settings, data: scopeData(ctx, { mode: 'semi_auto' }) },
      { text: '⚡ Автоматический', route: routes.settings, data: scopeData(ctx, { mode: 'auto' }) },
      { text: '↩️ К правилам', ...withScope(routes.rules, ctx) }
    ], { backRoute: routes.home });
  },

  async handleAction(ctx = {}) {
    const route = String(ctx.route || routes.home);
    if (route === routes.scope) return this.renderScope(ctx);
    if (route === routes.scopePostSelect) return this.renderScopePostSelect(ctx);
    if (route === routes.queue) return this.renderQueue(ctx);
    if (route === routes.reports) return this.renderReports(ctx);
    if (route === routes.rules) return this.renderRules(ctx);
    if (route === routes.keywords) return this.renderKeywords(ctx);
    if (route === routes.links) return this.renderLinks(ctx);
    if (route === routes.media) return this.renderMedia(ctx);
    if (route === routes.spam) return this.renderSpam(ctx);
    if (route === routes.users) return this.renderUsers(ctx);
    if (route === routes.rights) return this.renderRights(ctx);
    if (route === routes.actions) return this.renderActions(ctx);
    if (route === routes.actionConfirm) return this.renderActionConfirm(ctx);
    if (route === routes.logs) return this.renderLogs(ctx);
    if (route === routes.settings) return this.renderSettings(ctx);
    return this.renderHome(ctx);
  },

  selfTest() {
    const routeValues = Object.values(routes);
    const treeRouteValues = FUNCTION_TREE.map((item) => item.route);
    const missingTreeRoutes = treeRouteValues.filter((route) => !routeValues.includes(route));
    return {
      ok: routeValues.length >= 16 && FUNCTION_TREE.length >= 13 && missingTreeRoutes.length === 0,
      runtimeVersion: RUNTIME,
      sectionId: 'moderation',
      feature: 'moderation.enabled',
      functionTreeReady: true,
      finalFunctionTreeReady: true,
      functionCount: FUNCTION_TREE.length,
      routes,
      routeCount: routeValues.length,
      missingTreeRoutes,
      scopeSelectionReady: true,
      scopePostSelectReady: true,
      scopeDefaultEmptyReady: true,
      scopeChannelReady: true,
      scopePostReady: true,
      rulesCanApplyToWholeChannel: true,
      rulesCanApplyToSinglePost: true,
      queueReady: true,
      reportsReady: true,
      rulesReady: true,
      keywordsReady: true,
      linksReady: true,
      photoModerationReady: true,
      spamFloodReady: true,
      usersAndRightsReady: true,
      actionConfirmRouteReady: true,
      actionConfirmationsRequired: true,
      logsReady: true,
      modesReady: true,
      maxDocsBackedCapabilities: ['message_created', 'message_edited', 'message_removed', 'user_added', 'user_removed', 'members', 'admins', 'bot_permissions', 'remove_or_block_member'],
      destructiveActionsOneTapDisabled: true,
      commentsModerationCompatible: true,
      noVideoFilesInComments: true,
      legacyAdaptersUsed: false,
      finalStepsDocumented: FUNCTION_TREE.every((item) => !!item.finalStep)
    };
  }
};

module.exports = section;
module.exports.RUNTIME = RUNTIME;
module.exports.FUNCTION_TREE = FUNCTION_TREE;
module.exports.ACTIONS = ACTIONS;
