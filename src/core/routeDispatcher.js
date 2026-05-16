'use strict';

const sectionRegistry = require('./sectionRegistry');
const accessManager = require('./accessManager');
const menuRenderer = require('./menuRenderer');
const stateManager = require('./stateManager');
const flowEngine = require('./flowEngine');
const flowScreen = require('./flowScreen');

const START_ROUTES = new Set(['/start', 'start', 'старт', 'меню', 'main.home', 'main:home', 'home']);

async function mainMenu(ctx) {
  const sections = await accessManager.filterSections(ctx, sectionRegistry.listAll());
  return menuRenderer.renderMain(sections);
}

function backRouteForFlow(flowId = '') {
  if (flowId === 'buttons.create') return 'buttons.home';
  if (flowId === 'lead_magnets.create') return 'lead_magnets.home';
  return 'main.home';
}

function iconForFlow(flowId = '') {
  if (flowId === 'buttons.create') return '🔘';
  if (flowId === 'lead_magnets.create') return '🎁';
  return '';
}

async function dispatch(ctx = {}) {
  const route = String(ctx.route || '').trim();
  if (START_ROUTES.has(route.toLowerCase()) || !route) {
    if (ctx.adminId) await stateManager.resetSession(ctx.adminId, 'core_start');
    return mainMenu(ctx);
  }

  if (route === 'flow.cancel') {
    await flowEngine.cancel(ctx, 'core_flow_cancel');
    return menuRenderer.renderScreen({
      title: '✖️ Сценарий отменён',
      body: ['Текущий пошаговый сценарий очищен. Можно выбрать раздел заново.'],
      buttons: [],
      homeRoute: 'main.home'
    });
  }

  if (route === 'flow.select_post') {
    const selected = await flowEngine.selectPost(ctx);
    if (!selected.ok) {
      return menuRenderer.renderScreen({
        title: '⚠️ Не удалось выбрать пост',
        body: [`Ошибка: ${selected.error || 'unknown'}`, selected.expected ? `Ожидался шаг: ${selected.expected}` : '', selected.actual ? `Текущий шаг: ${selected.actual}` : ''].filter(Boolean),
        buttons: [{ text: '↩️ Назад к разделу', route: backRouteForFlow(ctx.payload?.flowId || selected.flow?.id || '') }],
        homeRoute: 'main.home'
      });
    }
    return flowScreen.renderFlowState(selected, {
      icon: iconForFlow(selected.flow?.id || ''),
      backRoute: backRouteForFlow(selected.flow?.id || '')
    });
  }

  if (route === 'billing.locked') {
    return menuRenderer.renderScreen({
      title: '🔒 Доступ ограничен',
      body: ['Эта функция доступна на расширенном тарифе.', 'Тарифы подключаются через accessManager, без патчей в меню.'],
      buttons: [{ text: '🏠 Главное меню', route: 'main.home' }],
      homeRoute: ''
    });
  }

  const map = sectionRegistry.routeMap();
  const section = map.get(route) || sectionRegistry.find(String(ctx.payload?.sectionId || ''));
  if (section && typeof section.handleAction === 'function') return section.handleAction(ctx);
  if (section && typeof section.renderHome === 'function') return section.renderHome(ctx);

  return menuRenderer.renderScreen({
    title: '⚠️ Неизвестный маршрут',
    body: [`Маршрут: ${route}`, 'Core не передаёт такие события в legacy bot.js.'],
    buttons: [{ text: '🏠 Главное меню', route: 'main.home' }],
    homeRoute: ''
  });
}

module.exports = { dispatch, mainMenu, START_ROUTES, backRouteForFlow, iconForFlow };
