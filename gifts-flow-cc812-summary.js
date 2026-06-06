'use strict';

const base = require('./gifts-flow-cc811-ux');
const store = require('./store');

const RUNTIME = 'CC8.1.3-GIFTS-NO-LINK-PREVIEW';
const EXTRA_ACTIONS = ['gift_admin_commit_save'];
const CLEAN_GIFT_ACTIONS = Array.from(new Set([...(base.CLEAN_GIFT_ACTIONS || []), ...EXTRA_ACTIONS]));

function clean(value) { return String(value || '').trim(); }
function arr(value) { return Array.isArray(value) ? value : []; }
function short(value, max = 90) { const s = clean(value).replace(/\s+/g, ' '); return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1)).trim()}…`; }
function setup(userId = '') { try { return store.getSetupState(clean(userId)) || {}; } catch { return {}; } }
function draftState(userId = '') { const flow = setup(userId).giftFlow || {}; return { flow, draft: flow.draft || {}, config: flow.draft?.conditionsConfig || {} }; }
function safeLinkLabel(url = '') {
  const raw = clean(url);
  if (!raw) return 'ссылка сохранена';
  let host = '';
  try { host = new URL(raw).hostname || ''; } catch {}
  if (!host) host = raw.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] || 'ссылка';
  host = host.replace(/^www\./i, '').replace(/\./g, '[.]');
  return `ссылка сохранена · ${host}`;
}
function stripRawUrls(text = '') {
  return String(text || '').replace(/https?:\/\/[^\s)\]]+/gi, (url) => safeLinkLabel(url));
}
function conditionLabel(item = {}) {
  if (item.type === 'subscription') return `Подписка: ${arr(item.channels).length || 0} канал(а) · ${item.mode === 'any' ? 'любой' : 'все'}`;
  if (item.type === 'promoCode') return `Промокод: ${arr(item.codes).join(', ') || 'не задан'}`;
  if (item.type === 'keyword') return `Ключевое слово: ${arr(item.keywords).join(', ') || 'не задано'}`;
  if (item.type === 'timeWindow') return `Окно по времени: ${clean(item.raw) || 'не задано'}`;
  if (item.type === 'reaction') return 'Реакция АдминКИТ: любая реакция';
  if (item.type === 'pollVote') return 'Опрос АдминКИТ: любой голос';
  if (item.type === 'firstTimeOnly') return 'Только первое получение';
  return clean(item.type || 'условие');
}
function summaryLines(userId = '') {
  const { draft, config } = draftState(userId);
  const items = arr(config.items).filter((x) => x && x.enabled !== false);
  return [
    `Материал подарка: ${draft.giftAttachment ? 'материал подарка добавлен' : (draft.giftUrl ? safeLinkLabel(draft.giftUrl).replace(/^ссылка сохранена/, 'ссылка на материал сохранена') : (draft.leadMagnetCode ? 'текстовый подарок добавлен' : 'не добавлен'))}`,
    `Текст получателю: ${draft.giftMessage ? short(stripRawUrls(draft.giftMessage), 100) : 'не задан'}`,
    `Условия: ${items.length ? `${items.length} услов.` : 'без условий'}`,
    ...items.map((item) => `• ${stripRawUrls(conditionLabel(item))}`)
  ];
}
function button(menu, text, action, extra) { return menu.button(text, action, extra || {}); }
function reviewScreen(menu, ctx = {}) {
  return {
    id: 'adminkit_gift_review_save',
    text: ['✅ Проверка перед сохранением', '', 'Шаг 5 — проверить и сохранить', '', 'Будет сохранено:', ...summaryLines(ctx.userId), '', 'Нажмите «Сохранить подарок», если всё верно.'].join('\n'),
    attachments: menu.keyboard([
      [button(menu, '✅ Сохранить подарок', 'gift_admin_commit_save')],
      [button(menu, '↩️ К условиям', 'gift_admin_conditions')],
      [button(menu, '❌ Отменить', 'gift_admin_cancel')],
      [button(menu, '🏠 Главное меню', 'admin_section_main')]
    ])
  };
}
function savedScreen(menu, ctx = {}, capture = {}) {
  return {
    id: 'adminkit_gift_saved_summary',
    text: ['✅ Подарок сохранён', '', 'Шаг 5 — сохранение завершено', '', 'Сохранено:', ...(capture.summary || summaryLines(ctx.userId))].join('\n'),
    attachments: menu.keyboard([
      [button(menu, '🧾 Текущий подарок', 'gift_admin_show_current')],
      [button(menu, '🎁 В начало подарков', 'admin_section_gifts')],
      [button(menu, '🏠 Главное меню', 'admin_section_main')]
    ])
  };
}
function isSuccessSave(screen = null) { return /Подарок сохранён/i.test(clean(screen && screen.text)); }
function rewriteScreen(screen = null, ctx = {}) {
  if (!screen) return screen;
  const id = clean(screen.id);
  const text = stripRawUrls(clean(screen.text));
  if (id === 'gifts_clean_message_step') {
    return { ...screen, id: 'adminkit_gift_message_step', text: ['🎁 Создание подарка', '', 'Шаг 3 — текст получателю', '', 'Сейчас в черновике:', ...summaryLines(ctx.userId).filter((line) => !/^Текст получателю:/.test(line)), '', 'Напишите сообщение, которое человек увидит вместе с подарком.', '', 'Например:', 'Спасибо за подписку! Забирайте подарок ниже.'].join('\n') };
  }
  if (/^gifts_clean_conditions/.test(id)) {
    return { ...screen, id: 'adminkit_gift_conditions', text: text.replace(/PR52 сохраняет[\s\S]*$/i, '').trim() };
  }
  if (/^gifts?_/.test(id)) return { ...screen, id: `adminkit_${id}`, text };
  return { ...screen, text };
}
function homeScreen(menu, payload = {}, ctx = {}) { return rewriteScreen(base.homeScreen ? base.homeScreen(menu, payload, ctx) : null, ctx); }
async function screenForPayload(menu, payload = {}, ctx = {}) {
  const action = clean(payload.action || payload.raw);
  if (action === 'gift_admin_save') return reviewScreen(menu, ctx);
  if (action === 'gift_admin_commit_save') {
    const capture = { summary: summaryLines(ctx.userId) };
    const screen = await base.screenForPayload(menu, { ...payload, action: 'gift_admin_save' }, ctx);
    return isSuccessSave(screen) ? savedScreen(menu, ctx, capture) : rewriteScreen(screen, ctx);
  }
  return rewriteScreen(await base.screenForPayload(menu, payload, ctx), ctx);
}
async function handleTextInput(menu, ctx = {}) { return rewriteScreen(await base.handleTextInput(menu, ctx), ctx); }
function isCleanGiftAction(action = '') { return CLEAN_GIFT_ACTIONS.includes(clean(action)) || (base.isCleanGiftAction ? base.isCleanGiftAction(action) : false); }

module.exports = { ...base, RUNTIME, CLEAN_GIFT_ACTIONS, isCleanGiftAction, screenForPayload, handleTextInput, homeScreen, safeLinkLabel, stripRawUrls };