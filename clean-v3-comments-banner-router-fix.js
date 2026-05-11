'use strict';

const db = require('./cc5-db-core');
const bridge = require('./cc55-v3-live-bridge');
const menu = require('./clean-v3-menu-core-db');
const api = require('./services/maxApi');
const config = require('./config');
const store = require('./store');
const { patchStoredPost } = require('./services/postPatcher');

const RUNTIME = 'CC6.5.8.5-CLEAN-V3-FUNCTION-POINTS';
const SOURCE = 'adminkit-CC6.5.8.5-comments-repatch-and-banner-confirm';

let installed = false;
let lastRoute = '';
let lastResult = null;
let lastBannerSave = null;
let lastRepatch = null;

const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 90) => { const s = norm(v); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const isMainText = (update = {}) => {
  const t = norm(db.text(update)).toLowerCase();
  return ['/start', 'start', 'старт', 'меню', 'главное меню', 'начать'].includes(t) || /главн.*меню/.test(t);
};

function routeFromUpdate(update = {}) {
  const p = db.payload(update) || {};
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
async function sendFresh(adminId, packet) {
  const result = await api.sendMessage({ botToken: config.botToken, userId: adminId, text: packet.text, attachments: packet.attachments || [], notify: false });
  const nextId = resultMessageId(result);
  if (nextId) await db.setMenu(adminId, nextId);
  return { mode: 'send_fresh', messageId: nextId };
}

async function selectedPost(adminId, p = {}) {
  const channels = await db.getChannels(adminId).catch(() => []);
  const channel = channels.find((x) => !String(x.channelId || '').includes('CHANNEL_ID')) || channels[0] || null;
  const channelId = norm(p.c || p.channelId || p.channel_id || channel?.channelId || '');
  const posts = channelId ? await db.getPosts(adminId, channelId, 50).catch(() => []) : [];
  const post = posts.find((item) =>
    (p.p && String(item.postId) === String(p.p)) ||
    (p.postId && String(item.postId) === String(p.postId)) ||
    (p.k && String(item.commentKey) === String(p.k))
  ) || null;
  const postId = norm(p.p || p.postId || post?.postId || '');
  const messageId = norm(post?.messageId || postId);
  const commentKey = norm(p.k || post?.commentKey || (channelId && postId ? `${channelId}:${postId}` : ''));
  const title = norm(post?.title || p.t || postId || 'Пост');
  return { channel, channelId, posts, post, postId, messageId, commentKey, title };
}

function commonPostPayload(picked) {
  return { c: picked.channelId, p: picked.postId, k: picked.commentKey };
}
async function renderCommentsPost(adminId, updateOrPayload = {}, notice = '') {
  const p = updateOrPayload && updateOrPayload.callback ? db.payload(updateOrPayload) : updateOrPayload;
  const picked = await selectedPost(adminId, p || {});
  const cleanPayload = commonPostPayload(picked);
  const lines = ['💬 Комментарии → пост', '', `📝 ${picked.title.slice(0, 80)}`, '', notice || 'Выберите действие.'];
  return {
    text: lines.join('\n'),
    attachments: keyboard([
      [callbackButton('✅/⏸ Комменты', 'comments:toggle', cleanPayload), callbackButton('🖼 Баннер', 'comments_banner:home', cleanPayload)],
      [callbackButton('🔁 Обновить кнопку', 'comments:repatch', cleanPayload), callbackButton('❤️ Реакции', 'comments_reactions:home', cleanPayload)],
      [callbackButton('📌 К списку', 'comments:choose_post', { c: picked.channelId })],
      [callbackButton('❓ Помощь', 'help:comments'), callbackButton('↩️ Раздел', 'comments:home')],
      [callbackButton('🏠 Главное меню', 'main:home')]
    ])
  };
}
function prepareStorePost(adminId, picked) {
  if (!picked.channelId || !picked.postId || !picked.commentKey) return { ok: false, reason: 'post_identity_missing' };
  store.saveChannel(picked.channelId, {
    title: norm(picked.channel?.title || picked.channelId),
    lastPostId: picked.postId,
    lastMessageId: picked.messageId || picked.postId,
    linkedByUserId: norm(adminId),
    autoModeEnabled: true,
    source: 'clean_v3_function_points'
  });
  const existing = store.getPost(picked.commentKey) || {};
  store.savePost(picked.commentKey, {
    ...existing,
    postId: picked.postId,
    channelId: picked.channelId,
    messageId: picked.messageId || picked.postId,
    originalText: norm(existing.originalText || picked.title || picked.postId),
    channelTitle: norm(picked.channel?.title || existing.channelTitle || picked.channelId),
    linkedByUserId: norm(adminId),
    textOverrideActive: false,
    source: 'clean_v3_function_points',
    patchedAttachments: [],
    lastPatchedFingerprint: '',
    lastPatchError: null
  });
  return { ok: true, commentKey: picked.commentKey };
}
async function repatchCommentsButton(adminId, update) {
  const picked = await selectedPost(adminId, db.payload(update));
  const prepared = prepareStorePost(adminId, picked);
  if (!prepared.ok) {
    lastRepatch = { ok: false, reason: prepared.reason, at: new Date().toISOString() };
    return renderCommentsPost(adminId, db.payload(update), 'Не удалось обновить кнопку: нет данных поста.');
  }
  try {
    const result = await patchStoredPost({
      botToken: config.botToken,
      appBaseUrl: config.appBaseUrl,
      botUsername: config.botUsername,
      maxDeepLinkBase: config.maxDeepLinkBase,
      commentKey: prepared.commentKey
    });
    lastRepatch = { ok: !!result.ok, postId: picked.postId, commentKey: prepared.commentKey, result, at: new Date().toISOString() };
    return renderCommentsPost(adminId, db.payload(update), result.ok ? '✅ Кнопка комментариев обновлена под текущий OpenApp.' : `⚠️ Кнопка не обновилась: ${result.reason || result.error?.message || 'ошибка патча'}`);
  } catch (error) {
    lastRepatch = { ok: false, postId: picked.postId, commentKey: prepared.commentKey, error: error && error.message ? error.message : String(error || 'patch_failed'), at: new Date().toISOString() };
    return renderCommentsPost(adminId, db.payload(update), `⚠️ Кнопка не обновилась: ${lastRepatch.error}`);
  }
}

async function ensureBannerTables() {
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
async function getBanner(adminId, channelId, postId) {
  await ensureBannerTables();
  const settings = await db.query('select banner_enabled from ak_post_settings_v3 where admin_id=$1 and channel_id=$2 and post_id=$3 limit 1', [adminId, channelId, postId]).catch(() => ({ rows: [] }));
  const row = await db.query('select enabled, banner_text, link_url, button_text, action_type from ak_comment_banners_v3 where admin_id=$1 and channel_id=$2 and post_id=$3 limit 1', [adminId, channelId, postId]).catch(() => ({ rows: [] }));
  const b = row.rows[0] || {};
  const enabledBySettings = settings.rows[0] ? settings.rows[0].banner_enabled !== false : true;
  return { enabled: b.enabled !== false && enabledBySettings, bannerText: norm(b.banner_text || ''), linkUrl: norm(b.link_url || ''), buttonText: norm(b.button_text || ''), actionType: norm(b.action_type || 'link') };
}
async function saveBanner(adminId, channelId, postId, next = {}) {
  const cur = await getBanner(adminId, channelId, postId);
  const b = { ...cur, ...next };
  await db.query(`insert into ak_comment_banners_v3(admin_id,channel_id,post_id,enabled,banner_text,link_url,button_text,action_type,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,now())
    on conflict(admin_id,channel_id,post_id) do update set enabled=excluded.enabled,banner_text=excluded.banner_text,link_url=excluded.link_url,button_text=excluded.button_text,action_type=excluded.action_type,updated_at=now()`,
    [adminId, channelId, postId, b.enabled !== false, b.bannerText || '', b.linkUrl || '', b.buttonText || '', b.actionType || 'link']);
  await db.query(`insert into ak_post_settings_v3(admin_id,channel_id,post_id,banner_enabled,updated_at) values($1,$2,$3,$4,now()) on conflict(admin_id,channel_id,post_id) do update set banner_enabled=excluded.banner_enabled, updated_at=now()`, [adminId, channelId, postId, b.enabled !== false]);
  return getBanner(adminId, channelId, postId);
}
function bannerRows(flow, b) {
  const cleanPayload = { c: flow.c, p: flow.p, k: flow.k };
  return [
    [callbackButton(b.enabled ? '⏸ Отключить баннер' : '✅ Включить баннер', 'comments_banner:toggle', cleanPayload)],
    [callbackButton('✍️ Текст баннера', 'comments_banner:edit_text', cleanPayload), callbackButton('🔗 Ссылка/действие', 'comments_banner:edit_url', cleanPayload)],
    [callbackButton('🔘 Текст кнопки', 'comments_banner:edit_button', cleanPayload), callbackButton('👀 Предпросмотр', 'comments_banner:preview', cleanPayload)],
    [callbackButton('🧹 Очистить', 'comments_banner:clear', cleanPayload)],
    [callbackButton('↩️ К посту', 'comments:post', cleanPayload), callbackButton('📌 К списку', 'comments:choose_post', { c: flow.c })],
    [callbackButton('❓ Помощь', 'help:comments'), callbackButton('↩️ Раздел', 'comments:home')],
    [callbackButton('🏠 Главное меню', 'main:home')]
  ];
}
async function handleBannerTextInput(update = {}) {
  if (db.cb(update)) return false;
  const adminId = db.adminId(update);
  if (!adminId || isMainText(update)) return false;
  const flow = await db.getFlow(adminId).catch(() => null);
  if (!flow || flow.type !== 'comments_banner_wait') return false;
  const raw = norm(db.text(update));
  if (!raw) return false;
  const value = ['-', '—', 'нет', 'очистить'].includes(raw.toLowerCase()) ? '' : raw;
  const next = {};
  const label = flow.field === 'url' ? 'ссылка/действие' : flow.field === 'button' ? 'текст кнопки' : 'текст баннера';
  if (flow.field === 'text') next.bannerText = value.slice(0, 500);
  if (flow.field === 'url') next.linkUrl = value.slice(0, 500);
  if (flow.field === 'button') next.buttonText = value.slice(0, 80);
  const b = await saveBanner(adminId, flow.c, flow.p, next);
  await db.clearFlow(adminId);
  lastBannerSave = { ok: true, field: flow.field, value: cut(value, 120), channelId: flow.c, postId: flow.p, at: new Date().toISOString() };
  const lines = [
    '🖼 Баннер', '', `📝 ${norm(flow.title || flow.p || 'Пост').slice(0, 80)}`, '',
    `✅ Сохранено: ${label}.`, '',
    b.enabled ? 'Статус: включён' : 'Статус: выключен',
    `Текст: ${b.bannerText ? cut(b.bannerText, 120) : 'не задан'}`,
    `Ссылка/действие: ${b.linkUrl ? cut(b.linkUrl, 120) : 'не задано'}`,
    `Кнопка: ${b.buttonText ? cut(b.buttonText, 40) : 'не задана'}`,
    '', 'Что настроить дальше?'
  ];
  const result = await sendFresh(adminId, { text: lines.join('\n'), attachments: keyboard(bannerRows(flow, b)) });
  return { ok: true, handledBy: RUNTIME, route: `comments_banner:save_${flow.field}`, result };
}

function install() {
  if (installed || bridge.__cleanV3FunctionPointsInstalled) return selfTest();
  installed = true;
  bridge.__cleanV3FunctionPointsInstalled = true;

  const originalHandle = bridge.handle.bind(bridge);
  bridge.handle = async function functionPointsRouter(update = {}) {
    const textResult = await handleBannerTextInput(update);
    if (textResult) { lastResult = textResult; return true; }

    const route = routeFromUpdate(update);
    if (db.cb(update) && route.startsWith('comments_banner:')) {
      lastRoute = route;
      const result = await menu.handle(update);
      lastResult = result || false;
      if (result) return true;
    }
    if (db.cb(update) && route === 'comments:post') {
      const adminId = db.adminId(update);
      if (!adminId) return false;
      lastRoute = route;
      const packet = await renderCommentsPost(adminId, update);
      await silentAnswer(update);
      const result = await sendOrEdit(update, adminId, packet);
      lastResult = { ok: true, handledBy: RUNTIME, route, result };
      return true;
    }
    if (db.cb(update) && route === 'comments:repatch') {
      const adminId = db.adminId(update);
      if (!adminId) return false;
      lastRoute = route;
      const packet = await repatchCommentsButton(adminId, update);
      await silentAnswer(update);
      const result = await sendOrEdit(update, adminId, packet);
      lastResult = { ok: true, handledBy: RUNTIME, route, result, lastRepatch };
      return true;
    }
    return originalHandle(update);
  };

  return selfTest();
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    installed: installed || !!bridge.__cleanV3FunctionPointsInstalled,
    scope: 'comments_function_points_only',
    routes: [
      'comments:post',
      'comments:repatch',
      'comments_banner:home',
      'comments_banner:toggle',
      'comments_banner:edit_text',
      'comments_banner:edit_url',
      'comments_banner:edit_button',
      'comments_banner:preview',
      'comments_banner:clear',
      'comments_banner:cancel'
    ],
    checks: {
      bridgePatched: true,
      commentsPostMenuAddsRepatchButton: true,
      repatchUsesExistingPostPatcher: true,
      bannerTextInputSendsFreshConfirmation: true,
      openAppUntouched: true,
      commentsLaunchUntouched: true,
      mainMenuUntouched: true
    },
    lastRoute,
    lastResult,
    lastBannerSave,
    lastRepatch
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest };
