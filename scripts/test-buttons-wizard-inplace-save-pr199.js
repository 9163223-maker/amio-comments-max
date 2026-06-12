'use strict';
const assert = require('assert');
const maxPath = require.resolve('../services/maxApi');
const storePath = require.resolve('../store');
const buttonsPath = require.resolve('../buttons-flow-cc8-clean');
const bootstrapPath = require.resolve('../pr199-buttons-wizard-inplace-save-bootstrap');
[maxPath, storePath, buttonsPath, bootstrapPath].forEach((p) => { delete require.cache[p]; });

const USER_ID = 'pr199-user';
const TARGET = { channelId: 'pr199-channel', postId: 'pr199-post', commentKey: 'pr199-comment' };
const READY_FLOW = { mode: 'button_wizard', stepIndex: 2, targetPost: TARGET, draft: { id: 'btn_pr199', text: 'Press', url: 'https://olga.style' } };
const STEP_TEXT = '\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u043a\u043d\u043e\u043f\u043a\u0438\n\u0428\u0430\u0433 2/3';
const SAVE_OK_TEXT = '\u041a\u043d\u043e\u043f\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0430. \u041f\u043e\u0441\u0442 \u043e\u0431\u043d\u043e\u0432\u043b\u0451\u043d.';
let state = { activeAdminFlowKind: 'button', buttonsActiveScreenMessageId: 'old-step-message', buttonFlow: READY_FLOW };
const editCalls = [];
const sendCalls = [];
const patches = [];

require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: {
  getSetupState: (uid) => { assert.strictEqual(uid, USER_ID); return state; },
  setSetupState: (uid, patch) => { assert.strictEqual(uid, USER_ID); patches.push(patch); state = { ...state, ...patch }; },
  store: { growth: { byChannel: {} } },
  saveStore: () => {},
  savePost: () => {}
} };
require.cache[maxPath] = { id: maxPath, filename: maxPath, loaded: true, exports: {
  editMessage: async (args) => { editCalls.push(args); return { message: { id: args.messageId, body: { mid: args.messageId } } }; },
  sendMessage: async (args) => { sendCalls.push(args); return { message: { id: 'new-message', body: { mid: 'new-message' } } }; }
} };
require.cache[buttonsPath] = { id: buttonsPath, filename: buttonsPath, loaded: true, exports: {
  handleTextInput: async () => ({ id: 'buttons_clean_add_preview', text: 'preview', attachments: [] }),
  screenForPayload: async (menu, payload = {}) => {
    if (payload.action === 'button_admin_cancel') {
      require('../store').setSetupState(USER_ID, { buttonFlow: null, activeAdminFlowKind: '' });
      return { id: 'buttons_clean_home', text: 'cancelled', attachments: [] };
    }
    if (payload.action === 'button_admin_save') {
      const current = require('../store').getSetupState(USER_ID);
      return current.buttonFlow ? { id: 'buttons_clean_home', text: SAVE_OK_TEXT, attachments: [] } : { id: 'buttons_clean_home', text: 'need_preview', attachments: [] };
    }
    return { id: 'buttons_clean_home', text: 'ok', attachments: [] };
  }
} };

const max = require('../services/maxApi');
const buttons = require('../buttons-flow-cc8-clean');
const bootstrap = require('../pr199-buttons-wizard-inplace-save-bootstrap');
assert.strictEqual(bootstrap.info().installed, false);
assert.strictEqual(bootstrap.install().ok, true);
assert.strictEqual(bootstrap.info().installOrder, 'after-persistent-store-bootstrap');
assert.strictEqual(bootstrap.info().buttonsCancelClearsPendingPreview, true);

(async () => {
  await max.sendMessage({ botToken: 'token', userId: USER_ID, text: STEP_TEXT, attachments: [] });
  assert.strictEqual(editCalls.length, 1);
  assert.strictEqual(sendCalls.length, 0);
  await buttons.handleTextInput({}, { userId: USER_ID, text: 'https://olga.style' });
  assert(state.buttonsPendingPreview);
  state = { ...state, activeAdminFlowKind: '', buttonFlow: null };
  const beforeRestore = patches.filter((p) => p.buttonsPendingPreviewRestoredRuntime === bootstrap.RUNTIME).length;
  assert.strictEqual((await buttons.screenForPayload({}, { action: 'button_admin_save' }, { userId: USER_ID })).text, SAVE_OK_TEXT);
  assert(patches.filter((p) => p.buttonsPendingPreviewRestoredRuntime === bootstrap.RUNTIME).length > beforeRestore);
  assert.strictEqual(state.buttonsPendingPreview, null);
  state = { activeAdminFlowKind: 'button', buttonsActiveScreenMessageId: 'old-step-message', buttonFlow: READY_FLOW };
  await buttons.handleTextInput({}, { userId: USER_ID, text: 'https://olga.style' });
  assert(state.buttonsPendingPreview);
  assert.strictEqual((await buttons.screenForPayload({}, { action: 'button_admin_cancel' }, { userId: USER_ID })).text, 'cancelled');
  assert.strictEqual(state.buttonsPendingPreview, null);
  const restoresAfterCancel = patches.filter((p) => p.buttonsPendingPreviewRestoredRuntime === bootstrap.RUNTIME).length;
  assert.strictEqual((await buttons.screenForPayload({}, { action: 'button_admin_save' }, { userId: USER_ID })).text, 'need_preview');
  assert.strictEqual(patches.filter((p) => p.buttonsPendingPreviewRestoredRuntime === bootstrap.RUNTIME).length, restoresAfterCancel);
  console.log('PR199 buttons wizard assertions passed');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
