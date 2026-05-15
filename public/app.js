;(() => {
'use strict';

// CC7.5.6-COMMENT-UI-SEND-GUARD
// Stable entrypoint: loads the proven open-state-first comments client.
// No server-side /public/app.js override and no landing-first fallback here.

const RUNTIME = 'CC7.5.6-PUBLIC-APP-COMMENT-UI-SEND-GUARD';
const MARKER = '__ADMINKIT_CC7_5_6_PUBLIC_APP_COMMENT_UI_SEND_GUARD__';
if (window[MARKER]) return;
window[MARKER] = true;
window.__ADMINKIT_PUBLIC_APP_RUNTIME__ = RUNTIME;

function bootOnepass() {
  if (window.__ADMINKIT_CC7_5_6_COMMENT_UI_SEND_GUARD__) return;
  const script = document.createElement('script');
  script.src = '/public/app-onepass.js?v=756';
  script.async = false;
  script.dataset.adminkitRuntime = RUNTIME;
  script.onerror = () => {
    const card = document.getElementById('postError');
    if (card) {
      card.textContent = 'Не удалось загрузить экран комментариев. Обновите страницу.';
      card.style.display = 'block';
    }
    console.error('[АдминКИТ]', RUNTIME, 'failed to load app-onepass.js');
  };
  (document.head || document.documentElement).appendChild(script);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootOnepass, { once: true });
else bootOnepass();
})();
