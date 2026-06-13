'use strict';
const assert = require('assert');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function hasProbeState(snapshot) {
  const text = JSON.stringify(snapshot || {});
  return /real-user-1|chat-1|channel-olga|post-1|card-pr206|test-admin/.test(text);
}
function sentinelStore() {
  return {
    posts: {
      'prod-channel:prod-post': {
        commentKey: 'prod-channel:prod-post',
        channelId: 'prod-channel',
        postId: 'prod-post',
        messageId: 'prod-message',
        originalText: 'production sentinel post'
      }
    },
    comments: { 'prod-channel:prod-post': [] },
    channels: { 'prod-channel': { id: 'prod-channel', title: 'Production Sentinel Channel' } },
    setupState: { 'prod-user': { sentinel: true, marker: 'production-sentinel-setup' } },
    likes: { 'prod-channel:prod-post': {} },
    reactions: { 'prod-channel:prod-post': {} },
    handoffs: {},
    uploadDiagnostics: [],
    moderation: { byChannel: {}, logs: [] },
    growth: { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} },
    gifts: { campaigns: {}, claims: {}, settings: { uploadLimits: { enabled: true, maxFiles: 1, maxBytes: 52428800, allowedTypes: ['file', 'image', 'video', 'audio'], allowedExtensions: [] } } },
    clientAccess: { clients: {}, tenants: {}, tenantUsers: {}, tenantChannels: {}, activationCodes: {}, accessEvents: [], channelsByUser: {}, pendingActivation: {} }
  };
}
function assertSentinelRestored(store, persistedPayloads = []) {
  assert.strictEqual(store.store.posts['prod-channel:prod-post']?.originalText, 'production sentinel post', 'exported store retains production sentinel');
  assert.strictEqual(store.getPost('prod-channel:prod-post')?.originalText, 'production sentinel post', 'store helpers read restored internal sentinel');
  assert.strictEqual(store.getPost('channel-olga:post-1'), null, 'fake probe post is not visible through helpers');
  assert.strictEqual(store.store.setupState['prod-user']?.marker, 'production-sentinel-setup', 'production setup state restored');
  assert.strictEqual(store.store.setupState['real-user-1'], undefined, 'fake probe setup state removed');
  assert(!hasProbeState(store.store), 'fake activation/channel/post state is not left in store');
  for (const payload of persistedPayloads) {
    assert(!hasProbeState(payload), 'saveStore did not persist probe-mutated state during cleanup');
    assert.strictEqual(payload.posts?.['prod-channel:prod-post']?.originalText, 'production sentinel post', 'persisted cleanup payload contains sentinel');
  }
}

(async () => {
  const store = require('../store');
  const max = require('../services/maxApi');
  const postsFlow = require('../posts-flow-cc8-clean-wrapper');
  const probe = require('../services/buttonsWizardPhysicalRouteProductionProbe');

  const processOriginalEnv = {
    ADMINKIT_TEST_MODE: process.env.ADMINKIT_TEST_MODE,
    ADMINKIT_DISABLE_AUTOSTART: process.env.ADMINKIT_DISABLE_AUTOSTART
  };
  const originalDiskStore = clone(store.store);
  const originalSaveStore = store.saveStore;
  const originals = {
    editMessage: max.editMessage,
    sendMessage: max.sendMessage,
    deleteMessage: max.deleteMessage,
    answerCallback: max.answerCallback,
    getChat: max.getChat,
    postsHandleTextInput: postsFlow.handleTextInput
  };

  try {
    process.env.ADMINKIT_TEST_MODE = 'live-mode';
    delete process.env.ADMINKIT_DISABLE_AUTOSTART;
    originalSaveStore(sentinelStore());

    const persistedAfterFailure = [];
    let saveCalls = 0;
    store.saveStore = (nextStore) => {
      saveCalls += 1;
      if (saveCalls === 1) throw new Error('forced save failure');
      persistedAfterFailure.push(clone(nextStore || store.store));
      return originalSaveStore(nextStore);
    };

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
    assert.strictEqual(max.editMessage, originals.editMessage, 'max.editMessage restored after failure');
    assert.strictEqual(max.sendMessage, originals.sendMessage, 'max.sendMessage restored after failure');
    assert.strictEqual(max.deleteMessage, originals.deleteMessage, 'max.deleteMessage restored after failure');
    assert.strictEqual(max.answerCallback, originals.answerCallback, 'max.answerCallback restored after failure');
    assert.strictEqual(max.getChat, originals.getChat, 'max.getChat restored after failure');
    assert.strictEqual(postsFlow.handleTextInput, originals.postsHandleTextInput, 'postsFlow.handleTextInput restored after failure');
    assertSentinelRestored(store, persistedAfterFailure);

    originalSaveStore(sentinelStore());
    const success = await probe.runProductionRouteProbe();
    assert.strictEqual(success.ok, true, `explicit probe succeeds: ${(success.diagnostics || []).join(',')}`);
    assert.strictEqual(process.env.ADMINKIT_TEST_MODE, 'live-mode', 'ADMINKIT_TEST_MODE restored after success');
    assert.strictEqual(process.env.ADMINKIT_DISABLE_AUTOSTART, undefined, 'ADMINKIT_DISABLE_AUTOSTART restored after success');
    assertSentinelRestored(store);
  } finally {
    store.saveStore = originalSaveStore;
    originalSaveStore(originalDiskStore);
    for (const [key, value] of Object.entries(processOriginalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    Object.assign(max, { editMessage: originals.editMessage, sendMessage: originals.sendMessage, deleteMessage: originals.deleteMessage, answerCallback: originals.answerCallback, getChat: originals.getChat });
    postsFlow.handleTextInput = originals.postsHandleTextInput;
  }

  console.log('production probe restore-on-failure and success assertions passed');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
