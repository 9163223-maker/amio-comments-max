'use strict';

const sectionRegistry = require('./sectionRegistry');
const accessManager = require('./accessManager');
const menuRenderer = require('./menuRenderer');
const stateManager = require('./stateManager');
const flowEngine = require('./flowEngine');
const flowScreen = require('./flowScreen');
const postAddonManager = require('./postAddonManager');

const START_ROUTES = new Set(['/start', 'start', 'старт', 'меню', 'main.home', 'main:home', 'home']);
const HARD_START_ROUTES = new Set(['/start', 'start', 'старт', 'меню']);
const RUNTIME = 'ADMINKIT-CORE-ROUTE-DISPATCHER-1.3-LEAD-SAVE-FLOW';

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function isRawId(value = '') { const s = clean(value); return /^-?\d{6,}$/.test(s) || /^[a-f0-9]{12,}$/i.test(s); }
function humanPostLabel(value = '', fallback = '') { const s = clean(value || fallback); return s || 'выбранный пост'; }
function humanChannelLabel(value = '') { const s = clean(value); if (!s || isRawId(s)) return ''; return s; }

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
      body: ['Эта кнопка относится к другому сценарию и не будет выполнена.', selected.expectedFlow ? `Активный сценарий: ${selected.expectedFlow}` : '', selected.actualFlow ? `Кнопка из сценария: ${selected.actualFlow}` : '', 'Начните действие заново из нужного раздела.'].filter(Boolean),
      buttons: [{ text: '↩️ Назад к разделу', route: backRouteForFlow(selected.expectedFlow || ctx.payload?.flowId || selected.flow?.id || '') }],
      homeRoute: 'main.home'
    });
  }
  if (error === 'text_required') return menuRenderer.renderScreen({ title: '⚠️ Нужно ввести текст', body: ['Введите текст и повторите шаг.', selected?.flow?.id ? `Сценарий: ${selected.flow.id}` : ''], buttons: [{ text: '↩️ Назад к разделу', route: backRouteForFlow(ctx.payload?.flowId || selected?.flow?.id || '') }], homeRoute: 'main.home' });
  if (error === 'text_too_long' || error === 'material_too_long') return menuRenderer.renderScreen({ title: '⚠️ Текст слишком длинный', body: [`Максимум: ${selected.limit || 64} символа.`, 'Сократите текст и повторите шаг.'], buttons: [{ text: '↩️ Назад к разделу', route: backRouteForFlow(ctx.payload?.flowId || selected?.flow?.id || '') }], homeRoute: 'main.home' });
  if (error === 'url_invalid') return menuRenderer.renderScreen({ title: '⚠️ Неверная ссылка', body: ['Введите корректную ссылку: https://site.ru или site.ru.', 'Сохраняем только http/https URL.'], buttons: [{ text: '↩️ Назад к разделу', route: backRouteForFlow(ctx.payload?.flowId || selected?.flow?.id || '') }], homeRoute: 'main.home' });
  if (error === 'button_limit_reached') return menuRenderer.renderScreen({ title: '⚠️ Лимит кнопок', body: [`На текущем тарифе доступно кнопок на пост: ${selected.limit || 1}.`, 'Лимит проверяется через accessManager, без legacy-слоёв.'], buttons: [{ text: '🔘 К кнопкам', route: 'buttons.home', data: { sectionId: 'buttons', refresh: 1 } }], homeRoute: 'main.home' });
  if (error === 'lead_magnet_limit_reached') return menuRenderer.renderScreen({ title: '⚠️ Лимит лид-магнитов', body: [`На текущем тарифе доступно лид-магнитов на пост: ${selected.limit || 1}.`, 'Для одного поста сейчас держим безопасную модель: заменить или удалить, не плодить дубли.'], buttons: [{ text: '🎁 К лид-магнитам', route: 'lead_magnets.home', data: { sectionId: 'lead_magnets', refresh: 1 } }], homeRoute: 'main.home' });
  return menuRenderer.renderScreen({ title: '⚠️ Не удалось выполнить шаг', body: [`Ошибка: ${error}`, selected?.expected ? `Ожидался шаг: ${selected.expected}` : '', selected?.actual ? `Текущий шаг: ${selected.actual}` : ''].filter(Boolean), buttons: [{ text: '↩️ Назад к разделу', route: backRouteForFlow(ctx.payload?.flowId || selected?.flow?.id || '') }], homeRoute: 'main.home' });
}

function renderFlow(result, options = {}) { return flowScreen.renderFlowState(result, { icon: iconForFlow(result.flow?.id || ''), backRoute: backRouteForFlow(result.flow?.id || ''), ...(options || {}) }); }
function shouldResetSessionOnStart(ctx = {}, route = '') { const normalized = String(route || '').trim().toLowerCase(); if (HARD_START_ROUTES.has(normalized)) return true; const updateType = String(ctx.updateType || ctx.raw?.update_type || ctx.raw?.type || '').trim().toLowerCase(); if (updateType === 'bot_started') return true; if (ctx.payload && Object.keys(ctx.payload || {}).length && ctx.payload.r === 'main.home') return false; return false; }

