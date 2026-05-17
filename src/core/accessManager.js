'use strict';

const accountManager = require('./accountManager');

const RUNTIME = 'ADMINKIT-CORE-ACCESS-MANAGER-1.32-FULL-MENU-FEATURES';
const DEFAULT_PLAN = 'free';

const PLAN_FEATURES = {
  free: {
    'channels.enabled': true,
    'comments.enabled': true,
    'photo_comments.enabled': false,
    'reactions_replies.enabled': true,
    'buttons.enabled': true,
    'buttons.max_per_post': 1,
    'lead_magnets.enabled': true,
    'lead_magnets.max_per_post': 1,
    'lead_magnets.condition.keyword': false,
    'lead_magnets.condition.channels_many': false,
    'post_highlights.enabled': false,
    'polls.enabled': false,
    'post_editor.enabled': false,
    'moderation.enabled': false,
    'archive.enabled': false,
    'stats.enabled': true,
    'stats.advanced': false,
    'navigation.enabled': true,
    'start_landing.enabled': true,
    'debug_diagnostics.enabled': false,
    'production_checklist.enabled': false,
    'settings.enabled': false
  },
  start: {
    'channels.enabled': true,
    'comments.enabled': true,
    'comments.photo': true,
    'photo_comments.enabled': true,
    'reactions_replies.enabled': true,
    'buttons.enabled': true,
    'buttons.max_per_post': 3,
    'lead_magnets.enabled': true,
    'lead_magnets.max_per_post': 3,
    'lead_magnets.condition.keyword': true,
    'lead_magnets.condition.channels_many': false,
    'post_highlights.enabled': true,
    'polls.enabled': true,
    'post_editor.enabled': true,
    'moderation.enabled': true,
    'archive.enabled': true,
    'archive.restore_text': true,
    'stats.enabled': true,
    'stats.advanced': false,
    'navigation.enabled': true,
    'start_landing.enabled': true,
    'debug_diagnostics.enabled': false,
    'production_checklist.enabled': false,
    'settings.enabled': true
  },
  pro: {
    '*': true,
    'buttons.max_per_post': 10,
    'lead_magnets.max_per_post': 10,
    'archive.storage_mb': 1024
  }
};

function valueFromPlan(plan, featureCode) {
  const features = PLAN_FEATURES[plan] || PLAN_FEATURES[DEFAULT_PLAN];
  if (features['*'] === true && features[featureCode] === undefined) return true;
  return features[featureCode];
}

function readOverride(account, featureCode) {
  const featureOverrides = account?.features_override || account?.featuresOverride || {};
  const limitOverrides = account?.limits_override || account?.limitsOverride || {};
  if (featureOverrides && Object.prototype.hasOwnProperty.call(featureOverrides, featureCode)) return featureOverrides[featureCode];
  if (limitOverrides && Object.prototype.hasOwnProperty.call(limitOverrides, featureCode)) return limitOverrides[featureCode];
  return undefined;
}

async function getAccountPlan(ctx = {}) { return accountManager.getPlanForContext(ctx); }
async function getAccount(ctx = {}) { if (ctx.account) return ctx.account; return accountManager.getAccountForAdmin(ctx.adminId || ctx.admin_id || ''); }

function evaluate(account, ctx = {}, featureCode) {
  const plan = String(ctx.planCode || ctx.account?.planCode || ctx.account?.plan_code || account?.plan_code || DEFAULT_PLAN).toLowerCase();
  const override = readOverride(account, featureCode);
  const value = override === undefined ? valueFromPlan(plan, featureCode) : override;
  return { ok: value === true || typeof value === 'number', plan, accountId: account?.account_id || account?.accountId || '', featureCode, value: value === undefined ? false : value };
}

async function can(ctx = {}, featureCode) {
  const account = await getAccount(ctx);
  return evaluate(account, { ...ctx, account }, featureCode);
}

async function limit(ctx = {}, featureCode, fallback = 0) {
  const result = await can(ctx, featureCode);
  return typeof result.value === 'number' ? result.value : fallback;
}

async function assertCan(ctx = {}, featureCode) {
  const result = await can(ctx, featureCode);
  if (!result.ok) {
    const error = new Error('feature_not_available_on_plan');
    error.code = 'feature_not_available_on_plan';
    error.featureCode = featureCode;
    error.plan = result.plan;
    error.accountId = result.accountId;
    throw error;
  }
  return result;
}

async function filterSections(ctx = {}, sections = []) {
  const account = await getAccount(ctx);
  const enrichedCtx = { ...ctx, account };
  return sections.map((section) => {
    const feature = section.feature || `${section.id}.enabled`;
    const allowed = evaluate(account, enrichedCtx, feature);
    return { ...section, locked: !allowed.ok, lockReason: allowed.ok ? '' : 'Доступно на расширенном тарифе' };
  });
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    batchedFilterSections: true,
    planCount: Object.keys(PLAN_FEATURES).length,
    fullMenuFeatureGatesReady: true,
    fullMenuFeatureCodes: [
      'photo_comments.enabled',
      'reactions_replies.enabled',
      'post_highlights.enabled',
      'polls.enabled',
      'post_editor.enabled',
      'navigation.enabled',
      'start_landing.enabled',
      'debug_diagnostics.enabled',
      'production_checklist.enabled'
    ],
    accountManager: accountManager.selfTest ? accountManager.selfTest() : null
  };
}

module.exports = { RUNTIME, DEFAULT_PLAN, PLAN_FEATURES, getAccountPlan, getAccount, can, limit, assertCan, filterSections, evaluate, selfTest };
