'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';
process.env.ADMINKIT_DISABLE_AUTOSTART = '1';

(async () => {
  const service = require('../services/buttonsWizardPhysicalRouteProbeService');
  const syncProbe = service.runProbeSync();
  assert.strictEqual(syncProbe.ok, false, 'runProbeSync never publishes hardcoded ok:true readiness');
  assert(syncProbe.pending || syncProbe.diagnostics.includes('pending_real_production_route_probe'), 'runProbeSync reports pending real probe');

  const owner = require('../buttons-wizard-screen-owner-pr206');
  const missingState = { buttonsActiveScreenMessageId: 'legacy-active-msg', buttonActiveScreenMessageId: 'legacy-active-msg' };
  const missingPatches = [];
  const missingEdits = [];
  const missingStore = {
    getSetupState() { return missingState; },
    setSetupState(userId, patch) { missingPatches.push({ userId, patch }); Object.assign(missingState, patch); }
  };
  const missingMax = { async editMessage(args) { missingEdits.push(args); return { message: { id: args.messageId } }; } };
  const missingResult = await owner.updateButtonsWizardScreen({
    storeApi: missingStore,
    maxApi: missingMax,
    config: { botToken: 'token' },
    userId: 'missing-owner-user',
    screen: { id: 'buttons_clean_add_url', text: '➕ Добавление кнопки\n\nШаг 2/3. Пришлите ссылку для кнопки.', attachments: [] }
  });
  assert.strictEqual(missingResult.ok, false, 'missing canonical owner returns diagnostic screen');
  assert.strictEqual(missingResult.diagnostic, 'missing_buttons_wizard_screen_message_id');
  assert.strictEqual(missingEdits.length, 0, 'missing canonical owner does not edit legacy active-screen id');
  assert(missingPatches.some((entry) => entry.patch.buttonsWizardInplaceRequiredButMissing === true), 'missing canonical owner diagnostic is recorded');

  const probe = await service.runProbe();
  assert.strictEqual(probe.ok, true, `production route probe succeeds: ${(probe.diagnostics || []).join(',')}`);
  assert.strictEqual(probe.source, 'adminkit-buttons-wizard-production-route-probe', 'readiness uses production route probe, not owner helper-only probe');
  assert.strictEqual(probe.step1Transport, 'editMessage', 'Step 1 uses editMessage');
  assert.strictEqual(probe.step2Transport, 'editMessage', 'Step 2 uses editMessage');
  assert.strictEqual(probe.step3Transport, 'editMessage', 'Step 3 uses editMessage');
  assert.strictEqual(probe.sameMessageAcrossSteps, true, 'all wizard steps use the same message id');
  assert.strictEqual(probe.wizardSendMessageCount, 0, 'wizard sends no duplicate messages');
  assert.strictEqual(probe.cleanupTouchedWizardMessage, false, 'cleanup does not touch wizard host message');
  assert.strictEqual(probe.callbackUserId, probe.textSenderUserId, 'callback and text sender resolve to same canonical owner');
  assert.strictEqual(probe.canonicalOwnerUserId, probe.callbackUserId, 'canonical owner remains callback/text user');

  console.log('test-buttons-wizard-physical-route-pr206 ok');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
