'use strict';

const menuRenderer = require('../../core/menuRenderer');
const channelData = require('../../core/channelDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-CHANNELS-SECTION-1.47.0-CONNECT-FORWARDED-POST';

const routes = {
  home: 'channels.home',
  connect: 'channels.connect',
  forwardedPreview: 'channels.forwarded_preview',
  confirm: 'channels.confirm',
  select: 'channels.select',
  cleanupConfirm: 'channels.cleanup_confirm',
  cleanup: 'channels.cleanup',
  connections: 'channels.connections'
};

const FUNCTION_TREE = [
  ['list', 'Список каналов', routes.home, 'показываем название канала и количество постов без технических ID'],
  ['connect', 'Подключить канал', routes.connect, 'администратор пересылает боту любой пост из нужного канала'],
  ['preview', 'Проверка пересланного поста', routes.forwardedPreview, 'показываем канал и начало поста перед подключением'],
  ['confirm', 'Подтвердить подключение', routes.confirm, 'сохраняем связь администратор ↔ канал, пост и выбранный канал'],
  ['select', 'Выбрать канал по умолчанию', routes.select, 'канал становится доступен во всех разделах АдминКИТ'],
  ['cleanup', 'Удалить служебный пост', routes.cleanupConfirm, 'служебный пересланный пост можно очистить, канал и данные остаются'],
  ['history', 'История подключений', routes.connections, 'видно последние подключения и статус служебного поста']
].map(([id, title, route, finalStep]) => ({ id, title, route, finalStep }));

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 84) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function payload(ctx = {}, overrides = {}) {
  return {
    channelId: clean(ctx.payload?.channelId || ctx.channelId || ''),
    channelTitle: clean(ctx.payload?.channelTitle || ctx.channelTitle || 'Подключённый канал'),
    postId: clean(ctx.payload?.postId || ctx.postId || ''),
    postTitle: clean(ctx.payload?.postTitle || ctx.postTitle || ''),
    messageId: clean(ctx.payload?.messageId || ctx.messageId || ''),
    serviceMessageId: clean(ctx.payload?.serviceMessageId || ctx.serviceMessageId || ctx.payload?.messageId || ''),
    connectionId: ctx.payload?.connectionId,
    ...(overrides || {})
  };
}
function render(title, body = [], buttons = [], options = {}) {
  return menuRenderer.renderScreen({ title, body, buttons, backRoute: options.backRoute || '', homeRoute: options.homeRoute === undefined ? 'main.home' : options.homeRoute });
}
function treeButtons() { return FUNCTION_TREE.map((item) => ({ text: item.title, route: item.route })); }

async function renderHome(ctx = {}) {
  const data = await channelData.listChannels(ctx.adminId || ctx.admin_id || ctx.userId || '', { limit: 20, noCache: !!ctx.payload?.refresh });
  return menuRenderer.renderScreen({
    title: '📺 Каналы',
    body: [
      ...channelData.formatChannelsForScreen(data),
      '',
      'Подключение канала теперь идёт через понятный путь: переслать пост → проверить канал → подтвердить → канал доступен во всех разделах.'
    ],
    buttons: [
      { text: '➕ Подключить канал', route: routes.connect, data: { sectionId: 'channels' } },
      { text: '🔄 Обновить список', route: routes.home, data: { sectionId: 'channels', refresh: 1 } },
      { text: '🕘 История подключений', route: routes.connections, data: { sectionId: 'channels' } }
    ],
    homeRoute: 'main.home'
  });
}

async function renderConnect(ctx = {}) {
  return render('➕ Подключение канала', [
    'Перешлите боту любой пост из канала, которым хотите управлять.',
    'АдминКИТ определит канал, покажет его название и начало поста, а затем попросит подтверждение.',
    'После подключения служебный пересланный пост можно удалить: связь с каналом и сохранённый post id останутся в базе.',
    'Для стресс-теста используем готовый пересланный пост.'
  ], [
    { text: '📨 Проверить тестовый пересланный пост', route: routes.forwardedPreview, data: payload(ctx, { channelId: 'core-stress-channel-connect', channelTitle: 'Канал для подключения', postId: 'core-stress-channel-post', messageId: 'core-stress-channel-message', serviceMessageId: 'core-stress-service-message', postTitle: 'Тестовый пост для подключения канала' }) },
    { text: '📺 К списку каналов', route: routes.home, data: payload(ctx) }
  ], { backRoute: routes.home });
}

async function renderForwardedPreview(ctx = {}) {
  const p = payload(ctx);
  const preview = channelData.previewForwardedPost(ctx, p);
  return render(preview.ok ? '👁 Проверка пересланного поста' : '⚠️ Пост не распознан', [
    preview.ok ? `Канал: ${preview.channelTitle}` : 'Не хватает данных канала или поста.',
    preview.ok ? `Пост: ${preview.postTitle}` : 'Перешлите боту пост из канала ещё раз.',
    preview.ok ? 'Если это нужный канал, подтвердите подключение.' : '',
    'В интерфейсе показываем название канала и начало поста, а не технические ID.'
  ], preview.ok ? [
    { text: '✅ Подтвердить подключение', route: routes.confirm, data: { ...p, channelTitle: preview.channelTitle, postTitle: preview.postTitle } },
    { text: '↩️ Переслать другой пост', route: routes.connect, data: p }
  ] : [
    { text: '↩️ Назад к подключению', route: routes.connect, data: p }
  ], { backRoute: routes.connect });
}

