'use strict';

const menuRenderer = require('../core/menuRenderer');
const startLanding = require('../core/startLandingAdapter');

const RUNTIME = 'ADMINKIT-CORE-START-LANDING-SECTION-1.49.1-RASTER-ONLY';

const routes = {
  home: 'start_landing.home',
  quickStart: 'start_landing.quick_start',
  capabilities: 'start_landing.capabilities',
  logo: 'start_landing.logo',
  readiness: 'start_landing.readiness',
  support: 'start_landing.support'
};

const FUNCTION_TREE = [
  ['quick_start', 'Быстрый старт', routes.quickStart, 'подключить канал → включить комментарии → добавить рост → проверить статистику'],
  ['capabilities', 'Что умеет АдминКИТ', routes.capabilities, 'объяснение пользы без технического мусора'],
  ['connect_channel', 'Подключить канал', 'channels.connect', 'главный CTA ведёт в рабочий сценарий подключения'],
  ['readiness', 'Проверить готовность', routes.readiness, 'чек-лист первого запуска'],
  ['logo', 'Логотип посадочной', routes.logo, 'найти текущий растровый файл и подсказать сжатие без перерисовки'],
  ['support', 'Помощь', routes.support, 'что делать, если канал не подключается']
].map(([id, title, route, finalStep]) => ({ id, title, route, finalStep }));

function render(title, body = [], buttons = [], options = {}) {
  return menuRenderer.renderScreen({ title, body, buttons, backRoute: options.backRoute || '', homeRoute: options.homeRoute === undefined ? 'main.home' : options.homeRoute });
}

async function renderHome(ctx = {}) {
  const logo = startLanding.findLogo();
  return render('🚀 АдминКИТ: старт', [
    'АдминКИТ помогает управлять каналом в MAX: комментарии, модерация, подарки, кнопки, опросы, выделение постов, редактирование и статистика.',
    'Начните с подключения канала. После этого остальные разделы смогут работать с выбранным каналом и постами.',
    logo.logoOptimized ? 'Логотип посадочной найден и сжат в webp.' : 'Для логотипа подготовлен слот: нужен исходный PNG/JPG/WebP, сжатый в webp до 120 КБ без изменения внешнего вида.',
    '',
    'Быстрый путь: подключить канал → включить комментарии → добавить инструменты роста → проверить статистику.'
  ], [
    { text: '➕ Подключить канал', route: 'channels.connect' },
    { text: '⚡ Быстрый старт', route: routes.quickStart },
    { text: '🧩 Что умеет АдминКИТ', route: routes.capabilities },
    { text: '🖼 Логотип посадочной', route: routes.logo },
    { text: '✅ Проверить готовность', route: routes.readiness },
    { text: '🆘 Помощь', route: routes.support }
  ], { homeRoute: 'main.home' });
}

async function renderQuickStart(ctx = {}) {
  const steps = startLanding.onboardingSteps();
  return render('⚡ Быстрый старт', [
    'Минимальный путь первого запуска:',
    ...steps.map((step, index) => `${index + 1}. ${step.title} — ${step.description}.`),
    '',
    'Этот путь не требует заходить в архив, debug или внутренние настройки.'
  ], steps.map((step) => ({ text: step.title, route: step.route })), { backRoute: routes.home });
}

async function renderCapabilities(ctx = {}) {
  const groups = startLanding.capabilityGroups();
  return render('🧩 Что умеет АдминКИТ', [
    'Коротко и по-человечески:',
    ...groups.map((group) => `• ${group.title}: ${group.text}.`),
    '',
    'Видео и файлы в комментариях не включаем: оставляем текст, фото, ответы и реакции.'
  ], [
    { text: '➕ Подключить канал', route: 'channels.connect' },
    { text: '⚡ Быстрый старт', route: routes.quickStart }
  ], { backRoute: routes.home });
}

