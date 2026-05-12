'use strict';

const Module = require('module');
const RUNTIME = 'CC6.7.1-V3-MENU-STRESS-SUMMARY';
let installed = false;
let expressWrapped = false;
let lastSummary = null;
let lastError = '';

function norm(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {} }
function countBy(list, field) {
  const out = {};
  for (const item of Array.isArray(list) ? list : []) {
    const key = norm(item && item[field]) || 'unknown';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}
function shortList(list, limit) {
  return (Array.isArray(list) ? list : []).slice(0, limit).map((x) => ({ route: x.route || '', code: x.code || '', error: x.error || '', text: x.text || '' }));
}
function makePlan(failures, warnings) {
  const codes = new Set([...(failures || []), ...(warnings || [])].map((x) => x.code));
  const plan = [];
  if (codes.has('render_exception')) plan.push('Исправить маршруты, которые падают при рендере.');
  if (codes.has('button_points_to_unknown_route')) plan.push('Добавить обработчики для кнопок, ведущих в неизвестные route.');
  if (codes.has('main_menu_anchor_missing')) plan.push('Вернуть кнопку Главное меню на вложенные экраны.');
  if (codes.has('section_anchor_missing')) plan.push('Вернуть кнопку Раздел на вложенные экраны.');
  if (codes.has('generic_fallback_visible') || codes.has('raw_route_fallback_visible')) plan.push('Убрать generic fallback: каждому route нужен свой экран.');
  if (!plan.length) plan.push('Закрепить one-active-menu: редактировать одно меню, не плодить новые блоки.');
  return plan;
}
async function summarize(adminId) {
  const stress = require('./v3-menu-stress-test');
  const result = await stress.runStressTest({ adminId: adminId || '17507246', sample: false });
  const failures = result.failures || [];
  const warnings = result.warnings || [];
  const summary = {
    ok: result.ok === true,
    runtimeVersion: RUNTIME,
    stressRuntimeVersion: result.runtimeVersion,
    generatedAt: new Date().toISOString(),
    conclusion: failures.length ? 'FAIL: меню пока нестабильно.' : warnings.length ? 'WARN: критических ошибок нет, но есть предупреждения.' : 'OK: дерево меню прошло проверку.',
    totals: result.totals || {},
    failureCodes: countBy(failures, 'code'),
    warningCodes: countBy(warnings, 'code'),
    topFailures: shortList(failures, 20),
    topWarnings: shortList(warnings, 20),
    actionPlan: makePlan(failures, warnings),
    safe: { noMaxApiCalls: true, noPostPatch: true, compact: true }
  };
  lastSummary = summary;
  return summary;
}
function installExpress() {
  if (Module._load.__adminkitV3MenuStressSummaryExpress) return;
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__adminkitV3MenuStressSummaryWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__adminkitV3MenuStressSummaryRoutes) {
          app.__adminkitV3MenuStressSummaryRoutes = true;
          app.get(['/debug/v3-menu-summary', '/debug/menu-summary'], async (req, res) => {
            noCache(res);
            try { res.json(await summarize(norm(req.query && req.query.adminId))); }
            catch (error) { lastError = error && error.message ? error.message : String(error); res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: lastError }); }
          });
          app.get('/debug/v3-menu-summary-last', (req, res) => { noCache(res); res.json(lastSummary || selfTest()); });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__adminkitV3MenuStressSummaryWrap = true;
      expressWrapped = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__adminkitV3MenuStressSummaryExpress = true;
}
function install() { if (installed) return selfTest(); installed = true; installExpress(); return selfTest(); }
function selfTest() { return { ok: installed, runtimeVersion: RUNTIME, installed, expressWrapped, lastError, endpoint: '/debug/v3-menu-summary' }; }
module.exports = { RUNTIME, install, selfTest, summarize };
