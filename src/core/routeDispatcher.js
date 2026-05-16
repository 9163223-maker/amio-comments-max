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

function flowErrorScreen(selected, ctx = {}) {
  const error = selected?.error || 'unknown';
  if (error === 'stale_flow_callback') {
    return menuRenderer.renderScreen({
      title: '⚠️ Старое меню больше не активно',
      body: [
        'Эта кнопка относится к другому сценарию и не будет выполнена.',
        selected.expectedFlow ? `Активный сценарий: ${selected.expectedFlow}` : '',
        selected.actualFlow ? `Кнопка из сценария: ${selected.actualFlow}` : '',
        'Начните действие заново из нужного раздела.'
      ].filter(Boolean),
      buttons: [{ text: '↩️ Назад к разделу', route: backRouteForFlow(selected.expectedFlow || ctx.payload?.flowId || selected.flow?.id || '') }],
      homeRoute: 'main.home'
    });
  }

  if (error === 'text_required') {
    return menuRenderer.renderScreen({
      title: '⚠️ Нужно ввести текст',
      body: ['Введите название и повторите шаг.', selected?.flow?.id ? `Сценарий: ${selected.flow.id}` : ''],
      buttons: [{ text: '↩️ Назад к разделу', route: backRouteForFlow(ctx.payload?.flowId || selected?.flow?.id || '') }],
      homeRoute: 'main.home'
    });
  }

  if (error === 'text_too_long') {
    return menuRenderer.renderScreen({
      title: '⚠️ Название слишком длинное',
      body: [`Максимум: ${selected.limit || 64} символа.`, 'Сократите название и повторите шаг.'],
      buttons: [{ text: '↩️ Назад к разделу', route: backRouteForFlow(ctx.payload?.flowId || selected?.flow?.id || '') }],
      homeRoute: 'main.home'
    });
  }

  return menuRenderer.renderScreen({
    title: '⚠️ Не удалось выполнить шаг',
    body: [
      `Ошибка: ${error}`,
      selected?.expected ? `Ожидался шаг: ${selected.expected}` : '',
      selected?.actual ? `Текущий шаг: ${selected.actual}` : ''
    ].filter(Boolean),
    buttons: [{ text: '↩️ Назад к разделу', route: backRouteForFlow(ctx.payload?.flowId || selected?.flow?.id || '') }],
    homeRoute: 'main.home'
  });
}

function renderFlow(result) {
  return flowScreen.renderFlowState(result, {
    icon: iconForFlow(result.flow?.id || ''),
    backRoute: backRouteForFlow(result.flow?.id || '')
  });
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
    if (!selected.ok) return flowErrorScreen(selected, ctx);
    return renderFlow(selected);
  }

  if (route === 'flow.input' || route === 'flow.input_text') {
    const accepted = await flowEngine.acceptInput(ctx);
    if (!accepted.ok) return flowErrorScreen(accepted, ctx);
    return renderFlow(accepted);
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

module.exports = { dispatch, mainMenu, START_ROUTES, backRouteForFlow, iconForFlow, flowErrorScreen, renderFlow };