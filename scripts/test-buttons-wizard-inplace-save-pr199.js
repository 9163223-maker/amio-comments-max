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
const STEP1_TEXT = '\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u043a\u043d\u043e\u043f\u043a\u0438\n\u0428\u0430\u0433 1/3';
const STEP2_TEXT = '\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u043a\u043d\u043e\u043f\u043a\u0438\n\u0428\u0430\u0433 2/3';
const PREVIEW_TEXT = '\u041f\u0440\u0435\u0434\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u043a\u043d\u043e\u043f\u043a\u0438\n\u0428\u0430\u0433 3/3';
const SAVE_OK_TEXT = '\u041a\u043d\u043e\u043f\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0430. \u041f\u043e\u0441\u0442 \u043e\u0431\u043d\u043e\u0432\u043b\u0451\u043d.';
let state = { activeAdminFlowKind: 'button', buttonFlow: READY_FLOW };
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
  isCleanButtonAction: (action = '') => ['button_admin_start_add', 'button_admin_save', 'button_admin_preview_back', 'button_admin_cancel'].includes(action),
  handleTextInput: async () => ({ id: 'buttons_clean_add_preview', text: PREVIEW_TEXT, attachments: [] }),
  screenForPayload: async (menu, payload = {}) => {
    if (payload.action === 'button_admin_start_add') return { id: 'buttons_clean_add_label', text: STEP1_TEXT, attachments: [] };
    if (payload.action === 'button_admin_preview_back') { require('../store').setSetupState(USER_ID, { buttonFlow: { ...READY_FLOW, stepIndex: 1, draft: { ...READY_FLOW.draft, url: '' } } }); return { id: 'buttons_clean_add_url', text: STEP2_TEXT, attachments: [] }; }
    if (payload.action === 'button_admin_cancel') { require('../store').setSetupState(USER_ID, { buttonFlow: null, activeAdminFlowKind: '' }); return { id: 'buttons_clean_home', text: 'cancelled', attachments: [] }; }
    if (payload.action === 'button_admin_save') { const current = require('../store').getSetupState(USER_ID); return current.buttonFlow && current.buttonFlow.stepIndex >= 2 && current.buttonFlow.draft.url ? { id: 'buttons_clean_home', text: SAVE_OK_TEXT, attachments: [] } : { id: 'buttons_clean_home', text: 'need_preview', attachments: [] }; }
    return null;
  }
} };

const max = require('../services/maxApi');
const buttons = require('../buttons-flow-cc8-clean');
const bootstrap = require('../pr199-buttons-wizard-inplace-save-bootstrap');
assert.strictEqual(bootstrap.info().installed, false);
assert.strictEqual(bootstrap.install().ok, true);
assert.strictEqual(bootstrap.info().buttonsRecordsActiveScreenOnEdit, true);
assert.strictEqual(bootstrap.info().buttonsPendingEditMessageScoped, true);
assert.strictEqual(buttons.isCleanButtonAction('admin_section_main'), true);

(async () => {
  const first = await buttons.screenForPayload({}, { action: 'button_admin_start_add' }, { userId: USER_ID, update: { callback: { message: { body: { mid: 'callback-message' } } } } });
  await max.editMessage({ botToken: 'token', messageId: 'other-message', text: first.text, attachments: first.attachments });
  assert.notStrictEqual(state.buttonsActiveScreenMessageId, 'other-message');
  await max.editMessage({ botToken: 'token', messageId: 'callback-message', text: first.text, attachments: first.attachments });
  assert.strictEqual(state.buttonsActiveScreenMessageId, 'callback-message');

  await max.sendMessage({ botToken: 'token', userId: USER_ID, text: STEP2_TEXT, attachments: [] });
  assert.strictEqual(editCalls.filter((c) => c.messageId === 'callback-message').length >= 2, true);
  assert.strictEqual(sendCalls.length, 0);

  await buttons.handleTextInput({}, { userId: USER_ID, text: 'https://olga.style' });
  assert(state.buttonsPendingPreview);
  state = { ...state, activeAdminFlowKind: '', buttonFlow: null };
  const beforeRestore = patches.filter((p) => p.buttonsPendingPreviewRestoredRuntime === bootstrap.RUNTIME).length;
  assert.strictEqual((await buttons.screenForPayload({}, { action: 'button_admin_save' }, { userId: USER_ID })).text, SAVE_OK_TEXT);
  assert(patches.filter((p) => p.buttonsPendingPreviewRestoredRuntime === bootstrap.RUNTIME).length > beforeRestore);
  assert.strictEqual(state.buttonsPendingPreview, null);

  state = { activeAdminFlowKind: 'button', buttonsActiveScreenMessageId: 'callback-message', buttonFlow: READY_FLOW };
  await buttons.handleTextInput({}, { userId: USER_ID, text: 'https://olga.style' });
  assert(state.buttonsPendingPreview);
  assert.strictEqual((await buttons.screenForPayload({}, { action: 'button_admin_preview_back' }, { userId: USER_ID })).text, STEP2_TEXT);
  assert.strictEqual(state.buttonsPendingPreview, null);
  const restoresAfterBack = patches.filter((p) => p.buttonsPendingPreviewRestoredRuntime === bootstrap.RUNTIME).length;
  assert.strictEqual((await buttons.screenForPayload({}, { action: 'button_admin_save' }, { userId: USER_ID })).text, 'need_preview');
  assert.strictEqual(patches.filter((p) => p.buttonsPendingPreviewRestoredRuntime === bootstrap.RUNTIME).length, restoresAfterBack);

  state = { activeAdminFlowKind: 'button', buttonsActiveScreenMessageId: 'callback-message', buttonFlow: READY_FLOW };
  await buttons.handleTextInput({}, { userId: USER_ID, text: 'https://olga.style' });
  assert(state.buttonsPendingPreview);
  assert.strictEqual((await buttons.screenForPayload({}, { action: 'button_admin_cancel' }, { userId: USER_ID })).text, 'cancelled');
  assert.strictEqual(state.buttonsPendingPreview, null);
  console.log('PR199 buttons wizard assertions passed');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
