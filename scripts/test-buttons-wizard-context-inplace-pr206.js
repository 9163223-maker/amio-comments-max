'use strict';
const assert = require('assert');

const store = require('../store');
const max = require('../services/maxApi');
const patch = require('../pr199-buttons-main-menu-route-guard');

function resetUser(id) {
  try { store.setSetupState(id, { activeAdminFlowKind: '', buttonFlow: null, buttonsActiveScreenMessageId: null }); } catch {}
}

async function main() {
  const userId = 'user-pr206';
  const chatId = 'chat-pr206';
  resetUser(userId);
  resetUser(chatId);

  const editCalls = [];
  const sendCalls = [];
  const originalEdit = max.editMessage;
  const originalSend = max.sendMessage;
  max.editMessage = async (args = {}) => {
    editCalls.push(args);
    return { success: true, message: { id: args.messageId, body: { mid: args.messageId } } };
  };
  max.sendMessage = async (args = {}) => {
    sendCalls.push(args);
    return { message: { id: 'sent-' + sendCalls.length, body: { mid: 'sent-' + sendCalls.length } } };
  };

  patch.install();

  const cleanGuard = require('../clean-bot-flow-guard-1546');
  const bot = cleanGuard.createCleanBot({
    handleWebhook: async (req, res) => {
      await max.sendMessage({ botToken: 'test-token', chatId, text: '➕ Добавление кнопки\nШаг 2/3. Пришлите ссылку для кнопки.', attachments: [] });
      return res.status(200).json({ ok: true, delegated: true });
    }
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return value; } };
  const update = { update_type: 'message_created', message: { sender: { user_id: userId }, recipient: { chat_id: chatId, chat_type: 'dialog' }, body: { text: '/start' } } };

  store.setSetupState(userId, { activeAdminFlowKind: 'button', buttonFlow: { step: 'url' }, buttonsActiveScreenMessageId: 'wizard-mid' });

  await bot.handleWebhook({ body: update }, res, { botToken: 'test-token' });

  assert.strictEqual(sendCalls.length, 0, 'chatId-only wizard send must be converted to edit when user context has active screen');
  assert.strictEqual(editCalls.at(-1).messageId, 'wizard-mid');
  assert.strictEqual(editCalls.at(-1).botToken, 'test-token');
  assert.strictEqual(store.getSetupState(userId).buttonsActiveScreenMessageId, 'wizard-mid');
  assert.strictEqual(store.getSetupState(chatId).buttonsActiveScreenMessageId, 'wizard-mid');

  max.editMessage = originalEdit;
  max.sendMessage = originalSend;
  console.log('PR206 real context wizard in-place assertions passed');
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
