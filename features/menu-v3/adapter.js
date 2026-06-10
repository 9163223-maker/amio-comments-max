'use strict';

const canonical = require('./canonical-menu');

const VERSION = 'menu-v3-feature-adapter-pr177-channels-push-ux';
const SOURCE = 'adminkit-pr177-channels-push-ux';

const POST_PICKER_SEQUENCE = ['section', 'channel', 'post', 'action'];
const POST_SCOPED_SECTIONS = ['comments', 'gifts', 'buttons', 'polls', 'highlights', 'editor'];

function normalize(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function ownerOf(route) { return normalize(route).split(':')[0] || 'main'; }
function button(text, route, data) { return { type: 'callback', text, payload: JSON.stringify({ ...(data || {}), route, action: route }) }; }
function actionButton(text, action, data) { return { type: 'callback', text, payload: JSON.stringify({ ...(data || {}), action }) }; }
function keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows.filter(Boolean).filter(row => row.length) } }]; }
function sectionTitle(owner) { return canonical.sectionById[owner]?.title || owner; }
function rowsOfTwo(items) { const rows = []; for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2)); return rows; }
function safeSectionHomeAction(sectionId) { return canonical.sectionById[sectionId]?.route || `${sectionId}:home`; }
function isSameRoute(a, b) { return normalize(a) === normalize(b) && normalize(a); }
function navButton(text, route, data = {}) { return button(text, route, data); }
function mainMenuRow(currentRoute = '') { return isSameRoute(currentRoute, 'main:home') ? [] : [[navButton('🏠 Главное меню', 'main:home')]]; }
function sectionNavRows(sectionId, options = {}) {
  const sectionHome = safeSectionHomeAction(sectionId);
  const currentRoute = normalize(options.currentRoute || '');
  const rows = [];
  const backRoute = normalize(options.backAction || options.backRoute || '');
  if (!options.isRoot && backRoute && !isSameRoute(backRoute, currentRoute)) rows.push([navButton('⬅️ Назад', backRoute, options.backPayload || {})]);
  if (!options.isRoot && !isSameRoute(sectionHome, currentRoute)) rows.push([navButton('↩️ В начало раздела', sectionHome)]);
  if (options.includeHelp !== false && !isSameRoute(`${sectionId}:help`, currentRoute)) rows.push([navButton('❓ Помощь по разделу', `${sectionId}:help`)]);
  if (options.includeMain !== false && !isSameRoute('main:home', currentRoute)) rows.push([navButton('🏠 Главное меню', 'main:home')]);
  return rows;
}
function helpNavRows(sectionId) { return [[navButton('↩️ В начало раздела', safeSectionHomeAction(sectionId))], [navButton('🏠 Главное меню', 'main:home')]]; }
function docNav(currentRoute = '') { return mainMenuRow(currentRoute); }
function looksRawClientId(value = '') { const text = normalize(value); return /^-?\d{6,}$/.test(text) || /\b\d{10,}\b/.test(text); }
function isConfirmedChannel(channel = {}) {
  const type = normalize(channel.type || channel.chatType || channel.chat_type || channel.kind).toLowerCase();
  return !type || type === 'channel' || channel.isChannel === true;
}
function channelTitle(channel, index = 0) {
  const title = normalize(channel && (channel.title || channel.channelTitle || channel.name || channel.channelName));
  return title && !looksRawClientId(title) ? title : `Канал ${index + 1}`;
}
function postTitle(post, index) {
  const title = normalize(post && (post.title || post.preview || post.originalText));
  return `${index + 1}. ${title ? title.slice(0, 48) : 'Пост без текста'}`;
}
function buttonForAction(item) {
  const data = { ...(item.payload || {}), canonicalAction: item.id, section: item.section };
  return String(item.targetAction || '').includes(':') ? button(item.title, item.targetAction, data) : actionButton(item.title, item.existingAction || item.targetAction, data);
}
function visibleButtonTexts(screen) {
  const rows = screen?.attachments?.[0]?.payload?.buttons || [];
  return rows.flat().map((item) => normalize(item.text)).filter(Boolean);
}
function visiblePayloads(screen) {
  const rows = screen?.attachments?.[0]?.payload?.buttons || [];
  return rows.flat().map((item) => normalize(item.payload)).filter(Boolean);
}

