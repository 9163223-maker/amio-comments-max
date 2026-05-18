'use strict';

const menuRenderer = require('../core/menuRenderer');
const checklist = require('../core/productionChecklistAdapter');

const RUNTIME = 'ADMINKIT-CORE-PRODUCTION-CHECKLIST-SECTION-1.51.0';

const routes = {
  home: 'production_checklist.home',
  features: 'production_checklist.features',
  env: 'production_checklist.env',
  security: 'production_checklist.security',
  policy: 'production_checklist.policy',
  gate: 'production_checklist.gate',
  canary: 'production_checklist.canary',
  rollback: 'production_checklist.rollback'
};

const FUNCTION_TREE = [
  ['features', 'Матрица разделов', routes.features, 'все 15 разделов и folded-подразделы проверены'],
  ['env', 'Env / deployment', routes.env, 'проверка DATABASE_URL, public URL, debug paths, GitHub export'],
  ['security', 'Security / UX guard', routes.security, 'no-cache, токены, locked debug, one active screen'],
  ['policy', 'Product policy', routes.policy, 'нет видео/файлов в комментариях, нет SVG-логотипа, опасные действия через подтверждение'],
  ['gate', 'Release gate', routes.gate, 'blockers / warnings / ready for manual MAX check'],
  ['canary', 'Canary plan', routes.canary, 'боевое включение только через canary, не всем сразу'],
  ['rollback', 'Rollback plan', routes.rollback, 'план отката и возврата к предыдущей сборке']
].map(([id, title, route, finalStep]) => ({ id, title, route, finalStep }));

function render(title, body = [], buttons = [], options = {}) {
  return menuRenderer.renderScreen({ title, body, buttons, backRoute: options.backRoute || '', homeRoute: options.homeRoute === undefined ? 'main.home' : options.homeRoute });
}
function iconStatus(item = {}) { return item.status === 'blocker' ? '⛔' : (item.status === 'warning' ? '⚠️' : '✅'); }
function line(item = {}) { return `${iconStatus(item)} ${item.title || item.id}`; }

async function renderHome(ctx = {}) {
  const gate = checklist.releaseGate();
  return render('✅ Production checklist', [
    'Финальная проверка перед боевой ручной проверкой в MAX и перед production.',
    `Blockers: ${gate.blockers.length}. Warnings: ${gate.warnings.length}.`,
    gate.readyForManualMaxCheck ? 'Можно переходить к ручной проверке в MAX.' : 'Есть blockers — production запрещён.',
    'Включение production не выполняется из checklist автоматически: только отдельное ручное подтверждение.',
    '',
    'Дерево проверки:',
    ...FUNCTION_TREE.map((item, index) => `${index + 1}. ${item.title} — ${item.finalStep}.`)
  ], FUNCTION_TREE.map((item) => ({ text: item.title, route: item.route })), { homeRoute: 'main.home' });
}

async function renderFeatures(ctx = {}) {
  const rows = checklist.featureMatrix();
  return render('📋 Матрица разделов', [
    'Проверяем, что все рабочие разделы зарегистрированы и прошли self-test:',
    ...rows.map((item) => `${iconStatus(item)} ${item.title} — ${item.runtimeVersion || 'runtime не указан'}`),
    '',
    `Folded внутри комментариев: ${checklist.FOLDED_COMMENT_SECTIONS.join(', ')}.`
  ], [
    { text: '🚦 Release gate', route: routes.gate },
    { text: '↩️ К checklist', route: routes.home }
  ], { backRoute: routes.home });
}

async function renderEnv(ctx = {}) {
  const rows = checklist.envChecklist();
  return render('⚙️ Env / deployment', [
    'Проверяем переменные и deployment-базу без вывода секретов:',
    ...rows.map(line),
    '',
    'Токены и секреты не показываются. Debug export проверяет только наличие и пути.'
  ], [
    { text: '🧪 Debug diagnostics', route: 'debug_diagnostics.home' },
    { text: '🚦 Release gate', route: routes.gate },
    { text: '↩️ К checklist', route: routes.home }
  ], { backRoute: routes.home });
}

async function renderSecurity(ctx = {}) {
  const rows = checklist.securityChecklist();
  return render('🔐 Security / UX guard', [
    'Финальные guardrails:',
    ...rows.map(line),
    '',
    'Debug остаётся внутренним закрытым разделом. Токены не выводим. Старые callback другого flow не должны выполнять действие.'
  ], [
    { text: '🧭 Навигация V3', route: 'navigation.home' },
    { text: '🧪 Debug diagnostics', route: 'debug_diagnostics.home' },
    { text: '↩️ К checklist', route: routes.home }
  ], { backRoute: routes.home });
}

