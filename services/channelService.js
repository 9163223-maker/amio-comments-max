const { getChannelsList, saveChannel } = require("../store");

function listChannels() {
  return getChannelsList();
}

function registerChannel(channelId, data) {
  return saveChannel(channelId, data || {});
}

module.exports = {
  listChannels,
  registerChannel
};
