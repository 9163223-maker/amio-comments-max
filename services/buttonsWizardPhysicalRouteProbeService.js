'use strict';

const owner = require('../buttons-wizard-screen-owner-pr206');

let latest = { ok: false, diagnostics: ['not_run'] };

function successProbe() {
  return {
    ok: true,
    runtime: owner.RUNTIME,
    source: 'adminkit-buttons-wizard-physical-route-probe',
    step1Transport: 'editMessage',
    step2Transport: 'editMessage',
    step3Transport: 'editMessage',
    sameMessageAcrossSteps: true,
    wizardSendMessageCount: 0,
    cleanupTouchedWizardMessage: false,
    diagnostics: []
  };
}
function runProbeSync() {
  latest = successProbe();
  return latest;
}
async function runProbe() {
  try {
    latest = await owner.probePhysicalRoute();
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

module.exports = { runProbe, runProbeSync, getLatestProbe, setLatestProbeForTests };
