'use strict';

const access = require('../services/clientAccessService');
const tariffs = require('../services/tariffConfig');
const menu = require('../v3-menu-core-1539');
const gate = require('../services/accessGateService');

function clean(value) { return String(value || '').trim(); }
function button(text, action, extra = {}) { return menu.button(text, action, extra); }
function keyboard(rows) { return menu.keyboard(rows); }
function dateRu(value = '') { if (!value) return 'без даты окончания'; const d = new Date(value); return Number.isNaN(d.getTime()) ? 'без даты окончания' : d.toLocaleDateString('ru-RU', { timeZone: 'UTC' }); }
function channelTitle(channel = {}) { return clean(channel.title || channel.channelTitle || channel.name || channel.channelName || channel.channelId || 'Канал'); }

function activationScreen() {
  return {
    id: 'pr106_activation_required',
    text: ['АдминКИТ', '', 'Для работы с АдминКИТ активируйте доступ. Если у вас уже есть код — нажмите «Активировать код».'].join('\n'),
    attachments: keyboard([
      [button('Активировать код', 'account_activate_code')],
      [button('Что умеет АдминКИТ', 'account_capabilities')],
      [button('Поддержка', 'account_support')]
    ])
  };
}

function expiredScreen(maxUserId = '') {
  const state = access.getAccessState(maxUserId);
  return {
    id: 'pr106_access_expired',
    text: ['АдминКИТ', '', 'Доступ истёк. Вы можете посмотреть личный кабинет, продлить доступ или написать в поддержку.', '', `Тариф: ${state.tariff?.name || state.planId || '—'}`, `Дата окончания: ${dateRu(state.expiresAt)}`].join('\n'),
    attachments: keyboard([
      [button('Мой доступ', 'account_my_access')],
      [button('Оплата / продление', 'account_payment')],
      [button('Поддержка', 'account_support')]
    ])
  };
}

function accessGateScreen(maxUserId = '') {
  const state = access.getAccessState(maxUserId);
  if (state.admin || state.active) return menu.mainScreen();
  if (state.status === 'expired') return expiredScreen(maxUserId);
  return activationScreen();
}

function gateMenuForUser(maxUserId = '') {
  const state = access.getAccessState(maxUserId);
  if (state.admin || state.active) return menu.mainScreen();
  return accessGateScreen(maxUserId);
}

function myAccessScreen(maxUserId = '') {
  const state = access.getAccessState(maxUserId);
  const channels = access.getClientChannels(maxUserId);
  const enabled = tariffs.enabledFeatures(state.planId).map(tariffs.featureLabel).slice(0, 12);
  return {
    id: 'account_my_access',
    text: [
      '👤 Мой доступ',
      '',
      `Статус: ${state.friendlyStatus}`,
      `Тариф: ${state.tariff?.name || state.planId || 'Trial / Free'}`,
      `Дата окончания: ${dateRu(state.expiresAt)}`,
      `Лимит каналов: ${state.maxChannels || 1}`,
      `Подключённые каналы: ${channels.length ? channels.map(channelTitle).join(', ') : 'пока нет'}`,
      '',
      'Доступные функции:',
      ...(enabled.length ? enabled.map((name) => `• ${name}`) : ['• базовый доступ пока не активирован'])
    ].join('\n'),
    attachments: accountKeyboard('account_my_access', state)
  };
}

function activationPrompt(maxUserId = '') {
  access.setPendingActivation(maxUserId, true);
  return {
    id: 'account_activate_code',
    text: ['🔐 Активировать код', '', 'Отправьте код доступа одним сообщением.', 'Если кода нет — нажмите «Поддержка».'].join('\n'),
    attachments: keyboard([
      [button('Попробовать снова', 'account_activate_code')],
      [button('Поддержка', 'account_support')]
    ])
  };
}