async function renderPolicy(ctx = {}) {
  const rows = checklist.policyChecklist();
  return render('📌 Product policy', [
    'Проверяем продуктовые запреты и принятые решения:',
    ...rows.map(line),
    '',
    'Логотип пока можно оставить как отложенную задачу: production не должен подменять его SVG или перерисовкой.'
  ], [
    { text: '🚦 Release gate', route: routes.gate },
    { text: '↩️ К checklist', route: routes.home }
  ], { backRoute: routes.home });
}

async function renderGate(ctx = {}) {
  const gate = checklist.releaseGate();
  return render('🚦 Release gate', [
    gate.ok ? 'Blockers нет.' : 'Есть blockers — выпуск запрещён.',
    `Warnings: ${gate.warnings.length}.`,
    gate.readyForManualMaxCheck ? 'Статус: готово к боевой ручной проверке в MAX.' : 'Статус: сначала устранить blockers.',
    gate.readyForProduction ? 'Production-ready без предупреждений.' : 'Production с предупреждениями требует отдельного решения.',
    '',
    'Blockers:',
    ...(gate.blockers.length ? gate.blockers.map(line) : ['✅ Нет blockers.']),
    '',
    'Warnings:',
    ...(gate.warnings.length ? gate.warnings.map(line) : ['✅ Нет warnings.'])
  ], [
    { text: '🟡 Canary plan', route: routes.canary },
    { text: '↩️ К checklist', route: routes.home }
  ], { backRoute: routes.home });
}

async function renderCanary(ctx = {}) {
  return render('🟡 Canary plan', [
    'Боевой запуск делаем не сразу на всех.',
    '1. Проверить один тестовый канал.',
    '2. Проверить один реальный канал администратора.',
    '3. Проверить комментарии, кнопки, подарок, опрос, редактирование, статистику.',
    '4. Debug export держать включённым для наблюдения.',
    '5. ADMINKIT_CORE_CANARY_ALL не включать без отдельного решения.',
    '',
    'Checklist ничего не включает автоматически.'
  ], [
    { text: '↩️ Release gate', route: routes.gate },
    { text: '🧯 Rollback plan', route: routes.rollback }
  ], { backRoute: routes.gate });
}

async function renderRollback(ctx = {}) {
  return render('🧯 Rollback plan', [
    'План отката перед production:',
    '1. Зафиксировать текущий рабочий commit и runtimeVersion.',
    '2. Не удалять предыдущий loader до успешной ручной проверки.',
    '3. При критической ошибке вернуть package.json main на предыдущий loader.',
    '4. Проверить /debug/store-live и /debug/core-stress после отката.',
    '5. Не чистить пользовательские данные ради отката кода.',
    '',
    'Откат — это отдельное ручное действие, не кнопка из пользовательского меню.'
  ], [
    { text: '🚦 Release gate', route: routes.gate },
    { text: '↩️ К checklist', route: routes.home }
  ], { backRoute: routes.gate });
}

async function handleAction(ctx = {}) {
  const route = String(ctx.route || routes.home);
  if (route === routes.features) return renderFeatures(ctx);
  if (route === routes.env) return renderEnv(ctx);
  if (route === routes.security) return renderSecurity(ctx);
  if (route === routes.policy) return renderPolicy(ctx);
  if (route === routes.gate) return renderGate(ctx);
  if (route === routes.canary) return renderCanary(ctx);
  if (route === routes.rollback) return renderRollback(ctx);
  return renderHome(ctx);
}

function selfTest() {
  const dataSelf = checklist.selfTest();
  const routeValues = Object.values(routes);
  return {
    ok: routeValues.length >= 8 && FUNCTION_TREE.length >= 7 && dataSelf.ok !== false,
    runtimeVersion: RUNTIME,
    sectionId: 'production_checklist',
    feature: 'production_checklist.enabled',
    functionTreeReady: true,
    functionCount: FUNCTION_TREE.length,
    routeCount: routeValues.length,
    routes,
    featureMatrixReady: true,
    envChecklistReady: true,
    securityChecklistReady: true,
    policyChecklistReady: true,
    releaseGateReady: true,
    canaryFirstReady: true,
    rollbackPlanReady: true,
    productionEnableRequiresManualConfirm: true,
    dangerousActionsDisabled: true,
    legacyAdaptersUsed: false,
    cleanCoreOnly: true,
    dataAdapter: dataSelf
  };
}

module.exports = { id: 'production_checklist', title: 'Production checklist', shortTitle: 'Production', icon: '✅', order: 150, feature: 'production_checklist.enabled', routes, renderHome, handleAction, selfTest, RUNTIME, FUNCTION_TREE };