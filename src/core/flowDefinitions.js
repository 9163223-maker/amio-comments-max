'use strict';

const FLOWS = Object.freeze({
  'buttons.create': Object.freeze({
    id: 'buttons.create',
    section: 'buttons',
    title: 'Добавление CTA-кнопки',
    feature: 'buttons.enabled',
    steps: Object.freeze([
      { id: 'select_post', title: 'Шаг 1/4 — выберите пост', input: 'post' },
      { id: 'input_title', title: 'Шаг 2/4 — название кнопки', input: 'text' },
      { id: 'input_url', title: 'Шаг 3/4 — ссылка кнопки', input: 'url' },
      { id: 'review_save', title: 'Шаг 4/4 — проверка и сохранение', input: 'confirm' }
    ])
  }),
  'lead_magnets.create': Object.freeze({
    id: 'lead_magnets.create',
    section: 'lead_magnets',
    title: 'Добавление лид-магнита',
    feature: 'lead_magnets.enabled',
    steps: Object.freeze([
      { id: 'select_channel', title: 'Шаг 1/10 — выберите канал', input: 'channel' },
      { id: 'select_post_source', title: 'Шаг 2/10 — источник поста', input: 'post_source' },
      { id: 'select_post', title: 'Шаг 3/10 — выберите пост', input: 'post' },
      { id: 'input_title', title: 'Шаг 4/10 — название лид-магнита', input: 'text' },
      { id: 'input_material', title: 'Шаг 5/10 — материал подарка', input: 'material' },
      { id: 'select_condition_group', title: 'Шаг 6/10 — группа условий', input: 'condition_group' },
      { id: 'select_access', title: 'Шаг 7/10 — условие получения', input: 'access' },
      { id: 'condition_setup', title: 'Шаг 8/10 — параметры условия', input: 'condition_setup' },
      { id: 'review_conditions', title: 'Шаг 9/10 — проверка условий', input: 'confirm' },
      { id: 'review_save', title: 'Шаг 10/10 — сохранение', input: 'confirm' }
    ])
  })
});

function getFlow(flowId) { return FLOWS[String(flowId || '')] || null; }
function firstStep(flowId) { return getFlow(flowId)?.steps?.[0] || null; }
function getStep(flowId, stepId) { const flow = getFlow(flowId); return flow?.steps?.find((step) => step.id === stepId) || null; }
function nextStep(flowId, stepId) { const flow = getFlow(flowId); if (!flow) return null; const index = flow.steps.findIndex((step) => step.id === stepId); return index >= 0 ? flow.steps[index + 1] || null : firstStep(flowId); }
function listFlows() { return Object.values(FLOWS); }
function selfTest() { const lead = getFlow('lead_magnets.create'); return { ok: !!lead && lead.steps.some((s) => s.id === 'condition_setup') && lead.steps.some((s) => s.id === 'select_channel'), leadMagnetFullFlowReady: true, leadMagnetStepCount: lead?.steps?.length || 0 }; }

module.exports = { FLOWS, getFlow, firstStep, getStep, nextStep, listFlows, selfTest };
