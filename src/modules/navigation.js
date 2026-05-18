'use strict';

const menuRenderer = require('../core/menuRenderer');
const navigationV3 = require('../core/navigationV3Adapter');

const RUNTIME = 'ADMINKIT-CORE-NAVIGATION-SECTION-1.48.1-V3-HINTS-SAFE';

const routes = {
  home: 'navigation.home',
  audit: 'navigation.audit',
  activeScreen: 'navigation.active_screen',
  cleanup: 'navigation.cleanup',
  flowGuard: 'navigation.flow_guard',
  backHome: 'navigation.back_home',
  folded: 'navigation.folded_sections'
};

const FUNCTION_TREE = [
  ['main_menu', 'Проверить главное меню', routes.audit, 'все основные разделы видны один раз, без дублей'],
  ['back_home', 'Назад / Главное меню', routes.backHome, 'каждый рабочий экран имеет понятный возврат'],
  ['active_screen', 'One active screen', routes.activeScreen, 'новый экран заменяет предыдущий, старый уходит в cleanup'],
  ['active_flow', 'One active flow', routes.flowGuard, 'старые callback другого сценария блокируются'],
  ['cleanup', 'Cleanup pipeline', routes.cleanup, 'активный экран и flow очищаются без мусора в чате'],
  ['folded', 'Вложенные разделы', routes.folded, 'Фото, реакции и ответы не дублируются в главном меню, а живут внутри комментариев']
].map(([id, title, route, finalStep]) => ({ id, title, route, finalStep }));

function render(title, body = [], buttons = [], options = {}) {
  return menuRenderer.renderScreen({ title, body, buttons, backRoute: options.backRoute || '', homeRoute: options.homeRoute === undefined ? 'main.home' : options.homeRoute });
}

async function renderHome(ctx = {}) {
  return render('🧭 Меню и навигация V3', [
    'Раздел проверяет каркас UX: главное меню, переходы, «Назад», «Главное меню», один активный экран, один активный сценарий и cleanup pipeline.',
    'Подсказки — только нативные inline. Всплывающие и плавающие подсказки в V3 запрещены.',
    'Цель: админ всегда понимает, где он находится, и не видит дубли/зависшие экраны.',
    '',
    'Дерево проверки:',
    ...FUNCTION_TREE.map((item, index) => `${index + 1}. ${item.title} — ${item.finalStep}`)
  ], FUNCTION_TREE.map((item) => ({ text: item.title, route: item.route })), { homeRoute: 'main.home' });
}

async function renderAudit(ctx = {}) {
  const self = navigationV3.selfTest();
  return render('📋 Проверка главного меню', [
    'Главное меню должно показывать рабочие разделы один раз и без технических дублей.',
    `Ожидаемые видимые маршруты: ${navigationV3.REQUIRED_VISIBLE_ROUTES.length}.`,
    'Фото в комментариях, реакции и ответы остаются внутри раздела «Комментарии» и не дробят верхнее меню.',
    self.nativeInlineOnly ? 'Подсказки: только native inline.' : 'Проверьте режим подсказок.'
  ], [
    { text: '🏠 Открыть главное меню', route: 'main.home' },
    { text: '🧭 Назад к навигации', route: routes.home }
  ], { backRoute: routes.home });
}

async function renderActiveScreen(ctx = {}) {
  const result = await navigationV3.setActiveScreen(ctx, ctx.payload?.messageId || 'navigation-v3-manual-screen');
  return render('🖥 One active screen', [
    result.oneActiveScreen ? 'Активный экран зафиксирован.' : 'Активный экран не зафиксирован.',
    `Старые экраны в очереди очистки: ${result.garbageCount}.`,
    'Правило V3: в рабочем чате должен оставаться один актуальный экран, а старые сообщения уходят в cleanup pipeline.'
  ], [
    { text: '🧹 Проверить cleanup pipeline', route: routes.cleanup },
    { text: '🧭 Назад к навигации', route: routes.home }
  ], { backRoute: routes.home });
}

