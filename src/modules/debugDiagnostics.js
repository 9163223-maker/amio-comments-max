'use strict';

const menuRenderer = require('../core/menuRenderer');
const debugExport = require('../core/debugExportAdapter');

const RUNTIME = 'ADMINKIT-CORE-DEBUG-DIAGNOSTICS-SECTION-1.50.0';

const routes = {
  home: 'debug_diagnostics.home',
  storeLive: 'debug_diagnostics.store_live',
  exportPreview: 'debug_diagnostics.export_preview',
  exportLite: 'debug_diagnostics.export_lite',
  selftest: 'debug_diagnostics.selftest',
  env: 'debug_diagnostics.env'
};

const FUNCTION_TREE = [
  ['store_live', 'Store-live', routes.storeLive, 'свежий debug без кэша'],
  ['export_preview', 'GitHub export dry-run', routes.exportPreview, 'проверить latest/latest-lite без записи'],
  ['export_lite', 'Lite export', routes.exportLite, 'лёгкий snapshot для быстрой проверки'],
  ['selftest', 'Self-test debug export', routes.selftest, 'проверить no-cache, auth guard и redaction'],
  ['env', 'Переменные debug', routes.env, 'показать только наличие и пути, без токенов']
].map(([id, title, route, finalStep]) => ({ id, title, route, finalStep }));

function render(title, body = [], buttons = [], options = {}) {
  return menuRenderer.renderScreen({ title, body, buttons, backRoute: options.backRoute || '', homeRoute: options.homeRoute === undefined ? 'main.home' : options.homeRoute });
}
function yes(value) { return value ? 'да' : 'нет'; }

async function renderHome(ctx = {}) {
  const self = debugExport.selfTest();
  return render('🧪 Debug / GitHub export', [
    'Внутренний раздел диагностики: свежий store-live, GitHub export, latest.json, latest-lite.json и no-cache.',
    'Токены не показываем. В интерфейсе видны только факт настройки, маска и пути файлов.',
    'Обычный debug не должен быть клиентским UX.',
    '',
    'Проверки:',
    ...FUNCTION_TREE.map((item, index) => `${index + 1}. ${item.title} — ${item.finalStep}.`),
    '',
    `No-cache: ${yes(self.noCacheHeadersReady)}. GitHub export: ${yes(self.githubExportReady)}. Redaction: ${yes(self.tokenRedactionReady)}.`
  ], [
    { text: '🟢 Store-live', route: routes.storeLive },
    { text: '🧪 Export dry-run', route: routes.exportPreview },
    { text: '📄 Lite export', route: routes.exportLite },
    { text: '✅ Self-test', route: routes.selftest },
    { text: '⚙️ Переменные debug', route: routes.env }
  ], { homeRoute: 'main.home' });
}

async function renderStoreLive(ctx = {}) {
  const data = debugExport.buildStoreLive();
  return render('🟢 Store-live', [
    'Endpoint: /debug/store-live',
    `Runtime: ${data.runtimeVersion}`,
    `GeneratedAt: ${data.generatedAt}`,
    'Ответ всегда должен идти с no-cache заголовками.',
    'На этом экране не показываем полный store, чтобы не засорять UX.'
  ], [
    { text: '🧪 Export dry-run', route: routes.exportPreview },
    { text: '↩️ К debug', route: routes.home }
  ], { backRoute: routes.home });
}

async function renderExportPreview(ctx = {}) {
  const result = await debugExport.exportToGithub({ dryRun: true });
  return render('🧪 GitHub export dry-run', [
    result.ok ? 'Dry-run готов: payload формируется.' : `Dry-run показал проблему: ${result.error || 'unknown'}.`,
    `Repo: ${result.config?.repo || 'не настроен'}`,
    `Branch: ${result.config?.branch || 'main'}`,
    `Latest: ${result.payloads?.latest?.path || 'debug/latest.json'}`,
    `Lite: ${result.payloads?.lite?.path || 'debug/latest-lite.json'}`,
    `Token configured: ${yes(result.config?.tokenConfigured)}`,
    'Dry-run не пишет в GitHub и не раскрывает токен.'
  ], [
    { text: '📄 Lite export', route: routes.exportLite },
    { text: '⚙️ Переменные debug', route: routes.env },
    { text: '↩️ К debug', route: routes.home }
  ], { backRoute: routes.home });
}