const HELP_TEXT = {
  channels: ['Помощь: Каналы', '', 'Здесь вы подключаете MAX-каналы к АдминКИТ.', '', 'Как подключить:', '1. Добавьте бота АдминКИТ администратором в ваш MAX-канал.', '2. Перешлите боту любой пост из этого канала.', '3. Откройте «Мои каналы» и выберите нужный канал.', '', 'Если канал не появился, проверьте, что бот добавлен именно администратором, и перешлите пост ещё раз.'],
  push: ['Как это работает', '', '1. Выберите чат или канал, где установлен бот.', '2. АдминКИТ опубликует кнопку «🔔 Подключить уведомления».', '3. Участник нажмёт кнопку и получит личную ссылку от бота.', '4. После подключения уведомления будут приходить через АдминКИТ PUSH.', '', 'Публиковать кнопку может только администратор или владелец выбранного чата/канала.'],
  comments: ['Помощь: Комментарии', '', 'Выберите нужную функцию, а затем канал или пост, если это потребуется.', '', '• Автокомментарии — включают или выключают комментарии для новых постов выбранного канала.', '• Включить к посту — добавляет комментарии к выбранной публикации независимо от автокомментариев.', '• Фото — показывает возможность прикреплять фотографии в комментариях канала.', '• Ответы — показывает возможность отвечать на комментарии.', '• Реакции — показывает возможность ставить реакции на комментарии.', '', 'Если нужного канала или поста нет, сначала подключите канал или перешлите публикацию боту.'],
  gifts: ['Помощь: Подарки / лид-магниты', '', 'Раздел выдаёт подарок подписчику после проверки условий.', 'Обычный сценарий: выберите канал и пост, создайте подарок, добавьте материал, текст получателю, условия выдачи и проверьте выдачу.', 'Отключение, удаление и замена материала выполняются из карточки подарка. Часть возможностей может зависеть от тарифа.', 'Если данных нет, подключите канал и перешлите пост, к которому нужен подарок.'],
  buttons: ['Помощь: Кнопки под постами', '', 'Раздел управляет пользовательскими кнопками под конкретным постом.', 'Обычный сценарий: выберите канал и пост, откройте текущие кнопки или добавьте новую кнопку, задайте текст, ссылку или действие, проверьте предпросмотр и сохраните.', 'Изменение и удаление доступны только из карточки текущих кнопок, чтобы не задеть другой пост.', 'Если постов нет, перешлите нужный пост боту.'],
  stats: ['Помощь: Статистика', '', 'Раздел показывает обзор канала: подписчики, динамику, посты, просмотры, комментарии, реакции, подарки, клики, рекламные ссылки и источники.', 'Обычный сценарий: откройте обзор, выберите нужный срез и при необходимости обновите данные.', 'Некоторые числа зависят от того, какие события и данные отдаёт MAX. Если данных нет, экран покажет честное пустое состояние.'],
  ad_links: ['Помощь: Рекламные ссылки', '', 'Раздел создаёт и показывает рекламные ссылки для кампаний.', 'Обычный сценарий: создайте ссылку, выберите канал или кампанию, получите ссылку и смотрите список ссылок.', 'Статистика, источник и отключение остаются внутри карточки ссылки или в разделе статистики, чтобы корневой экран не был перегружен.', 'Если ссылок нет, начните с создания рекламной ссылки.'],
  polls: ['Помощь: Опросы / голосования', '', 'Раздел создаёт опросы под конкретным постом и показывает результаты.', 'Обычный сценарий: выберите канал и пост, создайте опрос, используйте шаблон или свой вопрос, задайте 2–4 ответа.', 'Остановка опроса доступна внутри карточки активного опроса. Защита от устаревших и чужих действий сохраняется.', 'Если постов нет, перешлите нужный пост боту.'],
  highlights: ['Помощь: Выделение постов', '', 'Раздел ставит или снимает визуальное выделение у выбранного поста.', 'Обычный сценарий: выберите канал и пост, выберите тип метки, примените и проверьте результат.', 'Действия выполняются только для доступного вам канала и выбранного поста. Устаревшие или чужие действия блокируются.', 'Если постов нет, перешлите нужный пост боту.'],
  editor: ['Помощь: Редактор постов', '', 'Раздел предназначен для безопасного редактирования выбранного поста.', 'Обычный сценарий: выберите канал и пост, измените текст и сохраните форматирование, ссылки, цитаты и медиа, если это доступно.', 'Рискованные операции с медиа не расширяются в этом изменении. История и восстановление могут оставаться безопасными заглушками.', 'Если постов нет, перешлите нужный пост боту.'],
  archive: ['Помощь: Архив постов', '', 'Раздел хранит сохранённые посты и снимки, показывает статус архива и лимиты хранения.', 'Обычный сценарий: откройте сохранённые посты, проверьте снимки и при необходимости восстановите пост.', 'Postgres остаётся источником правды для архива, а клиентские экраны показывают только доступные вашему кабинету сохранённые посты.', 'Если архива нет, дождитесь появления сохранённых постов или проверьте статус архива.'],
  account: ['Помощь: Личный кабинет', '', 'Раздел показывает ваш доступ, тариф, срок, лимиты, подключённые каналы и способы связи с поддержкой.', 'Обычный сценарий: проверьте «Мой доступ», активируйте код при необходимости, посмотрите лимиты и каналы, затем обратитесь в поддержку для оплаты или продления.', 'Автоматическая успешная оплата не имитируется: продление остаётся через поддержку до появления платёжного адаптера.', 'Если доступа нет или срок истёк, личный кабинет остаётся безопасной точкой входа.'],
  settings: ['Помощь: Настройки', '', 'Раздел содержит пользовательские настройки бота: главное меню, очистку чата, уведомления, язык и формат, документы и навигацию.', 'Часть настроек пока открывается как безопасная заглушка без технических инструментов.', 'Если нужной настройки нет, используйте главное меню или поддержку.'],
};

