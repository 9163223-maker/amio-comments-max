'use strict';
const assert = require('assert');

(async () => {
  const store = require('../store');
  const max = require('../services/maxApi');
  const postsFlow = require('../posts-flow-cc8-clean-wrapper');
  const probe = require('../services/buttonsWizardPhysicalRouteProductionProbe');

  process.env.ADMINKIT_TEST_MODE = 'live-mode';
  delete process.env.ADMINKIT_DISABLE_AUTOSTART;
  const originalStore = JSON.parse(JSON.stringify(store.store));
  const originalSaveStore = store.saveStore;
  const originals = {
    editMessage: max.editMessage,
    sendMessage: max.sendMessage,
    deleteMessage: max.deleteMessage,
    answerCallback: max.answerCallback,
    getChat: max.getChat,
    postsHandleTextInput: postsFlow.handleTextInput
  };

  store.saveStore = () => { throw new Error('forced save failure'); };
  let failed = false;
  try {
    await probe.runProductionRouteProbe();
  } catch (error) {
    failed = /forced save failure/.test(String(error && error.message || error));
  }
  store.saveStore = originalSaveStore;

  assert.strictEqual(failed, true, 'probe test injected a failure');
  assert.strictEqual(process.env.ADMINKIT_TEST_MODE, 'live-mode', 'ADMINKIT_TEST_MODE restored after failure');
  assert.strictEqual(process.env.ADMINKIT_DISABLE_AUTOSTART, undefined, 'ADMINKIT_DISABLE_AUTOSTART restored after failure');
  assert.deepStrictEqual(store.store, originalStore, 'store state restored after failure');
  assert.strictEqual(max.editMessage, originals.editMessage, 'max.editMessage restored after failure');
  assert.strictEqual(max.sendMessage, originals.sendMessage, 'max.sendMessage restored after failure');
  assert.strictEqual(max.deleteMessage, originals.deleteMessage, 'max.deleteMessage restored after failure');
  assert.strictEqual(max.answerCallback, originals.answerCallback, 'max.answerCallback restored after failure');
  assert.strictEqual(max.getChat, originals.getChat, 'max.getChat restored after failure');
  assert.strictEqual(postsFlow.handleTextInput, originals.postsHandleTextInput, 'postsFlow.handleTextInput restored after failure');
  delete process.env.ADMINKIT_TEST_MODE;

  console.log('production probe restore-on-failure assertions passed');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