async function renderExportLite(ctx = {}) {
  const lite = debugExport.buildSnapshot({ lite: true });
  return render('📄 Lite export', [
    'Lite snapshot формируется отдельно от полного debug.',
    `Runtime: ${lite.runtimeVersion}`,
    `GeneratedAt: ${lite.generatedAt}`,
    `Mode: ${lite.mode}`,
    `Путь по умолчанию: ${debugExport.exportConfig().litePath}`
  ], [
    { text: '🧪 Export dry-run', route: routes.exportPreview },
    { text: '↩️ К debug', route: routes.home }
  ], { backRoute: routes.home });
}

async function renderSelftest(ctx = {}) {
  const self = debugExport.selfTest();
  return render('✅ Debug self-test', [
    `Runtime: ${self.runtimeVersion}`,
    `No-cache headers: ${yes(self.noCacheHeadersReady)}`,
    `GitHub export ready: ${yes(self.githubExportReady)}`,
    `Dry-run ready: ${yes(self.dryRunReady)}`,
    `Lite export ready: ${yes(self.liteExportReady)}`,
    `Token redaction: ${yes(self.tokenRedactionReady)}`,
    `Auth guard: ${yes(self.authGuardReady)}`
  ], [
    { text: '🟢 Store-live', route: routes.storeLive },
    { text: '↩️ К debug', route: routes.home }
  ], { backRoute: routes.home });
}

async function renderEnv(ctx = {}) {
  const cfg = debugExport.exportConfig();
  return render('⚙️ Переменные debug', [
    `GITHUB_DEBUG_TOKEN: ${cfg.tokenConfigured ? 'настроен' : 'не настроен'}`,
    `GITHUB_DEBUG_REPO: ${cfg.repo || 'не настроен'}`,
    `GITHUB_DEBUG_BRANCH: ${cfg.branch}`,
    `GITHUB_DEBUG_PATH: ${cfg.latestPath}`,
    `GITHUB_DEBUG_LITE_PATH: ${cfg.litePath}`,
    `DEBUG_EXPORT_ALLOW_PUBLIC: ${yes(cfg.allowPublic)}`,
    'Значения токенов не выводятся.'
  ], [
    { text: '🧪 Export dry-run', route: routes.exportPreview },
    { text: '↩️ К debug', route: routes.home }
  ], { backRoute: routes.home });
}

async function handleAction(ctx = {}) {
  const route = String(ctx.route || routes.home);
  if (route === routes.storeLive) return renderStoreLive(ctx);
  if (route === routes.exportPreview) return renderExportPreview(ctx);
  if (route === routes.exportLite) return renderExportLite(ctx);
  if (route === routes.selftest) return renderSelftest(ctx);
  if (route === routes.env) return renderEnv(ctx);
  return renderHome(ctx);
}

function selfTest() {
  const adapter = debugExport.selfTest();
  return {
    ok: adapter.ok !== false,
    runtimeVersion: RUNTIME,
    sectionId: 'debug_diagnostics',
    feature: 'debug_diagnostics.enabled',
    functionTreeReady: true,
    functionCount: FUNCTION_TREE.length,
    routeCount: Object.values(routes).length,
    routes,
    storeLiveReady: true,
    githubExportReady: adapter.githubExportReady === true,
    noCacheHeadersReady: adapter.noCacheHeadersReady === true,
    latestPathsReady: true,
    liteExportReady: adapter.liteExportReady === true,
    tokenRedactionReady: adapter.tokenRedactionReady === true,
    authGuardReady: adapter.authGuardReady === true,
    dangerousActionsDisabled: true,
    dataAdapter: adapter
  };
}

module.exports = { id: 'debug_diagnostics', title: 'Debug / диагностика', shortTitle: 'Debug', icon: '🧪', order: 140, feature: 'debug_diagnostics.enabled', routes, renderHome, handleAction, selfTest, RUNTIME, FUNCTION_TREE };