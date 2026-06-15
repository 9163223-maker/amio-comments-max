'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';
process.env.ADMINKIT_DISABLE_AUTOSTART = '1';

(async () => {
  const service = require('../services/buttonsWizardPhysicalRouteProbeService');
  const probe = await service.runProbe();
  assert.strictEqual(probe.ok, true, `production route probe failed: ${(probe.diagnostics || []).join(',')}`);
  assert.strictEqual(probe.source, 'adminkit-buttons-wizard-production-webhook-route-probe');

  const variants = probe.variants && probe.variants.realMax || {};
  for (const shape of ['body.text', 'body.link.url', 'body.preview.url', 'body.message.preview.url', 'body.attachments.payload.url', 'attachments.url']) {
    const variant = variants[shape];
    assert(variant, `variant exists: ${shape}`);
    assert.strictEqual(variant.step3Ok, true, `${shape} advances Step 2 -> Step 3`);
    assert.strictEqual(variant.payload.screenId, 'buttons_clean_add_preview', `${shape} returns preview screen id`);
    assert(/Предпросмотр кнопки/.test(variant.step3Text), `${shape} preview title is rendered`);
    assert(/Шаг 3\/3/.test(variant.step3Text), `${shape} Step 3 marker is rendered`);
    assert(/http:\/\/sports\.ru/.test(variant.step3Text), `${shape} URL is normalized and rendered`);
    assert(variant.sends >= 2, `${shape} sends fresh wizard messages`);
    for (const marker of ['buttons_url_input_seen', 'buttons_url_input_extracted', 'buttons_url_input_screen', 'buttons_url_input_edit_result']) {
      assert(variant.traceNames.includes(marker), `${shape} trace contains ${marker}`);
    }
  }

  assert.strictEqual(probe.variants.plain.payload.screenId, 'buttons_clean_add_preview', 'plain text URL returns preview screen');
  assert.strictEqual(probe.variants.linkPreviewWithText.normalizedUrl, 'http://olga.style', 'uppercase HTTP:// scheme normalizes to lowercase');
  assert(probe.variants.plain.sends >= 2, 'plain text URL sends fresh wizard messages');
  assert.strictEqual(probe.step3FromLinkPreviewTransport, 'sendMessage', 'wizard screen is sent fresh');
  assert.strictEqual(probe.urlPlainTextProbeOk, true, 'plain text URL advances');
  assert.strictEqual(probe.urlLinkPreviewProbeOk, true, 'metadata-only link-preview advances');
  assert.strictEqual(probe.uppercaseUrlProbeOk, true, 'uppercase scheme is accepted and normalized');

  console.log('test-buttons-url-link-preview-real-max-pr213 ok');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
