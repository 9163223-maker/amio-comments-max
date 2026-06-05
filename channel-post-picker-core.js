'use strict';

const store = require('./store');
const clientAccessService = require('./services/clientAccessService');
const maxApi = require('./services/maxApi');
const channelTitles = require('./human-channel-title-helper');

const RUNTIME = 'PR134-CHANNEL-POST-PICKER-CORE-1.1';
const UNTITLED_CHANNEL = channelTitles.UNTITLED_CHANNEL || 'Канал без названия';
const diagnosticsByUser = new Map();

function clean(value) { return String(value || '').trim(); }
function array(value) { return Array.isArray(value) ? value : []; }
function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
function short(value = '', max = 72) { const text = clean(value).replace(/\s+/g, ' '); return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trim()}…`; }
function looksRawId(value = '') { const text = clean(value); return /^-?\d{6,}$/.test(text) || /^id\d{6,}$/i.test(text); }
function looksInternal(value = '') {
  const text = clean(value);
  if (!text) return false;
  return /(^|[^A-Za-z0-9А-Яа-яЁё])(?:selftest|debug|test|legacy|global|internal)(?:[^A-Za-z0-9А-Яа-яЁё]|$)/i.test(text)
    || /(^|[^A-Za-z0-9А-Яа-яЁё])internal\s+service(?:[^A-Za-z0-9А-Яа-яЁё]|$)/i.test(text);
}
function looksForbiddenInternal(value = '') {
  const text = clean(value);
  if (!text) return false;
  return /(^|[^A-Za-z0-9А-Яа-яЁё])(?:selftest|debug|legacy|global|internal)(?:[^A-Za-z0-9А-Яа-яЁё]|$)/i.test(text)
    || /(^|[^A-Za-z0-9А-Яа-яЁё])internal\s+service(?:[^A-Za-z0-9А-Яа-яЁё]|$)/i.test(text);
}
function isIntentionalUserTestTitle(value = '') {
  return /(^|[^А-Яа-яЁё])(?:ак[\s-]*тест|тест[А-Яа-яЁё\d\s-]*)(?:[^А-Яа-яЁё]|$)/i.test(clean(value));
}
function maskChannelId(channelId = '') { const id = clean(channelId); if (!id) return ''; if (id.length <= 6) return '***'; return `${id.slice(0, 3)}…${id.slice(-3)}`; }
function firstTitle(source = {}) { return clean(source.title || source.channelTitle || source.name || source.channelName || source.chatTitle || source.chat_title || source.displayName || source.display_name || ''); }
function safeTitle(value = '') { const title = clean(value); if (!title || looksRawId(title) || looksInternal(title) || /^(?:Канал без названия|Канал из кода доступа|Название канала пока недоступно)$/i.test(title)) return ''; return title; }
function storedChannel(channelId = '') { const id = clean(channelId); if (!id) return null; return safe(() => array(store.getChannelsList()).find((item) => clean(item.channelId || item.id || item.chatId) === id), null) || null; }
function accessChannels(userId = '') { return array(safe(() => clientAccessService.getClientChannels(clean(userId)), [])); }
function accessChannel(userId = '', channelId = '') { const id = clean(channelId); return accessChannels(userId).find((item) => clean(item.channelId || item.id || item.chatId) === id) || null; }
function rawTitleFromChat(chat = {}) { return clean(firstTitle(chat) || firstTitle(chat.chat || {}) || firstTitle(chat.body || {}) || firstTitle(chat.payload || {})); }
function titleFromChat(chat = {}) { return safeTitle(rawTitleFromChat(chat)); }
function record(userId = '', action = '', entry = {}) {
  const key = `${clean(userId)}:${clean(action || 'channel_picker')}`;
  const current = diagnosticsByUser.get(key) || { userId: clean(userId), action: clean(action || 'channel_picker'), channelDiagnostics: [], warnings: [], at: Date.now() };
  if (entry.warning) current.warnings.push(entry.warning);
  if (entry.channelId || entry.title || entry.error) current.channelDiagnostics.push(entry);
  current.at = Date.now();
  diagnosticsByUser.set(key, current);
  diagnosticsByUser.set(clean(userId) || 'anonymous', current);
  return current;
}
function getLastDiagnostics(userId = '', action = '') { return diagnosticsByUser.get(`${clean(userId)}:${clean(action || 'channel_picker')}`) || diagnosticsByUser.get(clean(userId) || 'anonymous') || null; }
function clearDiagnostics(userId = '', action = '') { if (userId || action) diagnosticsByUser.delete(`${clean(userId)}:${clean(action || 'channel_picker')}`); }
function isVisibleChannelRecord(channel = {}) {
  const channelId = clean(channel.channelId || channel.id || channel.chatId);
  if (!channelId) return false;
  const stored = storedChannel(channelId) || {};
  const title = firstTitle(channel);
  const storedTitle = firstTitle(stored);
  const titleLabel = [title, storedTitle].join(' ');
  if (looksForbiddenInternal([channelId, titleLabel].join(' '))) return false;
  if (looksInternal(channelId) && isIntentionalUserTestTitle(titleLabel) && !looksInternal(titleLabel)) return true;
  return !looksInternal([channelId, titleLabel].join(' '));
}
function persistTitle(channelId = '', userId = '', title = '') {
  const id = clean(channelId), human = safeTitle(title);
  if (!id || !human) return;
  safe(() => store.saveChannel(id, { channelId: id, title: human, channelTitle: human, resolvedChannelTitle: human }), null);
  const tenant = safe(() => clientAccessService.getTenantByMaxUserId(clean(userId)), null);
  if (tenant?.tenantId) safe(() => clientAccessService.bindTenantChannel({ tenantId: tenant.tenantId, channelId: id, channelTitle: human, maxChannels: Number(tenant.maxChannels || 999) || 999 }), null);
}
async function resolveUiChannelTitle(channelId = '', userId = '', config = {}, fallbackSource = {}) {
  const id = clean(channelId || fallbackSource.channelId || fallbackSource.id || fallbackSource.chatId || '');
  const diagnostic = { channelIdMasked: maskChannelId(id), title: UNTITLED_CHANNEL, titleSource: 'fallback', getChatAttempted: false, getChatOk: false };
  const access = accessChannel(userId, id) || {};
  const storedForGuard = storedChannel(id) || {};
  const visibleTitleGuard = [firstTitle(access), firstTitle(fallbackSource), firstTitle(storedForGuard)].join(' ');
  if (!id || (looksInternal(id) && (looksForbiddenInternal(id) || !isIntentionalUserTestTitle(visibleTitleGuard) || looksInternal(visibleTitleGuard)))) {
    return { title: UNTITLED_CHANNEL, hidden: Boolean(id), diagnostic: { ...diagnostic, error: !id ? 'missing_channel_id' : 'internal_channel_hidden' } };
  }

  const accessTitle = safeTitle(firstTitle(access));
  if (accessTitle) return { title: accessTitle, diagnostic: { ...diagnostic, title: accessTitle, titleSource: 'clientAccess' } };

  const explicit = safeTitle(firstTitle(fallbackSource));
  if (explicit) return { title: explicit, diagnostic: { ...diagnostic, title: explicit, titleSource: 'postMetadata' } };

  const stored = safeTitle(firstTitle(storedChannel(id) || {}));
  if (stored) return { title: stored, diagnostic: { ...diagnostic, title: stored, titleSource: 'store' } };

  if (config && clean(config.botToken) && typeof maxApi.getChat === 'function') {
    diagnostic.getChatAttempted = true;
    try {
      const chat = await maxApi.getChat({ botToken: clean(config.botToken), chatId: id, timeoutMs: Number(config.getChatTimeoutMs || 1200) || 1200 });
      const rawLiveTitle = rawTitleFromChat(chat);
      if (looksInternal(rawLiveTitle)) {
        return { title: UNTITLED_CHANNEL, hidden: true, diagnostic: { ...diagnostic, getChatAttempted: true, getChatOk: true, error: 'internal_live_title_hidden' } };
      }
      const liveTitle = safeTitle(rawLiveTitle);
      if (liveTitle) {
        persistTitle(id, userId, liveTitle);
        return { title: liveTitle, diagnostic: { ...diagnostic, title: liveTitle, titleSource: 'maxGetChat', getChatAttempted: true, getChatOk: true } };
      }
      return { title: UNTITLED_CHANNEL, diagnostic: { ...diagnostic, getChatAttempted: true, getChatOk: false, error: 'getChat_title_missing' } };
    } catch (error) {
      return { title: UNTITLED_CHANNEL, diagnostic: { ...diagnostic, getChatAttempted: true, getChatOk: false, error: clean(error?.message || error || 'getChat_failed') } };
    }
  }

  return { title: UNTITLED_CHANNEL, diagnostic: { ...diagnostic, error: 'title_missing_no_bot_token' } };
}
async function listUiChannelsForUser(userId = '', config = {}) {
  const channels = [];
  const seen = new Set();
  const diagnostics = [];
  for (const raw of accessChannels(userId)) {
    const channelId = clean(raw.channelId || raw.id || raw.chatId);
    if (!channelId || seen.has(channelId) || !isVisibleChannelRecord({ ...raw, channelId })) continue;
    seen.add(channelId);
    const resolved = await resolveUiChannelTitle(channelId, userId, config, raw);
    diagnostics.push(resolved.diagnostic);
    if (resolved.hidden || isVisibleChannelRecord({ ...raw, channelId, title: resolved.title }) === false) continue;
    const visiblePosts = listUiPostsForChannel(userId, channelId);
    const hasSafeTitle = Boolean(safeTitle(resolved.title));
    if (!hasSafeTitle && !visiblePosts.length) {
      diagnostics.push({ ...resolved.diagnostic, error: 'titleless_channel_without_visible_posts_hidden' });
      continue;
    }
    channels.push({ ...raw, channelId, title: hasSafeTitle ? resolved.title : UNTITLED_CHANNEL, titleSource: resolved.diagnostic.titleSource, diagnostic: resolved.diagnostic });
  }
  record(userId, 'channel_picker', { warning: channels.length ? '' : 'no_tenant_visible_channels' });
  diagnostics.forEach((item) => record(userId, 'channel_picker', item));
  return channels;
}
async function buildChannelPickerRows(menu, userId = '', source = 'comments', config = {}) {
  const channels = await listUiChannelsForUser(userId, config);
  const action = clean(source) === 'gifts' ? 'gift_admin_channel_pick' : clean(source) === 'buttons' ? 'button_admin_channel_pick' : 'comments_channel_pick';
  const rows = channels.map((channel, index) => [menu.button(`${index + 1}. ${short(channel.title || UNTITLED_CHANNEL, 52)}`, action, { source: clean(source || 'comments'), channelId: channel.channelId })]);
  if (!rows.length) rows.push([menu.button('Подключить канал', 'admin_bind_channel')]);
  return { rows, channels, diagnostics: channels.map((item) => item.diagnostic) };
}
function listUiPostsForChannel(userId = '', channelId = '') {
  const id = clean(channelId);
  const visible = new Set(accessChannels(userId).map((item) => clean(item.channelId || item.id || item.chatId)).filter(Boolean));
  const seen = new Set();
  return array(safe(() => store.getPostsList(), []))
    .filter((post) => post && clean(post.commentKey) && clean(post.channelId) && clean(post.postId))
    .filter((post) => (!id || clean(post.channelId) === id) && visible.has(clean(post.channelId)))
    .filter((post) => !looksInternal([post.channelId, post.channelTitle, post.title, post.originalText].join(' ')))
    .filter((post) => { const key = clean(post.commentKey); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}
function hasMedia(post = {}) { return array(post.sourceAttachments || post.attachments || post.media || post.photos || post.files).length > 0 || Boolean(post.photo || post.image || post.video || post.document); }
function safePostPreview(post = {}) { const text = clean(post.originalText || post.postText || post.text || post.caption || ''); if (text && !looksInternal(text) && !/\b(?:postId|channelId|messageId|commentKey|commentId|token|payload|trace)\b/i.test(text)) return short(text, 120); return hasMedia(post) ? 'Пост с медиа' : 'Пост без текста'; }

module.exports = { RUNTIME, UNTITLED_CHANNEL, listUiChannelsForUser, resolveUiChannelTitle, buildChannelPickerRows, listUiPostsForChannel, safePostPreview, getLastDiagnostics, clearDiagnostics, maskChannelId, looksInternal, looksRawId };