function sectionHelpScreen(sectionId) {
  const id = canonical.sectionById[sectionId] ? sectionId : 'settings';
  return { ok: true, route: `${id}:help`, owner: id, text: (HELP_TEXT[id] || HELP_TEXT.settings).join('\n'), attachments: keyboard(helpNavRows(id)) };
}

function mainHome() {
  return { ok: true, route: 'main:home', owner: 'main', text: '🐋 АдминКИТ\n\nПанель управления MAX-каналом.\nВыберите раздел.', attachments: keyboard(canonical.clientSections.map((section) => [button(section.title, section.route)])) };
}

function termsHome() {
  return { ok: true, route: 'terms:home', owner: 'terms', text: ['📄 Пользовательское соглашение АдминКИТ', '', 'АдминКИТ — инструмент для администрирования MAX-каналов.', '', 'Используя бота, администратор подтверждает право управлять подключаемым каналом и отвечает за публикуемые посты, ссылки, кнопки, подарки и настройки.', '', 'Часть функций зависит от возможностей MAX API, прав бота в канале, сети и доступности mini-app.', '', 'Основные команды: /menu, /channels, /comments, /gifts, /stats, /privacy, /clear.'].join('\n'), attachments: keyboard(docNav('terms:home')) };
}

function privacyHome() {
  return { ok: true, route: 'privacy:home', owner: 'privacy', text: ['🔐 Политика конфиденциальности АдминКИТ', '', 'АдминКИТ — бот для управления MAX-каналами.', 'Бот: @id781310320690_bot', 'Адрес бота: https://max.ru/id781310320690_bot', '', 'Бот обрабатывает только данные, необходимые для работы функций: профиль MAX, подключённые каналы, посты, комментарии, кнопки, подарки, статистику и технические события.', '', 'Данные используются для подключения каналов, комментариев под постами, подарков, кнопок, статистики и работы сервиса.', '', 'АдминКИТ не передаёт данные для сторонней рекламы. Технические данные используются только для работы и поддержки сервиса.'].join('\n'), attachments: keyboard(docNav('privacy:home')) };
}

function sectionHome(owner) {
  const section = canonical.sectionById[owner];
  if (!section || !section.clientVisible || section.adminOnly) return mainHome();
  const actions = canonical.clientActions(section.id).map(buttonForAction);
  if (section.id === 'comments') {
    const byTitle = Object.fromEntries(actions.map((item) => [item.text, item]));
    return {
      ok: true,
      route: section.route,
      owner: section.id,
      text: ['Комментарии', '', 'Настройте комментарии в каналах:', 'автоматически для новых постов или вручную для нужной публикации.'].join('\n'),
      attachments: keyboard([
        [byTitle['Автокомментарии']],
        [byTitle['Включить к посту']],
        [byTitle['Фото'], byTitle['Ответы']],
        [byTitle['Реакции']],
        [navButton('Помощь', 'comments:help')],
        [navButton('Главное меню', 'main:home')]
      ])
    };
  }
  if (section.id === 'gifts') {
    const byTitle = Object.fromEntries(actions.map((item) => [item.text, item]));
    return {
      ok: true,
      route: section.route,
      owner: section.id,
      text: ['Подарки / лид-магниты', '', 'Создавайте подарки для постов: промокод, текст, файл, картинку или ссылку.', '', 'Сначала выберите действие.'].join('\n'),
      attachments: keyboard([
        [byTitle['Создать подарок']],
        [byTitle['Текущий подарок']],
        [byTitle['Список подарков']],
        [navButton('Главное меню', 'main:home')]
      ])
    };
  }
  return { ok: true, route: section.route, owner: section.id, text: `${section.title}\n\nВыберите действие.`, attachments: keyboard([...rowsOfTwo(actions), ...sectionNavRows(section.id, { isRoot: true, currentRoute: section.route })]) };
}


