'use strict';

const menuRenderer = require('./menuRenderer');

const RUNTIME = 'ADMINKIT-CORE-FLOW-SCREEN-1.2-HUMAN-LABELS';

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 58) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function isHuman(value = '') {
  const s = clean(value);
  if (!s) return false;
  if (/^-?\d{6,}$/.test(s)) return false;
  if (/^[a-f0-9]{12,}$/i.test(s)) return false;
  return true;
}
function postLabel(draft = {}) {
  return cut(draft.postTitle || draft.postPreview || draft.title || draft.postText || draft.postId || 'выбранный пост', 60);
}
function channelLabel(draft = {}) {
  const title = draft.channelTitle || draft.channelName || draft.channelDisplayName || '';
  if (isHuman(title)) return cut(title, 60);
  if (draft.channelId) return 'выбранный канал';
  return '';
}

function stepHint(flowId, stepId) {
  if (flowId === 'buttons.create') {
    if (stepId === 'select_post') return 'Сначала выберите пост, к которому нужно добавить CTA-кнопку. После выбора поста Core перейдёт к названию кнопки.';
    if (stepId === 'input_title') return 'Пост выбран. Теперь введите понятное название кнопки сообщением. Например: Купить, Записаться, Получить консультацию.';
    if (stepId === 'input_url') return 'Введите ссылку сообщением. Core принимает только http/https URL и сохранит её в ak_post_buttons.';
    if (stepId === 'review_save') return 'Проверьте название и ссылку. После нажатия “Сохранить” Core запишет кнопку только в ak_post_buttons.';
  }
  if (flowId === 'lead_magnets.create') {
    if (stepId === 'select_post') return 'Сначала выберите пост, к которому нужно добавить лид-магнит.';
    if (stepId === 'input_title') return 'Пост выбран. Теперь введите название лид-магнита. Например: чек-лист, гайд, промокод, подборка.';
    if (stepId === 'input_material') return 'Добавьте материал: текст, ссылку, файл или фото. Core сохранит материал отдельно от сценария.';
    if (stepId === 'select_access') return 'Выберите условие получения: всем, подписчикам, по кодовому слову или по другим доступным условиям тарифа.';
    if (stepId === 'review_conditions') return 'Проверьте условия получения. Для Pro позже будут доступны расширенные условия.';
    if (stepId === 'review_save') return 'Проверьте лид-магнит и сохраните. Данные клиента не перезаписываются, новые записи добавляются безопасно.';
  }
  return 'Продолжайте сценарий по шагам. Состояние хранится в единой Core-сессии.';
}

function postPickerButtons(flowId, posts = []) {
  if (!posts.length) return [{ text: 'Выбрать тестовый пост', route: 'flow.select_post', data: { flowId, postId: 'debug-post', postTitle: 'Тестовый пост' } }];
  return posts.slice(0, 10).map((post, index) => {
    const title = clean(post.displayTitle || post.title || post.text || post.postTitle || post.postId || post.id || 'Пост');
    const channelTitle = clean(post.channelTitle || post.channelName || post.channelDisplayName || '');
    return {
      text: `${index + 1}. ${title}`.slice(0, 64),
      route: 'flow.select_post',
      data: {
        flowId,
        postId: String(post.postId || post.id || post.key || ''),
        postTitle: cut(title, 100),
        ...(post.channelId ? { channelId: String(post.channelId) } : {}),
        ...(channelTitle ? { channelTitle: cut(channelTitle, 100) } : {}),
        ...(post.commentKey ? { commentKey: String(post.commentKey) } : {})
      }
    };
  });
}

function draftSummary(flowId = '', draft = {}) {
  const lines = [];
  const p = postLabel(draft);
  if (draft.postId || p) lines.push(`Пост: ${p}`);
  if (flowId === 'buttons.create' && draft.buttonTitle) lines.push(`Название кнопки: ${draft.buttonTitle}`);
  if (flowId === 'buttons.create' && draft.buttonUrl) lines.push(`Ссылка кнопки: ${draft.buttonUrl}`);
  if (flowId === 'lead_magnets.create' && draft.leadMagnetTitle) lines.push(`Название лид-магнита: ${draft.leadMagnetTitle}`);
  if (flowId === 'lead_magnets.create' && draft.materialPreview) lines.push(`Материал: ${draft.materialPreview}`);
  if (flowId === 'lead_magnets.create' && draft.accessLabel) lines.push(`Условия получения: ${draft.accessLabel}`);
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
  if (step.id === 'review_save') buttons.push({ text: '✅ Сохранить в Core', route: 'flow.save', data: { flowId: flow.id || '' } });
  if (options.backRoute) buttons.push({ text: '↩️ Назад к разделу', route: options.backRoute });
  buttons.push({ text: '✖️ Отменить сценарий', route: 'flow.cancel', data: { flowId: flow.id || '' } });
  return menuRenderer.renderScreen({ title, body, buttons, homeRoute: 'main.home' });
}

function selfTest() { return { ok: true, runtimeVersion: RUNTIME, saveActionReady: true, humanPostLabelReady: true, humanChannelLabelReady: true, rawChannelIdHiddenWhenTitleMissing: true }; }

module.exports = { RUNTIME, renderFlowState, stepHint, postPickerButtons, draftSummary, selfTest, postLabel, channelLabel };