'use strict';

const RUNTIME = 'CC8.3.51-PR165-PUSH-RUNTIME-WIRED';

function countPushDispatchDiagnostics(bot) {
  try {
    const summary = typeof bot?.getPushDispatchDiagnostics === 'function'
      ? bot.getPushDispatchDiagnostics(1)
      : null;
    return Number(summary && summary.count || 0) || 0;
  } catch {
    return 0;
  }
}

function createCleanBot(baseBot, legacyBot = baseBot) {
  return {
    ...baseBot,
    handleWebhook: async function handleWebhookWithPr165LiveChatPushRuntime(req, res, config) {
      const beforeCount = countPushDispatchDiagnostics(legacyBot);
      const result = await baseBot.handleWebhook(req, res, config);
      const afterCount = countPushDispatchDiagnostics(legacyBot);

      if (afterCount === beforeCount && typeof legacyBot?.dispatchLiveChatPushNotification === 'function') {
        const update = req && req.body || {};
        const message = typeof legacyBot.getMessage === 'function' ? legacyBot.getMessage(update) : null;
        const updateType = String(update && (update.update_type || update.type) || '').trim();
        const text = typeof legacyBot.getMessageText === 'function' ? legacyBot.getMessageText(message).trim() : '';
        const skippedReason = typeof legacyBot.liveChatPushSkipReason === 'function'
          ? legacyBot.liveChatPushSkipReason(updateType, message, text)
          : 'dispatcher_unavailable';

        if (!skippedReason) {
          await legacyBot.dispatchLiveChatPushNotification({ updateType, message, text, config });
        }
      }

      return result;
    },
    pr165LiveChatPushRuntime: true,
    pr165LiveChatPushRuntimeVersion: RUNTIME
  };
}

module.exports = { RUNTIME, createCleanBot };