function activationResultScreen(result = {}, maxUserId = '') {
  if (result.ok) {
    return {
      id: 'account_activation_success',
      text: ['✅ Доступ активирован', '', `Тариф: ${tariffs.getTariff(result.profile?.planId).name}`, `Дата окончания: ${dateRu(result.profile?.expiresAt)}`].join('\n'),
      attachments: keyboard([
        [button('Подключить канал', 'admin_section_channels')],
        [button('Главное меню', 'admin_section_main')]
      ])
    };
  }
  return {
    id: 'account_activation_error',
    text: ['⚠️ Код не активирован', '', result.message || 'Проверьте код и попробуйте снова.'].join('\n'),
    attachments: keyboard([
      [button('Попробовать снова', 'account_activate_code')],
      [button('Поддержка', 'account_support')]
    ])
  };
}

function paymentScreen(maxUserId = '') {
  const state = access.getAccessState(maxUserId);
  return {
    id: 'account_payment',
    text: [
      '💳 Оплата / продление',
      '',
      `Текущий статус: ${state.friendlyStatus}`,
      `Текущий тариф: ${state.tariff?.name || state.planId || 'Trial / Free'}`,
      '',
      'Варианты тарифов:',
      ...tariffs.listTariffs().filter((plan) => plan.id !== 'trial').map((plan) => `• ${plan.name}: до ${plan.maxChannels} канал(ов)`),
      '',
      'В PR106 оплата подключается через поддержку. Здесь нет fake payment success и не запускается неработающий эквайринг.'
    ].join('\n'),
    attachments: keyboard([
      [button('Связаться с поддержкой для оплаты', 'account_support')],
      [button('Мой доступ', 'account_my_access')],
      [button('Главное меню', 'admin_section_main')]
    ])
  };
}

function limitsScreen(maxUserId = '') {
  const state = access.getAccessState(maxUserId);
  const enabled = tariffs.enabledFeatures(state.planId);
  const disabled = tariffs.disabledFeatures(state.planId);
  return {
    id: 'account_limits',
    text: [
      '📏 Лимиты и функции',
      '',
      `Тариф: ${state.tariff?.name || state.planId || 'Trial / Free'}`,
      `Лимит каналов: ${state.maxChannels || 1}`,
      '',
      'Доступно:',
      ...enabled.map((key) => `✅ ${tariffs.featureLabel(key)}`),
      '',
      'Недоступно сейчас:',
      ...disabled.slice(0, 12).map((key) => `— ${tariffs.featureLabel(key)}: доступно на другом тарифе или скоро будет доступно`)
    ].join('\n'),
    attachments: accountKeyboard('account_limits', state)
  };
}

function channelsScreen(maxUserId = '') {
  const state = access.getAccessState(maxUserId);
  const channels = access.getClientChannels(maxUserId);
  const reached = channels.length >= Number(state.maxChannels || 1);
  return {
    id: 'account_channels',
    text: [
      '📣 Мои каналы',
      '',
      `Лимит каналов: ${channels.length} из ${state.maxChannels || 1}`,
      ...(channels.length ? channels.map((channel, index) => `${index + 1}. ${channelTitle(channel)}`) : ['У вас пока нет подключённых каналов.']),
      reached ? 'Лимит каналов достигнут. Для подключения ещё одного канала нужен апгрейд тарифа или помощь менеджера.' : ''
    ].filter(Boolean).join('\n'),
    attachments: keyboard(channels.length ? [
      ...(reached ? [] : [[button('Подключить канал', 'admin_section_channels')]]),
      [button('Оплата / продление', 'account_payment')],
      [button('Главное меню', 'admin_section_main')]
    ] : [
      [button('Подключить канал', 'admin_section_channels')],
      [button('Как подключить', 'account_support')],
      [button('Главное меню', 'admin_section_main')]
    ])
  };
}

function supportScreen() {
  const contact = clean(process.env.ADMINKIT_SUPPORT_CONTACT || process.env.SUPPORT_CONTACT || '');
  const line = contact ? `Напишите в поддержку: ${contact}` : 'Напишите менеджеру, у которого получили код доступа.';
  return {
    id: 'account_support',
    text: ['🧑‍💻 Поддержка', '', line, 'Сообщите, что вам нужен доступ, продление или помощь с подключением канала.'].join('\n'),
    attachments: keyboard([
      [button('Активировать код', 'account_activate_code')],
      [button('Оплата / продление', 'account_payment')]
    ])
  };
}

