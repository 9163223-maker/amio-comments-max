;(() => {
'use strict';

// CC7.5.5-CLEAN-COMMENTS-BASE
// The mini-app HTML still loads /public/app.js. From this build this file is the stable entrypoint.
// It deliberately does not contain the old SP36 landing-first client anymore.
// It loads the proven open-state-first client directly, without server-side /public/app.js override.

const RUNTIME = 'CC7.5.5-PUBLIC-APP-CLEAN-ENTRY';
const MARKER = '__ADMINKIT_CC7_5_5_PUBLIC_APP_CLEAN_ENTRY__';
if (window[MARKER]) return;
window[MARKER] = true;
window.__ADMINKIT_PUBLIC_APP_RUNTIME__ = RUNTIME;

function bootOnepass() {
  if (window.__ADMINKIT_CC7_5_3_APPJS_OPENSTATE_FIRST__ || window.__ADMINKIT_CC7_5_4_APPJS_OPENSTATE_FIRST_FINAL__) return;
  const script = document.createElement('script');
  script.src = '/public/app-onepass.js?v=755';
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
