'use strict';

const storage = require('./webPushStorage');
const channelService = require('./channelService');
const maxApi = require('./maxApi');

function clean(value) { return String(value || '').trim(); }
function safeTitle(value) { return clean(value).slice(0, 180); }
function last4(value) { return clean(value).replace(/[^A-Za-z0-9_-]/g, '').slice(-4); }

function registryTitle(binding) {
  for (const id of [binding && binding.channelId, binding && binding.chatId]) {
    const title = safeTitle(channelService.titleFromStored(id));
    if (title && title !== 'Канал без названия') return title;
  }
  return '';
}

async function apiTitle(binding, options = {}) {
  const botToken = clean(options.botToken);
  const chatId = clean(binding && (binding.chatId || binding.channelId));
  if (!botToken || !chatId) return '';
  try {
    const getChat = options.getChatImpl || maxApi.getChat;
    const chat = await getChat({ botToken, chatId });
    return safeTitle(chat && (chat.title || chat.name || chat.chatTitle));
  } catch {
    return '';
  }
}

async function resolveConnectedChats(maxUserId, options = {}) {
  const snapshot = await storage.listChatBindingsSnapshot(maxUserId);
  const currentEndpointHash = clean(options.endpointHash);
  const currentDeviceId = clean(options.deviceId);
  const chats = [];
  for (const binding of snapshot.chats) {
    const title = safeTitle(binding.chatTitle || binding.title) || registryTitle(binding) || await apiTitle(binding, options);
    const matchingBindings = snapshot.rawBindings.filter((item) => clean(item.chatId) === clean(binding.chatId) || (!binding.chatId && clean(item.channelId) === clean(binding.channelId)));
    const enabledOnThisDevice = Boolean((currentEndpointHash || currentDeviceId) && matchingBindings.some((item) =>
      (currentEndpointHash && clean(item.endpointHash) === currentEndpointHash) ||
      (currentDeviceId && clean(item.deviceId) === currentDeviceId)
    ));
    const knownForUser = true;
    const resolved = {
      ...binding,
      chatTitle: title,
      title,
      chatRef: last4(binding.chatId || binding.channelId),
      enabledOnThisDevice,
      knownForUser,
      needsReconnect: knownForUser && !enabledOnThisDevice,
      status: enabledOnThisDevice ? 'enabled' : 'needs_reconnect',
      lastConnectedAt: clean(binding.updatedAt || binding.createdAt)
    };
    chats.push(resolved);
    if (title && title !== safeTitle(binding.chatTitle) && binding.deviceId) {
      await storage.upsertChatBindingForDevice({
        maxUserId: binding.maxUserId,
        chatId: binding.chatId,
        channelId: binding.channelId,
        chatTitle: title,
        deviceId: binding.deviceId,
        endpointHash: binding.endpointHash
      });
    }
  }
  return {
    ...snapshot,
    chats,
    uniqueChatsCount: chats.length,
    missingTitleCount: chats.filter((item) => !safeTitle(item.chatTitle)).length
  };
}

module.exports = { resolveConnectedChats, registryTitle };
