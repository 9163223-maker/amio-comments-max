'use strict';

const RUNTIME = 'CC6.5.6.1-SILENT-MENU-CALLBACKS';
const SOURCE = 'adminkit-CC6.5.6.1-remove-max-opened-toast';

function install() {
  const api = require('./services/maxApi');
  if (!api || api.__adminkitSilentMenuCallbacks) return selfTest();

  const original = api.answerCallback;
  api.answerCallback = async function silentMenuAnswerCallback(args = {}) {
    const notification = String(args && args.notification || '').trim();
    const message = String(args && args.message || '').trim();
    const shouldSilence = ['Открыто', 'Главное меню', 'Открываем', 'Открывается'].includes(notification);

    if (shouldSilence && !message) {
      return original.call(this, {
        ...args,
        notification: ''
      });
    }

    return original.call(this, args);
  };

  api.__adminkitSilentMenuCallbacks = {
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    silencedNotifications: ['Открыто', 'Главное меню', 'Открываем', 'Открывается']
  };

  return selfTest();
}

function selfTest() {
  const api = require('./services/maxApi');
  return {
    ok: !!(api && api.__adminkitSilentMenuCallbacks),
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    policy: {
      suppressMaxOpenedToast: true,
      keepErrorNotifications: true,
      doesNotPatchWebhook: true,
      doesNotPatchMenuRenderer: true
    },
    installed: api && api.__adminkitSilentMenuCallbacks || null
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest };
