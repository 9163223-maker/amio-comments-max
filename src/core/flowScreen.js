'use strict';

const menuRenderer = require('./menuRenderer');

function stepHint(flowId, stepId) {
  if (flowId === 'buttons.create') {
    if (stepId === 'select_post') return 'Сначала выберите пост, к которому нужно добавить CTA-кнопку. После выбора поста Core перейдёт к названию кнопки.';
    if (stepId === 'input_title') return 'Введите понятное название кнопки. Например: Купить, Записаться, Получить консультацию.';
    if (stepId === 'input_url') return 'Введите ссылку, которая откроется по нажатию на кнопку.';
    if (stepId === 'review_save') return 'Проверьте название и ссылку. После сохранения Core пересоберёт кнопки поста через postAddonManager.';
  }
  if (flowId === 'lead_magnets.create') {
    if (stepId === 'select_post') return 'Сначала выберите пост, к которому нужно добавить лид-магнит.';
    if (stepId === 'input_title') return 'Введите название лид-магнита. Например: чек-лист, гайд, промокод, подборка.';
    if (stepId === 'input_material') return 'Добавьте материал: текст, ссылку, файл или фото. Core сохранит материал отдельно от сценария.';
    if (stepId === 'select_access') return 'Выберите условие получения: всем, подписчикам, по кодовому слову или по другим доступным условиям тарифа.';
    if (stepId === 'review_conditions') return 'Проверьте условия получения. Для Pro позже будут доступны расширенные условия.';
    if (stepId === 'review_save') return 'Проверьте лид-магнит и сохраните. Данные клиента не перезаписываются, новые записи добавляются безопасно.';
  }
  return 'Продолжайте сценарий по шагам. Состояние хранится в единой Core-сессии.';
}

function renderFlowState(result = {}, options = {}) {
  const flow = result.flow || {};
  const step = result.step || {};
  const draft = result.draft || {};
  const title = `${options.icon || ''} ${flow.title || 'Сценарий'} — ${step.title || 'шаг'}`.trim();
  const body = [
    stepHint(flow.id, step.id),
    '',
    `Flow: ${flow.id || 'unknown'}`,
    `Step: ${step.id || 'unknown'}`
  ];
  if (draft.postId) body.push(`Пост: ${draft.postId}`);
  if (draft.channelId) body.push(`Канал: ${draft.channelId}`);

  const buttons = [];
  if (options.backRoute) buttons.push({ text: '↩️ Назад к разделу', route: options.backRoute });
  buttons.push({ text: '✖️ Отменить сценарий', route: 'flow.cancel', data: { flowId: flow.id || '' } });

  return menuRenderer.renderScreen({
    title,
    body,
    buttons,
    homeRoute: 'main.home'
  });
}

module.exports = { renderFlowState, stepHint };