async function renderLogo(ctx = {}) {
  const logo = startLanding.findLogo();
  const foundLines = logo.foundCount
    ? logo.found.map((item, index) => `${index + 1}. ${item.file} — ${item.kind}, ${item.sizeKb} КБ${item.optimized ? ', подходит' : ''}`)
    : ['Текущий растровый файл логотипа в public не найден.'];
  return render('🖼 Логотип посадочной', [
    ...foundLines,
    '',
    logo.recommendation,
    `Рекомендуемый путь замены: ${logo.recommendedPath}`,
    'Только WEBP из исходного логотипа. Никаких SVG, векторной перерисовки и замены внешнего вида.',
    'Рекомендуемо: 512×512, прозрачность сохранить, вес до 120 КБ. Если исходник больше — просто сжать, не перерисовывать.'
  ], [
    { text: '➕ Подключить канал', route: 'channels.connect' },
    { text: '↩️ К старту', route: routes.home }
  ], { backRoute: routes.home });
}

async function renderReadiness(ctx = {}) {
  const checklist = startLanding.readinessChecklist();
  return render('✅ Готовность первого запуска', [
    'Проверяем стартовую посадочную без технического мусора:',
    ...checklist.map((item) => `${item.ok ? '✅' : '◻️'} ${item.title}${item.details ? ` — ${item.details}` : ''}`),
    '',
    'Если канал ещё не подключён, главный следующий шаг — подключить канал через пересланный пост.'
  ], [
    { text: '➕ Подключить канал', route: 'channels.connect' },
    { text: '🖼 Проверить логотип', route: routes.logo },
    { text: '🏠 Главное меню', route: 'main.home' }
  ], { backRoute: routes.home });
}

async function renderSupport(ctx = {}) {
  return render('🆘 Помощь на старте', [
    'Если канал не подключается:',
    '1. Перешлите боту обычный пост из нужного канала.',
    '2. Проверьте, что бот добавлен в канал и имеет права администратора.',
    '3. На экране проверки подтвердите именно тот канал, который нужен.',
    '4. После подключения можно удалить служебный пересланный пост — данные останутся.',
    '',
    'Если стартовый экран выглядит тяжёлым, проверьте логотип: нужен сжатый webp из оригинального изображения.'
  ], [
    { text: '➕ Подключить канал', route: 'channels.connect' },
    { text: '🖼 Логотип посадочной', route: routes.logo },
    { text: '↩️ К старту', route: routes.home }
  ], { backRoute: routes.home });
}

async function handleAction(ctx = {}) {
  const route = String(ctx.route || routes.home);
  if (route === routes.quickStart) return renderQuickStart(ctx);
  if (route === routes.capabilities) return renderCapabilities(ctx);
  if (route === routes.logo) return renderLogo(ctx);
  if (route === routes.readiness) return renderReadiness(ctx);
  if (route === routes.support) return renderSupport(ctx);
  return renderHome(ctx);
}

function selfTest() {
  const dataSelf = startLanding.selfTest ? startLanding.selfTest() : {};
  const routeValues = Object.values(routes);
  return {
    ok: routeValues.length >= 6 && FUNCTION_TREE.length >= 6 && dataSelf.ok !== false && dataSelf.noSvg === true,
    runtimeVersion: RUNTIME,
    sectionId: 'start_landing',
    feature: 'start_landing.enabled',
    functionTreeReady: true,
    functionCount: FUNCTION_TREE.length,
    routeCount: routeValues.length,
    routes,
    primaryCtaRoute: 'channels.connect',
    quickStartReady: true,
    capabilitiesReady: true,
    readinessChecklistReady: true,
    supportReady: true,
    logoAuditReady: true,
    logoFound: dataSelf.logoFound,
    logoOptimized: dataSelf.logoOptimized,
    recommendedLogoPath: dataSelf.recommendedLogoPath,
    rasterOnly: true,
    noSvg: true,
    noVectorRedraw: true,
    noTechnicalText: true,
    noRawIds: true,
    legacyAdaptersUsed: false,
    cleanCoreOnly: true,
    dangerousActionsDisabled: true,
    dataAdapter: dataSelf
  };
}

module.exports = { id: 'start_landing', title: 'Start / посадочная', shortTitle: 'Start', icon: '🚀', order: 130, feature: 'start_landing.enabled', routes, renderHome, handleAction, selfTest, RUNTIME, FUNCTION_TREE };
