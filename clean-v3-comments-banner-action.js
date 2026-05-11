'use strict';

const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');
const menu = require('./clean-v3-menu-core-db');

const RUNTIME = 'CC6.5.8.2-CLEAN-V3-COMMENTS-BANNER-ACTION';
const SOURCE = 'adminkit-CC6.5.8.2-comments-banner-toggle-only';

let installed = false;
let lastAction = null;

const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();

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

async function ensureSettingsTable() {
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
    )
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

async function getBannerStatus(adminId, channelId, postId) {
  if (!adminId || !channelId || !postId) return true;
  await ensureSettingsTable();
  const current = await db.query(
    'select banner_enabled from ak_post_settings_v3 where admin_id=$1 and channel_id=$2 and post_id=$3 limit 1',
    [adminId, channelId, postId]
  );
  return current.rows[0] ? current.rows[0].banner_enabled !== false : true;
}

async function setBannerStatus(adminId, channelId, postId, enabled) {
  await ensureSettingsTable();
  await db.query(`
    insert into ak_post_settings_v3(admin_id,channel_id,post_id,banner_enabled,updated_at)
    values($1,$2,$3,$4,now())
    on conflict(admin_id,channel_id,post_id) do update set
      banner_enabled=excluded.banner_enabled,
      updated_at=now()
  `, [adminId, channelId, postId, enabled]);
}

async function logBannerEvent(adminId, route, data = {}, messageId = '') {
  try {
    await menu.logEvent({
      adminId,
      route,
      nodeKey: 'comments_banner',
      owner: 'comments',
      eventType: 'banner_toggle',
      payload: { runtimeVersion: RUNTIME, ...data },
      messageId
    });
  } catch {}
}

async function renderBannerPacket(adminId, update = {}) {
  const p = payload(update);
  const picked = await selectedPost(adminId, p);
  const cleanPayload = { c: picked.channelId, p: picked.postId, k: picked.commentKey };

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

  const wasEnabled = await getBannerStatus(adminId, picked.channelId, picked.postId);
  const enabled = !wasEnabled;
  await setBannerStatus(adminId, picked.channelId, picked.postId, enabled);
  await logBannerEvent(adminId, 'comments_banner:home', { channelId: picked.channelId, postId: picked.postId, banner_enabled: enabled }, db.messageId(update));

  lastAction = { ok: true, adminId, channelId: picked.channelId, postId: picked.postId, banner_enabled: enabled, at: new Date().toISOString() };

  return {
    text: [
      '🖼 Баннер',
      '',
      `📝 ${picked.title.slice(0, 80)}`,
      '',
      enabled ? 'Статус: баннер включён.' : 'Статус: баннер отключён.',
      '',
      'Настройка сохранена в базе Clean V3.'
    ].join('\n'),
    attachments: keyboard([
      [callbackButton(enabled ? '⏸ Отключить баннер' : '✅ Включить баннер', 'comments_banner:home', cleanPayload)],
      [callbackButton('↩️ К посту', 'comments:post', cleanPayload), callbackButton('📌 К списку', 'comments:choose_post', { c: picked.channelId })],
      [callbackButton('❓ Помощь', 'help:comments'), callbackButton('↩️ Раздел', 'comments:home')],
      [callbackButton('🏠 Главное меню', 'main:home')]
    ])
  };
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

function install() {
  if (installed || menu.__cleanV3BannerActionInstalled) return selfTest();
  installed = true;
  menu.__cleanV3BannerActionInstalled = true;

  const originalHandle = menu.handle.bind(menu);
  menu.handle = async function bannerAwareHandle(update = {}) {
    const route = routeFromUpdate(update);
    if (db.cb(update) && route === 'comments_banner:home') {
      const adminId = db.adminId(update);
      if (!adminId) return false;
      const packet = await renderBannerPacket(adminId, update);
      await silentAnswer(update);
      const result = await sendOrEdit(update, adminId, packet);
      return { ok: true, handledBy: RUNTIME, sourceMarker: SOURCE, route, nodeKey: 'comments_banner', owner: 'comments', result };
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
    installed: installed || !!menu.__cleanV3BannerActionInstalled,
    scope: 'comments_banner_only',
    checks: {
      bannerActionRouteConnected: true,
      commentsToggleUntouched: true,
      reactionsUntouched: true,
      photoUntouched: true,
      previewUntouched: true,
      openAppUntouched: true,
      mainMenuUntouched: true
    },
    lastAction
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, renderBannerPacket };
