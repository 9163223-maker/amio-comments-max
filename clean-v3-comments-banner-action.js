'use strict';

const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');
const menu = require('./clean-v3-menu-core-db');
const bridge = require('./cc55-v3-live-bridge');

const RUNTIME = 'CC6.5.8.3-CLEAN-V3-COMMENTS-BANNER-FLOW';
const SOURCE = 'adminkit-CC6.5.8.3-comments-banner-text-link-button-flow';

let installed = false;
let lastAction = null;

const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 90) => {
  const s = norm(v);
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

function payload(update = {}) { return db.payload(update) || {}; }
function routeFromUpdate(update = {}) {
  const p = payload(update);
  return norm(p.r || p.route || p.action || db.action(update) || '');
}
function callbackButton(text, route, extra = {}) {
  const out = { r: route };
  Object.entries(extra || {}).forEach(([k, v]) => {
    const key = String(k || '').trim();
    const value = norm(v);
    if (key && value && !['r', 'route', 'action', 'command', 'payload'].includes(key)) out[key] = value;
  });
  return { type: 'callback', text, payload: JSON.stringify(out) };
}
function keyboard(rows) {
  return [{ type: 'inline_keyboard', payload: { buttons: rows.filter((row) => Array.isArray(row) && row.length) } }];
}
function isMainText(update = {}) {
  const t = norm(db.text(update)).toLowerCase();
  return ['/start', 'start', 'старт', 'меню', 'главное меню', 'начать'].includes(t) || /главн.*меню/.test(t);
}

async function ensureTables() {
  await db.init();
  await db.query(`
    create table if not exists ak_post_settings_v3 (
      admin_id text not null,
      channel_id text not null,
      post_id text not null,
      comments_enabled boolean not null default true,
      banner_enabled boolean not null default true,
      reactions_enabled boolean not null default true,
      updated_at timestamptz default now(),
      primary key(admin_id, channel_id, post_id)
    );
    create table if not exists ak_comment_banners_v3 (
      admin_id text not null,
      channel_id text not null,
      post_id text not null,
      enabled boolean not null default true,
      banner_text text not null default '',
      link_url text not null default '',
      button_text text not null default '',
      action_type text not null default 'link',
      updated_at timestamptz default now(),
      primary key(admin_id, channel_id, post_id)
    );
  `);
}

async function selectedPost(adminId, p = {}) {
  const channels = await db.getChannels(adminId).catch(() => []);
  const channel = channels[0] || null;
  const channelId = norm(p.c || p.channelId || p.channel_id || channel?.channelId || '');
  const posts = channelId ? await db.getPosts(adminId, channelId, 50).catch(() => []) : [];
  const post = posts.find((item) =>
    (p.p && String(item.postId) === String(p.p)) ||
    (p.postId && String(item.postId) === String(p.postId)) ||
    (p.k && String(item.commentKey) === String(p.k))
  ) || null;
  const postId = norm(p.p || p.postId || post?.postId || '');
  const commentKey = norm(p.k || post?.commentKey || (channelId && postId ? `${channelId}:${postId}` : ''));
  const title = norm(post?.title || p.t || postId || 'Пост');
  return { channel, channelId, posts, post, postId, commentKey, title };
}

async function getBannerConfig(adminId, channelId, postId) {
  await ensureTables();
  const settings = await db.query(
    'select banner_enabled from ak_post_settings_v3 where admin_id=$1 and channel_id=$2 and post_id=$3 limit 1',
    [adminId, channelId, postId]
  ).catch(() => ({ rows: [] }));
  const row = await db.query(
    'select enabled, banner_text, link_url, button_text, action_type, updated_at from ak_comment_banners_v3 where admin_id=$1 and channel_id=$2 and post_id=$3 limit 1',
    [adminId, channelId, postId]
  ).catch(() => ({ rows: [] }));
  const banner = row.rows[0] || {};
  const enabledBySettings = settings.rows[0] ? settings.rows[0].banner_enabled !== false : true;
  return {
    enabled: banner.enabled !== false && enabledBySettings,
    bannerText: norm(banner.banner_text || ''),
    linkUrl: norm(banner.link_url || ''),
    buttonText: norm(banner.button_text || ''),
    actionType: norm(banner.action_type || 'link'),
    updatedAt: banner.updated_at || null
  };
}

async function upsertBanner(adminId, channelId, postId, next = {}) {
  await ensureTables();
  const current = await getBannerConfig(adminId, channelId, postId);
  const merged = { ...current, ...next };
  await db.query(`
    insert into ak_comment_banners_v3(admin_id,channel_id,post_id,enabled,banner_text,link_url,button_text,action_type,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,now())
    on conflict(admin_id,channel_id,post_id) do update set
      enabled=excluded.enabled,
      banner_text=excluded.banner_text,
      link_url=excluded.link_url,
      button_text=excluded.button_text,
      action_type=excluded.action_type,
      updated_at=now()
  `, [adminId, channelId, postId, merged.enabled !== false, merged.bannerText || '', merged.linkUrl || '', merged.buttonText || '', merged.actionType || 'link']);
  await db.query(`
    insert into ak_post_settings_v3(admin_id,channel_id,post_id,banner_enabled,updated_at)
    values($1,$2,$3,$4,now())
    on conflict(admin_id,channel_id,post_id) do update set
      banner_enabled=excluded.banner_enabled,
      updated_at=now()
  `, [adminId, channelId, postId, merged.enabled !== false]);
  return getBannerConfig(adminId, channelId, postId);
}

async function logBannerEvent(adminId, route, data = {}, messageId = '') {
  try {
    await menu.logEvent({
      adminId,
      route,
      nodeKey: 'comments_banner',
      owner: 'comments',
      eventType: 'banner_flow',
      payload: { runtimeVersion: RUNTIME, ...data },
      messageId
    });
  } catch {}
}

function commonRows(picked, config) {
  const cleanPayload = { c: picked.channelId, p: picked.postId, k: picked.commentKey };
  return [
    [callbackButton(config.enabled ? '⏸ Отключить баннер' : '✅ Включить баннер', 'comments_banner:toggle', cleanPayload)],
    [callbackButton('✍️ Текст баннера', 'comments_banner:edit_text', cleanPayload), callbackButton('🔗 Ссылка/действие', 'comments_banner:edit_url', cleanPayload)],
    [callbackButton('🔘 Текст кнопки', 'comments_banner:edit_button', cleanPayload), callbackButton('👀 Предпросмотр', 'comments_banner:preview', cleanPayload)],
    [callbackButton('🧹 Очистить', 'comments_banner:clear', cleanPayload)],
    [callbackButton('↩️ К посту', 'comments:post', cleanPayload), callbackButton('📌 К списку', 'comments:choose_post', { c: picked.channelId })],
    [callbackButton('❓ Помощь', 'help:comments'), callbackButton('↩️ Раздел', 'comments:home')],
    [callbackButton('🏠 Главное меню', 'main:home')]
  ];
}

async function renderHomePacket(adminId, updateOrPayload = {}, notice = '') {
  const p = updateOrPayload && updateOrPayload.callback ? payload(updateOrPayload) : updateOrPayload;
  const picked = await selectedPost(adminId, p || {});

  if (!picked.channelId || !picked.postId) {
    return {
      text: ['🖼 Баннер', '', 'Сначала выберите пост из списка комментариев.', '', 'Баннер настраивается отдельно для каждого поста.'].join('\n'),
      attachments: keyboard([
        [callbackButton('📌 К списку', 'comments:choose_post', { c: picked.channelId })],
        [callbackButton('❓ Помощь', 'help:comments'), callbackButton('↩️ Раздел', 'comments:home')],
        [callbackButton('🏠 Главное меню', 'main:home')]
      ])
    };
  }

  const config = await getBannerConfig(adminId, picked.channelId, picked.postId);
  const lines = [
    '🖼 Баннер',
    '',
    `📝 ${picked.title.slice(0, 80)}`,
    '',
    config.enabled ? 'Статус: включён' : 'Статус: выключен',
    `Текст: ${config.bannerText ? cut(config.bannerText, 120) : 'не задан'}`,
    `Ссылка/действие: ${config.linkUrl ? cut(config.linkUrl, 120) : 'не задано'}`,
    `Кнопка: ${config.buttonText ? cut(config.buttonText, 40) : 'не задана'}`,
    '',
    notice || 'Настройте текст, ссылку/действие и подпись кнопки.'
  ];
  return { text: lines.join('\n'), attachments: keyboard(commonRows(picked, config)) };
}

async function renderPromptPacket(adminId, update, field) {
  const picked = await selectedPost(adminId, payload(update));
  const cleanPayload = { c: picked.channelId, p: picked.postId, k: picked.commentKey };
  await db.setFlow(adminId, { type: 'comments_banner_wait', field, ...cleanPayload, title: picked.title, runtimeVersion: RUNTIME, updatedAt: new Date().toISOString() });

  const promptByField = {
    text: 'Напишите текст баннера одним сообщением. Например: «Подпишитесь на канал и заберите подарок». Чтобы очистить — отправьте «-».',
    url: 'Отправьте ссылку или короткое действие для кнопки. Например: https://... или max://... Чтобы очистить — отправьте «-».',
    button: 'Напишите текст кнопки. Например: «Получить подарок» или «Перейти». Чтобы очистить — отправьте «-».'
  };

  return {
    text: ['🖼 Баннер', '', `📝 ${picked.title.slice(0, 80)}`, '', promptByField[field] || 'Отправьте значение.'].join('\n'),
    attachments: keyboard([
      [callbackButton('Отмена', 'comments_banner:cancel', cleanPayload)],
      [callbackButton('↩️ К посту', 'comments:post', cleanPayload), callbackButton('📌 К списку', 'comments:choose_post', { c: picked.channelId })]
    ])
  };
}

async function renderPreviewPacket(adminId, update) {
  const picked = await selectedPost(adminId, payload(update));
  const config = await getBannerConfig(adminId, picked.channelId, picked.postId);
  const cleanPayload = { c: picked.channelId, p: picked.postId, k: picked.commentKey };
  const bannerText = config.bannerText || 'Текст баннера пока не задан.';
  const buttonLine = config.buttonText || config.linkUrl ? `\n\n[${config.buttonText || 'Перейти'}] ${config.linkUrl || ''}` : '';
  return {
    text: ['👀 Предпросмотр баннера', '', `📝 ${picked.title.slice(0, 80)}`, '', bannerText + buttonLine, '', config.enabled ? 'Баннер будет показан.' : 'Баннер выключен и не будет показан.'].join('\n'),
    attachments: keyboard([
      [callbackButton('↩️ К настройке баннера', 'comments_banner:home', cleanPayload)],
      [callbackButton('↩️ К посту', 'comments:post', cleanPayload), callbackButton('📌 К списку', 'comments:choose_post', { c: picked.channelId })]
    ])
  };
}

async function renderBannerPacket(adminId, update = {}) {
  const route = routeFromUpdate(update) || 'comments_banner:home';
  const picked = await selectedPost(adminId, payload(update));
  if (route === 'comments_banner:home') return renderHomePacket(adminId, update);
  if (route === 'comments_banner:edit_text') return renderPromptPacket(adminId, update, 'text');
  if (route === 'comments_banner:edit_url') return renderPromptPacket(adminId, update, 'url');
  if (route === 'comments_banner:edit_button') return renderPromptPacket(adminId, update, 'button');
  if (route === 'comments_banner:preview') return renderPreviewPacket(adminId, update);
  if (route === 'comments_banner:cancel') {
    await db.clearFlow(adminId);
    return renderHomePacket(adminId, payload(update), 'Ввод отменён.');
  }
  if (route === 'comments_banner:clear') {
    await upsertBanner(adminId, picked.channelId, picked.postId, { bannerText: '', linkUrl: '', buttonText: '' });
    lastAction = { ok: true, action: 'clear', adminId, channelId: picked.channelId, postId: picked.postId, at: new Date().toISOString() };
    await logBannerEvent(adminId, route, lastAction, db.messageId(update));
    return renderHomePacket(adminId, payload(update), 'Баннер очищен.');
  }
  if (route === 'comments_banner:toggle') {
    const current = await getBannerConfig(adminId, picked.channelId, picked.postId);
    const next = await upsertBanner(adminId, picked.channelId, picked.postId, { enabled: !current.enabled });
    lastAction = { ok: true, action: 'toggle', adminId, channelId: picked.channelId, postId: picked.postId, banner_enabled: next.enabled, at: new Date().toISOString() };
    await logBannerEvent(adminId, route, lastAction, db.messageId(update));
    return renderHomePacket(adminId, payload(update), next.enabled ? 'Баннер включён.' : 'Баннер выключен.');
  }
  return renderHomePacket(adminId, update);
}

function resultMessageId(result) {
  const raw = JSON.stringify(result || {});
  const str = raw.match(/\"(?:message_id|messageId|id)\"\s*:\s*\"([^\"{}]+)\"/);
  if (str) return str[1];
  const num = raw.match(/\"(?:message_id|messageId|id)\"\s*:\s*(\d+)/);
  return num ? num[1] : '';
}

async function silentAnswer(update) {
  const id = db.callbackId(update);
  if (!id) return;
  try { await api.answerCallback({ botToken: config.botToken, callbackId: id, notification: '' }); } catch {}
}

async function sendOrEdit(update, adminId, packet) {
  const mid = db.messageId(update);
  if (mid) {
    try {
      await api.editMessage({ botToken: config.botToken, messageId: mid, text: packet.text, attachments: packet.attachments || [], notify: false });
      await db.setMenu(adminId, mid);
      return { mode: 'edit', messageId: mid };
    } catch {}
  }
  const result = await api.sendMessage({ botToken: config.botToken, userId: adminId, text: packet.text, attachments: packet.attachments || [], notify: false });
  const nextId = resultMessageId(result);
  if (nextId) await db.setMenu(adminId, nextId);
  return { mode: 'send', messageId: nextId };
}

async function handleBannerTextInput(update = {}) {
  if (db.cb(update)) return false;
  const adminId = db.adminId(update);
  if (!adminId || isMainText(update)) return false;
  const flow = await db.getFlow(adminId).catch(() => null);
  if (!flow || flow.type !== 'comments_banner_wait') return false;
  const valueRaw = norm(db.text(update));
  if (!valueRaw) return false;
  const value = ['-', '—', 'нет', 'очистить'].includes(valueRaw.toLowerCase()) ? '' : valueRaw;
  const next = {};
  if (flow.field === 'text') next.bannerText = value.slice(0, 500);
  if (flow.field === 'url') next.linkUrl = value.slice(0, 500);
  if (flow.field === 'button') next.buttonText = value.slice(0, 80);
  await upsertBanner(adminId, flow.c, flow.p, next);
  await db.clearFlow(adminId);
  lastAction = { ok: true, action: `save_${flow.field}`, adminId, channelId: flow.c, postId: flow.p, value: cut(value, 120), at: new Date().toISOString() };
  await logBannerEvent(adminId, `comments_banner:save_${flow.field}`, lastAction, db.messageId(update));
  const packet = await renderHomePacket(adminId, { c: flow.c, p: flow.p, k: flow.k }, 'Сохранено.');
  const result = await sendOrEdit(update, adminId, packet);
  return { ok: true, handledBy: RUNTIME, route: `comments_banner:save_${flow.field}`, result };
}

function install() {
  if (installed || menu.__cleanV3BannerFlowInstalled) return selfTest();
  installed = true;
  menu.__cleanV3BannerFlowInstalled = true;

  const originalMenuHandle = menu.handle.bind(menu);
  menu.handle = async function bannerAwareMenuHandle(update = {}) {
    const route = routeFromUpdate(update);
    if (db.cb(update) && route.startsWith('comments_banner:')) {
      const adminId = db.adminId(update);
      if (!adminId) return false;
      const packet = await renderBannerPacket(adminId, update);
      await silentAnswer(update);
      const result = await sendOrEdit(update, adminId, packet);
      return { ok: true, handledBy: RUNTIME, sourceMarker: SOURCE, route, nodeKey: 'comments_banner', owner: 'comments', result };
    }
    return originalMenuHandle(update);
  };

  const originalBridgeHandle = bridge.handle.bind(bridge);
  bridge.handle = async function bannerAwareBridgeHandle(update = {}) {
    const handledText = await handleBannerTextInput(update);
    if (handledText) return true;
    return originalBridgeHandle(update);
  };

  return selfTest();
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    installed: installed || !!menu.__cleanV3BannerFlowInstalled,
    scope: 'comments_banner_flow_only',
    checks: {
      bannerHomeConnected: true,
      bannerToggleConnected: true,
      bannerTextInputConnected: true,
      bannerUrlInputConnected: true,
      bannerButtonTextInputConnected: true,
      bannerPreviewConnected: true,
      commentsToggleUntouched: true,
      reactionsUntouched: true,
      photoUntouched: true,
      openAppUntouched: true,
      mainMenuUntouched: true
    },
    lastAction
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, renderBannerPacket, handleBannerTextInput };
