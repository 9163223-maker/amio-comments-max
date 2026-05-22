'use strict';

const base = require('./gifts-flow-cc8-fast');
const store = require('./store');

const RUNTIME = 'CC8.1.1-GIFTS-WIZARD-UX-CONDITIONS-CLEANUP';
const CLEAN_GIFT_ACTIONS = base.CLEAN_GIFT_ACTIONS || [];

const CONDITION_COPY = {
  subscription: '📺 Подписка на канал или несколько каналов',
  promoCode: '🔑 Промокод / кодовое слово',
  keyword: '💬 Ключевое слово в комментарии',
  reaction: '🔥 Реакция на пост через АдминКИТ',
  pollVote: '🗳 Голосование в опросе АдминКИТ',
  firstTimeOnly: '✅ Только первое получение',
  timeWindow: '🕓 Окно по времени'
};

function clean(value) {
  return String(value || '').trim();
}

function setup(userId = '') {
  try { return store.getSetupState(clean(userId)) || {}; } catch { return {}; }
}

function replaceRuntime(text = '') {
  return String(text || '').replace(/CC8\.1\.0-CLEAN-GIFTS-BUTTONS-TENANT-FOUNDATION/g, RUNTIME);
}

function cleanMessageStep(screen = null) {
  if (!screen || screen.id !== 'gifts_clean_message_step') return screen;
  return {
    ...screen,
    text: [
      '🎁 Создание подарка',
      '',
      'Шаг 3 — текст получателю',
      '',
      '✅ Ссылка сохранена.',
      '',
      'Напишите сообщение, которое человек увидит вместе с подарком.',
      '',
      'Например:',
      'Спасибо за подписку! Забирайте подарок ниже.'
    ].join('\n')
  };
}

function conditionStatusLines(userId = '') {
  const state = setup(userId);
  const flow = state.giftFlow || {};
  const draft = flow.draft || {};
  const conditions = { ...(draft.conditions || {}) };
  const lines = [];
  Object.entries(CONDITION_COPY).forEach(([key, label]) => {
    const enabled = Boolean(conditions[key]);
    lines.push(`${enabled ? '✅' : '⬜️'} ${label}`);
  });
  return lines;
}

function cleanConditionsScreen(menu, screen = null, ctx = {}) {
  if (!screen || !/^gifts_clean_conditions/.test(String(screen.id || ''))) return screen;
  const lines = [
    'Шаг 4 — условия получения подарка',
    '',
    'Выберите, что должен сделать пользователь. Некоторые условия будут открывать дополнительные шаги настройки.',
    '',
    'Что уже можно хранить в черновике:',
    ...conditionStatusLines(ctx.userId),
    '',
    'Важно: подписка на несколько каналов, проверка наличия бота в канале, промокоды, ключевые слова, реакции, опросы и временные окна будут вынесены в service-level PR53.',
    '',
    'Сейчас этот экран — UX foundation: он больше не является финальной заглушкой, а становится узлом конструктора условий.'
  ];
  return { ...screen, id: 'gifts_clean_conditions_builder_pr52', text: ['🎛 Условия получения', '', ...lines].join('\n') };
}

function postProcessScreen(menu, screen = null, ctx = {}) {
  if (!screen) return screen;
  let next = { ...screen, text: replaceRuntime(screen.text) };
  next = cleanMessageStep(next);
  next = cleanConditionsScreen(menu, next, ctx);
  return next;
}

async function screenForPayload(menu, payload = {}, ctx = {}) {
  const screen = await base.screenForPayload(menu, payload, ctx);
  return postProcessScreen(menu, screen, ctx);
}

async function handleTextInput(menu, ctx = {}) {
  const screen = await base.handleTextInput(menu, ctx);
  return postProcessScreen(menu, screen, ctx);
}

function isCleanGiftAction(action = '') {
  return base.isCleanGiftAction ? base.isCleanGiftAction(action) : CLEAN_GIFT_ACTIONS.includes(clean(action));
}

module.exports = {
  ...base,
  RUNTIME,
  CLEAN_GIFT_ACTIONS,
  isCleanGiftAction,
  screenForPayload,
  handleTextInput
};
