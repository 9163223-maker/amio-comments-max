;(() => {
'use strict';
const RUNTIME = 'CC7.5.56-COMMENT-SEND-FAST-HOTFIX';
const LOADER_MARKER = '__ADMINKIT_CC7_5_56_COMMENT_SEND_FAST_HOTFIX_LOADER__';
const ONEPASS_MARKER = '__ADMINKIT_CC7_5_56_COMMENT_SEND_FAST_HOTFIX__';
const ASSET_VERSION = 'v7556';
if (window[LOADER_MARKER]) return;
window[LOADER_MARKER] = true;
window.__ADMINKIT_PUBLIC_APP_RUNTIME__ = RUNTIME;
function bootOnepass() {
  if (window[ONEPASS_MARKER]) return;
  const script = document.createElement('script');
  script.src = '/public/app-onepass.js?' + ASSET_VERSION.replace(/^v/, 'v=');
  script.async = false;
  script.dataset.adminkitRuntime = RUNTIME;
  script.onerror = () => {
    const card = document.getElementById('postError');
    if (card) {
      card.textContent = 'Не удалось загрузить экран комментариев. Обновите страницу.';
      card.style.display = 'block';
    }
  };
  (document.head || document.documentElement).appendChild(script);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootOnepass, { once: true });
else bootOnepass();
})();
