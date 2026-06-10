'use strict';

// MAX exposes BotInfo.commands through GET /me. The available public API does
// not document a command-registration method, so writes are disabled unless an
// operator explicitly configures a verified method. Private admin navigation
// stays in inline buttons and the private-message command router.
const GLOBAL_COMMANDS = Object.freeze([
  Object.freeze({ name: 'push', description: '🔔 Уведомления этого чата' }),
  Object.freeze({ name: 'help', description: '🆘 Помощь' })
]);
const GLOBAL_COMMAND_NAMES = Object.freeze(GLOBAL_COMMANDS.map((command) => `/${command.name}`));
const SCOPE_SUPPORT = 'global-only-no-public-scopes';
const UNSUPPORTED_ERROR = 'max_command_sync_not_supported_by_available_api';
const EXTERNAL_CATALOG_NOTE = 'Кодовая фильтрация включена, но MAX slash-preview хранит внешний command catalog';

function clean(value) { return String(value || '').trim(); }
function normalizeCommandName(value) { return clean(value).replace(/^\/+/, '').toLowerCase(); }
function normalizeCommands(value) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  return list.map((item) => ({
    name: normalizeCommandName(item?.name || item?.command),
    description: clean(item?.description).slice(0, 120)
  })).filter((item) => item.name && !seen.has(item.name) && seen.add(item.name));
}
function commandsPayload() { return { commands: GLOBAL_COMMANDS.map((command) => ({ ...command })) }; }
function commandsFromBotInfo(info = {}) {
  return normalizeCommands(info.commands || info.bot?.commands || info.data?.commands || info.data?.bot?.commands);
}
function commandNames(commands = []) { return normalizeCommands(commands).map((item) => item.name).sort(); }
function commandsMismatch(desired = [], actual = []) {
  return JSON.stringify(commandNames(desired)) !== JSON.stringify(commandNames(actual));
}

async function commandStatus({ botToken = '', api } = {}) {
  const desiredCommands = commandsPayload().commands;
  if (!clean(botToken) || !api || typeof api.getBotInfo !== 'function') {
    return { ok: false, error: 'max_command_status_unavailable', desiredCommands, actualCommands: [], mismatch: true };
  }
  try {
    const info = await api.getBotInfo({ botToken });
    const actualCommands = commandsFromBotInfo(info);
    return { ok: true, desiredCommands, actualCommands, mismatch: commandsMismatch(desiredCommands, actualCommands) };
  } catch (error) {
    return { ok: false, error: 'max_command_status_failed', statusCode: Number(error?.status) || undefined, desiredCommands, actualCommands: [], mismatch: true };
  }
}

async function syncCommands({ botToken = '', api } = {}) {
  const status = await commandStatus({ botToken, api });
  const desiredCommands = commandsPayload().commands;
  const actualCommands = status.actualCommands || [];
  return {
    ok: false,
    error: UNSUPPORTED_ERROR,
    desiredCommands,
    actualCommands,
    mismatch: commandsMismatch(desiredCommands, actualCommands),
    note: EXTERNAL_CATALOG_NOTE
  };
}

module.exports = {
  GLOBAL_COMMANDS,
  GLOBAL_COMMAND_NAMES,
  SCOPE_SUPPORT,
  UNSUPPORTED_ERROR,
  EXTERNAL_CATALOG_NOTE,
  normalizeCommands,
  commandsPayload,
  commandsFromBotInfo,
  commandsMismatch,
  commandStatus,
  syncCommands
};
