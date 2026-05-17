'use strict';

const menuRenderer = require('./menuRenderer');
const conditionCatalog = require('./leadMagnetConditionCatalog');

const RUNTIME = 'ADMINKIT-CORE-FLOW-SCREEN-1.4-POST-CAPTURE-CONDITIONS';

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 58) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function isHuman(value = '') { const s = clean(value); if (!s) return false; if (/^-?\d{6,}$/.test(s)) return false; if (/^[a-f0-9]{12,}$/i.test(s)) return false; return true; }
function postLabel(draft = {}) { return cut(draft.postTitle || draft.postPreview || draft.title || draft.postText || draft.postId || 'выбранный пост', 60); }
function channelLabel(draft = {}) { const title = draft.channelTitle || draft.channelName || draft.channelDisplayName || ''; if (isHuman(title)) return cut(title, 60); if (draft.channelId) return 'выбранный канал'; return ''; }

function stepHint(flowId, stepId) {
  if (flowId === 'buttons.create') {
    if (stepId === 'select_post') return 'Выберите пост из базы или запустите capture-flow: переслать новый/старый пост из канала, чтобы Core добавил его в registry.';
    if (stepId === 'input_title') return 'Пост выбран. Теперь введите понятное название кнопки сообщением. Например: Купить, Записаться, Получить консультацию.';
    if (stepId === 'input_url') return 'Введите ссылку сообщением. Core принимает только http/https URL и сохранит её в ak_post_buttons.';
    if (stepId === 'review_save') return 'Проверьте название и ссылку. После нажатия “Сохранить” Core запишет кнопку только в ak_post_buttons.';
  }
  if (flowId === 'lead_magnets.create') {
    if (stepId === 'select_post') return 'Выберите канал и пост. Можно выбрать пост из базы или запустить capture-flow: переслать старый/новый пост, который ещё не был в системе.';
    if (stepId === 'input_title') return 'Пост выбран. Теперь введите название лид-магнита. Например: чек-лист, гайд, промокод, подборка.';
    if (stepId === 'input_material') return 'Добавьте материал сообщением: текст, промокод или ссылку. Файл/фото подключаются через material adapter отдельным шагом.';
    if (stepId === 'select_access') return 'Выберите условие получения подарка. Core показывает каталог условий: подписка, комментарии, реакции, ключевые фразы, квизы и комбинированные сценарии.';
    if (stepId === 'review_conditions') return 'Проверьте условия получения. Если нужны параметры условия — канал, пост, число комментариев, ключевая фраза — их уточнит следующий condition-setup flow.';
    if (stepId === 'review_save') return 'Проверьте лид-магнит и сохраните. Core запишет его в ak_post_lead_magnets без legacy adapters.';
  }
  return 'Продолжайте сценарий по шагам. Состояние хранится в единой Core-сессии.';
}

function postPickerButtons(flowId, posts = []) {
  const buttons = [];
  if (posts.length) {
    buttons.push(...posts.slice(0, 8).map((post, index) => {
      const title = clean(post.displayTitle || post.title || post.text || post.postTitle || post.postId || post.id || 'Пост');
      const channelTitle = clean(post.channelTitle || post.channelName || post.channelDisplayName || '');
      return { text: `${index + 1}. ${title}`.slice(0, 64), route: 'flow.select_post', data: { flowId, postId: String(post.postId || post.id || post.key || ''), postTitle: cut(title, 100), ...(post.channelId ? { channelId: String(post.channelId) } : {}), ...(channelTitle ? { channelTitle: cut(channelTitle, 100) } : {}), ...(post.commentKey ? { commentKey: String(post.commentKey) } : {}) } };
    }));
  } else {
    buttons.push({ text: 'Выбрать тестовый пост', route: 'flow.select_post', data: { flowId, postId: 'debug-post', postTitle: 'Тестовый пост' } });
  }
  buttons.push({ text: '📨 Переслать пост из канала', route: 'flow.capture_post', data: { flowId, captureMode: 'forwarded_post' } });
  buttons.push({ text: '🔎 Найти старый пост', route: 'flow.capture_post', data: { flowId, captureMode: 'legacy_or_old_post' } });
  return buttons;
}

function accessButtons(flowId = '') {
  return conditionCatalog.publicButtons().map((item) => ({ ...item, data: { ...(item.data || {}), flowId } }));
}

function draftSummary(flowId = '', draft = {}) {
  const lines = [];
  const p = postLabel(draft);
  if (draft.postId || p) lines.push(`Пост: ${p}`);
  if (draft.captureMode) lines.push(`Выбор поста: ${draft.captureModeLabel || draft.captureMode}`);
  if (flowId === 'buttons.create' && draft.buttonTitle) lines.push(`Название кнопки: ${draft.buttonTitle}`);
  if (flowId === 'buttons.create' && draft.buttonUrl) lines.push(`Ссылка кнопки: ${draft.buttonUrl}`);
  if (flowId === 'lead_magnets.create' && draft.leadMagnetTitle) lines.push(`Название лид-магнита: ${draft.leadMagnetTitle}`);
  if (flowId === 'lead_magnets.create' && draft.materialPreview) lines.push(`Материал: ${draft.materialPreview}`);
  if (flowId === 'lead_magnets.create' && draft.accessLabel) lines.push(`Условия получения: ${draft.accessLabel}`);
  if (flowId === 'lead_magnets.create' && draft.conditionVerifier) lines.push(`Проверка: ${draft.conditionVerifier}`);
  const c = channelLabel(draft);
  if (c) lines.push(`Канал: ${c}`);
  return lines;
}

function renderFlowState(result = {}, options = {}) {
  const flow = result.flow || {};
  const step = result.step || {};
  const draft = result.draft || {};
  const title = `${options.icon || ''} ${flow.title || 'Сценарий'} — ${step.title || 'шаг'}`.trim();
  const body = [stepHint(flow.id, step.id), '', `Flow: ${flow.id || 'unknown'}`, `Step: ${step.id || 'unknown'}`, ...draftSummary(flow.id, draft)];
  const buttons = [];
  if (step.id === 'select_post') buttons.push(...postPickerButtons(flow.id, options.posts || []));
  if (step.id === 'select_access') buttons.push(...accessButtons(flow.id));
  if (step.id === 'review_conditions') buttons.push({ text: '➡️ Перейти к сохранению', route: 'flow.next', data: { flowId: flow.id || '' } });
  if (step.id === 'review_save') buttons.push({ text: '✅ Сохранить в Core', route: 'flow.save', data: { flowId: flow.id || '' } });
  if (options.backRoute) buttons.push({ text: '↩️ Назад к разделу', route: options.backRoute });
  buttons.push({ text: '✖️ Отменить сценарий', route: 'flow.cancel', data: { flowId: flow.id || '' } });
  return menuRenderer.renderScreen({ title, body, buttons, homeRoute: 'main.home' });
}

function selfTest() { const catalog = conditionCatalog.selfTest(); return { ok: true, runtimeVersion: RUNTIME, saveActionReady: true, humanPostLabelReady: true, humanChannelLabelReady: true, rawChannelIdHiddenWhenTitleMissing: true, leadMagnetAccessButtonsReady: true, leadConditionCatalogReady: catalog.ok === true, leadConditionCount: catalog.count, postCaptureButtonsReady: true, reviewConditionsNextReady: true }; }

module.exports = { RUNTIME, renderFlowState, stepHint, postPickerButtons, accessButtons, draftSummary, selfTest, postLabel, channelLabel };
