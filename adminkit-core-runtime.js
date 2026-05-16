'use strict';

// AdminKit Core foundation.
// This file is intentionally independent from the legacy CC7.5.x loader chain.
// It can be imported safely for audits and self-tests before production is switched to Core.

const RUNTIME = 'ADMINKIT-CORE-1.1-FOUNDATION';
const SOURCE = 'adminkit-core-1-1-foundation';

function lazy(name) {
  // Lazy loading avoids circular imports with stateManager and keeps Core testable.
  return require(name);
}

async function dispatch(ctx = {}) {
  return lazy('./src/core/routeDispatcher').dispatch(ctx);
}

async function renderMain(ctx = {}) {
  return lazy('./src/core/routeDispatcher').mainMenu(ctx);
}

function selfTest() {
  const sectionRegistry = lazy('./src/core/sectionRegistry');
  const accessManager = lazy('./src/core/accessManager');
  const menuRenderer = lazy('./src/core/menuRenderer');

  const sections = sectionRegistry.listAll();
  const ids = sections.map((section) => section.id);
  const routeMap = sectionRegistry.routeMap();
  const required = ['channels', 'comments', 'buttons', 'lead_magnets', 'moderation', 'archive', 'stats', 'settings'];
  const missing = required.filter((id) => !ids.includes(id));

  return {
    ok: missing.length === 0 && routeMap.size >= sections.length,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    isCoreRuntime: true,
    activeInProduction: false,
    purpose: 'clean foundation for future switch from layered CC7.5.x wrappers to AdminKit Core',
    sections: ids,
    missingSections: missing,
    routeCount: routeMap.size,
    accessPlans: Object.keys(accessManager.PLAN_FEATURES || {}),
    rendererVersion: menuRenderer.inlineKeyboard([[menuRenderer.btn('test', 'main.home')]])[0]?.payload?.version || 0,
    constraints: {
      oneActiveScreen: true,
      sectionRegistryDriven: true,
      planAccessReady: true,
      noLegacyWrapperChain: true,
      noPublicAppOverride: true
    }
  };
}

module.exports = {
  RUNTIME,
  SOURCE,
  isCoreRuntime: true,
  dispatch,
  renderMain,
  selfTest
};
