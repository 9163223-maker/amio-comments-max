'use strict';

const RUNTIME = 'PR199-BUTTONS-MAIN-MENU-ROUTE-GUARD';
const SOURCE = 'adminkit-pr199-buttons-main-menu-route-guard';
let installed = false;
let installState = { ok: false, runtime: RUNTIME, source: SOURCE, installed: false };

function clean(value) { return String(value || '').trim(); }

function install() {
  if (installed) return installState;
  installed = true;
  try {
    const buttons = require('./buttons-flow-cc8-clean');
    const original = buttons.isCleanButtonAction;
    if (typeof original === 'function' && !buttons.__adminkitPr199MainMenuRouteGuard) {
      buttons.isCleanButtonAction = function isCleanButtonActionPr199MainMenuGuard(action = '') {
        if (clean(action) === 'admin_section_main') return false;
        return original.apply(this, arguments);
      };
      buttons.__adminkitPr199MainMenuRouteGuard = true;
    }
    installState = { ok: true, runtime: RUNTIME, source: SOURCE, installed: true, mainMenuUsesPublicRoute: true };
  } catch (error) {
    installState = { ok: false, runtime: RUNTIME, source: SOURCE, installed: false, error: clean(error && error.message || error).slice(0, 240) };
  }
  try { console.log('[pr199-buttons-main-menu-route-guard]', JSON.stringify(installState)); } catch {}
  return installState;
}

module.exports = { RUNTIME, SOURCE, install, info: () => installState };
