'use strict';

process.env.PUSH_PAIRING_SECRET = process.env.PUSH_PAIRING_SECRET || 'pr191-test-pairing-secret-with-enough-entropy';
process.env.PUBLIC_BASE_URL = 'https://example.test';

const assert = require('assert');
const onboarding = require('../services/groupPushOnboardingService');
const pairing = require('../services/pushPairingService');
const routes = require('../web-push-routes');

(async () => {
  const embedded = await onboarding.resolveChatTitle({
    message: { recipient: { title: 'Мож Хвост 3' }, body: { recipient: { title: 'Ниже приоритетом' } } },
    chatId: '-100000000001',
    botToken: 'test',
    api: { getChat: async () => { throw new Error('must_not_call'); } }
  });
  assert.equal(embedded.chatTitle, 'Мож Хвост 3');
  assert.equal(embedded.titleMissing, false);

  let getChatCalls = 0;
  const fetched = await onboarding.resolveChatTitle({
    message: { recipient: { chat_id: '-100000000002' } },
    chatId: '-100000000002',
    botToken: 'test',
    api: { getChat: async () => { getChatCalls += 1; return { title: 'Канал редакции' }; } }
  });
  assert.equal(getChatCalls, 1);
  assert.equal(fetched.chatTitle, 'Канал редакции');

  const joinUrl = onboarding.createPersonalJoinUrl({ maxUserId: '42', chatId: '-100000000002', chatTitle: fetched.chatTitle });
  const token = new URL(joinUrl).searchParams.get('t');
  const verified = pairing.verifyPairingToken(token);
  assert.equal(verified.chatTitle, 'Канал редакции');

  let html = '';
  routes.sendPushPage(
    { get: (name) => name === 'host' ? 'example.test' : '', protocol: 'https' },
    { type() { return this; }, send(value) { html = value; return value; } },
    { mode: 'client', joinMode: true, informationalJoin: true, chatTitle: 'Мож Хвост 3' }
  );
  assert(html.includes('Подключается чат:<br><strong>«Мож Хвост 3»</strong>'));
  assert(html.includes('Откройте АдминКИТ PUSH с экрана Домой.'));
  assert(html.includes('«Подключить этот чат»'));
  assert(!html.includes('-100000000002'));
  assert(!html.includes('Персональная ссылка найдена'));
  console.log('PR191 push join chat title: OK');
})().catch((error) => { console.error(error); process.exit(1); });