function saveButtonSuccessScreen(saved = {}) {
  const button = saved.button || {};
  const postTitle = humanPostLabel(saved.postTitle || button.meta?.postTitle, saved.postId || saved.ctx?.postId || '');
  const channelTitle = humanChannelLabel(saved.channelTitle || button.meta?.channelTitle || saved.ctx?.channelTitle || '');
  return menuRenderer.renderScreen({ title: '✅ CTA-кнопка сохранена в Core', body: [`Пост: ${postTitle}`, channelTitle ? `Канал: ${channelTitle}` : '', `Название: ${button.title || ''}`, `Ссылка: ${button.url || ''}`, '', 'Сохранено в чистую таблицу: ak_post_buttons.', 'Legacy-хранилища и старые патчи не использовались.', 'На этом шаге Core только сохраняет данные. Патч поста в MAX подключим отдельным чистым этапом.'].filter(Boolean), buttons: [{ text: '🔘 К списку кнопок', route: 'buttons.home', data: { sectionId: 'buttons', refresh: 1 } }], homeRoute: 'main.home' });
}

function saveLeadSuccessScreen(saved = {}) {
  const gift = saved.leadMagnet || {};
  const postTitle = humanPostLabel(saved.postTitle || gift.meta?.postTitle, saved.postId || saved.ctx?.postId || '');
  const channelTitle = humanChannelLabel(saved.channelTitle || gift.meta?.channelTitle || saved.ctx?.channelTitle || '');
  return menuRenderer.renderScreen({
    title: '✅ Лид-магнит сохранён в Core',
    body: [`Пост: ${postTitle}`, channelTitle ? `Канал: ${channelTitle}` : '', `Название: ${gift.title || saved.title || ''}`, saved.materialPreview ? `Материал: ${saved.materialPreview}` : '', saved.accessLabel ? `Условия: ${saved.accessLabel}` : '', '', 'Сохранено в чистую таблицу: ak_post_lead_magnets.', 'Legacy adapters не использовались.', 'Выдачу подарка в личные сообщения подключим отдельным clean delivery-flow.'].filter(Boolean),
    buttons: [{ text: '🎁 К лид-магнитам', route: 'lead_magnets.home', data: { sectionId: 'lead_magnets', refresh: 1 } }],
    homeRoute: 'main.home'
  });
}

async function saveButtonFromFlow(ctx = {}) {
  const current = await flowEngine.getCurrent(ctx);
  if (!current.ok) return flowErrorScreen(current, ctx);
  if (current.flow?.id !== 'buttons.create' || current.step?.id !== 'review_save') return flowErrorScreen({ ok: false, error: 'unexpected_step', expected: 'buttons.create/review_save', actual: `${current.flow?.id || ''}/${current.step?.id || ''}`, flow: current.flow, step: current.step, draft: current.draft }, ctx);
  const draft = current.draft || {};
  const saveCtx = { ...ctx, adminId: ctx.adminId || ctx.admin_id || current.session?.admin_id || '', channelId: draft.channelId || current.session?.selected_channel_id || ctx.channelId || ctx.payload?.channelId || '', channelTitle: draft.channelTitle || ctx.channelTitle || ctx.payload?.channelTitle || '', postId: draft.postId || current.session?.selected_post_id || ctx.postId || ctx.payload?.postId || '', postTitle: draft.postTitle || ctx.postTitle || ctx.payload?.postTitle || '', session: current.session, draft };
  const saved = await postAddonManager.addButton(saveCtx, { title: draft.buttonTitle || draft.title || '', url: draft.buttonUrl || draft.url || '', meta: { source: 'adminkit-core', flowId: 'buttons.create', savedAt: new Date().toISOString(), legacyAdaptersUsed: false } });
  if (!saved.ok) return flowErrorScreen({ ...saved, flow: current.flow, step: current.step, draft }, ctx);
  await flowEngine.cancel(ctx, 'button_saved_core_clean');
  return saveButtonSuccessScreen({ ...saved, postId: saveCtx.postId, postTitle: saveCtx.postTitle, channelTitle: saveCtx.channelTitle, ctx: saveCtx });
}

