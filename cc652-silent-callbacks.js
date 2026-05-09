'use strict';

const RUNTIME = 'CC6.5.2';
const SOURCE = 'adminkit-CC6.5.2-silent-navigation-callbacks';

function norm(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

const KEEP = new Set(['сохранено', 'удалено', 'очищено', 'включено', 'выключено', 'отменено', 'ошибка']);
const SILENT = [
  /главн.*меню/i,
  /^модерац/i,
  /^помощ/i,
  /^как подключ/i,
  /^выберите/i,
  /^канал выбран/i,
  /^правила (канала|поста)/i,
  /^сначала выберите/i,
  /^пришлите стоп/i
];

function shouldSilence(notification) {
  const text = norm(notification).toLowerCase();
  if (!text) return false;
  if (KEEP.has(text)) return false;
  return SILENT.some((re) => re.test(text));
}

function install() {
  const api = require('./services/maxApi');
  if (!api || api.__cc652SilentCallbacks) return api;
  const original = api.answerCallback;
  api.answerCallback = async function answerCallbackSilentNavigation(args = {}) {
    const notification = norm(args.notification);
    if (shouldSilence(notification)) {
      const next = { ...args };
      delete next.notification;
      return original.call(this, next);
    }
    return original.call(this, args);
  };
  api.answerCallback.__cc652 = {
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    policy: 'silent_navigation_final_actions_only',
    navigationToasts: 'silent',
    finalActionToasts: Array.from(KEEP),
    positionControl: 'not_supported_by_MAX_answers_api',
    durationControl: 'not_supported_by_MAX_answers_api'
  };
  api.__cc652SilentCallbacks = true;
  return api;
}

module.exports = { RUNTIME, SOURCE, install, shouldSilence };