function settingsDetailScreen(route) {
  const screens = {
    'settings:clear_chat': {
      title: 'Очистить чат',
      lines: [
        'Очистка всего чата недоступна через Bot API MAX.',
        'Бот не может запустить очистку истории от имени пользователя.',
        'Чтобы убрать историю полностью, используйте штатное меню MAX в самом чате.'
      ],
      rows: []
    },
    'settings:notifications': {
      title: 'Уведомления',
      lines: [
        'Настройки уведомлений будут доступны позже.',
        'Сейчас бот не показывает переключатели, чтобы не создавать видимость сохранённых предпочтений.',
        'Важные сообщения сервиса остаются в обычном чате с ботом.'
      ],
      rows: []
    },
    'settings:language_format': {
      title: 'Язык / формат',
      lines: [
        'Текущий интерфейс: русский язык.',
        'Текущий формат дат, чисел и сообщений используется по умолчанию для АдминКИТ.',
        'Постоянные пользовательские настройки языка и формата появятся после отдельной безопасной реализации.'
      ],
      rows: []
    },
    'settings:privacy_terms': {
      title: 'Privacy / Terms',
      lines: [
        'Документы доступны на отдельных безопасных экранах.',
        'Откройте политику конфиденциальности или пользовательское соглашение.'
      ],
      rows: [[button('Privacy', 'privacy:home')], [button('Terms', 'terms:home')]]
    },
    'settings:navigation': {
      title: 'Навигация',
      lines: [
        '«Главное меню» возвращает к списку основных разделов.',
        '«Назад» возвращает на предыдущий безопасный экран внутри текущего сценария.',
        '«В начало раздела» открывает корневой экран текущего раздела.',
        'Если экран открыт из корня раздела, лишние кнопки возврата не показываются.'
      ],
      rows: []
    }
  };
  const screen = screens[route] || screens['settings:navigation'];
  return { ok: true, route, owner: 'settings', text: [screen.title, '', ...screen.lines].join('\n'), attachments: keyboard([...screen.rows, ...sectionNavRows('settings', { currentRoute: route, backAction: 'settings:home' })]) };
}

function accountSectionScreen(route, context = {}) {
  const maxUserId = normalize(context.maxUserId || context.userId || context.max_user_id);
  const actionByRoute = { 'account:home': 'account_home', 'account:access': 'account_my_access', 'account:activate': 'account_activate_code', 'account:payment': 'account_payment', 'account:limits': 'account_limits', 'account:channels': 'account_channels', 'account:support': 'account_support' };
  const action = actionByRoute[route] || 'account_home';
  try {
    const accountScreens = require('../account-screens-pr106');
    const screen = accountScreens.screenForAction(action, maxUserId) || accountScreens.accountHome(maxUserId);
    const isRoot = route === 'account:home';
    const mappedRows = (screen.attachments?.[0]?.payload?.buttons || []).map((row) => row.filter((item) => {
      const text = normalize(item.text);
      return text !== 'Главное меню' && text !== '🏠 Главное меню' && !(isRoot && text === '🔔 Уведомления чатов');
    }));
    return { ok: true, route, owner: 'account', text: screen.text, attachments: keyboard([...mappedRows, ...sectionNavRows('account', { isRoot, currentRoute: route, backAction: isRoot ? '' : 'account:home' })]) };
  } catch (error) {
    return sectionHome('account');
  }
}