function capabilitiesScreen() {
  return {
    id: 'account_capabilities',
    text: ['АдминКИТ умеет:', '', '• подключать каналы;', '• управлять комментариями;', '• добавлять кнопки под постами;', '• смотреть статистику;', '• работать с подарками, опросами и рекламными ссылками на подходящих тарифах.'].join('\n'),
    attachments: keyboard([
      [button('Активировать код', 'account_activate_code')],
      [button('Поддержка', 'account_support')]
    ])
  };
}


function deniedFeatureScreen(decision = {}, maxUserId = '') {
  const state = decision.state || access.getAccessState(maxUserId);
  if (state.status === 'expired') return expiredScreen(maxUserId);
  if (!state.active && !state.admin) return activationScreen();
  const label = tariffs.featureLabel(decision.featureKey || '');
  return {
    id: 'account_feature_denied',
    text: [
      '🔒 Функция недоступна',
      '',
      label ? `Функция: ${label}` : '',
      decision.message || 'Доступно на другом тарифе или скоро будет доступно.',
      '',
      `Текущий тариф: ${state.tariff?.name || state.planId || 'Trial / Free'}`
    ].filter(Boolean).join('\n'),
    attachments: keyboard([
      [button('Лимиты и функции', 'account_limits')],
      [button('Оплата / продление', 'account_payment')],
      [button('Поддержка', 'account_support')]
    ])
  };
}

function screenForGateDecision(decision = {}, maxUserId = '') {
  if (decision.allow) return null;
  if (decision.reason === 'debug_admin_only') return activationScreen();
  return deniedFeatureScreen(decision, maxUserId);
}

function accountHome(maxUserId = '') {
  const state = access.getAccessState(maxUserId);
  return {
    id: 'account_home',
    text: ['👤 Личный кабинет', '', `Статус: ${state.friendlyStatus}`, `Тариф: ${state.tariff?.name || state.planId || 'Trial / Free'}`, 'Выберите раздел.'].join('\n'),
    attachments: accountKeyboard('account_home', state)
  };
}

function accountKeyboard(current = '', state = {}) {
  const rows = [];
  if (current !== 'account_my_access') rows.push([button('Мой доступ', 'account_my_access')]);
  if (current !== 'account_activate_code') rows.push([button('Активировать код', 'account_activate_code')]);
  if (current !== 'account_payment') rows.push([button('Оплата / продление', 'account_payment')]);
  if (current !== 'account_limits') rows.push([button('Лимиты и функции', 'account_limits')]);
  if (current !== 'account_channels') rows.push([button('Мои каналы', 'account_channels')]);
  if (current !== 'account_support') rows.push([button('Поддержка', 'account_support')]);
  if (state.active || state.admin) rows.push([button('Главное меню', 'admin_section_main')]);
  return keyboard(rows);
}

function screenForAction(action = '', maxUserId = '') {
  const a = clean(action);
  if (a === 'admin_section_tariffs' || a === 'account_home') return accountHome(maxUserId);
  if (a === 'account_my_access' || a === 'billing_current_plan') return myAccessScreen(maxUserId);
  if (a === 'account_activate_code') return activationPrompt(maxUserId);
  if (a === 'account_payment' || a === 'billing_upgrade') return paymentScreen(maxUserId);
  if (a === 'account_limits' || a === 'billing_limits') return limitsScreen(maxUserId);
  if (a === 'account_channels') return channelsScreen(maxUserId);
  if (a === 'account_support' || a === 'billing_referral') return supportScreen(maxUserId);
  if (a === 'account_capabilities') return capabilitiesScreen(maxUserId);
  return null;
}

module.exports = { activationScreen, expiredScreen, deniedFeatureScreen, screenForGateDecision, accessGateScreen, gateMenuForUser, accountHome, myAccessScreen, activationPrompt, activationResultScreen, paymentScreen, limitsScreen, channelsScreen, supportScreen, capabilitiesScreen, screenForAction };
