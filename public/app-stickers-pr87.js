;(() => {
'use strict';

const RUNTIME = 'CC8.2.0-ADMINKIT-STICKERS-COMMENTS-PR87';
const MARKER = '__ADMINKIT_STICKERS_PR87__';
if (window[MARKER]) return;
window[MARKER] = true;
window.__ADMINKIT_STICKERS_RUNTIME__ = RUNTIME;

const PANEL_ID = 'adminkitStickerPanelPr87';
const BUTTON_ID = 'adminkitStickerButtonPr87';
let stickers = [];
let stickersById = {};
let panelOpen = false;
let booted = false;

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function byId(id) { return document.getElementById(id); }
function state() {
  return window.__ADMINKIT_CC7_5_55_STATE__ ||
    window.__ADMINKIT_CC7_5_53_STATE__ ||
    window.__ADMINKIT_CC7_5_47_STATE__ ||
    window.__ADMINKIT_CC7_5_6_STATE__ ||
    window.__ADMINKIT_CC7_5_3_STATE__ ||
    window.__ADMINKIT_CC7_2_STATE__ ||
    null;
}
function getCommentsList() { return byId('commentsList'); }
function getComposer() { return byId('composerCard'); }
function getInput() { return byId('commentInput'); }
function getCurrentUserId() { const s = state(); return clean(s && s.currentUserId) || 'guest'; }
function getCurrentUserName() { const s = state(); return clean(s && s.currentUserName) || 'Гость'; }
function getCurrentAvatarUrl() { const s = state(); return clean(s && s.currentUserAvatarUrl); }
function formatTime(ts) { try { return new Date(ts || Date.now()).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } }
function isOwnComment(comment) { const uid = getCurrentUserId(); return Boolean(uid && clean(comment && comment.userId) === uid); }
function stickerFor(comment) { return stickersById[clean(comment && comment.stickerId)] || null; }
function ensureStyles() {
  if (byId('adminkitStickerStylesPr87')) return;
  const style = document.createElement('style');
  style.id = 'adminkitStickerStylesPr87';
  style.textContent = `
    #${BUTTON_ID}{width:38px;height:38px;border:0;border-radius:50%;background:rgba(255,255,255,.88);font-size:21px;line-height:38px;display:inline-flex;align-items:center;justify-content:center;color:#1a2f3f;margin-left:4px;box-shadow:0 1px 2px rgba(0,0,0,.06);}
    #${BUTTON_ID}.active{background:#dff7ff;color:#0780a6;}
    #${PANEL_ID}{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:rgba(250,253,255,.98);border-radius:22px 22px 0 0;box-shadow:0 -10px 30px rgba(0,0,0,.16);padding:12px 14px calc(18px + env(safe-area-inset-bottom));transform:translateY(110%);transition:transform .18s ease;max-height:48vh;overflow:auto;-webkit-overflow-scrolling:touch;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
    #${PANEL_ID}.open{transform:translateY(0);}
    .adminkit-sticker-search{height:36px;border-radius:18px;background:#eef6fb;padding:0 14px;display:flex;align-items:center;color:#6b7f8f;font-size:15px;margin-bottom:10px;}
    .adminkit-sticker-caption{font-size:13px;color:#8a9aa7;margin:10px 2px 8px;}
    .adminkit-sticker-grid{display:grid;grid-template-columns:repeat(4,minmax(64px,1fr));gap:8px;}
    .adminkit-sticker-option{border:0;background:#fff;border-radius:18px;min-height:78px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 5px rgba(18,55,75,.08);padding:6px;}
    .adminkit-sticker-option img{width:64px;height:64px;object-fit:contain;pointer-events:none;}
    .adminkit-sticker-tabs{display:flex;gap:8px;margin-top:10px;}
    .adminkit-sticker-tab{border:0;border-radius:16px;background:#edf6fb;color:#426272;padding:6px 12px;font-size:14px;}
    .comment-bubble.has-sticker{background:transparent!important;box-shadow:none!important;padding:2px 0 0!important;}
    .comment-sticker{max-width:180px;min-width:116px;display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none;}
    .comment-row.own .comment-sticker{margin-left:auto;}
    .comment-sticker img{width:148px;max-width:42vw;height:auto;display:block;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,.12));pointer-events:auto;}
    .comment-sticker-status{font-size:12px;color:#8a9aa7;text-align:center;margin-top:2px;}
    .comment-sticker-error{font-size:12px;color:#cc3b3b;margin-top:4px;}
  `;
  document.head.appendChild(style);
}
function ensurePanel() {
  let panel = byId(PANEL_ID);
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.innerHTML = '<div class="adminkit-sticker-search">Найти стикер</div><div class="adminkit-sticker-caption">Недавние</div><div class="adminkit-sticker-grid" data-grid="recent"></div><div class="adminkit-sticker-caption">АдминКИТ</div><div class="adminkit-sticker-grid" data-grid="all"></div><div class="adminkit-sticker-tabs"><button type="button" class="adminkit-sticker-tab">Стикеры</button><button type="button" class="adminkit-sticker-tab">Эмодзи</button></div>';
  document.body.appendChild(panel);
  panel.addEventListener('click', (event) => {
    const btn = event.target && event.target.closest ? event.target.closest('[data-sticker-id]') : null;
    if (!btn) return;
    event.preventDefault();
    sendSticker(clean(btn.getAttribute('data-sticker-id')));
  });
  return panel;
}
function renderPanel() {
  const panel = ensurePanel();
  const allGrid = panel.querySelector('[data-grid="all"]');
  const recentGrid = panel.querySelector('[data-grid="recent"]');
  const html = stickers.map((item) => '<button type="button" class="adminkit-sticker-option" data-sticker-id="' + escapeHtml(item.id) + '" aria-label="' + escapeHtml(item.title || item.alt || 'Стикер') + '"><img src="' + escapeHtml(item.url || item.fallbackUrl || '') + '" alt="' + escapeHtml(item.alt || item.title || 'Стикер') + '" loading="lazy"></button>').join('');
  if (allGrid) allGrid.innerHTML = html || '<div class="adminkit-sticker-caption">Стикеры пока готовятся</div>';
  if (recentGrid) recentGrid.innerHTML = stickers.slice(0, 4).map((item) => '<button type="button" class="adminkit-sticker-option" data-sticker-id="' + escapeHtml(item.id) + '"><img src="' + escapeHtml(item.url || item.fallbackUrl || '') + '" alt="' + escapeHtml(item.alt || item.title || 'Стикер') + '" loading="lazy"></button>').join('');
}
function togglePanel(force) {
  if (!stickers.length) return;
  const panel = ensurePanel();
  panelOpen = force === undefined ? !panelOpen : Boolean(force);
  panel.classList.toggle('open', panelOpen);
  const btn = byId(BUTTON_ID);
  if (btn) btn.classList.toggle('active', panelOpen);
}
function ensureButton() {
  if (!stickers.length || byId(BUTTON_ID)) return;
  const input = getInput();
  if (!input || !input.parentNode) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = BUTTON_ID;
  btn.title = 'Стикеры';
  btn.setAttribute('aria-label', 'Открыть стикеры');
  btn.textContent = '🙂';
  input.parentNode.insertBefore(btn, input.nextSibling);
  btn.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); togglePanel(); });
}
function rowHtml(comment, sticker, optimistic) {
  const own = isOwnComment(comment);
  const userName = clean(comment.userName) || 'Гость';
  const avatarUrl = clean(comment.avatarUrl);
  const avatar = own ? '' : '<div class="comment-avatar">' + (avatarUrl ? '<img src="' + escapeHtml(avatarUrl) + '" alt="' + escapeHtml(userName) + '" loading="lazy">' : '<span>' + escapeHtml(userName.charAt(0).toUpperCase() || 'Г') + '</span>') + '</div>';
  const author = own ? '' : '<div class="comment-author">' + escapeHtml(userName) + '</div>';
  const img = '<div class="comment-sticker" data-sticker-id="' + escapeHtml(sticker.id) + '"><img class="comment-sticker-img" src="' + escapeHtml(sticker.url || sticker.fallbackUrl || '') + '" alt="' + escapeHtml(sticker.alt || sticker.title || 'Стикер') + '" loading="lazy"></div>';
  const status = optimistic ? '<div class="comment-sticker-status">Отправляем…</div>' : '';
  return '<div class="comment-row ' + (own ? 'own' : 'other') + '" data-comment-id="' + escapeHtml(comment.id || '') + '" data-sticker-row="1">' + avatar + '<div class="comment-bubble ' + (own ? 'own ' : '') + 'has-sticker">' + author + img + status + '<div class="comment-time">' + escapeHtml(formatTime(comment.createdAt)) + '</div></div></div>';
}
function decorateRow(row, comment) {
  if (!row || !comment || clean(row.getAttribute('data-sticker-decorated')) === '1') return;
  const sticker = stickerFor(comment);
  if (!sticker) return;
  const bubble = row.querySelector('.comment-bubble');
  if (!bubble) return;
  bubble.classList.add('has-sticker');
  const textNode = bubble.querySelector('.comment-text');
  if (textNode && clean(textNode.textContent) === 'Стикер') textNode.remove();
  if (!bubble.querySelector('.comment-sticker')) {
    const holder = document.createElement('div');
    holder.innerHTML = '<div class="comment-sticker" data-sticker-id="' + escapeHtml(sticker.id) + '"><img class="comment-sticker-img" src="' + escapeHtml(sticker.url || sticker.fallbackUrl || '') + '" alt="' + escapeHtml(sticker.alt || sticker.title || 'Стикер') + '" loading="lazy"></div>';
    const time = bubble.querySelector('.comment-time');
    bubble.insertBefore(holder.firstChild, time || null);
  }
  row.setAttribute('data-sticker-decorated', '1');
}
function decorateStickerRows() {
  const s = state();
  const list = getCommentsList();
  if (!s || !list) return;
  const comments = Array.isArray(s.comments) ? s.comments : [];
  comments.filter((item) => item && item.type === 'sticker').forEach((comment) => {
    const id = clean(comment.id);
    const sticker = stickerFor(comment);
    if (!id || !sticker) return;
    let row = list.querySelector('[data-comment-id="' + CSS.escape(id) + '"]');
    if (!row) {
      const tmp = document.createElement('div');
      tmp.innerHTML = rowHtml(comment, sticker, false);
      row = tmp.firstChild;
      list.appendChild(row);
    }
    decorateRow(row, comment);
  });
}
function appendOptimistic(comment, sticker) {
  const list = getCommentsList();
  if (!list || !sticker) return null;
  const tmp = document.createElement('div');
  tmp.innerHTML = rowHtml(comment, sticker, true);
  const row = tmp.firstChild;
  list.appendChild(row);
  try { row.scrollIntoView({ block: 'end' }); } catch (_) {}
  return row;
}
async function sendSticker(stickerId) {
  const s = state();
  const sticker = stickersById[clean(stickerId)];
  if (!s || !sticker || !s.commentKey) return;
  togglePanel(false);
  const optimisticId = 'client_sticker_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const optimistic = { id: optimisticId, clientCommentId: optimisticId, type: 'sticker', text: 'Стикер', stickerId: sticker.id, packId: sticker.packId, userId: getCurrentUserId(), userName: getCurrentUserName(), avatarUrl: getCurrentAvatarUrl(), replyToId: clean(s.replyToId), createdAt: Date.now(), sendStatus: 'sending' };
  s.comments = (Array.isArray(s.comments) ? s.comments : []).concat([optimistic]);
  const row = appendOptimistic(optimistic, sticker);
  try {
    const response = await fetch('/api/comments/sticker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentKey: s.commentKey, packId: sticker.packId, stickerId: sticker.id, userId: getCurrentUserId(), userName: getCurrentUserName(), avatarUrl: getCurrentAvatarUrl(), replyToId: clean(s.replyToId) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false || !data.comment) throw new Error(clean(data.error || 'sticker_send_failed'));
    s.comments = (s.comments || []).map((item) => item.id === optimisticId ? { ...data.comment, text: data.comment.text || 'Стикер' } : item);
    if (row) {
      row.setAttribute('data-comment-id', clean(data.comment.id));
      const status = row.querySelector('.comment-sticker-status');
      if (status) status.remove();
      row.removeAttribute('data-sticker-decorated');
    }
    decorateStickerRows();
    s.replyToId = '';
  } catch (error) {
    if (row) {
      const bubble = row.querySelector('.comment-bubble');
      if (bubble && !bubble.querySelector('.comment-sticker-error')) bubble.insertAdjacentHTML('beforeend', '<div class="comment-sticker-error">Не удалось отправить стикер</div>');
    }
  }
}
async function loadStickers() {
  const response = await fetch('/api/stickers?t=' + Date.now(), { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) return [];
  return Array.isArray(data.stickers) ? data.stickers.filter((item) => item && item.id && item.url) : [];
}
async function boot() {
  if (booted) return;
  booted = true;
  ensureStyles();
  stickers = await loadStickers().catch(() => []);
  stickersById = Object.fromEntries(stickers.map((item) => [item.id, item]));
  if (!stickers.length) return;
  renderPanel();
  ensureButton();
  const list = getCommentsList();
  if (list) {
    list.addEventListener('click', (event) => {
      const stickerNode = event.target && event.target.closest ? event.target.closest('.comment-sticker') : null;
      if (!stickerNode) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
    const observer = new MutationObserver(() => decorateStickerRows());
    observer.observe(list, { childList: true, subtree: true });
  }
  window.setInterval(() => { ensureButton(); decorateStickerRows(); }, 700);
  decorateStickerRows();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 150), { once: true });
else setTimeout(boot, 150);
})();
