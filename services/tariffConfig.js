'use strict';

const PLAN_ORDER = ['free', 'trial', 'start', 'pro', 'business'];

const FEATURE_LABELS = {
  channels: 'Каналы',
  comments: 'Комментарии',
  text_comments: 'Текстовые комментарии',
  photo_comments: 'Фото в комментариях',
  reactions_replies: 'Реакции и ответы',
  buttons: 'Кнопки под постами',
  basic_stats: 'Базовая статистика',
  gifts: 'Подарки / лид-магниты',
  advanced_stats: 'Расширенная статистика',
  ad_links: 'Рекламные ссылки',
  polls: 'Опросы',
  highlights: 'Выделение постов',
  moderation: 'Модерация',
  export: 'Экспорт данных',
  priority_support: 'Приоритетная поддержка',
  attribution: 'Расширенный attribution',
  post_editor: 'Редактор постов',
  archive: 'Архив постов',
  settings: 'Настройки'
};

const TARIFFS = {
  free: {
    id: 'free',
    name: 'Trial / Free',
    status: 'available',
    maxChannels: 1,
    description: 'Пробный доступ для базовой проверки комментариев.',
    features: {
      channels: true,
      comments: true,
      text_comments: true,
      photo_comments: false,
      reactions_replies: false,
      buttons: false,
      basic_stats: false,
      gifts: false,
      advanced_stats: false,
      ad_links: false,
      polls: false,
      highlights: false,
      moderation: false,
      export: false,
      priority_support: false,
      attribution: false,
      post_editor: false,
      archive: true,
      settings: true
    }
  },
  trial: {
    id: 'trial',
    name: 'Trial / Free',
    status: 'available',
    maxChannels: 1,
    description: 'Пробный доступ для базовой проверки комментариев.',
    inherits: 'free'
  },
  start: {
    id: 'start',
    name: 'Start',
    status: 'available',
    maxChannels: 1,
    description: 'Стартовый тариф для одного канала.',
    features: {
      channels: true,
      comments: true,
      text_comments: true,
      photo_comments: true,
      reactions_replies: true,
      buttons: true,
      basic_stats: true,
      gifts: false,
      advanced_stats: false,
      ad_links: false,
      polls: false,
      highlights: false,
      moderation: false,
      export: false,
      priority_support: false,
      attribution: false,
      post_editor: true,
      archive: true,
      settings: true
    }
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    status: 'available',
    maxChannels: 5,
    description: 'Расширенный тариф для роста канала и рекламных механик.',
    features: {
      channels: true,
      comments: true,
      text_comments: true,
      photo_comments: true,
      reactions_replies: true,
      buttons: true,
      basic_stats: true,
      gifts: true,
      advanced_stats: true,
      ad_links: true,
      polls: true,
      highlights: true,
      moderation: true,
      export: false,
      priority_support: false,
      attribution: false,
      post_editor: true,
      archive: true,
      settings: true
    }
  },
  business: {
    id: 'business',
    name: 'Business',
    status: 'available',
    maxChannels: 20,
    description: 'Бизнес-тариф с расширенными лимитами и поддержкой.',
    features: {
      channels: true,
      comments: true,
      text_comments: true,
      photo_comments: true,
      reactions_replies: true,
      buttons: true,
      basic_stats: true,
      gifts: true,
      advanced_stats: true,
      ad_links: true,
      polls: true,
      highlights: true,
      moderation: true,
      export: true,
      priority_support: true,
      attribution: true,
      post_editor: true,
      archive: true,
      settings: true
    }
  }
};

function clean(value) { return String(value || '').trim().toLowerCase(); }

function mergePlan(planId) {
  const id = clean(planId) || 'free';
  const plan = TARIFFS[id] || TARIFFS.free;
  if (!plan.inherits) return { ...plan, features: { ...(plan.features || {}) } };
  const parent = mergePlan(plan.inherits);
  return { ...parent, ...plan, features: { ...(parent.features || {}), ...(plan.features || {}) } };
}

function getTariff(planId = 'free') { return mergePlan(planId); }
function listTariffs() { return PLAN_ORDER.map(getTariff); }
function planRank(planId = 'free') { const i = PLAN_ORDER.indexOf(clean(planId)); return i === -1 ? 0 : i; }
function isPlanAtLeast(planId, minPlan) { return planRank(planId) >= planRank(minPlan || 'free'); }
function getPlanLimits(planId = 'free') { const plan = getTariff(planId); return { planId: plan.id, maxChannels: Number(plan.maxChannels || 1), features: { ...(plan.features || {}) } }; }
function featureLabel(featureKey = '') { return FEATURE_LABELS[String(featureKey || '').trim()] || String(featureKey || '').trim(); }
function enabledFeatures(planId = 'free') { const plan = getTariff(planId); return Object.keys(plan.features || {}).filter((key) => plan.features[key]); }
function disabledFeatures(planId = 'free') { const plan = getTariff(planId); return Object.keys(FEATURE_LABELS).filter((key) => !plan.features?.[key]); }

module.exports = { PLAN_ORDER, TARIFFS, FEATURE_LABELS, getTariff, listTariffs, planRank, isPlanAtLeast, getPlanLimits, featureLabel, enabledFeatures, disabledFeatures };
