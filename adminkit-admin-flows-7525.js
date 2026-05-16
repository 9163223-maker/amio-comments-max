'use strict';

// CC7.5.25: load-time wording patch before legacy/base admin-flow modules are imported.
// Fixes screens where CC7.5.24 runtime was active, but old labels still appeared:
// - main menu button still showed "Подарки";
// - lead-magnet manager buttons still showed "Добавить/Изменить/Удалить подарок".
// Internal routes and DB fields remain gifts_* for compatibility.

const api = require('./services/maxApi');

const RUNTIME = 'CC7.5.25-LEAD-WORDING-PRELOAD-PATCH';
const MARKER = '__ADMINKIT_CC7_5_25_LEAD_WORDING_PRELOAD_PATCH__';

function renameLeadText(value) {
  if (typeof value !== 'string' || !value) return value;
  let out = value;

  // Step titles first, so "🎁 Подарки — шаг" becomes "🎁 Лид-магниты — шаг", not a hybrid label.
  out = out.split('🎁 Подарки — шаг').join('🎁 Лид-магниты — шаг');
  out = out.split('Подарки — шаг').join('Лид-магниты — шаг');

  const replacements = [
    ['🎁 Подарки / Лид-магниты', '🎁 Подарки / Лид-магниты'],
    ['🎁 Лид-магниты', '🎁 Подарки / Лид-магниты'],
    ['🎁 Подарки', '🎁 Подарки / Лид-магниты'],

    ['Управление подарками поста', 'Управление лид-магнитами поста'],
    ['Подарки сейчас', 'Лид-магниты сейчас'],
    ['Подарков у поста пока нет', 'Лид-магнитов у поста пока нет'],
    ['Что сделать с подарками?', 'Что сделать с лид-магнитами?'],
    ['Можно сразу продолжить управление подарками этого поста.', 'Можно сразу продолжить управление лид-магнитами этого поста.'],
    ['Управлять подарками этого поста', 'Управлять лид-магнитами этого поста'],

    ['Добавить новый подарок', 'Добавить новый лид-магнит'],
    ['Добавить ещё один подарок', 'Добавить ещё один лид-магнит'],
    ['Настроить подарок', 'Настроить лид-магнит'],
    ['Изменить подарок', 'Изменить лид-магнит'],
    ['Удалить подарок', 'Удалить лид-магнит'],
    ['Сохранить подарок', 'Сохранить лид-магнит'],

    ['Подарок добавлен к посту', 'Лид-магнит добавлен к посту'],
    ['Подарок изменён', 'Лид-магнит изменён'],
    ['Подарок удалён', 'Лид-магнит удалён'],
    ['Подарок получен', 'Материал лид-магнита получен'],
    ['Подарок не найден', 'Лид-магнит не найден'],
    ['Подарок отправлен в чат с ботом', 'Лид-магнит отправлен в чат с ботом'],

    ['Выберите пост, к которому применить подарок.', 'Выберите пост, к которому применить лид-магнит.'],
    ['Пришлите название подарка', 'Пришлите название лид-магнита'],
    ['Название подарка', 'Название лид-магнита'],
    ['название подарка', 'название лид-магнита'],
    ['Пришлите сам подарок.', 'Пришлите материал лид-магнита.'],
    ['кто сможет получить подарок', 'кто сможет получить лид-магнит'],
    ['получить подарок', 'получить лид-магнит'],

    ['Режим: изменить существующий подарок', 'Режим: изменить существующий лид-магнит'],
    ['Режим: добавить новый подарок', 'Режим: добавить новый лид-магнит'],
    ['Название лид-магнита:', 'Название лид-магнита:'],
    ['Подарок: MAX-вложение', 'Материал: MAX-вложение'],
    ['Подарок: не задан', 'Материал: не задан'],
    ['Подарок:', 'Материал:'],
    ['Доступ: всем', 'Условия получения: доступ всем'],
    ['Доступ: только подписчикам', 'Условия получения: только подписчикам'],
    ['Только подписчикам', 'Только подписчикам канала'],
    ['Всем', 'Доступ всем']
  ];

  for (const [from, to] of replacements) out = out.split(from).join(to);

  // Prevent accidental double label after stacked wrappers.
  out = out.split('🎁 Подарки / Подарки / Лид-магниты').join('🎁 Подарки / Лид-магниты');
  out = out.split('🎁 Подарки / Лид-магниты / Лид-магниты').join('🎁 Подарки / Лид-магниты');
  return out;
}

function renameUi(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(renameUi);
  const out = { ...value };
  for (const key of Object.keys(out)) {
    if (key === 'payload' || key === 'url') continue;
    out[key] = typeof out[key] === 'string' ? renameLeadText(out[key]) : renameUi(out[key]);
  }
  return out;
}

function patchApiOnce() {
  if (api.__adminkitCc7525LeadPreloadPatched) return;
  api.__adminkitCc7525LeadPreloadPatched = true;
  const originalSend = api.sendMessage;
  const originalEdit = api.editMessage;
  const originalAnswer = api.answerCallback;
  api.sendMessage = function cc7525Send(args = {}) {
    const next = { ...args };
    if (next.text) next.text = renameLeadText(next.text);
    if (next.attachments) next.attachments = renameUi(next.attachments);
    return originalSend.call(this, next);
  };
  api.editMessage = function cc7525Edit(args = {}) {
    const next = { ...args };
    if (next.text) next.text = renameLeadText(next.text);
    if (next.attachments) next.attachments = renameUi(next.attachments);
    return originalEdit.call(this, next);
  };
  if (typeof originalAnswer === 'function') {
    api.answerCallback = function cc7525Answer(args = {}) {
      const next = { ...args };
      if (next.notification) next.notification = renameLeadText(next.notification);
      return originalAnswer.call(this, next);
    };
  }
}

patchApiOnce();
const base = require('./adminkit-admin-flows-7524');

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
    mainMenuLeadLabelPatch: true,
    managerGiftButtonLabelsPatch: true,
    patchAppliedBeforeBaseImport: true,
    internalRoutesKept: 'gifts:*',
    dbFieldsKept: 'gifts_* / gift_*',
    sectionLabel: 'Подарки / Лид-магниты',
    professionalTermInside: 'Лид-магниты',
    commentsCoreTouched: false,
    buttonsCoreTouched: false,
    giftsCoreTouched: false,
    policy: 'lead_magnet_admin_wording_preload_patch_over_7524'
  };
}
function install() { patchApiOnce(); return selfTest(); }

module.exports = { RUNTIME, MARKER, install, selfTest, render, tryHandle, tryHandleExpress, forceRepatchPost: base.forceRepatchPost };
