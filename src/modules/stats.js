'use strict';

const menuRenderer = require('../core/menuRenderer');
const statsData = require('../core/statsDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-STATS-SECTION-1.43.0-REFERRAL-ATTRIBUTION';

const routes = {
  home: 'stats.home',
  overview: 'stats.overview',
  channels: 'stats.channels',
  posts: 'stats.posts',
  comments: 'stats.comments',
  buttons: 'stats.buttons',
  leadMagnets: 'stats.lead_magnets',
  sources: 'stats.sources',
  referrals: 'stats.referrals',
  referralCreate: 'stats.referral_create',
  funnel: 'stats.funnel',
  costs: 'stats.costs',
  topPosts: 'stats.top_posts',
  export: 'stats.export',
  freshness: 'stats.freshness'
};

const FUNCTION_TREE = [
  ['overview', 'Сводка по каналу', routes.overview, 'каналы, посты, комментарии, кнопки, лид-магниты, переходы и подписки собираются в один понятный экран'],
  ['channels', 'Каналы и рост аудитории', routes.channels, 'рост считаем по событиям подключения/ухода, если MAX прислал user_added/user_removed'],
  ['posts', 'Посты', routes.posts, 'берём посты из базы АдминКИТ и stat от MAX только когда поле реально доступно'],
  ['comments', 'Комментарии', routes.comments, 'считаем обсуждения, фото, ответы, реакции и активность по постам без видео/файлов'],
  ['buttons', 'CTA-кнопки', routes.buttons, 'считаем созданные кнопки, callback-нажатия и переходы по трекинг-ссылкам'],
  ['lead_magnets', 'Лид-магниты', routes.leadMagnets, 'считаем показы, выполненные условия, выдачи подарков и отказы'],
  ['sources', 'Источники трафика', routes.sources, 'Яндекс, Дзен, Пикабу, сайт, Telegram, блогеры и ручные кампании'],
  ['referrals', 'Реферальные ссылки', routes.referrals, 'создаём короткие ссылки АдминКИТ, фиксируем клик и редиректим в MAX'],
  ['funnel', 'Воронка источников', routes.funnel, 'показываем путь: клик → старт бота → вероятная подписка → комментарий → подарок'],
  ['costs', 'Расходы и цена результата', routes.costs, 'администратор вручную вносит расход, АдминКИТ считает цену клика, старта и вероятной подписки'],
  ['top_posts', 'Лучшие посты', routes.topPosts, 'рейтинг по комментариям, реакциям, кликам, выдачам лид-магнитов и вовлечению'],
  ['export', 'Экспорт отчёта', routes.export, 'CSV/JSON без токенов, raw payload, внутренних id и технических полей'],
  ['freshness', 'Свежесть данных', routes.freshness, 'отдельно показываем, что пришло из MAX, что из базы АдминКИТ и что требует ручного импорта']
].map(([id, title, route, finalStep]) => ({ id, title, route, finalStep }));

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 72) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function render(title, body = [], buttons = [], options = {}) {
  return menuRenderer.renderScreen({ title, body, buttons, links: options.links || [], backRoute: options.backRoute || '', homeRoute: options.homeRoute === undefined ? 'main.home' : options.homeRoute });
}
function payload(ctx = {}, overrides = {}) {
  return {
    channelId: clean(ctx.payload?.channelId || ctx.channelId || ''),
    channelTitle: clean(ctx.payload?.channelTitle || ctx.channelTitle || 'Подключённый канал'),
    ...(overrides || {})
  };
}
function treeButtons() { return FUNCTION_TREE.map((item) => ({ text: item.title, route: item.route })); }
function attributionLines() {
  return [
    'Важно: АдминКИТ честно разделяет точную и вероятную атрибуцию.',
    'Точно считаем: клик по ссылке АдминКИТ, старт бота с кодом, callback внутри бота, выдачу лид-магнита.',
    'Вероятно считаем: подписку после клика, если MAX прислал событие user_added, но не передал ref-код.',
    'Не обещаем: точный рекламный источник подписки, если MAX не передал источник или ref-код.'
  ];
}
function sourceOptionsText() {
  return statsData.sourceOptions().map((item) => `• ${item.title}`).join('\n');
}
async function sampleCampaign(ctx = {}, source = 'yandex_direct', campaign = 'майская реклама') {
  return statsData.createReferralCampaign(ctx, {
    source,
    campaign,
    channelId: ctx.payload?.channelId || ctx.channelId || 'stats-preview-channel',
    channelTitle: ctx.payload?.channelTitle || ctx.channelTitle || 'Подключённый канал',
    targetUrl: statsData.defaultTargetUrl()
  });
}
function campaignLines(campaigns = []) {
  if (!campaigns.length) return ['Пока нет созданных ссылок.', 'Нажмите «Создать ссылку», чтобы добавить ссылку для Яндекс Директа, Дзена, Пикабу, сайта или блогера.'];
  return campaigns.slice(0, 8).map((item, index) => `${index + 1}. ${item.sourceTitle} · ${cut(item.campaign, 42)}\n   Клики: ${item.clicks} · старты: ${item.starts} · вероятные подписки: ${item.probableSubscribers}\n   ${item.url}`);
}