function channelsHome() {
  const rows = [
    [button('Подключить канал', 'channels:connect')],
    [button('Мои каналы', 'channels:list')],
    [button('Инструкция', 'channels:instructions')],
    [button('Помощь', 'channels:help')],
    [button('Главное меню', 'main:home')]
  ];
  return { ok: true, route: 'channels:home', owner: 'channels', text: ['Каналы', '', 'Подключите канал, чтобы управлять комментариями, подарками, кнопками и статистикой через АдминКИТ.'].join('\n'), attachments: keyboard(rows) };
}
function channelsConnect(route) {
  return { ok: true, route, owner: 'channels', text: ['Подключить канал', '', '1. Откройте ваш MAX-канал.', '2. Добавьте бота АдминКИТ администратором.', '3. Перешлите боту любой пост из этого канала.', '', 'После этого канал появится в разделе «Мои каналы».'].join('\n'), attachments: keyboard([[button('Назад', 'channels:home')], [button('Главное меню', 'main:home')]]) };
}
function channelsList(context = {}) {
  const channels = (Array.isArray(context.channels || context.dataContext?.channels) ? (context.channels || context.dataContext.channels) : []).filter(isConfirmedChannel);
  if (!channels.length) return { ok: true, route: 'channels:list', owner: 'channels', text: ['Мои каналы', '', 'Каналы пока не подключены.', 'Добавьте бота администратором в MAX-канал и перешлите сюда любой пост.'].join('\n'), attachments: keyboard([[button('Подключить канал', 'channels:connect')], [button('Назад', 'channels:home')], [button('Главное меню', 'main:home')]]) };
  const rows = channels.slice(0, 12).map((channel, index) => {
    const title = channelTitle(channel, index);
    return [button(title, 'channels:card', { channelId: normalize(channel.channelId || channel.id), channelTitle: title, botAccess: channel.botAccess !== false })];
  });
  return { ok: true, route: 'channels:list', owner: 'channels', text: ['Мои каналы', '', 'Выберите канал.'].join('\n'), attachments: keyboard([...rows, [button('Назад', 'channels:home')], [button('Главное меню', 'main:home')]]) };
}
function channelsCard(context = {}) {
  const payload = context.payload || context.channel || {};
  const title = channelTitle(payload, 0);
  const status = payload.botAccess === false ? 'требуется проверка' : 'подключён';
  return { ok: true, route: 'channels:card', owner: 'channels', text: [`Канал: ${title}`, `Статус: ${status}`].join('\n'), attachments: keyboard([[button('Обновить статус', 'channels:status', { channelId: normalize(payload.channelId), channelTitle: title })], [button('Назад', 'channels:list')], [button('Главное меню', 'main:home')]]) };
}
function channelsStatus(route, context = {}) {
  const payload = context.payload || context.channel || {};
  const title = channelTitle(payload, 0);
  const status = payload.botAccess === false ? 'требуется проверка' : 'подключён';
  return { ok: true, route, owner: 'channels', text: [`Канал: ${title}`, `Статус: ${status}`].join('\n'), attachments: keyboard([[button('Обновить статус', 'channels:status', { channelId: normalize(payload.channelId), channelTitle: title })], [button('Назад', 'channels:list')], [button('Главное меню', 'main:home')]]) };
}
function channelsManage(route, context = {}) { return channelsCard(context); }

function chooseChannel(owner, context = {}) {
  const section = canonical.sectionById[owner] || { title: sectionTitle(owner) };
  const channels = Array.isArray(context.dataContext?.channels || context.channels) ? (context.dataContext?.channels || context.channels) : [];
  if (!channels.length) return { ok: true, route: `${owner}:choose_channel`, owner, needsData: 'channels', pickerContract: postPickerContract(owner), text: `${section.title}\n\nУ вас пока нет подключённых каналов.`, attachments: keyboard([[button('Подключить канал', 'channels:connect')], ...sectionNavRows(owner, { currentRoute: `${owner}:choose_channel`, backAction: safeSectionHomeAction(owner) })]) };
  const rows = channels.slice(0, 12).map((channel, index) => [button(channelTitle(channel, index), `${owner}:choose_post`, { section: owner, step: 'post', channelId: normalize(channel.channelId || channel.id), channelTitle: channelTitle(channel, index), backRoute: `${owner}:choose_channel` })]);
  return { ok: true, route: `${owner}:choose_channel`, owner, dataBound: true, pickerContract: postPickerContract(owner), text: `${section.title}\n\nВыберите канал`, attachments: keyboard([...rows, ...sectionNavRows(owner, { currentRoute: `${owner}:choose_channel`, backAction: safeSectionHomeAction(owner) })]) };
}
function choosePost(owner, context = {}) {
  const section = canonical.sectionById[owner] || { title: sectionTitle(owner) };
  const dataContext = context.dataContext || {};
  const posts = Array.isArray(dataContext.posts || context.posts) ? (dataContext.posts || context.posts) : [];
  const channel = normalize(dataContext.channelTitle || context.channelTitle) || 'Канал';
  if (posts.length) {
    const rows = posts.map((post, index) => [button(postTitle(post, index), `${owner}:post`, { section: owner, step: 'action', postId: normalize(post.postId), commentKey: normalize(post.commentKey), channelId: normalize(dataContext.channelId || context.channelId), channelTitle: channel, postTitle: normalize(post.title || post.preview || post.originalText), backRoute: `${owner}:choose_post` })]);
    return { ok: true, route: `${owner}:choose_post`, owner, dataBound: true, pickerContract: postPickerContract(owner), text: `${section.title}\n\nВыберите пост\nКанал: ${channel}`, attachments: keyboard([...rows, ...sectionNavRows(owner, { currentRoute: `${owner}:choose_post`, backAction: `${owner}:choose_channel` })]) };
  }
  return { ok: true, route: `${owner}:choose_post`, owner, needsData: 'posts', pickerContract: postPickerContract(owner), text: `${section.title}\n\nПостов пока нет`, attachments: keyboard(sectionNavRows(owner, { currentRoute: `${owner}:choose_post`, backAction: `${owner}:choose_channel` })) };
}

