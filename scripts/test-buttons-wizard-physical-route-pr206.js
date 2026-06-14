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
  assert.strictEqual(missingResult.ok, false, 'missing chat/user send target returns diagnostic screen');
  assert.strictEqual(missingResult.diagnostic, 'buttons_wizard_send_failed');

  const probe = await service.runProbe();
  assert.strictEqual(probe.ok, true, `production route probe succeeds: ${(probe.diagnostics || []).join(',')}`);
  assert.strictEqual(probe.source, 'adminkit-buttons-wizard-production-webhook-route-probe', 'readiness uses production route probe, not owner helper-only probe');
  assert.deepStrictEqual(probe.routeModules, ['clean-bot-channel-first-post-picker-pr90.js', 'clean-bot-flow-guard-1546.js'], 'probe runs through the production-relevant route modules');
  assert.strictEqual(probe.step1Transport, 'editMessage', 'Step 1 uses editMessage');
  assert.strictEqual(probe.step2Transport, 'sendMessage', 'Step 2 uses fresh sendMessage');
  assert.strictEqual(probe.step3Transport, 'sendMessage', 'Step 3 uses fresh sendMessage');
  assert.strictEqual(probe.sameMessageAcrossSteps, false, 'wizard steps move to fresh current messages');
  assert(probe.wizardSendMessageCount >= 6, 'wizard sends fresh current messages');
  assert.strictEqual(probe.cleanupTouchedWizardMessage, true, 'cleanup closes previous wizard messages');
  assert.strictEqual(probe.urlPlainTextProbeOk, true, 'plain text URL advances to Step 3');
  assert.strictEqual(probe.urlLinkPreviewProbeOk, true, 'MAX link-preview URL advances to Step 3');
  assert.strictEqual(probe.uppercaseUrlProbeOk, true, 'uppercase HTTP:// URL is accepted and normalized');
  assert.strictEqual(probe.step3FromLinkPreviewTransport, 'sendMessage', 'link-preview Step 3 uses fresh sendMessage');
  assert(Array.isArray(probe.linkPreviewVariantsTested) && probe.linkPreviewVariantsTested.includes('attachments[].payload.url'), 'probe explicitly covers link-preview metadata variants');
  assert.strictEqual(probe.variants.linkPreviewMetadataOnly.step3AfterUrl, true, 'metadata-only link preview advances after URL input');
  assert(probe.variants.linkPreviewMetadataOnly.sends >= 2, 'metadata-only link preview sends fresh wizard messages');
  assert(probe.variants.plain.requiredClosedWizardMessageIds.every((id) => probe.variants.plain.closedOrDeletedWizardMessageIds.includes(id)), 'plain variant closes or deletes every previous wizard message id');
  assert(probe.variants.plain.requiredClosedWizardMessageIds.includes('wizard-host-msg'), 'Step 1 host message is required to be closed before Step 2 fresh screen');
  assert(probe.variants.plain.requiredClosedWizardMessageIds.some((id) => /^sent-/.test(id)), 'Step 2 fresh message is required to be closed before Step 3 fresh screen');
  assert.strictEqual(probe.variants.plain.allRequiredWizardMessagesClosed, true, 'probe fails if any previous wizard message remains active');
  const partialCleanupIds = probe.variants.plain.requiredClosedWizardMessageIds.slice(0, 1);
  assert.strictEqual(probe.variants.plain.requiredClosedWizardMessageIds.every((id) => partialCleanupIds.includes(id)), false, 'partial cleanup/deletion cannot satisfy readiness');
  assert.strictEqual(probe.variants.plain.savePreviewClosedAfterSendOk, true, 'valid save sends fresh result before closing original Step 3 preview');
  assert.strictEqual(probe.variants.saveSendFailureFallback.ok, true, 'valid save fresh result failure falls back to editing preview with result/navigation');
  assert.strictEqual(probe.variants.plain.repeatStaleNoFreshMessageOk, true, 'repeated stale save edits original preview instead of sending duplicate stale messages');
  assert.strictEqual(probe.variants.plain.repeatStaleNewSends, 0, 'repeated stale save creates no fresh duplicate stale result');
  assert.strictEqual(probe.traceRedactedOk, true, 'URL timing trace redacts sensitive path/query/token/signature data');
  assert.strictEqual(probe.postEditLinkPreviewRawTextOk, true, 'post edit flow receives raw empty text instead of link-preview URL fallback');
  assert.strictEqual(probe.mediaAttachmentIgnoredOk, true, 'photo/file attachment payload URLs are not accepted as button URLs');
  assert.strictEqual(probe.variants.mediaAttachment.step3Ok, false, 'media attachment payload URL does not advance to Step 3');
  assert.strictEqual(probe.variants.mediaAttachment.normalizedUrl, '', 'media attachment payload URL is not saved to the button draft');
  assert(probe.variants.mediaAttachment.sends >= 1, 'media attachment URL path keeps current fresh wizard screen');
  assert.strictEqual(probe.linkPreviewTraceOk, true, 'metadata-only channel-first link preview emits required URL trace markers');
  for (const marker of ['buttons_url_input_seen', 'buttons_url_input_extracted', 'buttons_url_input_screen', 'buttons_url_input_edit_result']) {
    assert(probe.variants.linkPreviewMetadataOnly.traceNames.includes(marker), `metadata-only channel-first trace contains ${marker}`);
  }
  assert.strictEqual(probe.callbackUserId, probe.textSenderUserId, 'callback and text sender resolve to same canonical owner');
  assert.strictEqual(probe.canonicalOwnerUserId, probe.callbackUserId, 'canonical owner remains callback/text user');

  console.log('test-buttons-wizard-physical-route-pr206 ok');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
