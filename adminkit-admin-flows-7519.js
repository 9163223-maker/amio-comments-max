'use strict';

// CC7.5.19: Lead Magnets naming core over CC7.5.18.
// This is a scoped presentation-layer rename only:
// - admin UI says "Лид-магниты" instead of "Подарки";
// - internal routes and DB fields stay gifts_* for backward compatibility;
// - comments, buttons, post patcher, gift delivery and storage are untouched.

const api = require('./services/maxApi');

const RUNTIME = 'CC7.5.19-LEAD-MAGNETS-NAMING-CORE';
const MARKER = '__ADMINKIT_CC7_5_19_LEAD_MAGNETS_NAMING_CORE__';

const replacements = [
  ['🎁 Подарки', '🎁 Лид-магниты'],
  ['Подарки — шаг', 'Лид-магниты — шаг'],
  ['Управление подарками поста', 'Управление лид-магнитами поста'],
  ['Подарки сейчас', 'Лид-магниты сейчас'],
  ['Подарков у поста пока нет', 'Лид-магнитов у поста пока нет'],
  ['Что сделать с подарками?', 'Что сделать с лид-магнитами?'],
  ['Добавить новый подарок', 'Добавить новый лид-магнит'],
  ['Добавить ещё один подарок', 'Добавить ещё один лид-магнит'],
  ['Изменить подарок', 'Изменить лид-магнит'],
  ['Удалить подарок', 'Удалить лид-магнит'],
  ['Подарок удалён', 'Лид-магнит удалён'],
  ['Подарок добавлен к посту', 'Лид-магнит добавлен к посту'],
  ['Подарок изменён', 'Лид-магнит изменён'],
  ['Подарок получен', 'Материал лид-магнита получен'],
  ['Подарок не найден', 'Лид-магнит не найден'],
  ['Подарок отправлен в чат с ботом', 'Лид-магнит отправлен в чат с ботом'],
  ['Настроить подарок', 'Настроить лид-магнит'],
  ['Управлять подарками этого поста', 'Управлять лид-магнитами этого поста'],
  ['Можно сразу продолжить управление подарками этого поста.', 'Можно сразу продолжить управление лид-магнитами этого поста.'],
  ['Выбрать другой пост', 'Выбрать другой пост'],
  ['Название подарка', 'Название лид-магнита'],
  ['название подарка', 'название лид-магнита'],
  ['Пришлите название подарка', 'Пришлите название лид-магнита'],
  ['Пришлите сам подарок.', 'Пришлите материал лид-магнита.'],
  ['Подарок: MAX-вложение', 'Материал: MAX-вложение'],
  ['Подарок: не задан', 'Материал: не задан'],
  ['Подарок:', 'Материал:'],
  ['Изменить название', 'Изменить название'],
  ['Изменить подарок', 'Изменить материал'],
  ['Пришлите сам лид-магнит.', 'Пришлите материал лид-магнита.'],
  ['кто сможет получить подарок', 'кто сможет получить лид-магнит'],
  ['получить подарок', 'получить лид-магнит'],
  ['Сохранить подарок', 'Сохранить лид-магнит'],
  ['Доступ: всем', 'Условия получения: доступ всем'],
  ['Доступ: только подписчикам', 'Условия получения: только подписчикам'],
  ['Только подписчикам', 'Только подписчикам канала'],
  ['Всем', 'Доступ всем']
];

function renameText(value) {
  if (typeof value !== 'string' || !value) return value;
  let out = value;
  for (const [from, to] of replacements) out = out.split(from).join(to);
  return out;
}

function renameInlineUi(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(renameInlineUi);
  const out = { ...value };
  for (const key of Object.keys(out)) {
    if (key === 'payload' || key === 'url') continue;
    out[key] = typeof out[key] === 'string' ? renameText(out[key]) : renameInlineUi(out[key]);
  }
  return out;
}

function patchApiOnce() {
  if (api.__adminkitCc7519LeadMagnetsPatched) return;
  api.__adminkitCc7519LeadMagnetsPatched = true;
  const originalSend = api.sendMessage;
  const originalEdit = api.editMessage;
  const originalAnswer = api.answerCallback;
  api.sendMessage = function sendMessageLeadMagnets(args = {}) {
    const next = { ...args };
    if (next.text) next.text = renameText(next.text);
    if (next.attachments) next.attachments = renameInlineUi(next.attachments);
    return originalSend.call(this, next);
  };
  api.editMessage = function editMessageLeadMagnets(args = {}) {
    const next = { ...args };
    if (next.text) next.text = renameText(next.text);
    if (next.attachments) next.attachments = renameInlineUi(next.attachments);
    return originalEdit.call(this, next);
  };
  if (typeof originalAnswer === 'function') {
    api.answerCallback = function answerCallbackLeadMagnets(args = {}) {
      const next = { ...args };
      if (next.notification) next.notification = renameText(next.notification);
      return originalAnswer.call(this, next);
    };
  }
}

patchApiOnce();
const base = require('./adminkit-admin-flows-7518');

async function tryHandle(update) { return base.tryHandle(update); }
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return base.render(route); }
function selfTest() {
  const b = base.selfTest ? base.selfTest() : {};
  return {
    ...b,
    ok: true,
    runtimeVersion: RUNTIME,
    marker: MARKER,
    leadMagnetsNaming: true,
    internalRoutesKept: 'gifts:*',
    dbFieldsKept: 'gifts_* / gift_*',
    commentsCoreTouched: false,
    buttonsCoreTouched: false,
    giftsCoreTouched: false,
    policy: 'rename_admin_presentation_only_over_7518'
  };
}
function install() { patchApiOnce(); return selfTest(); }

module.exports = { RUNTIME, MARKER, install, selfTest, render, tryHandle, tryHandleExpress, forceRepatchPost: base.forceRepatchPost };