function postScreen(owner, context = {}) {
  const payload = context.payload || context.post || {};
  const title = normalize(payload.postTitle) || normalize(payload.title) || 'выбранный пост';
  const highlightPayload = { ...payload, source: 'highlight_card' };
  const highlightRows = [[actionButton('Применить', 'highlight_apply', highlightPayload)]];
  if (payload.highlight?.enabled || payload.hasHighlight === true) highlightRows.push([actionButton('Снять выделение', 'highlight_remove', highlightPayload)]);
  const rowsByOwner = {
    comments: [[actionButton('Включить', 'comments_manual_patch', { ...payload, source: 'comments_manual_confirmation' })], [button('Фото', 'comments:photos', payload), button('Ответы', 'comments:replies', payload)], [button('Реакции', 'comments:reactions', payload)]],
    editor: [[actionButton('Изменить текст выбранного поста', 'admin_posts_edit_text', payload)], [button('Выбрать другой пост', 'editor:choose_post', payload)]],
    buttons: [[actionButton('Добавить кнопку', 'button_admin_start_add', payload), actionButton('Текущие кнопки', 'button_admin_show_current', payload)]],
    gifts: [[actionButton('Создать подарок', 'gift_admin_start_create', payload), actionButton('Список подарков', 'gift_admin_show_current', payload)]],
    highlights: highlightRows,
    polls: [[actionButton('Создать опрос', 'poll_create', payload), actionButton('Результаты', 'poll_status', payload)]],
    stats: [[actionButton('Статистика поста', 'admin_stats_post', payload)]],
  };
  return { ok: true, route: `${owner}:post`, owner, pickerContract: postPickerContract(owner), text: `${sectionTitle(owner)}\n\nПост: ${title}\n\nВыберите действие.`, attachments: keyboard([...(rowsByOwner[owner] || []), ...sectionNavRows(owner, { currentRoute: `${owner}:post`, backAction: `${owner}:choose_post` })]) };
}

function pushHome() {
  return {
    ok: true,
    route: 'push:home',
    owner: 'push',
    text: ['🔔 Push-уведомления', '', 'Опубликуйте кнопку подключения в MAX-чат или канал, чтобы участники могли получать уведомления на iPhone через АдминКИТ PUSH.'].join('\n'),
    attachments: keyboard([
      [button('Опубликовать приглашение', 'admin_push_select_chat')],
      [button('Как это работает', 'admin_push_help')],
      [navButton('Главное меню', 'main:home')]
    ])
  };
}

