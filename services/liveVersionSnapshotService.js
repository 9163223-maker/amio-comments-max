'use strict';

function clean(value) { return String(value || '').trim(); }
function bool(value) { return value === true; }
function safeInfo(path) {
  try {
    const mod = require(path);
    return mod && typeof mod.info === 'function' ? (mod.info() || {}) : {};
  } catch (error) {
    return { ok: false, error: clean(error && error.message || error).slice(0, 160) };
  }
}

function summarize(snapshot = {}) {
  const wizard = snapshot.pr199ButtonsWizard || {};
  const guard = snapshot.pr199ButtonsMainMenuRouteGuard || {};
  const gates = {
    pr199ButtonsWizardOk: bool(wizard.ok),
    pr199ButtonsMainMenuRouteGuardOk: bool(guard.ok),
    chatIdWizardEditForwardsBotToken: bool(guard.chatIdWizardEditForwardsBotToken),
    chatIdWizardEditFallsBackToSend: bool(guard.chatIdWizardEditFallsBackToSend),
    buttonsDuplicateSaveGuarded: bool(wizard.buttonsDuplicateSaveGuarded),
    buttonsPendingPreviewConsumedBeforeSave: bool(wizard.buttonsPendingPreviewConsumedBeforeSave),
    installOrderAfterPersistentStoreBootstrap: clean(wizard.installOrder) === 'after-persistent-store-bootstrap'
  };
  return {
    ok: snapshot.ok === true,
    pr199Ready: Object.values(gates).every(Boolean),
    ...gates
  };
}

function buildLiveVersionSnapshot() {
  try {
    const wizard = safeInfo('../pr199-buttons-wizard-inplace-save-bootstrap');
    const guard = safeInfo('../pr199-buttons-main-menu-route-guard');
    const snapshot = {
      ok: true,
      safe: true,
      generatedAt: new Date().toISOString(),
      pr199ButtonsWizard: {
        ok: bool(wizard.ok),
        installed: bool(wizard.installed),
        installOrder: clean(wizard.installOrder),
        buttonsDuplicateSaveGuarded: bool(wizard.buttonsDuplicateSaveGuarded),
        buttonsPendingPreviewConsumedBeforeSave: bool(wizard.buttonsPendingPreviewConsumedBeforeSave)
      },
      pr199ButtonsMainMenuRouteGuard: {
        ok: bool(guard.ok),
        installed: bool(guard.installed),
        chatIdWizardEditForwardsBotToken: bool(guard.chatIdWizardEditForwardsBotToken),
        chatIdWizardEditFallsBackToSend: bool(guard.chatIdWizardEditFallsBackToSend)
      }
    };
    snapshot.liveVersionSummary = summarize(snapshot);
    return snapshot;
  } catch (error) {
    return {
      ok: false,
      safe: true,
      generatedAt: new Date().toISOString(),
      error: clean(error && error.message || error).slice(0, 160),
      liveVersionSummary: { ok: false, pr199Ready: false }
    };
  }
}

module.exports = { buildLiveVersionSnapshot, summarize };
