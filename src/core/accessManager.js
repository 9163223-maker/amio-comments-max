'use strict';

const DEFAULT_PLAN = 'free';

const PLAN_FEATURES = {
  free: {
    'channels.enabled': true,
    'comments.enabled': true,
    'buttons.enabled': true,
    'buttons.max_per_post': 1,
    'lead_magnets.enabled': true,
    'lead_magnets.max_per_post': 1,
    'lead_magnets.condition.keyword': false,
    'lead_magnets.condition.channels_many': false,
    'archive.enabled': false,
    'stats.enabled': true,
    'stats.advanced': false
  },
  start: {
    'channels.enabled': true,
    'comments.enabled': true,
    'comments.photo': true,
    'buttons.enabled': true,
    'buttons.max_per_post': 3,
    'lead_magnets.enabled': true,
    'lead_magnets.max_per_post': 3,
    'lead_magnets.condition.keyword': true,
    'lead_magnets.condition.channels_many': false,
    'archive.enabled': true,
    'archive.restore_text': true,
    'stats.enabled': true,
    'stats.advanced': false
  },
  pro: {
    '*': true,
    'buttons.max_per_post': 10,
    'lead_magnets.max_per_post': 10,
    'archive.storage_mb': 1024
  }
};

async function getAccountPlan(ctx = {}) {
  return String(ctx.planCode || ctx.account?.planCode || DEFAULT_PLAN).toLowerCase();
}

async function can(ctx = {}, featureCode) {
  const plan = await getAccountPlan(ctx);
  const features = PLAN_FEATURES[plan] || PLAN_FEATURES[DEFAULT_PLAN];
  if (features['*'] === true) return { ok: true, plan, featureCode, value: true };
  const value = features[featureCode];
  return { ok: value === true || typeof value === 'number', plan, featureCode, value: value === undefined ? false : value };
}

async function assertCan(ctx = {}, featureCode) {
  const result = await can(ctx, featureCode);
  if (!result.ok) {
    const error = new Error('feature_not_available_on_plan');
    error.code = 'feature_not_available_on_plan';
    error.featureCode = featureCode;
    error.plan = result.plan;
    throw error;
  }
  return result;
}

async function filterSections(ctx = {}, sections = []) {
  const out = [];
  for (const section of sections) {
    const feature = section.feature || `${section.id}.enabled`;
    const allowed = await can(ctx, feature);
    out.push({ ...section, locked: !allowed.ok, lockReason: allowed.ok ? '' : 'Доступно на расширенном тарифе' });
  }
  return out;
}

module.exports = { DEFAULT_PLAN, PLAN_FEATURES, getAccountPlan, can, assertCan, filterSections };