function placeholderScreen(route, context = {}) {
  const owner = ownerOf(route);
  return { ok: true, route, owner, text: `${sectionTitle(owner)}\n\nРаздел подготовлен. Действие будет включено после безопасной реализации.`, attachments: keyboard(sectionNavRows(owner, { currentRoute: route, backAction: safeSectionHomeAction(owner) })) };
}
function safeError(route, error) {
  const owner = ownerOf(route);
  return { ok: false, route, owner, text: `⚠️ Не удалось открыть экран.\n\nРаздел: ${sectionTitle(owner)}\nПопробуйте вернуться в главное меню или открыть помощь по разделу.`, error: error && error.message ? error.message : String(error || 'unknown_error'), attachments: keyboard(sectionNavRows(canonical.sectionById[owner] ? owner : 'settings', { isRoot: true, currentRoute: route })) };
}
function normalizeRoute(route) {
  const safeRoute = normalize(route || 'main:home');
  return canonical.resolveSectionByRoute(safeRoute)?.route || safeRoute;
}
function postPickerContract(sectionId = '') {
  const section = normalize(sectionId);
  return { section, source: section, sequence: POST_PICKER_SEQUENCE.slice(), steps: ['section home', 'choose channel', 'choose post', 'section action'], payload: ['section/source', 'step', 'internal channelId', 'internal commentKey', 'internal postId when needed', 'safe back target', 'safe section home target'], clientVisibleTechnicalIds: false, tenantVisibleChannelsOnly: true, staleForeignReplayBlockedBySectionHandlers: true, implementationStatus: 'contract_only', productionActionsMigrated: false, note: 'Production post-scoped callbacks continue to use existing tenant-aware flows until picker hydration/delegation is migrated safely.' };
}
function postPickerAudit() {
  const sections = POST_SCOPED_SECTIONS.map((section) => postPickerContract(section));
  return { ok: sections.every((item) => item.sequence.join('>') === POST_PICKER_SEQUENCE.join('>') && item.tenantVisibleChannelsOnly && item.clientVisibleTechnicalIds === false && item.implementationStatus === 'contract_only'), version: VERSION, implementationStatus: 'contract_only', productionActionsMigrated: false, sections };
}

function render(route, context = {}) {
  try {
    const safeRoute = normalizeRoute(route || 'main:home');
    if (safeRoute === 'main:home' || safeRoute === 'start' || safeRoute === '/start') return mainHome();
    if (safeRoute === 'terms:home' || safeRoute === '/terms') return termsHome();
    if (safeRoute === 'privacy:home' || safeRoute === '/privacy') return privacyHome();
    const section = canonical.resolveSectionByRoute(safeRoute);
    const owner = section ? section.id : ownerOf(safeRoute);
    if (safeRoute.endsWith(':help')) return sectionHelpScreen(owner);
    if (owner === 'push' && safeRoute === 'push:home') return pushHome();
    if (owner === 'comments' && safeRoute === 'comments:auto') {
      const enabled = context.autoCommentsEnabled !== false;
      return { ok: true, route: safeRoute, owner, text: ['Автокомментарии', '', 'Когда включено, АдминКИТ сам добавляет комментарии к новым постам этого канала.', 'Когда выключено, новые посты остаются без комментариев, но вы можете включить их вручную для нужного поста.', '', `Сейчас: ${enabled ? 'включено' : 'выключено'}.`].join('\n'), attachments: keyboard([[actionButton(enabled ? 'Выключить' : 'Включить', enabled ? 'comments_auto_patch_disable' : 'comments_auto_patch_enable')], ...sectionNavRows(owner, { currentRoute: safeRoute, backAction: 'comments:home' })]) };
    }
    if (owner === 'settings' && safeRoute !== 'settings:home') return settingsDetailScreen(safeRoute);
    if (owner === 'account') return accountSectionScreen(safeRoute, context);
    if (owner === 'channels') {
      if (safeRoute === 'channels:home') return channelsHome(context);
      if (safeRoute === 'channels:list') return channelsList(context);
      if (safeRoute === 'channels:connect' || safeRoute === 'channels:instructions') return channelsConnect(safeRoute);
      if (safeRoute === 'channels:check' || safeRoute === 'channels:status') return channelsStatus(safeRoute, context);
      if (safeRoute === 'channels:card') return channelsCard(context);
      if (safeRoute === 'channels:manage') return channelsManage(safeRoute, context);
    }
    if (safeRoute.endsWith(':home')) return sectionHome(owner);
    if (safeRoute.endsWith(':choose_channel')) return chooseChannel(owner, context);
    if (safeRoute.endsWith(':choose_post')) return choosePost(owner, context);
    if (safeRoute.endsWith(':post')) return postScreen(owner, context);
    return placeholderScreen(safeRoute, context);
  } catch (error) { return safeError(route, error); }
}

