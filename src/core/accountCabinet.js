'use strict';

const core = require('./index');

const RUNTIME = 'CC8.0.0-ACCOUNT-CABINET';

function clean(value) {
  return String(value || '').trim();
}

function numberOrZero(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function ruEnabled(value) {
  return value ? '✅' : '❌';
}

function featureLabel(featureCode = '') {
  const map = {
    comments_enabled: 'Комментарии под постами',
    photo_comments_enabled: 'Фото в комментариях',
    reactions_enabled: 'Реакции',
    replies_enabled: 'Ответы',
    gift_enabled: 'Подарки / лид-магниты',
    cta_buttons_enabled: 'CTA-кнопки',
    polls_enabled: 'Опросы',
    archive_enabled: 'Архив',
    advanced_stats_enabled: 'Расширенная статистика',
    moderation_enabled: 'Модерация',
    export_enabled: 'Экспорт',
    team_access_enabled: 'Командный доступ'
  };
  return map[clean(featureCode)] || clean(featureCode);
}

function limitLabel(limitCode = '') {
  const map = {
    max_channels_count: 'Каналов',
    posts_archive_limit: 'Постов в архиве',
    comments_per_month: 'Комментариев в месяц'
  };
  return map[clean(limitCode)] || clean(limitCode);
}

async function safeCount(sql, params = []) {
  if (!core.postgres.hasDatabaseUrl()) return 0;
  try {
    const { rows } = await core.postgres.query(sql, params);
    return numberOrZero(rows?.[0]?.count);
  } catch {
    return 0;
  }
}

async function getUsageSummary(user = {}) {
  const ownerUserId = clean(user.userId || user.ownerUserId);
  const tenantId = clean(user.tenantId);
  if (!ownerUserId || !tenantId || !core.postgres.hasDatabaseUrl()) {
    return { channels: 0, archivedItems: 0, comments: 0, referrals: 0 };
  }
  const params = [ownerUserId, tenantId];
  const [channels, archivedItems, comments, referrals] = await Promise.all([
    safeCount('select count(*)::int as count from ak_channels where owner_user_id=$1 and tenant_id=$2 and coalesce(is_active,true)=true', params),
    safeCount('select count(*)::int as count from ak_archive_items where owner_user_id=$1 and tenant_id=$2', params),
    safeCount('select count(*)::int as count from ak_comments where owner_user_id=$1 and tenant_id=$2 and deleted_at is null', params),
    safeCount('select count(*)::int as count from ak_referrals where referrer_user_id=$1', [ownerUserId])
  ]);
  return { channels, archivedItems, comments, referrals };
}

async function buildAccountData(context = {}, config = {}) {
  const user = context?.user || null;
  if (!user) {
    return {
      ok: false,
      reason: 'user_context_missing',
      user: null,
      tariff: null,
      features: {},
      limits: {},
      usage: { channels: 0, archivedItems: 0, comments: 0, referrals: 0 },
      referralLink: ''
    };
  }
  const tariff = context?.access?.tariff || await core.tariffs.getTariff(user.tariffCode || core.tariffs.DEFAULT_TARIFF);
  const features = tariff?.features || {};
  const limits = tariff?.limits || {};
  const usage = await getUsageSummary(user);
  const referralLink = core.referrals.buildReferralLink({
    botUsername: config?.botUsername || process.env.BOT_USERNAME || process.env.MAX_BOT_USERNAME || '',
    maxDeepLinkBase: config?.maxDeepLinkBase || process.env.MAX_DEEP_LINK_BASE || 'https://max.ru',
    referralCode: user.referralCode || ''
  });
  return {
    ok: true,
    user,
    tariff,
    features,
    limits,
    usage,
    referralLink,
    runtimeVersion: RUNTIME
  };
}

function buildButtons(action = 'admin_section_tariffs') {
  const current = clean(action);
  const buttons = [];
  if (current !== 'billing_current_plan') buttons.push([{ type: 'callback', text: '💳 Текущий тариф', payload: JSON.stringify({ action: 'billing_current_plan' }) }]);
  if (current !== 'billing_limits') buttons.push([{ type: 'callback', text: '📏 Лимиты и доступы', payload: JSON.stringify({ action: 'billing_limits' }) }]);
  if (current !== 'billing_referral') buttons.push([{ type: 'callback', text: '🤝 Реферальная ссылка', payload: JSON.stringify({ action: 'billing_referral' }) }]);
  if (current !== 'billing_upgrade') buttons.push([{ type: 'callback', text: '⬆️ Сменить тариф', payload: JSON.stringify({ action: 'billing_upgrade' }) }]);
  buttons.push([{ type: 'callback', text: '🏠 Главное меню', payload: JSON.stringify({ action: 'admin_section_main' }) }]);
  return [{ type: 'inline_keyboard', payload: { buttons } }];
}

function buildHomeText(data = {}) {
  if (!data.ok) {
    return [
      '👤 Личный кабинет',
      '',
      'Профиль пока не создан в Postgres.',
      'Откройте /start ещё раз после применения миграций и настройки DATABASE_URL.',
      '',
      `Причина: ${data.reason || 'unknown'}`
    ].join('\n');
  }
  const user = data.user || {};
  const tariff = data.tariff || {};
  const usage = data.usage || {};
  const limits = data.limits || {};
  return [
    '👤 Личный кабинет',
    '',
    `Пользователь: ${user.displayName || user.username || user.maxUserId || user.userId}`,
    `Тариф: ${tariff.name || user.tariffCode || 'Free'}`,
    `Статус: ${user.status || 'active'}`,
    '',
    'Использование:',
    `• Каналы: ${usage.channels}${limits.max_channels_count ? ` из ${limits.max_channels_count}` : ''}`,
    `• Архив: ${usage.archivedItems}${limits.posts_archive_limit ? ` из ${limits.posts_archive_limit}` : ''}`,
    `• Комментарии: ${usage.comments}${limits.comments_per_month ? ` из ${limits.comments_per_month}` : ''}`,
    `• Рефералы: ${usage.referrals}`,
    '',
    'Выберите действие ниже.'
  ].join('\n');
}

function buildLimitsText(data = {}) {
  if (!data.ok) return buildHomeText(data);
  const features = data.features || {};
  const limits = data.limits || {};
  const featureLines = Object.keys(features).sort().map((key) => `${ruEnabled(Boolean(features[key]))} ${featureLabel(key)}`);
  const limitLines = Object.keys(limits).sort().map((key) => `• ${limitLabel(key)}: ${limits[key]}`);
  return [
    '📏 Лимиты и доступы',
    '',
    `Тариф: ${data.tariff?.name || data.user?.tariffCode || 'Free'}`,
    '',
    'Доступные функции:',
    ...(featureLines.length ? featureLines : ['Пока нет данных по функциям.']),
    '',
    'Лимиты:',
    ...(limitLines.length ? limitLines : ['Пока нет данных по лимитам.'])
  ].join('\n');
}

function buildReferralText(data = {}) {
  if (!data.ok) return buildHomeText(data);
  return [
    '🤝 Реферальная программа',
    '',
    `Ваш код: ${data.user?.referralCode || 'ещё не создан'}`,
    `Приглашено: ${data.usage?.referrals || 0}`,
    '',
    'Ваша реферальная ссылка:',
    data.referralLink || 'Ссылка появится после настройки botUsername / maxDeepLinkBase.',
    '',
    'Позже сюда добавим бонусы: дни тарифа, скидки или внутренний баланс.'
  ].join('\n');
}

function buildUpgradeText(data = {}) {
  const current = data?.tariff?.name || data?.user?.tariffCode || 'Free';
  return [
    '⬆️ Сменить тариф',
    '',
    `Текущий тариф: ${current}`,
    '',
    'Платёжный адаптер будет подключён отдельным PR.',
    '',
    'План тарифов:',
    '• Free — базовые текстовые комментарии.',
    '• Start — комментарии, реакции, ответы, CTA и подарки.',
    '• Pro — фото в комментариях, опросы, расширенная статистика.',
    '• Business — больше каналов, экспорт, расширенная модерация.',
    '• Agency — много клиентов и командный доступ.'
  ].join('\n');
}

async function buildAccountScreen({ action = 'admin_section_tariffs', context = {}, config = {} } = {}) {
  const data = await buildAccountData(context, config);
  const normalizedAction = clean(action || 'admin_section_tariffs');
  let text = buildHomeText(data);
  if (normalizedAction === 'billing_limits') text = buildLimitsText(data);
  if (normalizedAction === 'billing_referral') text = buildReferralText(data);
  if (normalizedAction === 'billing_upgrade') text = buildUpgradeText(data);
  if (normalizedAction === 'billing_current_plan') text = buildHomeText(data);
  return {
    id: `account_${normalizedAction}`,
    text,
    attachments: buildButtons(normalizedAction),
    data,
    runtimeVersion: RUNTIME
  };
}

module.exports = {
  RUNTIME,
  buildAccountData,
  buildAccountScreen,
  getUsageSummary
};
