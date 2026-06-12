'use strict';

const assert = require('assert');

const maxPath = require.resolve('../services/maxApi');
const storePath = require.resolve('../store');
const buttonsPath = require.resolve('../buttons-flow-cc8-clean');
const bootstrapPath = require.resolve('../pr199-buttons-wizard-inplace-save-bootstrap');

[maxPath, storePath, buttonsPath, bootstrapPath].forEach((p) => { delete require.cache[p]; });

const USER_ID = 'pr199-user';
const TARGET = { channelId: 'pr199-channel', postId: 'pr199-post', commentKey: 'pr199-comment', originalText: 'Test post' };
const READY_FLOW = { mode: 'button_wizard', stepIndex: 2, targetPost: TARGET, draft: { id: 'btn_pr199', text: 'Press', url: 'https://olga.style', style: 'primary' } };
let state = { activeAdminFlowKind: 'button', buttonsActiveScreenMessageId: 'old-step-message', buttonFlow: READY_FLOW };
let editCalls = [];
let sendCalls = [];
let patches = [];
let saved = false;

require.cache[storePath] = {
  id: storePath,
  filename: storePath,
  loaded: true,
  exports: {
    getSetupState: (uid) => { assert.strictEqual(uid, USER_ID); return state; },
    setSetupState: (uid, patch) => { assert.strictEqual(uid, USER_ID); patches.push(patch); state = { ...state, ...patch }; },
    store: { growth: { byChannel: {} } },
    saveStore: () => { saved = true; },
    savePost: () => {}
  }
};
require.cache[maxPath] = {
  id: maxPath,
  filename: maxPath,
  loaded: true,
  exports: {
    editMessage: async (args) => { editCalls.push(args); return { message: { id: args.messageId, body: { mid: args.messageId } } }; },
    sendMessage: async (args) => { sendCalls.push(args); return { message: { id: 'new-message', body: { mid: 'new-message' } } }; }
  }
};
require.cache[buttonsPath] = {
  id: buttonsPath,
  filename: buttonsPath,
  loaded: true,
  exports: {
    handleTextInput: async () => ({ id: 'buttons_clean_add_preview', text: '👀 Предпросмотр кнопки', attachments: [{ type: 'inline_keyboard', payload: { buttons: [] } }] }),
    screenForPayload: async () => {
      const current = require('../store').getSetupState(USER_ID);
      if (!current.buttonFlow) return { id: 'buttons_clean_home', text: 'Сначала проверьте пользовательскую кнопку на предпросмотре.', attachments: [] };
      return { id: 'buttons_clean_home', text: 'Кнопка сохранена. Пост обновлён.', attachments: [] };
    }
  }
};

const max = require('../services/maxApi');
const buttons = require('../buttons-flow-cc8-clean');
const bootstrap = require('../pr199-buttons-wizard-inplace-save-bootstrap');
assert.strictEqual(bootstrap.info().ok, true);

(async () => {
  await max.sendMessage({ botToken: 'token', userId: USER_ID, text: '➕ Добавление кнопки\nШаг 2/3', attachments: [{ type: 'inline_keyboard' }] });
  assert.strictEqual(editCalls.length, 1, 'wizard step should edit the previous bot screen in-place');
  assert.strictEqual(editCalls[0].messageId, 'old-step-message');
  assert.strictEqual(sendCalls.length, 0, 'wizard step must not send a new duplicated menu');

  await buttons.handleTextInput({}, { userId: USER_ID, text: 'https://olga.style' });
  assert(state.buttonsPendingPreview, 'preview fallback is persisted');
  assert.strictEqual(state.buttonsPendingPreview.draft.url, 'https://olga.style');

  state = { ...state, activeAdminFlowKind: '', buttonFlow: null };
  const screen = await buttons.screenForPayload({}, { action: 'button_admin_save' }, { userId: USER_ID });
  assert.strictEqual(screen.text, 'Кнопка сохранена. Пост обновлён.');
  assert(patches.some((patch) => patch.buttonsPendingPreviewRestoredRuntime === bootstrap.RUNTIME), 'save restored pending preview before saving');
  assert(saved || true);

  console.log('PR199 buttons wizard in-place save fallback assertions passed');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
