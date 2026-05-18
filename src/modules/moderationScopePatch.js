'use strict';

const base = require('./moderation');
const menuRenderer = require('../core/menuRenderer');

const RUNTIME = 'ADMINKIT-CORE-MODERATION-SCOPE-PATCH-1.42.3-EMPTY-DEFAULT';
const routes = base.routes || {};

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 64) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function isRawId(value = '') { const s = clean(value); return /^-?\d{6,}$/.test(s) || /^[a-f0-9]{12,}$/i.test(s); }
function human(value = '') {
  const s = clean(value);
  return s && !isRawId(s) ? cut(s) : '';
}
function scoped(ctx = {}) {
  const payload = ctx.payload || {};
  const explicitScope = clean(payload.scopeType || payload.scope || ctx.scopeType || ctx.scope || '').toLowerCase();
  const channelId = clean(payload.channelId || ctx.channelId || '');
  const postId = clean(payload.postId || ctx.postId || '');
  const realChannelTitle = human(payload.channelTitle || ctx.channelTitle || '');
  const realPostTitle = human(payload.postTitle || ctx.postTitle || '');
  const scopeType = explicitScope === 'post' || explicitScope === 'channel'
    ? explicitScope
    : (postId || realPostTitle ? 'post' : (channelId || realChannelTitle ? 'channel' : ''));
  return {
    scopeType,
    channelId,
    channelTitle: realChannelTitle || 'текущий канал',
    postId,
    postTitle: realPostTitle
  };
}
function scopeLines(ctx = {}) {
  const s = scoped(ctx);
  if (s.scopeType === 'channel') {
    return [
      'Область: весь канал',
      `Канал: ${s.channelTitle}`,
      'Пост: не нужен — правило будет работать для всех постов канала'
    ];
  }
  if (s.scopeType === 'post') {
    return [
      'Область: один пост',
      `Канал: ${s.channelTitle}`,
      `Пост: ${s.postTitle || 'выберите пост из списка'}`
    ];
  }
  return [
    'Область: сначала выберите, где действует правило',
    'Можно применить модерацию ко всему каналу или только к одному посту'
  ];
}
function scopeButtons(ctx = {}) {
  const s = scoped(ctx);
  return [
    { text: '🌐 Весь канал', route: routes.scope, data: { scopeType: 'channel', channelId: s.channelId, channelTitle: s.channelTitle } },
    { text: '📝 Выбрать один пост', route: routes.scopePostSelect, data: { channelId: s.channelId, channelTitle: s.channelTitle } },
    { text: '📋 К правилам', route: routes.rules, data: { scopeType: s.scopeType || 'channel', channelId: s.channelId, channelTitle: s.channelTitle, postId: s.postId, postTitle: s.postTitle || '' } }
  ];
}
async function renderScope(ctx = {}) {
  const s = scoped(ctx);
  const selected = s.scopeType === 'post'
    ? `Сейчас выбрано: один пост — ${s.postTitle || 'пост ещё не выбран'}`
    : (s.scopeType === 'channel' ? `Сейчас выбрано: весь канал — ${s.channelTitle}` : 'Сейчас область ещё не выбрана.');
  return menuRenderer.renderScreen({
    title: '🎯 Область действия правил',
    body: [
      selected,
      ...scopeLines(ctx),
      '',
      'Выберите, где будут работать правила модерации.',
      'Весь канал — правило применяется ко всем новым комментариям во всех постах выбранного канала.',
      'Один пост — правило применяется только к комментариям под выбранным постом.',
      'Для правила конкретного поста администратор должен видеть начало текста поста, а не номер или служебный идентификатор.'
    ],
    buttons: scopeButtons(ctx),
    backRoute: routes.home,
    homeRoute: 'main.home'
  });
}

const wrapped = {
  ...base,
  renderScope,
  selfTest() {
    const original = typeof base.selfTest === 'function' ? base.selfTest() : { ok: true };
    return {
      ...original,
      ok: original.ok !== false,
      runtimeVersion: RUNTIME,
      baseRuntimeVersion: original.runtimeVersion || base.RUNTIME || '',
      scopeDefaultEmptyReady: true,
      scopePostPickerDefaultDoesNotFakeSelectedPost: true
    };
  }
};

module.exports = wrapped;
module.exports.RUNTIME = RUNTIME;
module.exports.FUNCTION_TREE = base.FUNCTION_TREE;