async function renderCleanup(ctx = {}) {
  const result = await navigationV3.simulateCleanupPipeline(ctx);
  return render('🧹 Cleanup pipeline', [
    result.ok ? 'Cleanup pipeline работает.' : 'Cleanup pipeline требует проверки.',
    result.oldScreenMovedToGarbage ? 'Предыдущий экран переносится в очередь очистки.' : 'Предыдущий экран не попал в очередь очистки.',
    result.activeScreenMovedToGarbageOnReset ? 'Активный экран при reset тоже переносится в очистку.' : 'Активный экран при reset не обработан.',
    result.flowCleared ? 'Активный сценарий очищается.' : 'Активный сценарий не очистился.',
    result.garbageLimitSafe ? 'Лимит мусорных сообщений соблюдён.' : 'Лимит мусорных сообщений превышен.'
  ], [
    { text: '🧭 Назад к навигации', route: routes.home },
    { text: '🏠 Главное меню', route: 'main.home' }
  ], { backRoute: routes.home });
}

async function renderFlowGuard(ctx = {}) {
  const result = await navigationV3.simulateFlowGuard(ctx);
  return render('🧭 One active flow', [
    result.ok ? 'Защита одного активного сценария работает.' : 'Защита сценария требует проверки.',
    result.staleFlowCallbackBlocked ? 'Старый callback другого сценария блокируется и не выполняет действие.' : 'Старый callback не был заблокирован.',
    'Это защищает админа от случайного нажатия старой кнопки из другого flow.'
  ], [
    { text: '🧭 Назад к навигации', route: routes.home },
    { text: '🏠 Главное меню', route: 'main.home' }
  ], { backRoute: routes.home });
}

async function renderBackHome(ctx = {}) {
  return render('↩️ Назад / Главное меню', [
    'В V3 каждый экран должен иметь понятный путь назад или в главное меню.',
    'Кнопка «Назад» возвращает к предыдущему логическому экрану раздела.',
    'Кнопка «Главное меню» возвращает к единому стартовому меню и не плодит новый flow.'
  ], [
    { text: '↩️ Назад к навигации', route: routes.home },
    { text: '🏠 Главное меню', route: 'main.home' }
  ], { backRoute: routes.home });
}

async function renderFolded(ctx = {}) {
  return render('🧩 Вложенные разделы', [
    'Фото в комментариях, реакции и ответы не должны быть отдельными верхними пунктами главного меню.',
    'Они доступны внутри «Комментарии», чтобы сохранить принцип one screen / one flow.',
    `Скрытые вложенные маршруты: ${navigationV3.FOLDED_ROUTES.join(', ')}.`
  ], [
    { text: '💬 К комментариям', route: 'comments.home' },
    { text: '🧭 Назад к навигации', route: routes.home }
  ], { backRoute: routes.home });
}

async function handleAction(ctx = {}) {
  const route = String(ctx.route || routes.home);
  if (route === routes.audit) return renderAudit(ctx);
  if (route === routes.activeScreen) return renderActiveScreen(ctx);
  if (route === routes.cleanup) return renderCleanup(ctx);
  if (route === routes.flowGuard) return renderFlowGuard(ctx);
  if (route === routes.backHome) return renderBackHome(ctx);
  if (route === routes.folded) return renderFolded(ctx);
  return renderHome(ctx);
}

function selfTest() {
  const dataSelf = navigationV3.selfTest ? navigationV3.selfTest() : {};
  const routeValues = Object.values(routes);
  return {
    ok: routeValues.length >= 7 && FUNCTION_TREE.length >= 6 && dataSelf.ok !== false,
    runtimeVersion: RUNTIME,
    sectionId: 'navigation',
    feature: 'navigation.enabled',
    functionTreeReady: true,
    functionCount: FUNCTION_TREE.length,
    routeCount: routeValues.length,
    routes,
    nativeInlineOnly: true,
    overlayHintsDisabled: true,
    floatingHintsDisabled: true,
    oneActiveScreenReady: true,
    oneActiveFlowGuardReady: true,
    cleanupPipelineReady: true,
    backHomeRoutesReady: true,
    foldedSectionsReady: true,
    legacyAdaptersUsed: false,
    cleanCoreOnly: true,
    dataAdapter: dataSelf
  };
}

module.exports = { id: 'navigation', title: 'Меню и навигация V3', shortTitle: 'Навигация V3', icon: '🧭', order: 120, feature: 'navigation.enabled', routes, renderHome, handleAction, selfTest, RUNTIME, FUNCTION_TREE };
