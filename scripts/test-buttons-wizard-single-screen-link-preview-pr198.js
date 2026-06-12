'use strict';

const assert = require('assert');

const targetPath = require.resolve('../clean-bot-flow-guard-1546');
const guardPath = require.resolve('../clean-bot-flow-guard-1544');
const menuPath = require.resolve('../v3-menu-core-1539');
const postsPath = require.resolve('../posts-flow-cc8-text-flow');
const giftsPath = require.resolve('../gifts-flow-cc812-bottom');
const buttonsPath = require.resolve('../buttons-flow-cc8-clean');
const maxPath = require.resolve('../services/maxApi');
const storePath = require.resolve('../store');
const timingPath = require.resolve('../v3-ui-timing-cc8');
const patcherPath = require.resolve('../services/postPatcher');

[targetPath, guardPath, menuPath, postsPath, giftsPath, buttonsPath, maxPath, storePath, timingPath, patcherPath].forEach((p) => { delete require.cache[p]; });

const USER_ID = 'pr198-user';
let setupState = {
  activeAdminFlowKind: 'button',
  buttonFlow: { mode: 'button_wizard', stepIndex: 1, draft: { text: 'HTTP://olga.style', url: '' } },
  buttonsActiveScreenMessageId: 'old-button-step',
  buttonsActiveScreenId: 'buttons_clean_add_url'
};
let seenText = '';
const patches = [];
const editCalls = [];
const sendCalls = [];

require.cache[guardPath] = { id: guardPath, filename: guardPath, loaded: true, exports: { createCleanBot: (legacy) => legacy } };
require.cache[menuPath] = { id: menuPath, filename: menuPath, loaded: true, exports: { button: (text, action, extra = {}) => ({ text, payload: JSON.stringify({ action, ...extra }) }), keyboard: (rows) => [{ type: 'inline_keyboard', payload: { buttons: rows } }] } };
require.cache[postsPath] = { id: postsPath, filename: postsPath, loaded: true, exports: { screenForPayload: async () => null, handleTextInput: async () => null } };
require.cache[giftsPath] = { id: giftsPath, filename: giftsPath, loaded: true, exports: { handleTextInput: async () => null } };
require.cache[buttonsPath] = {
  id: buttonsPath,
  filename: buttonsPath,
  loaded: true,
  exports: {
    handleTextInput: async (menu, ctx) => {
      seenText = ctx.text;
      return { id: 'buttons_clean_add_preview', text: 'Шаг 3/3. Проверьте кнопку', attachments: [{ type: 'inline_keyboard', payload: { buttons: [[{ text: 'Сохранить', payload: '{}' }]] } }] };
    }
  }
};
require.cache[maxPath] = {
  id: maxPath,
  filename: maxPath,
  loaded: true,
  exports: {
    editMessage: async (args) => { editCalls.push(args); return { message: { id: args.messageId } }; },
    sendMessage: async (args) => { sendCalls.push(args); return { message: { id: 'new-button-step' } }; },
    answerCallback: async () => ({ ok: true })
  }
};
require.cache[storePath] = {
  id: storePath,
  filename: storePath,
  loaded: true,
  exports: {
    getSetupState: () => setupState,
    setSetupState: (uid, patch) => { assert.strictEqual(uid, USER_ID); patches.push(patch); setupState = { ...setupState, ...patch }; }
  }
};
require.cache[timingPath] = { id: timingPath, filename: timingPath, loaded: true, exports: { measure: async (name, meta, fn) => fn(), log: () => {}, mask: (value) => String(value || '').slice(0, 3) } };
require.cache[patcherPath] = { id: patcherPath, filename: patcherPath, loaded: true, exports: { tryPatchChannelPost: async () => ({ skipped: true }) } };

const bot = require('../clean-bot-flow-guard-1546').createCleanBot({ handleWebhook: async () => { throw new Error('legacy handler must not run'); } });

let responseStatus = 0;
let responseBody = null;
const res = { status(code) { responseStatus = code; return this; }, json(payload) { responseBody = payload; return payload; } };

(async () => {
  await bot.handleWebhook({ body: {
    update_type: 'message_created',
    message: {
      sender: { user_id: USER_ID },
      recipient: { chat_type: 'dialog' },
      body: { link: { url: 'HTTP://olga.style/' } }
    }
  } }, res, { botToken: 'token' });

  assert.strictEqual(responseStatus, 200);
  assert.strictEqual(responseBody.action, 'button_text_input');
  assert.strictEqual(responseBody.buttonsLinkPreviewText, true);
  assert.strictEqual(seenText, 'HTTP://olga.style/');
  assert.strictEqual(editCalls.length, 1, 'previous button wizard screen is closed');
  assert.strictEqual(editCalls[0].messageId, 'old-button-step');
  assert.deepStrictEqual(editCalls[0].attachments, []);
  assert.strictEqual(sendCalls.length, 1, 'new preview screen is sent once');
  assert.strictEqual(sendCalls[0].userId, USER_ID);
  assert.strictEqual(sendCalls[0].text, 'Шаг 3/3. Проверьте кнопку');
  assert.strictEqual(setupState.buttonsActiveScreenMessageId, 'new-button-step');
  assert(patches.some((patch) => patch.buttonsClosedScreenMessageId === 'old-button-step'), 'closed screen is recorded');
  assert(patches.some((patch) => patch.buttonsActiveScreenMessageId === 'new-button-step'), 'new active button screen is recorded');

  console.log('PR198 buttons wizard single-screen link preview assertions passed');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
