;(() => {
'use strict';
const RUNTIME = 'CC7.5.48-COMMENT-PHOTO-ATTACHMENTS';
const MARKER = '__ADMINKIT_CC7_5_48_COMMENT_PHOTO_ATTACHMENTS__';
if (window[MARKER]) return;
window[MARKER] = true;
window.__ADMINKIT_PUBLIC_APP_RUNTIME__ = RUNTIME;
function bootOnepass() {
  if (window.__ADMINKIT_CC7_5_48_COMMENT_PHOTO_ATTACHMENTS__) return;
  const script = document.createElement('script');
  script.src = '/public/app-onepass.js?v=7548';
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