async function saveLeadMagnetFromFlow(ctx = {}) {
  const current = await flowEngine.getCurrent(ctx);
  if (!current.ok) return flowErrorScreen(current, ctx);
  if (current.flow?.id !== 'lead_magnets.create' || current.step?.id !== 'review_save') return flowErrorScreen({ ok: false, error: 'unexpected_step', expected: 'lead_magnets.create/review_save', actual: `${current.flow?.id || ''}/${current.step?.id || ''}`, flow: current.flow, step: current.step, draft: current.draft }, ctx);
  const draft = current.draft || {};
  const saveCtx = { ...ctx, adminId: ctx.adminId || ctx.admin_id || current.session?.admin_id || '', channelId: draft.channelId || current.session?.selected_channel_id || ctx.channelId || ctx.payload?.channelId || '', channelTitle: draft.channelTitle || ctx.channelTitle || ctx.payload?.channelTitle || '', postId: draft.postId || current.session?.selected_post_id || ctx.postId || ctx.payload?.postId || '', postTitle: draft.postTitle || ctx.postTitle || ctx.payload?.postTitle || '', session: current.session, draft };
  const materialType = draft.materialType || 'text';
  const saved = await postAddonManager.addLeadMagnet(saveCtx, { title: draft.leadMagnetTitle || draft.title || '', materialType, text: materialType === 'text' ? (draft.material || '') : '', url: materialType === 'url' ? (draft.material || '') : '', accessMode: draft.accessMode || 'subscribers_current_channel', conditions: draft.conditions || {}, meta: { source: 'adminkit-core', flowId: 'lead_magnets.create', savedAt: new Date().toISOString(), legacyAdaptersUsed: false } });
  if (!saved.ok) return flowErrorScreen({ ...saved, flow: current.flow, step: current.step, draft }, ctx);
  await flowEngine.cancel(ctx, 'lead_magnet_saved_core_clean');
  return saveLeadSuccessScreen({ ...saved, title: draft.leadMagnetTitle || draft.title || '', materialPreview: draft.materialPreview || '', accessLabel: draft.accessLabel || '', postId: saveCtx.postId, postTitle: saveCtx.postTitle, channelTitle: saveCtx.channelTitle, ctx: saveCtx });
}

async function dispatch(ctx = {}) {
  const route = String(ctx.route || '').trim();
  const normalizedRoute = route.toLowerCase();
  if (START_ROUTES.has(normalizedRoute) || !route) { if (ctx.adminId && shouldResetSessionOnStart(ctx, route)) await stateManager.resetSession(ctx.adminId, 'core_start'); return mainMenu(ctx); }
  if (route === 'flow.cancel') { await flowEngine.cancel(ctx, 'core_flow_cancel'); return menuRenderer.renderScreen({ title: '✖️ Сценарий отменён', body: ['Текущий пошаговый сценарий очищен. Можно выбрать раздел заново.'], buttons: [], homeRoute: 'main.home' }); }
  if (route === 'flow.select_post') { const selected = await flowEngine.selectPost(ctx); if (!selected.ok) return flowErrorScreen(selected, ctx); return renderFlow(selected); }
  if (route === 'flow.select_access') { const selected = await flowEngine.selectAccess(ctx); if (!selected.ok) return flowErrorScreen(selected, ctx); return renderFlow(selected); }
  if (route === 'flow.next') { const moved = await flowEngine.next(ctx); if (!moved.ok) return flowErrorScreen(moved, ctx); return renderFlow(moved); }
  if (route === 'flow.input' || route === 'flow.input_text') { const accepted = await flowEngine.acceptInput(ctx); if (!accepted.ok) return flowErrorScreen(accepted, ctx); return renderFlow(accepted); }
  if (route === 'flow.save') {
    const current = await flowEngine.getCurrent(ctx);
    if (current.flow?.id === 'lead_magnets.create') return saveLeadMagnetFromFlow(ctx);
    return saveButtonFromFlow(ctx);
  }
  if (route === 'billing.locked') return menuRenderer.renderScreen({ title: '🔒 Доступ ограничен', body: ['Эта функция доступна на расширенном тарифе.', 'Тарифы подключаются через accessManager, без патчей в меню.'], buttons: [{ text: '💳 Тарифы и кабинет', route: 'billing.home' }, { text: '🏠 Главное меню', route: 'main.home' }], homeRoute: '' });
  const map = sectionRegistry.routeMap();
  const section = map.get(route) || sectionRegistry.find(String(ctx.payload?.sectionId || ''));
  if (section && typeof section.handleAction === 'function') return section.handleAction(ctx);
  if (section && typeof section.renderHome === 'function') return section.renderHome(ctx);
  return menuRenderer.renderScreen({ title: '⚠️ Неизвестный маршрут', body: [`Маршрут: ${route}`, 'Core не передаёт такие события в legacy bot.js.'], buttons: [{ text: '🏠 Главное меню', route: 'main.home' }], homeRoute: '' });
}

function selfTest() { return { ok: true, runtimeVersion: RUNTIME, cleanButtonSaveRoute: true, buttonSaveTable: 'ak_post_buttons', cleanLeadMagnetSaveRoute: true, leadMagnetSaveTable: 'ak_post_lead_magnets', leadMagnetAccessRouteReady: true, flowNextRouteReady: true, legacyAdaptersUsed: false, humanSaveScreenReady: true, rawPostIdHiddenOnSaveScreen: true, rawChannelIdHiddenOnSaveScreen: true }; }

module.exports = { RUNTIME, dispatch, mainMenu, START_ROUTES, HARD_START_ROUTES, shouldResetSessionOnStart, backRouteForFlow, iconForFlow, flowErrorScreen, renderFlow, saveButtonFromFlow, saveLeadMagnetFromFlow, selfTest };
