'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const commands = require('../services/nativeSlashCommands');
const registry = require('../services/maxCommandRegistryService');
assert.deepStrictEqual(commands.PUBLIC_GROUP_COMMANDS, ['/push', '/help']);
for (const command of ['/menu','/channels','/comments','/gifts','/buttons','/polls','/posts','/stats','/debug','/clear','/privacy']) {
  assert.strictEqual(commands.isCommandAllowedInContext({ command, userId: 'ordinary', message: { sender: { user_id: 'ordinary' }, recipient: { chat_id: 'group-1', chat_type: 'group' } } }), false, `${command} denied in group for non-admin`);
}
assert.deepStrictEqual(registry.GLOBAL_COMMAND_NAMES, ['/push', '/help']);
for (const leaked of ['/start','/menu','/channels','/comments','/gifts','/buttons','/polls','/posts','/stats','/debug','/clear','/privacy','/settings','/archive']) assert(!registry.GLOBAL_COMMAND_NAMES.includes(leaked));
const campaign = fs.readFileSync(path.join(__dirname, '..', 'clean-bot-campaign-attribution-cc8336.js'), 'utf8');
const cleanBot = fs.readFileSync(path.join(__dirname, '..', 'clean-bot-1539.js'), 'utf8');
assert(campaign.includes('isPrivateUserChat(message) && access.hasPendingActivation(uid)'));
assert(cleanBot.includes('privateMessage(m)&&txt(m).trim()'));
console.log('PR186 client command leakage tests passed');
