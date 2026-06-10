'use strict';

// MAX currently exposes BotInfo.commands through GET /me, but its public API does
// not expose command scopes or a documented command-registration method. Keep the
// only global command catalog client-safe; private admin navigation stays in
// inline buttons and the private-message command router.
const GLOBAL_COMMANDS = Object.freeze([
  Object.freeze({ name: 'push', description: '🔔 Уведомления этого чата' }),
  Object.freeze({ name: 'help', description: '🆘 Помощь' })
]);
const GLOBAL_COMMAND_NAMES = Object.freeze(GLOBAL_COMMANDS.map((command) => `/${command.name}`));
const SCOPE_SUPPORT = 'global-only-no-public-scopes';

function commandsPayload() {
  return { commands: GLOBAL_COMMANDS.map((command) => ({ ...command })) };
}

module.exports = { GLOBAL_COMMANDS, GLOBAL_COMMAND_NAMES, SCOPE_SUPPORT, commandsPayload };
