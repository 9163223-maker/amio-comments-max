'use strict';

const assert = require('assert');
const registry = require('../services/maxCommandRegistryService');
const slash = require('../services/nativeSlashCommands');
const routes = require('../performance-debug-routes-pr73');

(async () => {
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

  const unsupported = await routes.internalMaxCommandSyncPayload({
    botToken: 'token',
    api: { getBotInfo: async () => ({ commands: [{ name: 'start' }] }), updateBotCommands: async () => ({ supported: false }) }
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.error, 'max_command_sync_not_supported_by_available_api');
  assert(unsupported.note.includes('внешний command catalog'));

  let updated = null;
  let actual = [{ name: 'start' }];
  const synced = await routes.internalMaxCommandSyncPayload({
    botToken: 'token',
    api: {
      getBotInfo: async () => ({ commands: actual }),
      updateBotCommands: async ({ commands }) => { updated = commands; actual = commands; return { supported: true, method: 'test' }; }
    }
  });
  assert.deepEqual(updated.map((item) => item.name), ['push', 'help']);
  assert.equal(synced.ok, true);
  assert.equal(synced.mismatch, false);

  assert.deepEqual(slash.PUBLIC_GROUP_COMMANDS, ['/push', '/help']);
  console.log('PR191 MAX command catalog status/sync: OK');
})().catch((error) => { console.error(error); process.exit(1); });
