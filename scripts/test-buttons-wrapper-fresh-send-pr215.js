'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';
process.env.ADMINKIT_DISABLE_AUTOSTART = '1';

function clearModules(paths) { paths.forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch {} }); }
function clean(value) { return String(value || '').trim(); }

function installHarness() {
  clearModules([
    '../store', '../services/maxApi', '../buttons-flow-cc8-clean',
    '../pr199-buttons-wizard-inplace-save-bootstrap', '../pr199-buttons-main-menu-route-guard',
    '../pr202-buttons-real-show-path-inplace', '../buttons-wizard-screen-owner-pr206'
  ]);
  const states = {};
  const store = {
    store: { setupState: states, posts: {}, growth: { byChannel: {} }, channels: {} },
    getSetupState(userId) { return states[clean(userId)] || {}; },
    setSetupState(userId, patch) { states[clean(userId)] = { ...(states[clean(userId)] || {}), ...(patch || {}) }; return states[clean(userId)]; },
    saveStore() {}, savePost() {}, getPost() { return null; }, saveChannel() {}
  };
  const calls = [];
  let sendSeq = 1;
  const max = {
    async sendMessage(args = {}) { const mid = `base-send-${sendSeq++}`; calls.push({ type: 'sendMessage', mid, ...args }); return { message: { id: mid, body: { mid } } }; },
    async editMessage(args = {}) { calls.push({ type: 'editMessage', ...args }); return { message: { id: args.messageId, body: { mid: args.messageId } } }; },
    async answerCallback() { calls.push({ type: 'answerCallback' }); return { ok: true }; },
    async getChat() { return { title: 'Wrapper Test' }; }
  };
  require.cache[require.resolve('../store')] = { id: require.resolve('../store'), filename: require.resolve('../store'), loaded: true, exports: store };
  require.cache[require.resolve('../services/maxApi')] = { id: require.resolve('../services/maxApi'), filename: require.resolve('../services/maxApi'), loaded: true, exports: max };

  require('../pr199-buttons-wizard-inplace-save-bootstrap').install();
  require('../pr199-buttons-main-menu-route-guard').install();
  require('../pr202-buttons-real-show-path-inplace').install();
  const owner = require('../buttons-wizard-screen-owner-pr206');
  return { store, states, max, calls, owner };
}

(async () => {
  const { states, max, calls, owner } = installHarness();
  const userId = 'pr215-wrapper-user';
  const chatId = 'pr215-wrapper-chat';
  const step1 = { id: 'buttons_clean_add_label', text: '➕ Добавление кнопки\n\nШаг 1/3. Напишите текст кнопки.', attachments: [] };
  const step2 = { id: 'buttons_clean_add_url', text: '➕ Добавление кнопки\n\nШаг 2/3. Пришлите ссылку для кнопки.', attachments: [] };
  const step3 = { id: 'buttons_clean_add_preview', text: '👀 Предпросмотр кнопки\n\nШаг 3/3. Проверьте пользовательскую кнопку перед сохранением.', attachments: [] };

  states[userId] = {
    buttonsWizardScreenMessageId: 'old-user-wizard',
    buttonsActiveScreenMessageId: 'old-user-wizard',
    activeAdminFlowKind: 'button',
    buttonFlow: { flowId: 'flow-user' }
  };
  await max.sendMessage({ botToken: 'token', userId, text: step2.text, attachments: [], notify: false, pr215FreshWizard: true });
  assert.strictEqual(calls.filter((call) => call.type === 'sendMessage').length, 1, 'PR215 userId wizard send reaches base sendMessage through PR199/PR202 chain');
  assert.strictEqual(calls.filter((call) => call.type === 'editMessage').length, 0, 'PR215 userId wizard send is not rewritten into editMessage');
  assert.strictEqual(calls[0].pr215FreshWizard, true, 'pr215FreshWizard flag survives wrapper chain for userId send');

  calls.length = 0;
  states[chatId] = {
    buttonsWizardScreenMessageId: 'old-chat-wizard',
    buttonsActiveScreenMessageId: 'old-chat-wizard',
    activeAdminFlowKind: 'button',
    buttonFlow: { flowId: 'flow-chat' }
  };
  await max.sendMessage({ botToken: 'token', chatId, text: step2.text, attachments: [], notify: false, pr215FreshWizard: true });
  assert.strictEqual(calls.filter((call) => call.type === 'sendMessage').length, 1, 'PR215 chatId wizard send reaches base sendMessage through PR199 main-menu guard');
  assert.strictEqual(calls.filter((call) => call.type === 'editMessage').length, 0, 'PR215 chatId wizard send is not rewritten into editMessage');
  assert.strictEqual(calls[0].pr215FreshWizard, true, 'pr215FreshWizard flag survives wrapper chain for chatId send');

  calls.length = 0;
  owner.recordButtonsWizardScreen({ userId, chatId, messageId: 'owner-step-1', screen: step1 });
  await owner.updateButtonsWizardScreen({ config: { botToken: 'token' }, userId, chatId, screen: step2 });
  await owner.updateButtonsWizardScreen({ config: { botToken: 'token' }, userId, chatId, screen: step3 });
  const sends = calls.filter((call) => call.type === 'sendMessage');
  const edits = calls.filter((call) => call.type === 'editMessage');
  assert.strictEqual(sends.length, 2, 'Step 2/3 and Step 3/3 are fresh sendMessage calls through installed wrappers');
  assert(sends.every((call) => call.pr215FreshWizard === true), 'fresh-step sends keep pr215FreshWizard through installed wrappers');
  assert(sends[0].text.includes('Шаг 2/3'), 'Step 2/3 appears as fresh sendMessage');
  assert(sends[1].text.includes('Шаг 3/3'), 'Step 3/3 appears as fresh sendMessage');
  assert(edits.some((call) => call.messageId === 'owner-step-1' && /Предыдущий шаг закрыт/.test(call.text)), 'previous wizard Step 1 is closed/disabled');
  assert(edits.some((call) => call.messageId === sends[0].mid && /Предыдущий шаг закрыт/.test(call.text)), 'previous wizard Step 2 is closed/disabled before Step 3');
  assert.strictEqual(states[userId].buttonsWizardScreenMessageId, sends[1].mid, 'latest active wizard message id is the fresh Step 3 send');

  calls.length = 0;
  await max.sendMessage({ botToken: 'token', userId, text: '🔘 Кнопки под постами\nКнопка сохранена. Пост обновлён.', attachments: [], notify: false });
  assert.strictEqual(calls.filter((call) => call.type === 'sendMessage').length, 1, 'save result appears as a fresh visible message');
  assert.strictEqual(calls.filter((call) => call.type === 'editMessage').length, 0, 'save result is not rewritten into editMessage');

  console.log('test-buttons-wrapper-fresh-send-pr215 ok');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
