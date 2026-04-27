const {
  listGiftCampaigns,
  getGiftCampaign,
  saveGiftCampaign,
  deleteGiftCampaign,
  findGiftCampaignForPost,
  getGiftClaim,
  saveGiftClaim,
  listGiftClaims,
  getGiftSettings,
  saveGiftSettings,
  normalizeGiftAttachment,
  normalizeGiftUploadLimits
} = require("../store");
const { getChatMembers, getBotChatMember, sendMessage, answerCallback } = require("./maxApi");

function buildGiftDmText(campaign, userName = "") {
  const greeting = userName ? `${userName}, ` : "";
  return String(campaign?.giftMessage || `${greeting}спасибо за подписку! Забирайте подарок ниже.`).trim();
}

function getDirectGiftUrl(campaign = null) {
  if (campaign?.giftUrl) return String(campaign.giftUrl || "").trim();
  const giftAttachment = normalizeGiftAttachment(campaign?.giftAttachment);
  const payload = giftAttachment?.payload && typeof giftAttachment.payload === "object" ? giftAttachment.payload : {};
  return String(payload.url || payload.download_url || payload.public_url || "").trim();
}

function normalizeMaxUrl(url = "") {
  return String(url || "").trim().replace(/^https:\/\/web\.max\.ru\//i, "https://max.ru/");
}

function buildGiftLinkButtonAttachment(campaign, directGiftUrl = "") {
  const targetUrl = normalizeMaxUrl(directGiftUrl || campaign?.giftUrl || "");
  if (!targetUrl) return null;
  return {
    type: "inline_keyboard",
    payload: {
      buttons: [[{
        type: "link",
        text: String(campaign?.dmButtonText || "Открыть подарок").trim(),
        url: targetUrl
      }]]
    }
  };
}

function buildGiftDeliveryAttachments(campaign) {
  const attachments = [];
  const giftAttachment = normalizeGiftAttachment(campaign?.giftAttachment);
  if (giftAttachment?.type && giftAttachment?.payload) {
    attachments.push({
      type: giftAttachment.type,
      payload: giftAttachment.payload
    });
  }

  const linkButton = buildGiftLinkButtonAttachment(campaign);
  if (linkButton) attachments.push(linkButton);
  return attachments;
}

async function verifySubscription({ botToken, chatId, userId }) {
  if (!chatId) {
    return { ok: false, subscribed: false, reason: "chat_id_missing" };
  }
  if (!userId) {
    return { ok: false, subscribed: false, reason: "user_id_missing" };
  }

  const response = await getChatMembers({
    botToken,
    chatId,
    userIds: [userId]
  });

  const members = Array.isArray(response?.members) ? response.members : [];
  return {
    ok: true,
    subscribed: members.length > 0,
    members,
    raw: response
  };
}

async function getMembershipDiagnostics({ botToken, chatId }) {
  if (!chatId) {
    return { ok: false, reason: "chat_id_missing" };
  }
  try {
    const me = await getBotChatMember({ botToken, chatId });
    return { ok: true, me };
  } catch (error) {
    return {
      ok: false,
      error: {
        status: error?.status || 0,
        message: error?.message || "membership_check_failed",
        data: error?.data || null
      }
    };
  }
}

async function deliverGiftToUser({ botToken, campaign, userId, userName }) {
  return sendMessage({
    botToken,
    userId,
    text: buildGiftDmText(campaign, userName),
    attachments: buildGiftDeliveryAttachments(campaign)
  });
}

async function answerGiftReady({ botToken, callbackId, campaign, deliverySucceeded = false }) {
  if (!callbackId) return { success: false, skipped: true, reason: "callback_id_missing" };
  const rawSuccessNotification = String(campaign?.successNotification || "").trim();
  const notification = String(rawSuccessNotification || (deliverySucceeded ? "Подарок отправлен в личные сообщения" : "Подарок готов")).trim();
  return answerCallback({
    botToken,
    callbackId,
    ...(notification ? { notification } : {})
  });
}

async function claimGift({ botToken, campaignId, userId, userName = "", callbackId = "" }) {
  const campaign = getGiftCampaign(campaignId);
  if (!campaign || !campaign.enabled) {
    if (callbackId) {
      await answerCallback({ botToken, callbackId, notification: "Акция сейчас недоступна" });
    }
    return { ok: false, status: "campaign_not_found" };
  }

  const existing = getGiftClaim(campaign.id, userId);
  if (campaign.onlyOnce && existing?.deliveredAt) {
    if (callbackId) {
      await answerCallback({
        botToken,
        callbackId,
        notification: String(campaign.alreadyClaimedNotification || "Подарок уже был отправлен ранее").trim()
      });
    }
    return { ok: true, status: "already_claimed", campaign, claim: existing };
  }

  let subscriptionResult;
  try {
    subscriptionResult = await verifySubscription({
      botToken,
      chatId: campaign.requiredChatId || campaign.channelId,
      userId
    });
  } catch (error) {
    const diagnostics = await getMembershipDiagnostics({ botToken, chatId: campaign.requiredChatId || campaign.channelId });
    if (callbackId) {
      await answerCallback({
        botToken,
        callbackId,
        notification: "Не удалось проверить подписку. Проверьте права бота в канале."
      });
    }
    return {
      ok: false,
      status: "subscription_check_failed",
      campaign,
      diagnostics,
      error: {
        status: error?.status || 0,
        message: error?.message || "subscription_check_failed",
        data: error?.data || null
      }
    };
  }

  if (!subscriptionResult?.subscribed) {
    saveGiftClaim(campaign.id, userId, {
      status: "not_subscribed",
      userName,
      checkedAt: Date.now()
    });
    if (callbackId) {
      await answerCallback({
        botToken,
        callbackId,
        notification: String(campaign.notSubscribedNotification || "Сначала подпишитесь на канал, затем нажмите кнопку ещё раз").trim()
      });
    }
    return { ok: true, status: "not_subscribed", campaign, subscriptionResult };
  }

  let delivery = { success: false, skipped: true, reason: "dm_disabled" };
  let deliveryError = null;

  if (campaign.deliverToDm !== false) {
    try {
      delivery = await deliverGiftToUser({ botToken, campaign, userId, userName });
    } catch (error) {
      deliveryError = {
        status: error?.status || 0,
        message: error?.message || "gift_delivery_failed",
        data: error?.data || null
      };
    }
  }

  const deliverySucceeded = Boolean(delivery?.message || delivery?.success);
  const claim = saveGiftClaim(campaign.id, userId, {
    status: deliverySucceeded ? "delivered_dm" : "delivery_failed",
    userName,
    checkedAt: Date.now(),
    ...(deliverySucceeded ? { deliveredAt: Date.now() } : {}),
    delivery,
    deliveryError
  });

  if (callbackId) {
    if (deliverySucceeded) {
      await answerGiftReady({ botToken, callbackId, campaign, deliverySucceeded: true });
    } else {
      await answerCallback({
        botToken,
        callbackId,
        notification: String(campaign.dmDeliveryFallbackNotification || "Не удалось отправить подарок в личные сообщения. Откройте бота и нажмите Старт, затем нажмите кнопку ещё раз.").trim()
      });
    }
  }

  return {
    ok: deliverySucceeded,
    status: deliverySucceeded ? "delivered_dm" : "delivery_failed",
    campaign,
    claim,
    delivery,
    deliveryError
  };
}

module.exports = {
  listGiftCampaigns,
  getGiftCampaign,
  saveGiftCampaign,
  deleteGiftCampaign,
  listGiftClaims,
  findGiftCampaignForPost,
  verifySubscription,
  getMembershipDiagnostics,
  claimGift,
  getGiftSettings,
  saveGiftSettings,
  normalizeGiftUploadLimits,
  normalizeGiftAttachment,
  buildGiftDeliveryAttachments,
  getDirectGiftUrl
};
