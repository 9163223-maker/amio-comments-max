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
const { evaluateGiftConditions } = require("./giftConditionGate");

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
  return { type: "inline_keyboard", payload: { buttons: [[{ type: "link", text: String(campaign?.dmButtonText || "Открыть подарок").trim(), url: targetUrl }]] } };
}

function buildGiftDeliveryAttachments(campaign) {
  const attachments = [];
  const giftAttachment = normalizeGiftAttachment(campaign?.giftAttachment);
  if (giftAttachment?.type && giftAttachment?.payload) attachments.push({ type: giftAttachment.type, payload: giftAttachment.payload });
  const linkButton = buildGiftLinkButtonAttachment(campaign);
  if (linkButton) attachments.push(linkButton);
  return attachments;
}

async function verifySubscription({ botToken, chatId, userId }) {
  if (!chatId) return { ok: false, subscribed: false, reason: "chat_id_missing" };
  if (!userId) return { ok: false, subscribed: false, reason: "user_id_missing" };
  const response = await getChatMembers({ botToken, chatId, userIds: [userId] });
  const members = Array.isArray(response?.members) ? response.members : [];
  return { ok: true, subscribed: members.length > 0, members, raw: response };
}

async function getMembershipDiagnostics({ botToken, chatId }) {
  if (!chatId) return { ok: false, reason: "chat_id_missing" };
  try {
    const me = await getBotChatMember({ botToken, chatId });
    return { ok: true, me };
  } catch (error) {
    return { ok: false, error: { status: error?.status || 0, message: error?.message || "membership_check_failed", data: error?.data || null } };
  }
}

async function deliverGiftToUser({ botToken, campaign, userId, userName }) {
  return sendMessage({ botToken, userId, text: buildGiftDmText(campaign, userName), attachments: buildGiftDeliveryAttachments(campaign) });
}

async function answerGiftReady({ botToken, callbackId, campaign, deliverySucceeded = false }) {
  if (!callbackId) return { success: false, skipped: true, reason: "callback_id_missing" };
  const rawSuccessNotification = String(campaign?.successNotification || "").trim();
  const notification = String(rawSuccessNotification || (deliverySucceeded ? "Подарок отправлен в личные сообщения" : "Подарок готов")).trim();
  return answerCallback({ botToken, callbackId, ...(notification ? { notification } : {}) });
}

async function safeAnswerCallback({ botToken, callbackId, notification }) {
  if (!callbackId) return null;
  try { return await answerCallback({ botToken, callbackId, notification: String(notification || "").trim() || undefined }); } catch { return null; }
}

async function safeSendPrompt({ botToken, userId, text }) {
  if (!botToken || !userId || !String(text || "").trim()) return null;
  try { return await sendMessage({ botToken, userId, text: String(text || "").trim() }); } catch { return null; }
}

function hasWrongPromoCode(gate = {}, providedCode = "") {
  if (!String(providedCode || "").trim()) return false;
  return Boolean(gate.checks?.some((item) => item.type === 'promoCode' && !item.ok && item.reason === 'wrong_code'));
}

async function notifyConditionFailure({ botToken, callbackId, userId, notification }) {
  const text = String(notification || "Сначала выполните условия получения подарка").trim();
  await safeAnswerCallback({ botToken, callbackId, notification: text });
  if (!callbackId) await safeSendPrompt({ botToken, userId, text });
}

async function claimGift({ botToken, campaignId, userId, userName = "", callbackId = "", providedCode = "" }) {
  const campaign = getGiftCampaign(campaignId);
  if (!campaign || !campaign.enabled) {
    await notifyConditionFailure({ botToken, callbackId, userId, notification: "Акция сейчас недоступна" });
    return { ok: false, status: "campaign_not_found" };
  }

  const gate = await evaluateGiftConditions({ botToken, campaign, userId, providedCode });
  if (!gate.ok) {
    const wrongCode = hasWrongPromoCode(gate, providedCode);
    const keepPending = gate.status === "condition_input_required" || wrongCode;
    const claim = saveGiftClaim(campaign.id, userId, {
      status: keepPending ? "condition_input_required" : gate.status,
      userName,
      checkedAt: Date.now(),
      pendingInputType: keepPending ? "promoCode" : (gate.inputType || ""),
      conditions: gate.checks || []
    });

    if (keepPending) {
      await safeAnswerCallback({ botToken, callbackId, notification: wrongCode ? "Кодовое слово не подошло" : (gate.notification || "Введите кодовое слово") });
      await safeSendPrompt({ botToken, userId, text: wrongCode ? "Кодовое слово не подошло. Проверьте код и отправьте его ещё раз." : (gate.promptText || "Введите кодовое слово или промокод.") });
      return { ok: true, status: "condition_input_required", campaign, claim, gate };
    }

    await notifyConditionFailure({ botToken, callbackId, userId, notification: gate.notification || "Сначала выполните условия получения подарка" });
    return { ok: true, status: "conditions_not_met", campaign, claim, gate };
  }

  let delivery = { success: false, skipped: true, reason: "dm_disabled" };
  let deliveryError = null;
  if (campaign.deliverToDm !== false) {
    try { delivery = await deliverGiftToUser({ botToken, campaign, userId, userName }); }
    catch (error) { deliveryError = { status: error?.status || 0, message: error?.message || "gift_delivery_failed", data: error?.data || null }; }
  }

  const deliverySucceeded = Boolean(delivery?.message || delivery?.success);
  const claim = saveGiftClaim(campaign.id, userId, { status: deliverySucceeded ? "delivered_dm" : "delivery_failed", userName, checkedAt: Date.now(), ...(deliverySucceeded ? { deliveredAt: Date.now(), pendingInputType: "" } : {}), conditions: gate.checks || [], delivery, deliveryError });

  if (callbackId) {
    if (deliverySucceeded) await answerGiftReady({ botToken, callbackId, campaign, deliverySucceeded: true });
    else await safeAnswerCallback({ botToken, callbackId, notification: String(campaign.dmDeliveryFallbackNotification || "Не удалось отправить подарок в личные сообщения. Откройте бота и нажмите Старт, затем нажмите кнопку ещё раз.").trim() });
  }

  return { ok: deliverySucceeded, status: deliverySucceeded ? "delivered_dm" : "delivery_failed", campaign, claim, gate, delivery, deliveryError };
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