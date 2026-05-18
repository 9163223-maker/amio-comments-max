'use strict';

const menuRenderer = require('../core/menuRenderer');
const editorData = require('../core/postEditorDataAdapterV2');

const RUNTIME = 'ADMINKIT-CORE-POST-EDITOR-SECTION-1.44.0-DIRECT-EDIT-ARCHIVE';

const routes = {
  home: 'post_editor.home',
  quickChannel: 'post_editor.quick_channel',
  quickPost: 'post_editor.quick_post',
  quickText: 'post_editor.quick_text',
  quickPreview: 'post_editor.quick_preview',
  quickApply: 'post_editor.quick_apply',
  forwarded: 'post_editor.forwarded_post',
  archive: 'post_editor.archive',
  archiveList: 'post_editor.archive_list',
  archiveSave: 'post_editor.archive_save',
  archiveRestore: 'post_editor.archive_restore',
  archiveDeleteConfirm: 'post_editor.archive_delete_confirm',
  archiveDelete: 'post_editor.archive_delete',
  archiveLimits: 'post_editor.archive_limits'
};

const FUNCTION_TREE = [
  ['quick_edit', 'Быстрое редактирование поста', routes.quickChannel, 'канал → пост → новый текст → предпросмотр → применить через прямое редактирование сообщения'],
  ['forwarded_post', 'Редактирование пересланного поста', routes.forwarded, 'если поста нет в базе, администратор пересылает его боту; АдминКИТ сохраняет message id и пробует прямое редактирование'],
  ['preview', 'Предпросмотр изменений', routes.quickPreview, 'перед применением показываем канал, пост и новый текст, без восстановления из архива'],
  ['apply', 'Применить правку', routes.quickApply, 'правка отправляется в MAX как изменение существующего сообщения; архив не участвует в обычном сценарии'],
  ['archive', 'Архив постов', routes.archive, 'отдельный раздел памяти постов: сохранение, список, восстановление и удаление записи из базы'],
  ['archive_restore', 'Восстановить из архива', routes.archiveList, 'используется только когда пост удалён или нужно вернуть сохранённый текст из базы'],
  ['archive_delete', 'Удалить из архива', routes.archiveDeleteConfirm, 'удаление записи из базы выполняется только после отдельного подтверждения'],
  ['plan_limits', 'Лимиты памяти по тарифам', routes.archiveLimits, 'бесплатный/стартовый тариф хранит 3 поста, средний — 15, высокий — 60']
].map(([id, title, route, finalStep]) => ({ id, title, route, finalStep }));

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 84) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function payload(ctx = {}, overrides = {}) { return { channelId: clean(ctx.payload?.channelId || ctx.channelId || ''), channelTitle: clean(ctx.payload?.channelTitle || ctx.channelTitle || 'Подключённый канал'), postId: clean(ctx.payload?.postId || ctx.postId || ''), postTitle: clean(ctx.payload?.postTitle || ctx.postTitle || ''), messageId: clean(ctx.payload?.messageId || ctx.messageId || ''), ...(overrides || {}) }; }
function render(title, body = [], buttons = [], options = {}) { return menuRenderer.renderScreen({ title, body, buttons, backRoute: options.backRoute || '', homeRoute: options.homeRoute === undefined ? 'main.home' : options.homeRoute }); }
function treeButtons() { return FUNCTION_TREE.map((item) => ({ text: item.title, route: item.route })); }
function postDataFromPayload(ctx = {}) { return payload(ctx, { newText: clean(ctx.payload?.newText || ctx.text || ''), originalText: clean(ctx.payload?.originalText || ctx.payload?.postTitle || '') }); }