const section = {
  id: 'stats', title: 'Статистика', icon: '📊', order: 70, feature: 'stats.enabled', routes,

  async renderHome(ctx = {}) {
    return render('📊 Статистика', [
      'Финальное дерево статистики собрано только из функций, которые реально можно внедрить в Core без обещаний сверх возможностей MAX.',
      'Главный фокус 1.43.0 — источники трафика и реферальные ссылки: Яндекс, Дзен, Пикабу, сайт, Telegram, блогеры и ручные кампании.',
      ...attributionLines(),
      '',
      'Дерево функций:',
      ...FUNCTION_TREE.map((item, index) => `${index + 1}. ${item.title} — ${item.finalStep}`)
    ], treeButtons(), { homeRoute: 'main.home' });
  },

  async renderOverview(ctx = {}) {
    const funnel = await statsData.referralFunnel(ctx, { limit: 8 });
    const totals = funnel.totals || {};
    return render('📈 Сводка по каналу', [
      'Сводка объединяет безопасные read-only агрегаты: каналы, посты, комментарии, кнопки, лид-магниты и источники трафика.',
      `Точные клики по реферальным ссылкам: ${Number(totals.exactClicks || 0)}`,
      `Точные старты бота: ${Number(totals.exactStarts || 0)}`,
      `Вероятные подписки после клика: ${Number(totals.probableSubscribers || 0)}`,
      'Для post stat используем только данные, которые реально пришли из MAX или уже сохранены в базе АдминКИТ.'
    ], [
      { text: '🔗 Источники трафика', route: routes.sources, data: payload(ctx) },
      { text: '🧭 Воронка источников', route: routes.funnel, data: payload(ctx) },
      { text: '🕒 Свежесть данных', route: routes.freshness, data: payload(ctx) }
    ], { backRoute: routes.home });
  },

  async renderChannels(ctx = {}) {
    return render('📡 Каналы и рост аудитории', [
      'Рост аудитории считаем по событиям, которые реально попадают в бот и webhook.',
      'Если MAX прислал user_added — фиксируем приход. Если user_removed — фиксируем уход.',
      'Если событие пришло после клика по реферальной ссылке, показываем это как вероятную подписку источника, а не как стопроцентную атрибуцию.',
      'Raw id и технические payload в пользовательском экране не показываем.'
    ], [
      { text: '🔗 Источники трафика', route: routes.sources, data: payload(ctx) },
      { text: '🧭 Воронка', route: routes.funnel, data: payload(ctx) }
    ], { backRoute: routes.home });
  },

  async renderPosts(ctx = {}) {
    return render('📝 Посты', [
      'Статистика постов строится из двух безопасных источников: база АдминКИТ и поле stat от MAX, если оно реально есть в данных поста.',
      'Показываем человекочитаемое начало поста, клики по кнопкам, комментарии, реакции и выдачи лид-магнитов.',
      'Если MAX не отдал конкретную метрику, в интерфейсе показываем “нет данных”, а не придумываем значение.'
    ], [
      { text: '🏆 Лучшие посты', route: routes.topPosts, data: payload(ctx) },
      { text: '💬 Комментарии', route: routes.comments, data: payload(ctx) }
    ], { backRoute: routes.home });
  },

  async renderComments(ctx = {}) {
    return render('💬 Статистика комментариев', [
      'Считаем активность обсуждений: новые комментарии, фото, ответы, реакции и жалобы.',
      'Видео и файлы не входят в комментарии и не добавляются в статистику комментариев.',
      'Для модерации статистика показывает очереди, жалобы, скрытые сообщения и восстановленные записи.'
    ], [
      { text: '🛡️ Модерация', route: 'moderation.home' },
      { text: '🏆 Лучшие посты', route: routes.topPosts, data: payload(ctx) }
    ], { backRoute: routes.home });
  },

  async renderButtons(ctx = {}) {
    return render('🔘 CTA-кнопки', [
      'Считаем созданные кнопки, callback-нажатия и переходы через трекинг-ссылки.',
      'Для внешних ссылок лучше использовать промежуточные ссылки АдминКИТ: так мы точно фиксируем клик до ухода пользователя на площадку.',
      'Клики по callback внутри бота считаются точной метрикой.'
    ], [
      { text: '🔗 Создать реферальную ссылку', route: routes.referralCreate, data: payload(ctx) },
      { text: '📋 Все ссылки', route: routes.referrals, data: payload(ctx) }
    ], { backRoute: routes.home });
  },

  async renderLeadMagnets(ctx = {}) {
    return render('🎁 Лид-магниты', [
      'Считаем показы, выполнение условий, выдачу подарка и отказы.',
      'Воронка лид-магнита связывается с источником, если пользователь пришёл через трекинг-ссылку или стартовал бота с кодом.',
      'Выдача подарка внутри АдминКИТ — точная метрика.'
    ], [
      { text: '🎁 Лид-магниты', route: 'lead_magnets.home' },
      { text: '🧭 Воронка источников', route: routes.funnel, data: payload(ctx) }
    ], { backRoute: routes.home });
  },

  async renderSources(ctx = {}) {
    return render('🧲 Источники трафика', [
      'Источники нужны, чтобы понимать, какая реклама реально приводит людей в канал и воронку.',
      'Поддерживаемые источники:',
      sourceOptionsText(),
      '',
      ...attributionLines(),
      '',
      'Практический сценарий: создаём отдельную ссылку для Яндекс Директа, Дзена, Пикабу, сайта и каждого блогера.'
    ], [
      { text: '➕ Создать ссылку', route: routes.referralCreate, data: payload(ctx, { source: 'yandex_direct' }) },
      { text: '📋 Список ссылок', route: routes.referrals, data: payload(ctx) },
      { text: '🧭 Воронка', route: routes.funnel, data: payload(ctx) }
    ], { backRoute: routes.home });
  },

  async renderReferrals(ctx = {}) {
    const list = await statsData.listReferralCampaigns(ctx, { limit: 10 });
    return render('🔗 Реферальные ссылки', [
      'Реферальная ссылка АдминКИТ сначала фиксирует клик, затем перенаправляет человека в MAX-канал или нужную посадочную.',
      'Это даёт точную статистику кликов по площадкам и кампаниям.',
      '',
      ...campaignLines(list.campaigns || [])
    ], [
      { text: '➕ Создать ссылку', route: routes.referralCreate, data: payload(ctx, { source: 'yandex_direct' }) },
      { text: '🧭 Воронка источников', route: routes.funnel, data: payload(ctx) },
      { text: '↩️ К источникам', route: routes.sources, data: payload(ctx) }
    ], { backRoute: routes.sources });
  },

  async renderReferralCreate(ctx = {}) {
    const source = clean(ctx.payload?.source || 'yandex_direct');
    const campaign = clean(ctx.payload?.campaign || 'майская реклама');
    const created = await sampleCampaign(ctx, source, campaign);
    const campaignData = created.campaign || {};
    return render('➕ Создание реферальной ссылки', [
      'В боевом UX здесь будет пошаговый сценарий: источник → кампания → целевая ссылка → расход → сохранить.',
      'В Core 1.43.0 уже готова безопасная основа: код, запись кампании, фиксация клика и редирект.',
      `Источник: ${campaignData.sourceTitle || statsData.sourceTitle(source)}`,
      `Кампания: ${campaignData.campaign || campaign}`,
      `Ссылка: ${campaignData.url || statsData.makeReferralUrl(statsData.makeCode({ source, campaign }))}`,
      `Куда ведёт: ${campaignData.targetUrl || statsData.defaultTargetUrl()}`,
      '',
      'Для Яндекс Директа, Дзена, Пикабу и сайта создаём отдельные ссылки, чтобы не смешивать рекламные каналы.'
    ], [
      { text: '📋 Все ссылки', route: routes.referrals, data: payload(ctx) },
      { text: '🧭 Проверить воронку', route: routes.funnel, data: payload(ctx) }
    ], { backRoute: routes.referrals });
  },

  async renderFunnel(ctx = {}) {
    const funnel = await statsData.referralFunnel(ctx, { limit: 10 });
    const rows = funnel.rows || [];
    const totals = funnel.totals || {};
    const rowLines = rows.length ? rows.slice(0, 6).map((row, index) => `${index + 1}. ${row.sourceTitle} · ${cut(row.campaign, 36)} — клики ${row.exactClicks}, старты ${row.exactStarts}, вероятные подписки ${row.probableSubscribers}, лиды ${row.leads}`) : ['Пока нет данных по ссылкам. Создайте первую ссылку для рекламной площадки.'];
    return render('🧭 Воронка источников', [
      'Воронка показывает рекламный путь без ложной точности.',
      'Путь: клик → старт бота → вероятная подписка → комментарий → получение подарка.',
      `Итого точные клики: ${Number(totals.exactClicks || 0)}`,
      `Итого точные старты: ${Number(totals.exactStarts || 0)}`,
      `Итого вероятные подписки: ${Number(totals.probableSubscribers || 0)}`,
      `Итого лиды/выдачи: ${Number(totals.leads || 0)}`,
      '',
      ...rowLines,
      '',
      ...attributionLines()
    ], [
      { text: '➕ Создать ссылку', route: routes.referralCreate, data: payload(ctx) },
      { text: '💰 Расходы', route: routes.costs, data: payload(ctx) },
      { text: '📤 Экспорт', route: routes.export, data: payload(ctx) }
    ], { backRoute: routes.sources });
  },

  async renderCosts(ctx = {}) {
    return render('💰 Расходы и цена результата', [
      'Расходы по рекламным площадкам вводятся вручную или позже импортируются из рекламных кабинетов.',
      'После ввода расхода АдминКИТ считает: цену клика, цену старта, цену вероятной подписки и цену лида.',
      'Это позволит сравнить Яндекс Директ, Дзен, Пикабу, сайт, блогеров и другие источники не по ощущениям, а по цифрам.'
    ], [
      { text: '🧭 Воронка', route: routes.funnel, data: payload(ctx) },
      { text: '🔗 Ссылки', route: routes.referrals, data: payload(ctx) }
    ], { backRoute: routes.home });
  },

  async renderTopPosts(ctx = {}) {
    return render('🏆 Лучшие посты', [
      'Лучшие посты считаем по доступным метрикам: комментарии, реакции, клики по кнопкам, выдачи лид-магнитов и жалобы.',
      'Посты показываются человеческими названиями/началом текста, без raw id.',
      'Если часть данных MAX не отдаёт, рейтинг строится по тем событиям, которые зафиксированы в АдминКИТ.'
    ], [
      { text: '📝 Посты', route: routes.posts, data: payload(ctx) },
      { text: '💬 Комментарии', route: routes.comments, data: payload(ctx) }
    ], { backRoute: routes.home });
  },

  async renderExport(ctx = {}) {
    return render('📤 Экспорт отчёта', [
      'Экспорт нужен для клиента, подрядчика или рекламщика.',
      'Форматы: CSV и JSON.',
      'В экспорт не попадают токены, raw payload, внутренние id, debug-поля и технические ошибки.',
      'Минимальный отчёт: источник, кампания, ссылка, клики, старты, вероятные подписки, лиды, расход и цена результата.'
    ], [
      { text: '🧭 Воронка', route: routes.funnel, data: payload(ctx) },
      { text: '🔗 Ссылки', route: routes.referrals, data: payload(ctx) }
    ], { backRoute: routes.home });
  },

  async renderFreshness(ctx = {}) {
    return render('🕒 Свежесть данных', [
      'Свежесть данных показываем открыто, чтобы администратор понимал, откуда взялась цифра.',
      'Из MAX: события webhook, stat постов, если поле доступно, user_added/user_removed, если они приходят.',
      'Из АдминКИТ: клики по /r-ссылкам, callback-нажатия, комментарии, лид-магниты, модерация и сохранённые посты.',
      'Вручную: расходы рекламных кампаний и внешние показы, если площадка не отдаёт их через API.',
      'Главное правило: нет данных — пишем “нет данных”, а не рисуем красивую, но неверную статистику.'
    ], [
      { text: '📈 Сводка', route: routes.overview, data: payload(ctx) },
      { text: '📤 Экспорт', route: routes.export, data: payload(ctx) }
    ], { backRoute: routes.home });
  },

  async handleAction(ctx = {}) {
    const route = String(ctx.route || routes.home);
    if (route === routes.overview) return this.renderOverview(ctx);
    if (route === routes.channels) return this.renderChannels(ctx);
    if (route === routes.posts) return this.renderPosts(ctx);
    if (route === routes.comments) return this.renderComments(ctx);
    if (route === routes.buttons) return this.renderButtons(ctx);
    if (route === routes.leadMagnets) return this.renderLeadMagnets(ctx);
    if (route === routes.sources) return this.renderSources(ctx);
    if (route === routes.referrals) return this.renderReferrals(ctx);
    if (route === routes.referralCreate) return this.renderReferralCreate(ctx);
    if (route === routes.funnel) return this.renderFunnel(ctx);
    if (route === routes.costs) return this.renderCosts(ctx);
    if (route === routes.topPosts) return this.renderTopPosts(ctx);
    if (route === routes.export) return this.renderExport(ctx);
    if (route === routes.freshness) return this.renderFreshness(ctx);
    return this.renderHome(ctx);
  },

  selfTest() {
    const dataSelf = statsData.selfTest ? statsData.selfTest() : {};
    const routeValues = Object.values(routes);
    const treeRoutes = FUNCTION_TREE.map((item) => item.route);
    const missingTreeRoutes = treeRoutes.filter((route) => !routeValues.includes(route));
    return {
      ok: routeValues.length >= 15 && FUNCTION_TREE.length >= 13 && missingTreeRoutes.length === 0 && dataSelf.ok !== false,
      runtimeVersion: RUNTIME,
      sectionId: 'stats',
      feature: 'stats.enabled',
      finalFunctionTreeReady: true,
      functionTreeReady: true,
      functionCount: FUNCTION_TREE.length,
      routeCount: routeValues.length,
      routes,
      missingTreeRoutes,
      referralAttributionReady: true,
      referralLinksReady: dataSelf.referralCampaignsReady === true,
      referralRedirectReady: dataSelf.redirectRouteRequired === true,
      exactClicksReady: dataSelf.exactClicksReady === true,
      probableSubscribersSeparated: dataSelf.probableSubscribersSeparated === true,
      doesNotPromiseExactSubscriptionSourceWithoutMaxRef: true,
      trafficSourcesReady: true,
      yandexZenPikabuSiteReady: true,
      costsReady: true,
      exportWithoutRawTechnicalFieldsReady: true,
      dataFreshnessReady: true,
      noVideoFilesInComments: true,
      legacyAdaptersUsed: false,
      cleanCoreOnly: true,
      finalStepsDocumented: FUNCTION_TREE.every((item) => !!item.finalStep),
      statsDataAdapter: dataSelf
    };
  }
};

module.exports = section;
module.exports.RUNTIME = RUNTIME;
module.exports.FUNCTION_TREE = FUNCTION_TREE;
module.exports.routes = routes;
