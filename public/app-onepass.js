;(() => {
'use strict';

const RUNTIME = 'CC7.5.6-COMMENT-UI-SEND-GUARD';
const MARKER = '__ADMINKIT_CC7_5_6_COMMENT_UI_SEND_GUARD__';
if (window[MARKER]) return;
window[MARKER] = true;

function byId(id) { return document.getElementById(id); }
function clean(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function safeDecode(v) {
  let current = String(v || '');
  for (let i = 0; i < 5; i += 1) {
    try {
      const decoded = decodeURIComponent(current.replace(/\+/g, '%20'));
      if (decoded === current) break;
      current = decoded;
    } catch (_) { break; }
  }
  return current;
}
function escapeHtml(v) {
  return String(v || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function formatTime(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; }
}
function pluralComments(n) {
  const count = Math.max(0, Number(n || 0) || 0);
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 0) return '0 комментариев';
  if (mod10 === 1 && mod100 !== 11) return count + ' комментарий';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return count + ' комментария';
  return count + ' комментариев';
}
function getPossibleWebApps() {
  return [
    window.WebApp,
    window.Telegram && window.Telegram.WebApp,
    window.Max && window.Max.WebApp,
    window.MAX && window.MAX.WebApp,
    window.maxWebApp,
    window.MAXWebApp,
    window.MiniApp,
    window.max && window.max.WebApp
  ].filter(Boolean);
}
function initBridgeUi() {
  const app = getPossibleWebApps()[0];
  try { app && app.ready && app.ready(); } catch (_) {}
  try { app && app.expand && app.expand(); } catch (_) {}
  try { app && app.disableClosingConfirmation && app.disableClosingConfirmation(); } catch (_) {}
}
function getBridgeUser() {
  for (const app of getPossibleWebApps()) {
    const user = (app && app.initDataUnsafe && app.initDataUnsafe.user) || (app && app.user);
    if (user) return user;
  }
  return null;
}
function getBridgeUserName() {
  const user = getBridgeUser();
  return clean((user && (user.first_name || user.username || user.last_name)) || '');
}
function getBridgeUserId() {
  const user = getBridgeUser();
  return clean((user && user.id) || '');
}
function getBridgeAvatarUrl() {
  const user = getBridgeUser();
  return clean((user && user.photo_url) || '');
}
function addUnique(list, value) {
  const text = clean(value);
  if (text && !list.includes(text)) list.push(text);
}
function isStartOnlyValue(v) {
  const s = clean(safeDecode(v)).toLowerCase();
  return !s || ['start', 'menu', 'main', 'home', 'bot', 'admin', 'adminkit'].includes(s);
}
function derivePostNumber(text) {
  const s = clean(safeDecode(text));
  if (!s) return '';
  let m = s.match(/(?:^|[^\w])(post|пост)[:=\s-]*(\d{1,4})(?:$|[^\w])/i);
  if (m) return m[2];
  m = s.match(/(?:^|[?&#\s])(startapp|start_param|WebAppStartParam|payload|startPayload|start_payload|post|postId|post_id|title)=(?:Post\s*)?(\d{1,4})(?:$|[&#\s])/i);
  if (m) return m[2];
  m = s.match(/^\d{1,4}$/);
  if (m) return m[0];
  return '';
}
function parseCompactPayload(text) {
  const s = clean(safeDecode(text));
  const out = { commentKey: '', channelId: '', postId: '', handoff: '' };
  if (!s) return out;
  let m = s.match(/(?:^|[^A-Za-z0-9_-])(cp_(-?\d{3,})_(-?\d{1,}))(?:$|[^A-Za-z0-9_-])/) || s.match(/^(cp_(-?\d{3,})_(-?\d{1,}))$/);
  if (m) {
    out.handoff = m[1];
    out.channelId = m[2];
    out.postId = m[3];
    out.commentKey = out.channelId + ':' + out.postId;
    return out;
  }
  m = s.match(/(?:^|[^A-Za-z0-9_-])(ck_(-?\d{3,})_(-?\d{1,}))(?:$|[^A-Za-z0-9_-])/) || s.match(/^(ck_(-?\d{3,})_(-?\d{1,}))$/);
  if (m) {
    out.handoff = m[1];
    out.channelId = m[2];
    out.postId = m[3];
    out.commentKey = out.channelId + ':' + out.postId;
    return out;
  }
  m = s.match(/(-?\d{3,}):(-?\d{1,})/);
  if (m) {
    out.channelId = m[1];
    out.postId = m[2];
    out.commentKey = out.channelId + ':' + out.postId;
  }
  return out;
}
function scanParams() {
  const result = { commentKey: '', handoff: '', channelId: '', postId: '', title: '', raw: '', rawPieces: [], hasCommentIdentity: false, launchMode: 'start' };
  function markCommentIdentity(reason) {
    result.hasCommentIdentity = true;
    result.launchMode = 'comments';
    result.identityReason = result.identityReason || reason || 'explicit_comment_identity';
  }
  function applyCompact(value) {
    const parsed = parseCompactPayload(value);
    if (parsed.handoff && !result.handoff) result.handoff = parsed.handoff;
    if (parsed.commentKey && !result.commentKey) result.commentKey = parsed.commentKey;
    if (parsed.channelId && !result.channelId) result.channelId = parsed.channelId;
    if (parsed.postId && !result.postId) result.postId = parsed.postId;
    if (parsed.commentKey || parsed.handoff) markCommentIdentity('compact_payload');
    return Boolean(parsed.commentKey || parsed.channelId || parsed.postId || parsed.handoff);
  }
  function addRaw(value) {
    const v = String(value || '');
    if (!v) return;
    addUnique(result.rawPieces, v);
    addUnique(result.rawPieces, safeDecode(v));
    applyCompact(v);
  }
  function setValue(key, value) {
    const v = clean(safeDecode(value));
    if (!v) return;
    addRaw(v);
    applyCompact(v);
    const lower = String(key || '').toLowerCase();
    const isPayloadKey = ['handoff', 'startapp', 'start_param', 'webappstartparam', 'payload', 'startpayload', 'start_payload', 'button_payload', 'launch_payload', 'web_app_payload'].includes(lower);
    if ((lower === 'commentkey' || lower === 'key') && !result.commentKey && !isStartOnlyValue(v)) {
      result.commentKey = v.replace(/^ck:/i, '');
      markCommentIdentity('commentKey_field');
    }
    if (isPayloadKey) {
      if (!result.handoff && !isStartOnlyValue(v)) result.handoff = v;
      if (/^(cp_|ck_|h_|ak_)/i.test(v) || /-?\d{3,}:-?\d{1,}/.test(v)) markCommentIdentity('payload_field');
      const number = derivePostNumber(v);
      if (number) {
        if (!result.postId) result.postId = number;
        if (!result.title) result.title = 'Post ' + number;
        markCommentIdentity('payload_post_number');
      }
    }
    if ((lower === 'channelid' || lower === 'channel' || lower === 'channel_id') && !result.channelId && /^-?\d{3,}$/.test(v)) result.channelId = v;
    if ((lower === 'postid' || lower === 'post_id' || lower === 'messageid' || lower === 'message_id') && !result.postId && /^-?\d{1,}$/.test(v)) {
      result.postId = v.replace(/^post:/i, '');
      markCommentIdentity('postId_field');
    }
    if ((lower === 'title' || lower === 'posttitle' || lower === 'posttext') && !result.title && /\b(Post|Пост)\s*\d{1,4}\b/i.test(v)) {
      result.title = v;
      markCommentIdentity('post_title_field');
    }
  }
  function scanObject(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 5) return;
    try { addRaw(JSON.stringify(obj).slice(0, 2500)); } catch (_) {}
    Object.entries(obj).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === 'object') scanObject(value, depth + 1);
      else setValue(key, value);
    });
  }
  function scan(raw) {
    if (raw && typeof raw === 'object') { scanObject(raw, 0); return; }
    raw = String(raw || '');
    if (!raw) return;
    addRaw(raw);
    for (const variant of [raw, safeDecode(raw)]) {
      applyCompact(variant);
      const parts = [variant];
      if (variant.includes('?')) parts.push(variant.split('?').slice(1).join('?'));
      if (variant.includes('#')) parts.push(variant.split('#').slice(1).join('#'));
      for (const part of parts) {
        try {
          const params = new URLSearchParams(String(part || '').replace(/^#|^\?/g, ''));
          for (const pair of params.entries()) setValue(pair[0], pair[1]);
        } catch (_) {}
      }
      const compact = variant.match(/(cp_-?\d{3,}_-?\d{1,}|ck_-?\d{3,}_-?\d{1,}|ak_[A-Za-z0-9_-]{8,})/i);
      if (compact) setValue('handoff', compact[1]);
      const ck = variant.match(/-?\d{3,}:-?\d{1,}/);
      if (ck) setValue('commentKey', ck[0]);
      const handoff = variant.match(/h_[A-Za-z0-9_-]{6,}/);
      if (handoff) setValue('handoff', handoff[0]);
      const postId = variant.match(/(?:postId|post_id|messageId|message_id|post)[:=](-?\d{1,})/i);
      if (postId) setValue('postId', postId[1]);
      const title = variant.match(/\b(Post\s*new!!\s*\d+!|Post\s*new\s*\d+|Post\s*zero\s*\d+|Post\s*\d+|Пост\s*\d+)\b/i);
      if (title) setValue('title', title[1]);
      const number = derivePostNumber(variant);
      if (number) {
        if (!result.postId) result.postId = number;
        if (!result.title) result.title = 'Post ' + number;
      }
    }
  }

  try { scan(location.href); scan(location.search); scan(location.hash); scan(document.referrer || ''); } catch (_) {}
  getPossibleWebApps().forEach((app) => {
    try {
      const unsafe = (app && app.initDataUnsafe) || {};
      ['start_param', 'startapp', 'WebAppStartParam', 'payload', 'startPayload', 'start_payload', 'button_payload', 'launch_payload', 'web_app_payload', 'postId', 'post_id', 'messageId', 'message_id', 'commentKey', 'channelId', 'channel_id', 'title', 'postTitle'].forEach((key) => setValue(key, unsafe[key]));
      scanObject(unsafe, 0);
      scan(app && app.initData);
      scan(app && app.startParam);
      scan(app && app.launchParams);
      scan(app && app.params);
      scan(app && app.payload);
      scan(app && app.startPayload);
      scan(app && app.start_payload);
      scan(app && app.buttonPayload);
      scan(app && app.webAppPayload);
    } catch (_) {}
  });

  if (result.commentKey && result.commentKey.includes(':')) {
    const parts = result.commentKey.split(':');
    if (!result.channelId && parts[0]) result.channelId = clean(parts[0]);
    if (!result.postId && parts[1]) result.postId = clean(parts[1]);
  }
  if (!result.title && result.postId && /^\d{1,4}$/.test(result.postId)) result.title = 'Post ' + result.postId;
  result.raw = result.rawPieces.join(' ').slice(0, 4000);
  return result;
}

const refs = {
  postCard: byId('postCard'), postTitle: byId('postTitle'), postMedia: byId('postMedia'), commentsList: byId('commentsList'),
  emptyState: byId('emptyState'), nameInput: byId('nameInput'), commentInput: byId('commentInput'), sendBtn: byId('sendBtn'),
  attachBtn: byId('attachBtn'), attachmentInput: byId('attachmentInput'), commentsCountPill: byId('commentsCountPill'),
  adminkitDiscussionLink: byId('adminkitDiscussionLink'), backBtn: byId('backBtn'), composerAvatar: byId('composerAvatar'),
  composerAvatarFallback: byId('composerAvatarFallback'), discussionLabel: byId('discussionLabel'), composerCard: byId('composerCard'),
  postError: byId('postError'), commentInlineStatus: byId('commentInlineStatus'), commentsWrap: byId('commentsWrap'),
  miniAppStartCard: byId('miniAppStartCard'), miniAppStartText: byId('miniAppStartText'), miniAppStartWorkBtn: byId('miniAppStartWorkBtn'),
  miniAppCommunityBtn: byId('miniAppCommunityBtn'), miniAppTopbar: byId('miniAppTopbar')
};

const params = scanParams();
const state = {
  commentKey: params.commentKey, handoff: params.handoff, channelId: params.channelId, postId: params.postId,
  title: params.title, raw: params.raw, launchMode: params.launchMode, hasCommentIdentity: params.hasCommentIdentity,
  currentUserId: getBridgeUserId(), currentUserName: getBridgeUserName(), currentUserAvatarUrl: getBridgeAvatarUrl(),
  comments: [], meta: {}, commentsCount: 0, pollTimer: null, requestInFlight: false,
  sendInFlight: false, lastSendFingerprint: '', lastSendStartedAt: 0
};
window.__ADMINKIT_CC7_5_6_STATE__ = state;
window.__ADMINKIT_CC7_5_3_STATE__ = state;
window.__ADMINKIT_CC7_2_STATE__ = state;

function setInlineStatus(message, isError) {
  if (!refs.commentInlineStatus) return;
  refs.commentInlineStatus.textContent = message || '';
  refs.commentInlineStatus.classList.toggle('hidden', !message);
  refs.commentInlineStatus.classList.toggle('error', Boolean(isError && message));
}
function setSendingUi(isSending) {
  if (refs.sendBtn) {
    refs.sendBtn.disabled = Boolean(isSending);
    refs.sendBtn.setAttribute('aria-busy', isSending ? 'true' : 'false');
    refs.sendBtn.classList.toggle('is-sending', Boolean(isSending));
  }
  if (refs.commentInput) refs.commentInput.readOnly = Boolean(isSending);
}
function buildOpenStateUrl() {
  const q = new URLSearchParams();
  if (state.commentKey) q.set('commentKey', state.commentKey);
  if (state.handoff) q.set('handoff', state.handoff);
  if (state.channelId) q.set('channelId', state.channelId);
  if (state.postId) q.set('postId', state.postId);
  if (state.title) q.set('title', state.title);
  if (state.raw) q.set('raw', state.raw);
  q.set('appRuntime', RUNTIME);
  q.set('t', Date.now());
  return '/api/adminkit/comment-open-state?' + q.toString();
}
function loadOpenStateSync() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', buildOpenStateUrl(), false);
    xhr.setRequestHeader('Cache-Control', 'no-store');
    xhr.send(null);
    if (xhr.status >= 200 && xhr.status < 400) return JSON.parse(xhr.responseText || '{}');
    return { ok: false, error: 'http_' + xhr.status };
  } catch (error) { return { ok: false, error: String((error && error.message) || error) }; }
}
async function loadOpenStateAsync() {
  const response = await fetch(buildOpenStateUrl(), { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || ('http_' + response.status));
  return data;
}
function showMiniStart() {
  document.body && document.body.classList && document.body.classList.add('miniapp-start-mode');
  if (refs.miniAppTopbar) refs.miniAppTopbar.style.display = 'none';
  if (refs.postCard) refs.postCard.style.display = 'none';
  if (refs.commentsWrap) refs.commentsWrap.style.display = 'none';
  const wrap = document.querySelector('.discussion-label-wrap');
  if (wrap) wrap.style.display = 'none';
  if (refs.composerCard) refs.composerCard.style.display = 'none';
  if (refs.postError) { refs.postError.textContent = ''; refs.postError.style.display = 'none'; }
  if (refs.miniAppStartCard) refs.miniAppStartCard.classList.remove('hidden');
  if (refs.miniAppStartText) refs.miniAppStartText.innerHTML = '<div class="miniapp-start-copy strong">АдминКИТ — система управления MAX</div><div class="miniapp-start-copy">Рост канала, комментарии, подарки, кнопки, модерация и статистика — в одном месте.</div><div class="miniapp-start-copy subtle">Нажмите «Приступить к работе», чтобы открыть чат с ботом.</div>';
}
function hideMiniStart() {
  document.body && document.body.classList && document.body.classList.remove('miniapp-start-mode');
  if (refs.miniAppStartCard) refs.miniAppStartCard.classList.add('hidden');
  if (refs.miniAppTopbar) refs.miniAppTopbar.style.display = 'grid';
  if (refs.postCard) refs.postCard.style.display = 'block';
  if (refs.commentsWrap) refs.commentsWrap.style.display = 'block';
  const wrap = document.querySelector('.discussion-label-wrap');
  if (wrap) wrap.style.display = 'flex';
  if (refs.composerCard) refs.composerCard.style.display = 'block';
}
function applyMeta(meta) {
  meta = meta || {};
  state.meta = meta;
  if (meta.commentKey) state.commentKey = clean(meta.commentKey);
  if (meta.channelId) state.channelId = clean(meta.channelId);
  if (meta.postId) state.postId = clean(meta.postId);
  if (meta.postTitle) state.title = clean(meta.postTitle);
  const snapshot = meta.postSnapshot || {};
  const title = clean(meta.postTitle || snapshot.title || snapshot.text || state.title || (state.postId ? ('Post ' + state.postId) : ''));
  if (refs.postTitle) refs.postTitle.textContent = title;
  if (refs.discussionLabel) refs.discussionLabel.textContent = 'Начало обсуждения';
  const banner = (meta && meta.banner) || {};
  const ctaText = clean(banner.button || banner.text) || '🐋 АдминКИТ';
  const ctaLink = clean(banner.link) || 'https://max.ru/id781310320690_bot?start=menu';
  if (refs.adminkitDiscussionLink) {
    refs.adminkitDiscussionLink.textContent = ctaText;
    refs.adminkitDiscussionLink.href = ctaLink;
    refs.adminkitDiscussionLink.target = '_blank';
    refs.adminkitDiscussionLink.rel = 'noopener noreferrer';
  }
  if (refs.postError) { refs.postError.textContent = ''; refs.postError.style.display = 'none'; }
}
function renderAttachment(attachment) {
  const type = clean(attachment && (attachment.type || attachment.kind));
  const url = clean(attachment && (attachment.url || attachment.previewUrl || attachment.posterUrl));
  const name = clean(attachment && (attachment.name || attachment.fileName)) || 'файл';
  if (!url) return '';
  if (type === 'image' || /\.(jpg|jpeg|png|webp|gif)$/i.test(url)) return '<div class="comment-attachment comment-attachment-image"><img src="' + escapeHtml(url) + '" alt="' + escapeHtml(name) + '" loading="lazy"></div>';
  if (type === 'video' || /\.(mp4|mov|webm)$/i.test(url)) return '<div class="comment-attachment comment-attachment-video"><video controls playsinline src="' + escapeHtml(url) + '"></video></div>';
  return '<a class="comment-attachment comment-attachment-file" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(name) + '</a>';
}
function renderComments(list) {
  state.comments = Array.isArray(list) ? list : [];
  if (refs.emptyState) {
    refs.emptyState.textContent = state.comments.length ? '' : 'Комментариев пока нет';
    refs.emptyState.style.display = state.comments.length ? 'none' : 'block';
  }
  if (!refs.commentsList) return;
  refs.commentsList.innerHTML = state.comments.map((comment) => {
    const userId = clean(comment.userId || comment.user_id || '');
    const userName = clean(comment.userName || comment.user_name || comment.name || 'Гость');
    const own = Boolean(state.currentUserId && userId && String(state.currentUserId) === String(userId));
    const text = clean(comment.text || comment.body || '');
    const time = formatTime(comment.createdAt || comment.created_at || comment.updatedAt || comment.updated_at);
    const attachments = (Array.isArray(comment.attachments) ? comment.attachments : []).map(renderAttachment).join('');
    const avatar = own ? '' : '<div class="comment-avatar">' + escapeHtml(userName.charAt(0).toUpperCase() || 'Г') + '</div>';
    const author = own ? '' : '<div class="comment-author">' + escapeHtml(userName) + '</div>';
    const ownClass = own ? ' own' : '';
    return '<div class="comment-row ' + (own ? 'own' : 'other') + '" data-comment-id="' + escapeHtml(comment.id || '') + '">' + avatar + '<div class="comment-bubble' + ownClass + '">' + author + (text ? '<div class="comment-text">' + escapeHtml(text) + '</div>' : '') + attachments + '<div class="comment-time">' + escapeHtml(time) + '</div></div></div>';
  }).join('');
}
function renderOpenState(data) {
  data = data || {};
  state.launchMode = 'comments';
  state.hasCommentIdentity = true;
  hideMiniStart();
  applyMeta(data.meta || {});
  const list = Array.isArray(data.comments) ? data.comments : [];
  const count = Number(data.commentsCount || list.length || 0) || 0;
  renderComments(list);
  if (refs.commentsCountPill) refs.commentsCountPill.textContent = pluralComments(count);
}
async function refreshOpenState() {
  if (state.launchMode !== 'comments' || state.requestInFlight) return;
  state.requestInFlight = true;
  try { renderOpenState(await loadOpenStateAsync()); } catch (_) {}
  finally { state.requestInFlight = false; }
}
function outgoingUserName() { return clean(state.currentUserName || (refs.nameInput && refs.nameInput.value) || 'Гость'); }
function outgoingUserId() { return clean(state.currentUserId || (refs.nameInput && refs.nameInput.value) || 'guest'); }
function makeSendFingerprint(text) {
  return [state.commentKey || '', outgoingUserId() || 'guest', text || ''].join('|');
}
async function sendComment() {
  const text = clean(refs.commentInput && refs.commentInput.value);
  if (!text || !state.commentKey) return;
  const fingerprint = makeSendFingerprint(text);
  if (state.sendInFlight) return;
  if (fingerprint === state.lastSendFingerprint && Date.now() - Number(state.lastSendStartedAt || 0) < 8000) return;
  state.sendInFlight = true;
  state.lastSendFingerprint = fingerprint;
  state.lastSendStartedAt = Date.now();
  setInlineStatus('Отправляем…', false);
  setSendingUi(true);
  try {
    const response = await fetch('/api/comments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentKey: state.commentKey, userId: outgoingUserId(), userName: outgoingUserName(), avatarUrl: state.currentUserAvatarUrl || '', text, attachments: [] })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      setInlineStatus(clean(data.message || data.userMessage || data.friendlyMessage) || 'Комментарий не опубликован: сработала модерация или правила обсуждения.', true);
      return;
    }
    if (refs.commentInput) refs.commentInput.value = '';
    state.lastSendFingerprint = '';
    setInlineStatus('', false);
    await refreshOpenState();
  } catch (_) { setInlineStatus('Не удалось отправить комментарий. Попробуйте ещё раз.', true); }
  finally {
    state.sendInFlight = false;
    setSendingUi(false);
  }
}
function openMaxLink(target) {
  const app = getPossibleWebApps()[0];
  try { if (app && app.openMaxLink) app.openMaxLink(target); else location.href = target; } catch (_) { location.href = target; }
}
function bindEvents() {
  if (refs.sendBtn) refs.sendBtn.addEventListener('click', sendComment);
  if (refs.commentInput) refs.commentInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); } });
  if (refs.backBtn) refs.backBtn.addEventListener('click', () => { try { history.back(); } catch (_) {} });
  if (refs.attachBtn && refs.attachmentInput) refs.attachBtn.addEventListener('click', () => refs.attachmentInput.click());
  if (refs.miniAppStartWorkBtn) refs.miniAppStartWorkBtn.addEventListener('click', () => openMaxLink('https://max.ru/id781310320690_bot?start=menu'));
  if (refs.miniAppCommunityBtn) refs.miniAppCommunityBtn.addEventListener('click', () => openMaxLink('https://max.ru/id781310320690_biz'));
}
function showDiscussionError() {
  hideMiniStart();
  applyMeta({ postTitle: state.title || (state.postId ? ('Post ' + state.postId) : '') });
  renderComments([]);
  if (refs.commentsCountPill) refs.commentsCountPill.textContent = '0 комментариев';
  if (refs.postError) {
    refs.postError.textContent = 'Не удалось определить пост. Обновите экран.';
    refs.postError.style.display = 'block';
  }
}
function boot() {
  initBridgeUi();
  bindEvents();
  if (state.currentUserName && refs.nameInput) { refs.nameInput.value = state.currentUserName; refs.nameInput.readOnly = true; refs.nameInput.style.display = 'none'; }
  if (state.currentUserAvatarUrl && refs.composerAvatar) { refs.composerAvatar.src = state.currentUserAvatarUrl; refs.composerAvatar.style.display = 'block'; if (refs.composerAvatarFallback) refs.composerAvatarFallback.style.display = 'none'; }

  const initial = loadOpenStateSync();
  window.__ADMINKIT_CC7_5_6_INITIAL__ = initial;
  window.__ADMINKIT_CC7_5_3_INITIAL__ = initial;
  window.__ADMINKIT_CC7_2_INITIAL__ = initial;
  if (initial && initial.ok && initial.meta) {
    renderOpenState(initial);
    state.pollTimer = setInterval(refreshOpenState, 5000);
    return;
  }

  if (state.hasCommentIdentity || state.commentKey || state.handoff || state.channelId || state.postId || state.title) {
    showDiscussionError();
    state.pollTimer = setInterval(refreshOpenState, 5000);
    return;
  }

  showMiniStart();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
})();
