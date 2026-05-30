'use strict';

const base = require('./clean-bot-channel-fast-pr84');
const max = require('./services/maxApi');
const store = require('./store');
const menu = require('./v3-menu-core-1539');
const tenant = require('./tenant-scope');
const trace = require('./v3-ui-trace-1539');
const walkthroughTrace = require('./admin-walkthrough-trace');

const RUNTIME = 'CC8.3.2-CHANNEL-FIRST-POST-PICKER-PR90';
const MAX_POSTS = 8;

function clean(value) { return String(value || '').trim(); }
function short(value, max = 64) { const s = clean(value).replace(/\s+/g, ' '); return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)).trim() + '…'; }
function arr(value) { return Array.isArray(value) ? value : []; }
function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
function find(value, predicate, depth = 6, seen = new Set()) {
  if (!value || depth < 0 || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (predicate(value)) return value;
  for (const item of (Array.isArray(value) ? value : Object.values(value))) {
    const found = find(item, predicate, depth - 1, seen);
    if (found) return found;
  }
  return null;
}
function message(update = {}) { return update?.message || update?.data?.message || update?.callback?.message || update?.data?.callback?.message || find(update, (x) => x && typeof x === 'object' && (x.body?.text || x.text || x.body?.caption || x.caption) && (x.recipient || x.sender || x.message_id || x.id), 5) || null; }
function directCallback(update = {}) { return update?.callback || update?.data?.callback || update?.message?.callback || update?.data?.message?.callback || null; }
function callback(update = {}) { return directCallback(update) || find(update, (x) => x && typeof x === 'object' && (x.callback_id || x.callbackId || x.payload || x.callback_data || x.callbackData) && !(x.body && (x.body.text || x.body.caption)), 6) || null; }
function cbid(cb = {}) { return clean(cb.callback_id || cb.callbackId || cb.id); }
function payloadValue(cb = {}) { return cb.payload !== undefined ? cb.payload : cb.data !== undefined ? cb.data : cb.value !== undefined ? cb.value : cb.callback_data !== undefined ? cb.callback_data : cb.callbackData !== undefined ? cb.callbackData : ''; }
function parsePayload(cb = {}) { const value = payloadValue(cb); if (value && typeof value === 'object') return value; const raw = clean(value); if (!raw) return {}; try { return JSON.parse(raw); } catch { return { action: raw, raw }; } }
function updateType(update = {}) { return clean(update.update_type || update.type || update?.data?.update_type || update?.data?.type).toLowerCase(); }
function isMessageCreatedLikeUpdate(kind = '') { return kind === 'message_created' || kind === 'message_created_callback' || kind === 'bot_started'; }
function isRealCallback(update = {}, cb = null) { const kind = updateType(update); if (isMessageCreatedLikeUpdate(kind)) return false; if (directCallback(update)) return true; if (!cb) return false; if (kind.includes('callback')) return true; return Boolean(cbid(cb)); }
function body(msg = {}) { return msg?.body && typeof msg.body === 'object' ? msg.body : {}; }
function messageId(msg = {}) { const b = body(msg); return clean(b.mid || b.message_id || b.messageId || msg.mid || msg.message_id || msg.messageId || msg.id); }
function chatId(msg = {}) { return clean(msg?.recipient?.chat_id || msg?.recipient?.id || msg?.chat_id || msg?.chat?.id); }
function chatType(msg = {}) { return clean(msg?.recipient?.chat_type || msg?.recipient?.type || msg?.chat_type || msg?.chat?.type).toLowerCase(); }
function isChannelMessage(msg = {}) { const id = chatId(msg); return chatType(msg) === 'channel' || /^-/.test(id); }
function userFrom(obj) { if (!obj || typeof obj !== 'object') return ''; return clean(obj.user_id || obj.userId || obj.sender_id || obj.senderId || obj.from_id || obj.fromId || obj.id || userFrom(obj.user) || userFrom(obj.sender) || userFrom(obj.from) || userFrom(obj.author)); }
function senderId(msg = {}) { return clean(msg?.sender?.user_id || msg?.sender?.id || msg?.user_id || ''); }
function userId(update = {}, cb = null, msg = null) { return userFrom(cb) || userFrom(update) || senderId(msg) || userFrom(find(update, (x) => x && typeof x === 'object' && (x.user_id || x.userId || x.sender_id || x.senderId || x.from_id || x.fromId), 7)); }
function channelTitleFromPost(post = {}) { return clean(post.channelTitle || post.channelName || post.chatTitle || post.title || post.name || post.channelId || 'Канал'); }
function postTitle(post = {}) { return short(post.originalText || post.postText || post.text || post.caption || post.postId || post.messageId || post.commentKey || 'Пост без текста', 58); }
function postTime(post = {}) { const ts = Number(post.updatedAt || post.createdAt || post.ts || 0); if (!Number.isFinite(ts) || !ts) return ''; try { return new Date(ts).toISOString().slice(0, 16).replace('T', ' '); } catch { return ''; } }
function sourceRoot(source = 'comments') {
  const s = clean(source).toLowerCase();
  if (s === 'stats') return 'admin_section_stats';
  if (s === 'posts') return 'admin_section_posts';
  if (s === 'buttons') return 'admin_section_buttons';
  if (s === 'gifts') return 'admin_section_gifts';
  if (s === 'highlights') return 'admin_section_highlights';
  if (s === 'polls') return 'admin_section_polls';
  if (s === 'moderation') return 'admin_section_moderation';
  return 'admin_section_comments';
}
function sourceLabel(source = 'comments') {
  const s = clean(source).toLowerCase();
  if (s === 'stats') return '📊 Статистика';
  if (s === 'posts') return '✏️ Редактирование постов';
  if (s === 'buttons') return '⚪ CTA / пользовательские кнопки';
  if (s === 'gifts') return '🎁 Подарки / лид-магниты';
  if (s === 'highlights') return '⭐ Выделение постов';
  if (s === 'polls') return '🗳 Голосовалки / опросы';
  if (s === 'moderation') return '🛡 Модерация';
  return '💬 Комментарии под постами';
}
function backLabel(source = 'comments') { return sourceLabel(source).replace(/^([^\s]+)\s*/, '$1 В начало '); }
function getTenant(user = '') { return tenant.ensureTenantContext(clean(user)); }
function allPosts(user = '') {
  const ctx = getTenant(user);
  const seen = new Set();
  return safe(() => arr(store.getPostsList()), [])
    .filter((post) => post && clean(post.commentKey) && clean(post.channelId) && clean(post.postId || post.messageId) && tenant.belongsToTenant(post, ctx))
    .filter((post) => { const key = clean(post.commentKey); if (!key || seen.has(key)) return false; seen.add(key); return true; })
    .sort((a, b) => Number(b.updatedAt || b.createdAt || b.ts || 0) - Number(a.updatedAt || a.createdAt || a.ts || 0));
}
function channelsFromPosts(user = '') {
  const map = new Map();
  allPosts(user).forEach((post) => {
    const id = clean(post.channelId);
    const title = channelTitleFromPost(post);
    if (!id || !title || /^global$/i.test(title) || map.has(id)) return;
    map.set(id, title);
  });
  return Array.from(map.entries()).map(([channelId, title]) => ({ channelId, title })).slice(0, 12);
}
function postsForChannel(user = '', channelId = '') {
  const ch = clean(channelId);
  return allPosts(user).filter((post) => !ch || clean(post.channelId) === ch).slice(0, MAX_POSTS);
}
function button(text, action, extra = {}) { return menu.button(text, action, extra); }
function keyboard(rows) { return menu.keyboard(rows); }
function footer(source = 'comments') { return [[button(backLabel(source), sourceRoot(source))], [button('🏠 Главное меню', 'admin_section_main')]]; }
function pickActionForSource(source = 'comments') {
  const s = clean(source).toLowerCase();
  if (s === 'stats') return 'admin_stats_post';
  if (s === 'posts') return 'admin_posts_open';
  if (s === 'buttons') return 'button_admin_select_post';
  if (s === 'gifts') return 'gift_admin_select_post';
  return 'comments_pick_post';
}
function pickExtra(source = 'comments', post = {}, channelId = '') {
  const s = clean(source).toLowerCase();
  const basePayload = { commentKey: clean(post.commentKey), channelId: clean(channelId || post.channelId) };
  if (s === 'stats' || s === 'posts' || s === 'buttons' || s === 'gifts') return basePayload;
  return { ...basePayload, source: s || 'comments' };
}
function channelPickerScreen(source = 'comments', user = '') {
  const channels = channelsFromPosts(user);
  if (channels.length === 1) return postsScreen(source, user, channels[0].channelId);
  const rows = channels.map((channel, index) => [button(`${index + 1}. ${short(channel.title, 52)}`, 'comments_channel_pick', { source, channelId: channel.channelId })]);
  if (!rows.length) rows.push([button('📺 Подключить канал', 'admin_section_channels')]);
  rows.push(...footer(source));
  return {
    id: `channel_first_${clean(source || 'comments')}_channels`,
    text: [sourceLabel(source), '', channels.length ? 'Выберите канал. После этого бот покажет посты только этого канала.' : 'Посты каналов пока не найдены в памяти бота.', '', 'Каналы показываются названием. Технический channelId скрыт внутри payload.'].join('\n'),
    attachments: keyboard(rows)
  };
}
function postsScreen(source = 'comments', user = '', channelId = '') {
  const posts = postsForChannel(user, channelId);
  const title = channelTitleFromPost(posts[0] || { channelId });
  const rows = posts.map((post, index) => [button(`${index + 1}. ${postTitle(post)}`, pickActionForSource(source), pickExtra(source, post, channelId))]);
  if (!rows.length) rows.push([button('Пока нет постов в этом канале', sourceRoot(source))]);
  if (channelsFromPosts(user).length > 1) rows.push([button('📺 Выбрать другой канал', 'comments_select_post', { source })]);
  rows.push(...footer(source));
  const lines = [`Канал: ${title || 'Канал'}`, '', posts.length ? 'Выберите пост.' : 'В этом канале пока нет сохранённых постов.'];
  posts.forEach((post, index) => {
    const meta = [postTime(post)].filter(Boolean).join(' · ');
    lines.push(`${index + 1}. ${postTitle(post)}${meta ? '\n   ' + meta : ''}`);
  });
  return { id: `channel_first_${clean(source || 'comments')}_posts`, text: [sourceLabel(source), '', ...lines].join('\n'), attachments: keyboard(rows) };
}
function sourceFromPayload(action = '', payload = {}) {
  const explicit = clean(payload.source).toLowerCase();
  if (explicit) return explicit;
  if (action === 'admin_posts_picker') return 'posts';
  if (action === 'admin_stats_post') return 'stats';
  return 'comments';
}
function shouldHandle(action = '', payload = {}) {
  if (action === 'comments_select_post' || action === 'comments_channel_pick' || action === 'admin_posts_picker') return true;
  if (action === 'admin_stats_post' && !clean(payload.commentKey || payload.key)) return true;
  return false;
}
async function ack(config, id) { if (!id) return null; try { return await max.answerCallback({ botToken: config.botToken, callbackId: id }); } catch { return null; } }
async function show(config, update, msg, screen) {
  const mid = messageId(msg);
  const cid = chatId(msg);
  const uid = userId(update, null, msg);
  if (mid) {
    try { return await max.editMessage({ botToken: config.botToken, messageId: mid, text: screen.text, attachments: screen.attachments, notify: false }); } catch {}
  }
  return max.sendMessage({ botToken: config.botToken, userId: cid ? '' : uid, chatId: cid, text: screen.text, attachments: screen.attachments, notify: false });
}

function createCleanBot(legacy) {
  const wrapped = base.createCleanBot(legacy);
  return {
    handleWebhook: async function handleWebhookWithChannelFirstPostPicker(req, res, config) {
      const update = req.body || {};
      const msg = message(update);
      const cb = callback(update);
      const real = isRealCallback(update, cb);
      if (real && cb && msg && !isChannelMessage(msg)) {
        const payload = parsePayload(cb);
        const action = clean(payload.action || payload.raw);
        if (shouldHandle(action, payload)) {
          const uid = userId(update, cb, msg);
          const source = sourceFromPayload(action, payload);
          const screen = action === 'comments_channel_pick'
            ? postsScreen(source, uid, payload.channelId)
            : channelPickerScreen(source, uid);
          trace.log('channel_first_post_picker', { action, source, userId: trace.mask(uid), screenId: screen.id, channelId: trace.mask(payload.channelId || '') });
          walkthroughTrace.log('channel_first.post_picker', { action, source, userId: uid, screenId: screen.id, channelId: payload.channelId || '' });
          await ack(config, cbid(cb));
          await show(config, update, msg, screen);
          return res.status(200).json({ ok: true, handledBy: RUNTIME, action, source, screenId: screen.id });
        }
      }
      return wrapped.handleWebhook(req, res, config);
    }
  };
}

module.exports = { RUNTIME, createCleanBot };
