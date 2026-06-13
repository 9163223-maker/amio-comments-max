'use strict';

const assert = require('assert');

const target = require('../clean-bot-channel-first-post-picker-pr90');
const helpers = target._private;

function assertEmptyLinkPreview(value, label) {
  assert.doesNotThrow(() => helpers.linkPreviewInfo(value), `${label} must not throw`);
  assert.deepStrictEqual(helpers.linkPreviewInfo(value), { text: '', path: '', candidateCount: 0 }, `${label} returns empty link preview info`);
}

assertEmptyLinkPreview(null, 'linkPreviewInfo(null)');
assertEmptyLinkPreview(undefined, 'linkPreviewInfo(undefined)');
assertEmptyLinkPreview('text', 'linkPreviewInfo(string)');
assertEmptyLinkPreview(123, 'linkPreviewInfo(number)');
assertEmptyLinkPreview({ body: null }, 'linkPreviewInfo({ body: null })');
assertEmptyLinkPreview({ body: { message: null } }, 'linkPreviewInfo({ body: { message: null } })');
assertEmptyLinkPreview({ message: null }, 'linkPreviewInfo({ message: null })');

for (const value of [null, undefined, 'text', 123]) {
  assert.doesNotThrow(() => helpers.messageShapeForTrace(value));
  assert.doesNotThrow(() => helpers.messageId(value));
  assert.doesNotThrow(() => helpers.chatId(value));
  assert.doesNotThrow(() => helpers.chatType(value));
  assert.doesNotThrow(() => helpers.isChannelMessage(value));
  assert.doesNotThrow(() => helpers.text(value));
  assert.doesNotThrow(() => helpers.body(value));
  assert.doesNotThrow(() => helpers.payloadValue(value));
  assert.doesNotThrow(() => helpers.parsePayload(value));
}

(async () => {
  let responseStatus = 0;
  let responseBody = null;
  let legacyCalled = false;
  const res = {
    headersSent: false,
    status(code) { responseStatus = code; return this; },
    json(payload) { responseBody = payload; this.headersSent = true; return payload; }
  };
  const bot = target.createCleanBot({
    handleWebhook: async (req, legacyRes) => {
      legacyCalled = true;
      return legacyRes.status(200).json({ ok: true, handledBy: 'legacy-null-message-safe' });
    }
  });

  await assert.doesNotReject(() => bot.handleWebhook({ body: {
    update_type: 'message_created',
    message: null,
    data: { message: { body: { message: null, link: null, preview: null, attachments: [null] } } }
  } }, res, { botToken: 'token' }));

  assert.strictEqual(responseStatus, 200, 'null-message webhook returns safe HTTP 200');
  assert(responseBody && responseBody.ok, 'null-message webhook resolves with ok response');
  assert.strictEqual(legacyCalled, true, 'null-message webhook safely delegates instead of parsing null link preview');

  let safeErrorStatus = 0;
  let safeErrorBody = null;
  const throwingRes = {
    headersSent: false,
    status(code) { safeErrorStatus = code; return this; },
    json(payload) { safeErrorBody = payload; this.headersSent = true; return payload; }
  };
  const throwingBot = target.createCleanBot({ handleWebhook: async () => { throw new Error('legacy malformed webhook failure'); } });

  await assert.doesNotReject(() => throwingBot.handleWebhook(null, throwingRes, { botToken: 'token' }));
  assert.strictEqual(safeErrorStatus, 200, 'top-level safety converts malformed webhook failure to safe HTTP 200');
  assert.strictEqual(safeErrorBody.action, 'channel_first_safe_error', 'top-level safety records safe diagnostic action');

  console.log('PR211 channel-first null-message regression assertions passed');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
