;(() => {
'use strict';
const RUNTIME = 'CC7.5.47-PUBLIC-APP-COMMENT-UI-NAV-SEARCH';
const MARKER = '__ADMINKIT_CC7_5_47_PUBLIC_APP_COMMENT_UI_NAV_SEARCH__';
if (window[MARKER]) return;
window[MARKER] = true;
window.__ADMINKIT_PUBLIC_APP_RUNTIME__ = RUNTIME;
function bootOnepass() {
  if (window.__ADMINKIT_CC7_5_47_COMMENT_UI_NAV_SEARCH__) return;
  const script = document.createElement('script');
  script.src = '/public/app-onepass.js?v=7547';
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