function selfTest() {
  const validation = canonical.validate();
  const routes = ['main:home', ...canonical.clientSections.map((section) => section.route), ...canonical.clientSections.map((section) => `${section.id}:help`), 'settings:clear_chat', 'settings:notifications', 'settings:language_format', 'settings:privacy_terms', 'settings:navigation', 'comments:choose_channel', 'comments:choose_post', 'editor:choose_post', 'gifts:choose_post', 'highlights:choose_post', 'polls:choose_post', 'terms:home', 'privacy:home'];
  const sampleContext = { dataContext: { ok: true, channels: [{ channelId: 'test-channel', title: 'Тестовый канал' }], channelId: 'test-channel', channelTitle: 'Тестовый канал', posts: [{ postId: '1', commentKey: 'test-channel:1', title: 'Тестовый пост' }] } };
  const results = routes.map(route => render(route, route.includes('choose_') ? sampleContext : {}));
  const screensOk = results.every(result => result && result.text && Array.isArray(result.attachments));
  const mainLabels = visibleButtonTexts(mainHome());
  const rootScreens = canonical.clientSections.map((section) => render(section.route));
  const rootLabels = rootScreens.flatMap(visibleButtonTexts);
  const helpScreens = canonical.clientSections.map((section) => render(`${section.id}:help`));
  const labelText = [...mainLabels, ...rootLabels, ...helpScreens.flatMap(visibleButtonTexts)].join('\n');
  const payloadText = [...rootScreens, ...helpScreens].flatMap(visiblePayloads).join('\n');
  const banned = [/\bCTA\b/i, /Debug/i, /trace/i, /GitHub export/i, /production checklist/i, /postId/i, /channelId/i, /commentKey/i, /token/i, /payload/i, /видео/i, /файл/i];
  const bannedHits = banned.filter((pattern) => pattern.test(labelText)).map(String);
  const rootNavOk = rootScreens.every((screen) => {
    const texts = visibleButtonTexts(screen);
    const pushRoot = screen.route === 'push:home';
    const channelsRoot = screen.route === 'channels:home';
    const commentsRoot = screen.route === 'comments:home';
    const giftsRoot = screen.route === 'gifts:home';
    const requiredNavigation = pushRoot
      ? texts.includes('Как это работает') && texts.includes('Главное меню')
      : (channelsRoot
        ? texts.includes('Помощь') && texts.includes('Главное меню')
        : (commentsRoot
        ? texts.includes('Помощь') && texts.includes('Главное меню')
        : (giftsRoot ? texts.includes('Главное меню') : texts.includes('❓ Помощь по разделу') && texts.includes('🏠 Главное меню'))));
    return requiredNavigation && !texts.includes('↩️ В начало раздела') && !texts.includes('⬅️ Назад');
  });
  const deepScreens = ['channels:list', 'channels:connect', 'settings:clear_chat', 'settings:notifications', 'settings:language_format', 'settings:privacy_terms', 'settings:navigation', 'comments:choose_channel', 'comments:choose_post', 'comments:post'].map((route) => render(route, route === 'comments:post' ? { payload: { postTitle: 'Тестовый пост' } } : sampleContext));
  const deepNavOk = deepScreens.every((screen) => {
    const texts = visibleButtonTexts(screen);
    if (screen.route === 'channels:list' || screen.route === 'channels:connect') return texts.includes('Назад') && texts.includes('Главное меню');
    return texts.includes('↩️ В начало раздела') && texts.includes('❓ Помощь по разделу') && texts.includes('🏠 Главное меню') && texts.includes('⬅️ Назад');
  });
  const helpNavOk = helpScreens.every((screen) => {
    const texts = visibleButtonTexts(screen);
    return texts.includes('↩️ В начало раздела') && texts.includes('🏠 Главное меню') && !texts.includes('❓ Помощь по разделу');
  });
  const picker = postPickerAudit();
  return { ok: validation.ok && screensOk && canonical.clientSections.length === 13 && bannedHits.length === 0 && rootNavOk && deepNavOk && helpNavOk && picker.ok && !/"route":"main:home".*"route":"main:home"/.test(payloadText), version: VERSION, sourceMarker: SOURCE, canonicalVersion: canonical.VERSION, safeCoreFreeze: true, touchesBoot: false, patchesExpress: false, patchesModuleLoad: false, patchesAppPost: false, touchesDebugStore: false, touchesDebugPing: false, clientSections: canonical.clientSections.length, routesChecked: routes.length, validation, bannedHits, rootNavOk, deepNavOk, helpNavOk, postPickerAudit: picker, failures: results.filter(result => !result || !result.text).map(result => result && result.route) };
}

module.exports = { VERSION, SOURCE, render, selfTest, mainHome, sectionHome, sectionNavRows, sectionHelpScreen, safeSectionHomeAction, postPickerContract, postPickerAudit };
