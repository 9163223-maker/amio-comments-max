'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';
process.env.ADMINKIT_DISABLE_AUTOSTART = '1';

function clear(paths) { paths.forEach((p) => { delete require.cache[p]; }); }
function textOf(screen) { return String(screen && screen.text || ''); }

async function harness(name = 'ok', patchResult = { ok: true }) {
  const paths = ['../store','../services/postPatcher','../services/clientAccessService','../cc5-db-core','../services/maxApi','../buttons-flow-cc8-clean'].map(require.resolve);
  clear(paths);
  const userId = `pr215-save-${name}`;
  const channelId = `pr215-channel-${name}`;
  const commentKey = `pr215-comment-${name}`;
  const state = {};
  const posts = { [commentKey]: { tenantKey: `tenant_${userId}`, ownerUserId: userId, channelId, channelTitle: 'PR215', postId: `post-${name}`, messageId: `msg-${name}`, commentKey, originalText: 'post' } };
  const patchCalls = [];
  const store = { store: { setupState: state, posts, growth: { byChannel: {} }, channels: {} }, getSetupState: (u) => state[u] || null, setSetupState: (u,p) => (state[u] = { ...(state[u] || {}), ...(p || {}) }), savePost: (k,p) => (posts[k] = { ...(posts[k] || {}), ...(p || {}) }), getPost: (k) => posts[k] || null, saveStore() {}, saveChannel() {} };
  require.cache[require.resolve('../store')] = { loaded: true, exports: store };
  require.cache[require.resolve('../services/postPatcher')] = { loaded: true, exports: { patchStoredPost: async (opts) => { patchCalls.push(opts); return patchResult; } } };
  require.cache[require.resolve('../services/clientAccessService')] = { loaded: true, exports: { getClientChannels: () => [{ channelId, title: 'PR215' }] } };
  require.cache[require.resolve('../cc5-db-core')] = { loaded: true, exports: { getPosts: async () => [] } };
  require.cache[require.resolve('../services/maxApi')] = { loaded: true, exports: { getChat: async () => ({ title: 'PR215' }) } };
  const buttons = require('../buttons-flow-cc8-clean');
  const menu = { button: (text, action, extra = {}) => ({ text, payload: { action, ...extra } }), keyboard: (rows) => rows };
  const ctx = { userId, config: {} };
  await buttons.screenForPayload(menu, { action: 'button_admin_select_post', commentKey, channelId, postId: `post-${name}` }, ctx);
  await buttons.screenForPayload(menu, { action: 'button_admin_start_add', cardId: state[userId].buttonsCurrentCard.cardId }, ctx);
  await buttons.handleTextInput(menu, { ...ctx, text: 'Кнопка 215' });
  const preview = await buttons.handleTextInput(menu, { ...ctx, text: 'Http://sports.ru' });
  return { buttons, menu, ctx, state, userId, commentKey, channelId, patchCalls, flowId: preview.attachments[0][0].payload.flowId };
}

(async () => {
  const ok = await harness('ok');
  const saved = await ok.buttons.screenForPayload(ok.menu, { action: 'button_admin_save', flowId: ok.flowId }, ok.ctx);
  const trace = ok.state[ok.userId].buttonSaveRouteTrace.map((x) => x.step);
  assert(trace.includes('screenForPayload'), 'save routes through screenForPayload');
  assert(trace.includes('confirmSave'), 'confirmSave is entered');
  assert(trace.includes('saveDraft'), 'saveDraft is entered for matching flowId');
  assert(/Кнопка сохранена/.test(textOf(saved)), 'matching flowId returns visible save result');
  assert.strictEqual(ok.patchCalls.length, 1, 'matching flowId patches exactly once');

  const missing = await harness('missing');
  const targetBefore = missing.state[missing.userId].buttonTargetPost.commentKey;
  const staleMissing = await missing.buttons.screenForPayload(missing.menu, { action: 'button_admin_save' }, missing.ctx);
  assert(/предпросмотр устарел/i.test(textOf(staleMissing)), 'missing flowId returns visible stale screen');
  assert.strictEqual(missing.state[missing.userId].buttonTargetPost.commentKey, targetBefore, 'missing flowId preserves selected target');

  const mismatch = await harness('mismatch');
  const targetBeforeMismatch = mismatch.state[mismatch.userId].buttonTargetPost.commentKey;
  const staleMismatch = await mismatch.buttons.screenForPayload(mismatch.menu, { action: 'button_admin_save', flowId: `${mismatch.flowId}-old` }, mismatch.ctx);
  assert(/предпросмотр устарел/i.test(textOf(staleMismatch)), 'mismatched flowId returns visible stale screen');
  assert.strictEqual(mismatch.state[mismatch.userId].buttonTargetPost.commentKey, targetBeforeMismatch, 'mismatched flowId preserves selected target');

  const failed = await harness('failed', { ok: false, reason: 'exact_patch_reason_pr215' });
  const failedScreen = await failed.buttons.screenForPayload(failed.menu, { action: 'button_admin_save', flowId: failed.flowId }, failed.ctx);
  assert(/Кнопка сохранена, но пост не обновился: exact_patch_reason_pr215/.test(textOf(failedScreen)), 'patch failure exact reason is visible');

  console.log('test-buttons-save-callback-route-pr215 ok');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
