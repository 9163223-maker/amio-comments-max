;(() => {
'use strict';

const RUNTIME = 'CC8.1.11-FAST-COMMENT-SEND-UNLOCK';
const MARKER = '__ADMINKIT_CC8_1_11_FAST_COMMENT_SEND_UNLOCK__';
const LEGACY_MARKER = '__ADMINKIT_CC7_5_64_DIRECT_MEDIA_POST_PATCH_TRACE__';
const LEGACY_SRC = '/public/app-onepass.js?v=7564';
if (window[MARKER]) return;
window[MARKER] = true;
window.__ADMINKIT_FAST_COMMENT_SEND_UNLOCK_RUNTIME__ = RUNTIME;

function byId(id) { return document.getElementById(id); }
function getState() {
  return window.__ADMINKIT_CC7_5_55_STATE__ ||
    window.__ADMINKIT_CC7_5_53_STATE__ ||
    window.__ADMINKIT_CC7_5_47_STATE__ ||
    window.__ADMINKIT_CC7_5_6_STATE__ ||
    window.__ADMINKIT_CC7_5_3_STATE__ ||
    window.__ADMINKIT_CC7_2_STATE__ || null;
}
function pushMetric(reason) {
  const list = window.__ADMINKIT_FAST_COMMENT_SEND_UNLOCK_EVENTS__ || [];
  list.push({ at: Date.now(), runtimeVersion: RUNTIME, reason: String(reason || '') });
  window.__ADMINKIT_FAST_COMMENT_SEND_UNLOCK_EVENTS__ = list.slice(-20);
}
function hasPendingPhoto(state) {
  return Boolean(state && state.pendingPhoto && state.pendingPhoto.file);
}
function unlockTextComposer(reason) {
  const state = getState();
  if (!state || hasPendingPhoto(state)) return false;
  const input = byId('commentInput');
  const sendBtn = byId('sendBtn');
  if (!state.sendInFlight && !(input && input.readOnly) && !(sendBtn && sendBtn.disabled)) return false;
  state.sendInFlight = false;
  if (input) input.readOnly = false;
  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.setAttribute('aria-busy', 'false');
    sendBtn.classList.remove('is-sending');
  }
  pushMetric(reason || 'unlock');
  return true;
}
function scheduleUnlock(reason) {
  [90, 180, 360, 750, 1400].forEach((delay) => {
    window.setTimeout(() => unlockTextComposer(reason + ':' + delay), delay);
  });
}
function installFastUnlock() {
  const sendBtn = byId('sendBtn');
  const input = byId('commentInput');
  if (sendBtn && !sendBtn.__adminkitFastUnlock) {
    sendBtn.__adminkitFastUnlock = true;
    sendBtn.addEventListener('click', () => scheduleUnlock('send_click'), true);
  }
  if (input && !input.__adminkitFastUnlock) {
    input.__adminkitFastUnlock = true;
    input.addEventListener('keydown', (event) => {
      if (event && event.key === 'Enter' && !event.shiftKey) scheduleUnlock('enter_send');
    }, true);
    input.addEventListener('focus', () => scheduleUnlock('input_focus'), true);
  }
  scheduleUnlock('install');
}
function loadLegacy() {
  if (window[LEGACY_MARKER]) { installFastUnlock(); return; }
  const script = document.createElement('script');
  script.src = LEGACY_SRC;
  script.async = false;
  script.dataset.adminkitRuntime = RUNTIME;
  script.onload = () => installFastUnlock();
  script.onerror = () => {
    const card = byId('postError');
    if (card) {
      card.textContent = 'Не удалось загрузить экран комментариев. Обновите страницу.';
      card.style.display = 'block';
    }
  };
  (document.head || document.documentElement).appendChild(script);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadLegacy, { once: true });
else loadLegacy();
})();
