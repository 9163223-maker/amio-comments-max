'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';
process.env.ADMINKIT_DISABLE_AUTOSTART = '1';

const owner = require('../buttons-wizard-screen-owner-pr206');

(async () => {
  const states = {};
  const calls = [];
  const storeApi = {
    getSetupState(userId) { return states[userId] || {}; },
    setSetupState(userId, patch) { states[userId] = { ...(states[userId] || {}), ...(patch || {}) }; return states[userId]; }
  };
  let seq = 1;
  const maxApi = {
    async editMessage(args) { calls.push({ type: 'editMessage', ...args }); return { ok: true, message: { body: { mid: args.messageId } } }; },
    async sendMessage(args) { const mid = `fresh-${seq++}`; calls.push({ type: 'sendMessage', mid, ...args }); return { ok: true, message: { body: { mid } } }; }
  };
  const userId = 'pr215-fresh-user';
  const chatId = 'pr215-fresh-chat';
  const step1 = { id: 'buttons_clean_add_label', text: '➕ Добавление кнопки\n\nШаг 1/3. Напишите текст кнопки.', attachments: [] };
  const step2 = { id: 'buttons_clean_add_url', text: '➕ Добавление кнопки\n\nШаг 2/3. Пришлите ссылку для кнопки.', attachments: [] };
  const step3 = { id: 'buttons_clean_add_preview', text: '👀 Предпросмотр кнопки\n\nШаг 3/3. Проверьте пользовательскую кнопку перед сохранением.', attachments: [] };

  owner.recordButtonsWizardScreen({ storeApi, userId, chatId, messageId: 'old-step-1', screen: step1 });
  await owner.updateButtonsWizardScreen({ storeApi, maxApi, config: {}, userId, chatId, screen: step2 });
  assert.strictEqual(calls[0].type, 'sendMessage', 'step 2 is sent fresh below user text before closing old step');
  assert.strictEqual(calls[1].type, 'editMessage', 'old step 1 is closed/disabled after fresh send succeeds');
  assert.strictEqual(states[userId].buttonsWizardScreenMessageId, 'fresh-1', 'active wizard id updates after step 2');
  assert.strictEqual(states[userId].buttonsWizardLastRenderMethod, 'sendMessage', 'fresh wizard render method is recorded');

  await owner.updateButtonsWizardScreen({ storeApi, maxApi, config: {}, userId, chatId, screen: step3 });
  assert.strictEqual(calls[2].type, 'sendMessage', 'step 3 is sent fresh below link-preview message before closing old step');
  assert.strictEqual(calls[3].type, 'editMessage', 'old step 2 is closed/disabled after fresh send succeeds');
  assert.strictEqual(states[userId].buttonsWizardScreenMessageId, 'fresh-2', 'active wizard id updates after step 3');
  assert.strictEqual(calls.filter((c) => c.type === 'sendMessage').length, 2, 'no duplicate active wizard screens are sent for one transition');
  assert.strictEqual(owner.shouldSkipWizardCleanup({}), false, 'fresh-current mode does not protect old wizard screens from cleanup');

  const failStates = {};
  const failCalls = [];
  const failStore = {
    getSetupState(user) { return failStates[user] || {}; },
    setSetupState(user, patch) { failStates[user] = { ...(failStates[user] || {}), ...(patch || {}) }; return failStates[user]; }
  };
  const failMax = {
    async editMessage(args) { failCalls.push({ type: 'editMessage', ...args }); return { ok: true }; },
    async sendMessage(args) { failCalls.push({ type: 'sendMessage', ...args }); throw new Error('fresh_send_failed_pr215'); }
  };
  owner.recordButtonsWizardScreen({ storeApi: failStore, userId: 'fail-step2-user', chatId, messageId: 'fail-old-step-1', screen: step1 });
  const failedStep2 = await owner.updateButtonsWizardScreen({ storeApi: failStore, maxApi: failMax, config: {}, userId: 'fail-step2-user', chatId, screen: step2 });
  assert.strictEqual(failedStep2.diagnostic, 'buttons_wizard_send_failed', 'Step 2 send failure returns diagnostic');
  assert.strictEqual(failCalls.filter((c) => c.type === 'editMessage').length, 0, 'Step 2 send failure does not close old wizard first');
  assert.strictEqual(failStore.getSetupState('fail-step2-user').buttonsWizardScreenMessageId, 'fail-old-step-1', 'Step 2 send failure keeps old wizard active');

  failCalls.length = 0;
  owner.recordButtonsWizardScreen({ storeApi: failStore, userId: 'fail-step3-user', chatId, messageId: 'fail-old-step-2', screen: step2 });
  const failedStep3 = await owner.updateButtonsWizardScreen({ storeApi: failStore, maxApi: failMax, config: {}, userId: 'fail-step3-user', chatId, screen: step3 });
  assert.strictEqual(failedStep3.diagnostic, 'buttons_wizard_send_failed', 'Step 3 send failure returns diagnostic');
  assert.strictEqual(failCalls.filter((c) => c.type === 'editMessage').length, 0, 'Step 3 send failure does not close old wizard first');
  assert.strictEqual(failStore.getSetupState('fail-step3-user').buttonsWizardScreenMessageId, 'fail-old-step-2', 'Step 3 send failure keeps old wizard active');

  console.log('test-buttons-wizard-fresh-current-screen-pr215 ok');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
