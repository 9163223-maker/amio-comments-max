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
    diagnostics: [reason]
  };
}
function runProbeSync() {
  latest = pendingProbe();
  return latest;
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
      diagnostics: [String(error && error.message || error).slice(0, 180)]
    };
    return latest;
  }
}
function getLatestProbe() { return latest; }
function setLatestProbeForTests(probe) { latest = probe || latest; return latest; }

module.exports = { runProbe, runProbeSync, getLatestProbe, setLatestProbeForTests, pendingProbe };
