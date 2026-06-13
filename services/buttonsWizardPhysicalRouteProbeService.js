'use strict';

const owner = require('../buttons-wizard-screen-owner-pr206');
const productionProbe = require('./buttonsWizardPhysicalRouteProductionProbe');

let latest = { ok: false, pending: true, diagnostics: ['not_run'] };

function pendingProbe(reason = 'pending_real_production_route_probe') {
  return {
    ok: false,
    pending: true,
    runtime: owner.RUNTIME,
    source: 'adminkit-buttons-wizard-physical-route-probe',
    step1Transport: '',
    step2Transport: '',
    step3Transport: '',
    sameMessageAcrossSteps: false,
    wizardSendMessageCount: 0,
    cleanupTouchedWizardMessage: false,
    urlPlainTextProbeOk: false,
    urlLinkPreviewProbeOk: false,
    uppercaseUrlProbeOk: false,
    step3FromLinkPreviewTransport: '',
    diagnostics: [reason]
  };
}
function runProbeSync(reason) {
  latest = pendingProbe(reason);
  return latest;
}
function startupProbeEnabled() { return process.env.ADMINKIT_RUN_STARTUP_PRODUCTION_PROBE === '1'; }
async function runStartupProbe() {
  if (!startupProbeEnabled()) return runProbeSync('startup_production_probe_disabled');
  return runProbe();
}
async function runProbe() {
  try {
    latest = await productionProbe.runProductionRouteProbe();
    return latest;
  } catch (error) {
    latest = {
      ok: false,
      runtime: owner.RUNTIME,
      source: 'adminkit-buttons-wizard-physical-route-probe',
      step1Transport: '',
      step2Transport: '',
      step3Transport: '',
      sameMessageAcrossSteps: false,
      wizardSendMessageCount: -1,
      cleanupTouchedWizardMessage: false,
      urlPlainTextProbeOk: false,
      urlLinkPreviewProbeOk: false,
      uppercaseUrlProbeOk: false,
      step3FromLinkPreviewTransport: '',
      diagnostics: [String(error && error.message || error).slice(0, 180)]
    };
    return latest;
  }
}
function getLatestProbe() { return latest; }
function setLatestProbeForTests(probe) { latest = probe || latest; return latest; }

module.exports = { runProbe, runStartupProbe, runProbeSync, startupProbeEnabled, getLatestProbe, setLatestProbeForTests, pendingProbe };