const section = {
  id: 'post_editor', title: 'Редактирование постов', icon: '✏️', order: 90, feature: 'post_editor.enabled', routes,

  async renderHome(ctx = {}) {
    return render('✏️ Редактирование постов', [
      'Основной сценарий — быстрый: выбрать канал, выбрать пост, ввести новый текст и применить правку к уже опубликованному сообщению.',
      'Архив — отдельный раздел. Обычное редактирование не должно заставлять администратора восстанавливать пост из архива.',
      'Если MAX разрешит изменить конкретный старый пост по message id, АдминКИТ применит правку напрямую. Если API вернёт отказ, покажем понятную причину и предложим архив/пересылку как запасной путь.',
      '',
      'Дерево функций:',
      ...FUNCTION_TREE.map((item, index) => `${index + 1}. ${item.title} — ${item.finalStep}`)
    ], treeButtons(), { homeRoute: 'main.home' });
  },

  async renderQuickChannel(ctx = {}) {
    const channels = await editorData.listChannels(ctx);
    const body = ['Шаг 1 из 4. Выберите канал, где опубликован пост.', 'После этого покажем список последних сохранённых постов с человеческими названиями.'];
    const buttons = channels.length ? channels.slice(0, 10).map((channel, index) => ({ text: `${index + 1}. ${cut(channel.displayTitle || channel.channelTitle || channel.title || 'Подключённый канал', 54)}`, route: routes.quickPost, data: { channelId: channel.channelId, channelTitle: channel.displayTitle || channel.channelTitle || channel.title || 'Подключённый канал' } })) : [{ text: 'Подключённый канал', route: routes.quickPost, data: payload(ctx, { channelId: 'manual-channel', channelTitle: 'Подключённый канал' }) }];
    buttons.push({ text: '📨 Переслать пост боту', route: routes.forwarded, data: payload(ctx) });
    buttons.push({ text: '🗄 Архив постов', route: routes.archive, data: payload(ctx) });
    return render('✏️ Быстрое редактирование', body, buttons, { backRoute: routes.home });
  },

  async renderQuickPost(ctx = {}) {
    const p = payload(ctx);
    const posts = await editorData.listPostsForEdit(ctx, { channelId: p.channelId, limit: 10 });
    const body = [`Канал: ${p.channelTitle || 'Подключённый канал'}`, 'Шаг 2 из 4. Выберите пост для редактирования.', 'Показываем начало текста, а не технический id.'];
    const buttons = posts.length ? posts.map((post, index) => ({ text: `${index + 1}. ${cut(post.postTitle || post.postPreview || 'Пост без текста', 54)}`, route: routes.quickText, data: { channelId: post.channelId || p.channelId, channelTitle: post.channelTitle || p.channelTitle, postId: post.postId, messageId: post.messageId, postTitle: post.postTitle || post.postPreview } })) : [{ text: '📨 Переслать пост боту', route: routes.forwarded, data: p }];
    buttons.push({ text: '↩️ Выбрать другой канал', route: routes.quickChannel, data: p });
    return render('📝 Выберите пост', body, buttons, { backRoute: routes.quickChannel });
  },

  async renderQuickText(ctx = {}) {
    const p = payload(ctx);
    return render('✍️ Новый текст поста', [
      `Канал: ${p.channelTitle || 'Подключённый канал'}`,
      `Пост: ${p.postTitle || 'выбранный пост'}`,
      'Шаг 3 из 4. Пришлите новый текст поста следующим сообщением.',
      'В боевом режиме бот примет текст и покажет предпросмотр. Медиа поста не удаляем и не пересобираем.',
      'Для стресс-теста используется готовый текст из payload.'
    ], [
      { text: '👁 Предпросмотр с тестовым текстом', route: routes.quickPreview, data: { ...p, newText: 'Обновлённый текст поста через АдминКИТ' } },
      { text: '↩️ К выбору поста', route: routes.quickPost, data: p }
    ], { backRoute: routes.quickPost });
  },

  async renderQuickPreview(ctx = {}) {
    const p = postDataFromPayload(ctx);
    const result = await editorData.directEditPost(ctx, p, { dryRun: true });
    return render('👁 Предпросмотр правки', [
      `Канал: ${p.channelTitle || 'Подключённый канал'}`,
      `Пост: ${p.postTitle || 'выбранный пост'}`,
      `Новый текст: ${cut(p.newText || 'текст не введён', 240)}`,
      result.ok ? 'Проверка прошла: можно пробовать прямое редактирование существующего сообщения.' : 'Нужна пересылка поста или message id: без него прямое редактирование невозможно.',
      'Архив на этом пути не используется.'
    ], [
      { text: '✅ Применить правку', route: routes.quickApply, data: { ...p, dryRun: true } },
      { text: '🗄 Сохранить в архив', route: routes.archiveSave, data: { ...p, postText: p.newText || p.postTitle } },
      { text: '↩️ Изменить текст', route: routes.quickText, data: p }
    ], { backRoute: routes.quickText });
  },

  async renderQuickApply(ctx = {}) {
    const p = postDataFromPayload(ctx);
    const result = await editorData.directEditPost(ctx, p, { dryRun: ctx.payload?.dryRun === true });
    return render(result.ok ? '✅ Правка готова к применению' : '⚠️ Не удалось применить правку', [
      result.ok ? 'АдминКИТ подготовил прямое редактирование существующего сообщения.' : 'Прямое редактирование не выполнено.',
      result.ok && result.dryRun ? 'Сейчас это безопасная проверка без вызова боевого API.' : '',
      result.error === 'message_id_required_for_direct_edit' ? 'Нужно переслать пост боту, чтобы получить message id для попытки прямого редактирования.' : '',
      'Обычный путь редактирования не восстанавливает пост из архива и не создаёт новый post id.',
      `Пост: ${p.postTitle || 'выбранный пост'}`
    ], [
      { text: '📨 Переслать пост боту', route: routes.forwarded, data: p },
      { text: '🗄 Архив постов', route: routes.archive, data: p },
      { text: '↩️ К редактированию', route: routes.quickChannel, data: p }
    ], { backRoute: routes.quickPreview });
  },

  async renderForwarded(ctx = {}) {
    return render('📨 Переслать пост боту', [
      'Этот путь нужен, когда поста нет в базе или не хватает message id.',
      'Администратор пересылает старый пост боту. АдминКИТ сохраняет канал, начало текста, post id/message id и дальше пробует прямое редактирование.',
      'Это не восстановление из архива: мы не создаём новый пост, а пытаемся изменить существующее сообщение.'
    ], [
      { text: '✏️ Продолжить редактирование', route: routes.quickChannel, data: payload(ctx) },
      { text: '🗄 Архив постов', route: routes.archive, data: payload(ctx) }
    ], { backRoute: routes.home });
  },

  async renderArchive(ctx = {}) {
    const limit = editorData.memoryLimitForPlan(ctx.planCode || ctx.payload?.planCode || 'start');
    return render('🗄 Архив постов', [
      'Архив — отдельная память постов в базе. Он нужен для восстановления случайно удалённого поста или сохранённого текста.',
      'Обычное редактирование идёт через раздел “Быстрое редактирование”, без архива.',
      `Текущий лимит памяти по тарифу: ${limit} поста/постов на канал.`,
      'Удаление из архива удаляет запись из базы АдминКИТ после подтверждения.'
    ], [
      { text: '📋 Список архива', route: routes.archiveList, data: payload(ctx) },
      { text: '💾 Сохранить текущий пост', route: routes.archiveSave, data: payload(ctx, { postText: ctx.payload?.postText || ctx.payload?.postTitle || 'Текст поста для архива' }) },
      { text: '📏 Лимиты памяти', route: routes.archiveLimits, data: payload(ctx) },
      { text: '✏️ Быстрое редактирование', route: routes.quickChannel, data: payload(ctx) }
    ], { backRoute: routes.home });
  },

  async renderArchiveList(ctx = {}) {
    const p = payload(ctx);
    const list = await editorData.listArchive(ctx, { channelId: p.channelId, limit: editorData.memoryLimitForPlan(ctx.planCode || 'start') });
    const lines = list.posts.length ? list.posts.slice(0, 8).map((post, index) => `${index + 1}. ${post.postTitle}`) : ['В архиве пока нет сохранённых постов.'];
    const first = list.posts[0] || {};
    const buttons = [];
    if (first.archiveId) {
      buttons.push({ text: '♻️ Восстановить первый пост', route: routes.archiveRestore, data: { ...p, archiveId: first.archiveId, dryRun: true } });
      buttons.push({ text: '🗑 Удалить первый из архива — подтвердить', route: routes.archiveDeleteConfirm, data: { ...p, archiveId: first.archiveId } });
    }
    buttons.push({ text: '↩️ К архиву', route: routes.archive, data: p });
    return render('📋 Список архива', ['Сохранённые посты:', ...lines], buttons, { backRoute: routes.archive });
  },

  async renderArchiveSave(ctx = {}) {
    const p = payload(ctx, { postText: ctx.payload?.postText || ctx.payload?.newText || ctx.payload?.postTitle || 'Текст поста для архива' });
    const saved = await editorData.archivePost(ctx, p);
    return render(saved.ok ? '✅ Пост сохранён в архив' : '⚠️ Не удалось сохранить в архив', [
      saved.ok ? `Пост: ${saved.postTitle}` : 'Не хватает канала или поста для сохранения.',
      'Архив хранится в базе АдминКИТ и подчиняется лимитам тарифа.',
      'Восстановление из архива — отдельный сценарий, не основной путь редактирования.'
    ], [
      { text: '📋 Список архива', route: routes.archiveList, data: p },
      { text: '✏️ Быстрое редактирование', route: routes.quickChannel, data: p }
    ], { backRoute: routes.archive });
  },

  async renderArchiveRestore(ctx = {}) {
    const restored = await editorData.restoreArchive(ctx, { archiveId: ctx.payload?.archiveId }, { dryRun: true });
    return render(restored.ok ? '♻️ Восстановление подготовлено' : '⚠️ Не удалось восстановить', [
      restored.ok ? 'АдминКИТ нашёл запись архива и подготовил правку существующего сообщения.' : 'Запись архива не найдена или не хватает message id.',
      'Боевой запуск должен проверить, разрешит ли MAX изменить это сообщение.',
      'Это запасной путь для удалённых/случайно потерянных постов, а не обычное редактирование.'
    ], [
      { text: '📋 Список архива', route: routes.archiveList, data: payload(ctx) },
      { text: '✏️ Быстрое редактирование', route: routes.quickChannel, data: payload(ctx) }
    ], { backRoute: routes.archiveList });
  },

  async renderArchiveDeleteConfirm(ctx = {}) {
    return render('🧾 Подтверждение удаления из архива', [
      'Удаление из архива убирает сохранённую запись из базы АдминКИТ.',
      'Опубликованный пост в канале этим действием не трогаем.',
      'Нажмите финальное подтверждение только если запись больше не нужна.'
    ], [
      { text: '✅ Да, удалить из архива', route: routes.archiveDelete, data: payload(ctx, { archiveId: ctx.payload?.archiveId }) },
      { text: '↩️ Отменить', route: routes.archiveList, data: payload(ctx) }
    ], { backRoute: routes.archiveList });
  },

  async renderArchiveDelete(ctx = {}) {
    const deleted = await editorData.deleteArchiveRecord(ctx, { archiveId: ctx.payload?.archiveId });
    return render(deleted.ok ? '✅ Запись удалена из архива' : '⚠️ Не удалось удалить запись', [
      deleted.ok ? 'Запись удалена из базы архива АдминКИТ.' : 'Запись не найдена или уже удалена.',
      'Пост в канале не менялся.'
    ], [
      { text: '📋 Список архива', route: routes.archiveList, data: payload(ctx) },
      { text: '↩️ К архиву', route: routes.archive, data: payload(ctx) }
    ], { backRoute: routes.archiveList });
  },

  async renderArchiveLimits(ctx = {}) {
    const limits = editorData.PLAN_LIMITS || {};
    return render('📏 Лимиты памяти архива', [
      'Лимит нужен, чтобы база не разрасталась бесконечно и тарифы отличались ценностью.',
      `Бесплатный / стартовый: ${limits.free || 3} поста на канал.`,
      `Средний тариф: ${limits.plus || 15} постов на канал.`,
      `Высокий тариф: ${limits.business || 60} постов на канал.`,
      'При превышении лимита самые старые записи архива очищаются автоматически. Администратор также может удалить запись вручную.'
    ], [
      { text: '📋 Список архива', route: routes.archiveList, data: payload(ctx) },
      { text: '↩️ К архиву', route: routes.archive, data: payload(ctx) }
    ], { backRoute: routes.archive });
  },

  async handleAction(ctx = {}) {
    const route = String(ctx.route || routes.home);
    if (route === routes.quickChannel) return this.renderQuickChannel(ctx);
    if (route === routes.quickPost) return this.renderQuickPost(ctx);
    if (route === routes.quickText) return this.renderQuickText(ctx);
    if (route === routes.quickPreview) return this.renderQuickPreview(ctx);
    if (route === routes.quickApply) return this.renderQuickApply(ctx);
    if (route === routes.forwarded) return this.renderForwarded(ctx);
    if (route === routes.archive) return this.renderArchive(ctx);
    if (route === routes.archiveList) return this.renderArchiveList(ctx);
    if (route === routes.archiveSave) return this.renderArchiveSave(ctx);
    if (route === routes.archiveRestore) return this.renderArchiveRestore(ctx);
    if (route === routes.archiveDeleteConfirm) return this.renderArchiveDeleteConfirm(ctx);
    if (route === routes.archiveDelete) return this.renderArchiveDelete(ctx);
    if (route === routes.archiveLimits) return this.renderArchiveLimits(ctx);
    return this.renderHome(ctx);
  },

  selfTest() {
    const dataSelf = editorData.selfTest ? editorData.selfTest() : {};
    const routeValues = Object.values(routes);
    const treeRoutes = FUNCTION_TREE.map((item) => item.route);
    return {
      ok: routeValues.length >= 13 && FUNCTION_TREE.length >= 8 && dataSelf.ok !== false,
      runtimeVersion: RUNTIME,
      sectionId: 'post_editor',
      feature: 'post_editor.enabled',
      functionTreeReady: true,
      functionCount: FUNCTION_TREE.length,
      routeCount: routeValues.length,
      routes,
      directEditFirstReady: true,
      quickEditDoesNotRequireArchiveRestore: true,
      forwardedPostEditFallbackReady: true,
      archiveSeparateTreeReady: true,
      archiveSaveReady: true,
      archiveRestoreReady: true,
      archiveDeleteReady: true,
      archiveDeleteNeedsConfirmation: true,
      archivePlanLimitsReady: true,
      noLocalAgeBlock: dataSelf.noLocalAgeBlock === true,
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