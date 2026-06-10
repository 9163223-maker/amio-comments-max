'use strict';

const access = require('../services/clientAccessService');
const tariffs = require('../services/tariffConfig');
const menu = require('../v3-menu-core-1539');
const gate = require('../services/accessGateService');

function clean(value) { return String(value || '').trim(); }
function button(text, action, extra = {}) { return menu.button(text, action, extra); }
function link(text, url) { return menu.link(text, url); }
function keyboard(rows) { return menu.keyboard(rows); }
function publicPushUrl() {
  const base = clean(process.env.PUBLIC_BASE_URL || process.env.ADMINKIT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || menu.BASE || 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run').replace(/\/+$/, '');
  return `${base}/push`;
}
function dateRu(value = '') { if (!value) return 'без даты окончания'; const d = new Date(value); return Number.isNaN(d.getTime()) ? 'без даты окончания' : d.toLocaleDateString('ru-RU', { timeZone: 'UTC' }); }
function channelTitle(channel = {}) { return clean(channel.title || channel.channelTitle || channel.name || channel.channelName || channel.channelId || 'Канал'); }

function activationScreen() {
  return {
    id: 'pr186_customer_start',
    text: ['АдминКИТ', '', 'Здесь можно подключить уведомления для MAX-чатов и узнать, что умеет АдминКИТ для MAX.'].join('\n'),
    attachments: keyboard([
      [button('🔔 Мои уведомления', 'account_push_notifications')],
      [button('➕ Подключить чат', 'account_push_notifications_help')],
      [button('Помощь', 'account_support')],
      [button('Что умеет АдминКИТ для MAX', 'account_capabilities')]
    ])
  };
}
function expiredScreen(maxUserId = '') {
  const state = access.getAccessState(maxUserId);
  return {
    id: 'pr106_access_expired',
    text: ['АдминКИТ', '', 'Доступ истёк. Вы можете посмотреть личный кабинет, продлить доступ или написать в поддержку.', '', `Тариф: ${state.tariff?.name || state.planId || '—'}`, `Дата окончания: ${dateRu(state.expiresAt)}`].join('\n'),
    attachments: keyboard([
      [button('🔔 Уведомления чатов', 'account_push_notifications')],
      [button('Мой доступ', 'account_my_access')],
      [button('Оплата / продление', 'account_payment')],
      [button('Поддержка', 'account_support')]
    ])
  };
}

function accessGateScreen(maxUserId = '') {
  const state = access.getAccessState(maxUserId);
  if (state.admin || state.active) return menu.mainScreen();
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
    text: ['Ввести код активации', '', 'Пришлите код доступа.'].join('\n'),
    attachments: keyboard([
      [button('Попробовать снова', 'account_activate_code')],
      [button('Помощь', 'account_support')],
      [button('Главное меню', 'customer_main')]
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
    text: ['Код не найден. Проверьте код или напишите в помощь.'].join('\n'),
    attachments: keyboard([
      [button('Попробовать снова', 'account_activate_code')],
      [button('Помощь', 'account_support')],
      [button('Главное меню', 'customer_main')]
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
      'Для оплаты или продления напишите в помощь.'
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
  const line = contact ? `Напишите нам: ${contact}` : 'Напишите нам, и мы поможем с подключением уведомлений.';
  return {
    id: 'account_support',
    text: ['Помощь', '', 'Если не получается подключить уведомления или чат не появляется в списке, напишите нам.', '', line].join('\n'),
    attachments: keyboard([
      [button('Задать вопрос', 'account_ask_question')],
      [button('Мои уведомления', 'account_push_notifications')],
      [button('Подключить чат', 'account_push_notifications_help')],
      [button('Главное меню', 'customer_main')]
    ])
  };
}

function capabilitiesScreen() {
  return {
    id: 'account_capabilities',
    text: [
      'Что умеет АдминКИТ для MAX', '',
      'АдминКИТ помогает вести MAX-каналы и чаты без лишней ручной работы.', '',
      'Что можно делать:', '',
      '💬 Комментарии', 'Подключать обсуждения к постам, включать реакции и ответы.', '',
      '🎁 Подарки и лид-магниты', 'Выдавать файл, картинку, промокод, ссылку или текст после действия пользователя.', '',
      '🔘 Кнопки под постами', 'Добавлять кнопки, ссылки и переходы к нужным материалам.', '',
      '📊 Статистика', 'Смотреть активность, клики, реакции и вовлечённость.', '',
      '🔔 Уведомления', 'Подключать push-уведомления для участников MAX-чатов.', '',
      '🛡 Модерация', 'Управлять комментариями и снижать ручную нагрузку.', '',
      'АдминКИТ подходит авторам, экспертам, сообществам и бизнесу, которые ведут MAX и хотят больше контроля над каналом.'
    ].join('\n'),
    attachments: keyboard([
      [button('Задать вопрос', 'account_ask_question')],
      [button('Получить доступ', 'account_get_access')],
      [button('Ввести код активации', 'account_activate_code')],
      [button('Мои уведомления', 'account_push_notifications')],
      [button('Главное меню', 'customer_main')]
    ])
  };
}

function pushNotificationsScreen(maxUserId = '', options = {}) {
  const chatMap = new Map();
  for (const item of (Array.isArray(options.chats) ? options.chats : [])) {
    const title = clean(item && (item.chatTitle || item.title));
    if (!title) continue;
    const key = title.toLocaleLowerCase();
    const next = { title, enabled: item && item.enabledOnThisDevice === true, reconnect: item && item.needsReconnect === true };
    const current = chatMap.get(key);
    if (!current || next.enabled) chatMap.set(key, next);
  }
  const chats = [...chatMap.values()].slice(0, 12);
  const enabled = chats.filter((item) => item.enabled);
  const reconnect = chats.filter((item) => !item.enabled && item.reconnect);
  let text;
  if (enabled.length || reconnect.length) {
    text = ['🔔 Мои уведомления', '', ...(enabled.length ? ['На этом устройстве:', ...enabled.map((item) => `• ${item.title} — включены`), ''] : []), ...(reconnect.length ? ['Нужно подключить:', ...reconnect.map((item) => `• ${item.title} — подключить`)] : [])].join('\n').trim();
  } else {
    text = ['🔔 Мои уведомления', '', 'У вас пока нет подключённых чатов.', 'Чтобы получать уведомления, подключите нужный MAX-чат.'].join('\n');
  }
  return {
    id: 'account_push_notifications',
    text,
    attachments: keyboard([
      [button(chats.length ? '➕ Подключить ещё чат' : '➕ Подключить чат', 'account_push_notifications_help')],
      [link('Открыть АдминКИТ PUSH', publicPushUrl())],
      [button('Помощь', 'account_support')],
      [button('Главное меню', 'customer_main')]
    ])
  };
}
function pushNotificationsHelpScreen() {
  return {
    id: 'account_push_notifications_help',
    text: ['➕ Подключить чат', '', '1. Откройте MAX-чат, где установлен бот.', '2. Отправьте /push.', '3. Откройте ссылку и включите уведомления в АдминКИТ PUSH.'].join('\n'),
    attachments: keyboard([
      [link('Открыть АдминКИТ PUSH', publicPushUrl())],
      [button('Мои уведомления', 'account_push_notifications')],
      [button('Помощь', 'account_support')],
      [button('Главное меню', 'customer_main')]
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
  if (current !== 'account_push_notifications') rows.push([button('🔔 Уведомления чатов', 'account_push_notifications')]);
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
  if (a === 'customer_main') return activationScreen();
  if (a === 'admin_section_tariffs' || a === 'account_home') return access.getAccessState(maxUserId).active || access.getAccessState(maxUserId).admin ? accountHome(maxUserId) : activationScreen();
  if (a === 'account_my_access' || a === 'billing_current_plan') return access.getAccessState(maxUserId).active || access.getAccessState(maxUserId).admin ? myAccessScreen(maxUserId) : activationScreen();
  if (a === 'account_push_notifications') return pushNotificationsScreen(maxUserId);
  if (a === 'account_push_notifications_help') return pushNotificationsHelpScreen(maxUserId);
  if (a === 'account_activate_code') return activationPrompt(maxUserId);
  if (a === 'account_payment' || a === 'billing_upgrade') return access.getAccessState(maxUserId).active || access.getAccessState(maxUserId).admin ? paymentScreen(maxUserId) : supportScreen(maxUserId);
  if (a === 'account_limits' || a === 'billing_limits') return access.getAccessState(maxUserId).active || access.getAccessState(maxUserId).admin ? limitsScreen(maxUserId) : capabilitiesScreen(maxUserId);
  if (a === 'account_channels') return access.getAccessState(maxUserId).active || access.getAccessState(maxUserId).admin ? channelsScreen(maxUserId) : activationScreen();
  if (a === 'account_support' || a === 'billing_referral') return supportScreen(maxUserId);
  if (a === 'account_capabilities') return capabilitiesScreen(maxUserId);
  if (a === 'account_ask_question' || a === 'account_get_access') return supportScreen(maxUserId);
  return null;
}

module.exports = { activationScreen, expiredScreen, pushNotificationsScreen, pushNotificationsHelpScreen, deniedFeatureScreen, screenForGateDecision, accessGateScreen, gateMenuForUser, accountHome, myAccessScreen, activationPrompt, activationResultScreen, paymentScreen, limitsScreen, channelsScreen, supportScreen, capabilitiesScreen, screenForAction };