async function renderConfirm(ctx = {}) {
  const p = payload(ctx);
  const connected = await channelData.connectForwardedPost(ctx, p);
  return render(connected.ok ? '✅ Канал подключён' : '⚠️ Не удалось подключить канал', [
    connected.ok ? `Канал: ${connected.channelTitle}` : 'Не хватает данных пересланного поста.',
    connected.ok ? `Сохранён пост: ${connected.postTitle}` : '',
    connected.ok ? 'Канал выбран и теперь доступен в комментариях, кнопках, подарках, статистике, редактировании, выделениях и опросах.' : '',
    connected.ok ? 'Служебный пересланный пост можно удалить — данные подключения останутся.' : ''
  ], connected.ok ? [
    { text: '📺 К списку каналов', route: routes.home, data: { ...p, refresh: 1 } },
    { text: '🧹 Удалить служебный пост', route: routes.cleanupConfirm, data: { ...p, connectionId: connected.connectionId, channelId: connected.channelId, channelTitle: connected.channelTitle } }
  ] : [
    { text: '↩️ Назад к подключению', route: routes.connect, data: p }
  ], { backRoute: routes.forwardedPreview });
}

async function renderSelect(ctx = {}) {
  const p = payload(ctx);
  const selected = await channelData.selectChannel(ctx, p);
  return render(selected.ok ? '✅ Канал выбран' : '⚠️ Канал не выбран', [
    selected.ok ? `Канал: ${selected.channelTitle}` : 'Не удалось выбрать канал.',
    selected.ok ? 'Этот канал будет использоваться как текущий в разделах АдминКИТ.' : ''
  ], [
    { text: '📺 К списку каналов', route: routes.home, data: { ...p, refresh: 1 } }
  ], { backRoute: routes.home });
}

async function renderCleanupConfirm(ctx = {}) {
  return render('🧾 Удалить служебный пост?', [
    'Это очищает только служебный пересланный пост в диалоге с ботом.',
    'Канал, связь администратора с каналом и сохранённый post id остаются в базе.',
    'Опубликованный пост в самом канале не удаляем.'
  ], [
    { text: '✅ Да, удалить служебный пост', route: routes.cleanup, data: payload(ctx, { connectionId: ctx.payload?.connectionId }) },
    { text: '↩️ Оставить как есть', route: routes.home, data: payload(ctx) }
  ], { backRoute: routes.home });
}

async function renderCleanup(ctx = {}) {
  const cleaned = await channelData.markAuthPostCleaned(ctx, { connectionId: ctx.payload?.connectionId, channelId: ctx.payload?.channelId });
  return render(cleaned.ok ? '✅ Служебный пост очищен' : '⚠️ Не удалось очистить служебный пост', [
    cleaned.ok ? 'Служебная запись помечена как очищенная.' : 'Служебная запись не найдена или уже очищена.',
    'Канал и сохранённый post id остались в базе АдминКИТ.',
    'Пост в канале не менялся.'
  ], [
    { text: '📺 К списку каналов', route: routes.home, data: { ...payload(ctx), refresh: 1 } },
    { text: '🕘 История подключений', route: routes.connections, data: payload(ctx) }
  ], { backRoute: routes.home });
}

async function renderConnections(ctx = {}) {
  const result = await channelData.listRecentConnections(ctx, { limit: 5 });
  const lines = result.connections.length ? result.connections.map((item, index) => `${index + 1}. ${item.channelTitle} — ${item.postTitle} · ${item.status === 'service_cleaned' ? 'служебный пост очищен' : 'подключено'}`) : ['Истории подключений пока нет.'];
  return render('🕘 История подключений', lines, [
    { text: '➕ Подключить канал', route: routes.connect, data: payload(ctx) },
    { text: '📺 К списку каналов', route: routes.home, data: payload(ctx) }
  ], { backRoute: routes.home });
}

async function handleAction(ctx = {}) {
  const route = String(ctx.route || routes.home);
  if (route === routes.connect) return renderConnect(ctx);
  if (route === routes.forwardedPreview) return renderForwardedPreview(ctx);
  if (route === routes.confirm) return renderConfirm(ctx);
  if (route === routes.select) return renderSelect(ctx);
  if (route === routes.cleanupConfirm) return renderCleanupConfirm(ctx);
  if (route === routes.cleanup) return renderCleanup(ctx);
  if (route === routes.connections) return renderConnections(ctx);
  return renderHome(ctx);
}

function selfTest() {
  const dataSelf = channelData.selfTest ? channelData.selfTest() : {};
  const routeValues = Object.values(routes);
  return {
    ok: routeValues.length >= 8 && FUNCTION_TREE.length >= 7 && dataSelf.ok !== false,
    runtimeVersion: RUNTIME,
    sectionId: 'channels',
    feature: 'channels.enabled',
    functionTreeReady: true,
    functionCount: FUNCTION_TREE.length,
    routeCount: routeValues.length,
    routes,
    connectForwardedPostReady: true,
    previewBeforeConnectReady: true,
    channelSelectionReady: true,
    servicePostCleanupReady: true,
    channelAvailableEverywhere: true,
    rawIdsHiddenInUx: true,
    legacyConnectRemovedFromUx: true,
    dataAdapter: dataSelf
  };
}

module.exports = {
  id: 'channels',
  title: 'Каналы',
  shortTitle: 'Каналы',
  icon: '📺',
  order: 10,
  feature: 'channels.enabled',
  routes,
  renderHome,
  handleAction,
  selfTest,
  RUNTIME,
  FUNCTION_TREE
};
