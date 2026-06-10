'use strict';

process.env.ADMIN_TOKEN = 'operator-secret-pr191';

const assert = require('assert');
const registry = require('../services/maxCommandRegistryService');
const slash = require('../services/nativeSlashCommands');
const routes = require('../performance-debug-routes-pr73');
const fs = require('fs');
const path = require('path');

(async () => {
  const maxApiSource = fs.readFileSync(path.join(__dirname, '..', 'services', 'maxApi.js'), 'utf8');
  assert(!maxApiSource.includes('PATCH') || !maxApiSource.includes('/me'), 'MAX API wrapper has no undocumented command write path');
  assert(!maxApiSource.includes('MAX_COMMAND_SYNC_METHOD'));

  const desired = registry.commandsPayload().commands;
  assert.deepEqual(desired.map((item) => item.name), ['push', 'help']);
  for (const old of ['start', 'menu', 'channels', 'comments', 'gifts', 'debug']) assert(!desired.some((item) => item.name === old));

  const status = await routes.internalMaxCommandStatusPayload({
    botToken: 'token',
    api: { getBotInfo: async () => ({ commands: [{ name: 'push', description: 'Push' }, { name: 'start', description: 'Start' }] }) }
  });
  assert.equal(status.ok, true);
  assert.equal(status.mismatch, true);
  assert.deepEqual(status.actualCommands.map((item) => item.name), ['push', 'start']);

  let undocumentedWriteCalls = 0;
  const unsupported = await routes.internalMaxCommandSyncPayload({
    botToken: 'token',
    api: {
      getBotInfo: async () => ({ commands: [{ name: 'start' }] }),
      updateBotCommands: async () => { undocumentedWriteCalls += 1; return { supported: true }; }
    }
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.error, 'max_command_sync_not_supported_by_available_api');
  assert(unsupported.note.includes('внешний command catalog'));
  assert.equal(undocumentedWriteCalls, 0, 'sync never invokes an undocumented setter');

  const headerReq = (headers = {}, query = {}, body = {}) => ({
    get(name) { return headers[String(name).toLowerCase()] || ''; },
    query,
    body
  });
  assert.equal(routes.operatorAllowed(headerReq({ authorization: 'Bearer operator-secret-pr191' })), true);
  assert.equal(routes.operatorAllowed(headerReq({ 'x-admin-token': 'operator-secret-pr191' })), true);
  assert.equal(routes.operatorAllowed(headerReq({}, { adminToken: 'operator-secret-pr191' })), false);
  assert.equal(routes.operatorAllowed(headerReq({}, {}, { adminToken: 'operator-secret-pr191' })), false);
  assert(!JSON.stringify(unsupported).includes('operator-secret-pr191'));


  assert.deepEqual(slash.PUBLIC_GROUP_COMMANDS, ['/push', '/help']);
  console.log('PR191 MAX command catalog status/sync: OK');
})().catch((error) => { console.error(error); process.exit(1); });
