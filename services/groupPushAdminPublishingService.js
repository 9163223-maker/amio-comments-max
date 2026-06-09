'use strict';

const NON_ADMIN_MESSAGE = 'Не удалось опубликовать приглашение. Публиковать кнопку может только администратор или владелец выбранного чата/канала.';
const VERIFICATION_FAILURE_MESSAGE = 'Не удалось проверить права в выбранном чате/канале. Проверьте, что бот добавлен туда администратором, и попробуйте ещё раз.';
const ADMIN_ROLES = new Set(['admin', 'administrator', 'owner', 'creator']);

function clean(value) {
  return String(value ?? '').trim();
}

function memberUserId(member = {}) {
  return clean(member.user_id || member.userId || member.id || member.user?.user_id || member.user?.userId || member.user?.id);
}

function memberRole(member = {}) {
  if (member.is_owner === true || member.isOwner === true || member.owner === true) return 'owner';
  if (member.is_admin === true || member.isAdmin === true || member.admin === true) return 'administrator';
  return clean(member.role || member.chat_role || member.chatRole || member.status || member.permissions?.role).toLowerCase();
}

function membersFrom(response) {
  if (Array.isArray(response?.members)) return response.members;
  if (Array.isArray(response?.data?.members)) return response.data.members;
  return null;
}

async function verifyRequesterCanPublish({ botToken, requesterId, chatId, api } = {}) {
  const safeRequesterId = clean(requesterId);
  const safeChatId = clean(chatId);
  if (!clean(botToken) || !safeRequesterId || !safeChatId) return { ok: false, error: 'verification_failed' };
  if (!api || typeof api.getChat !== 'function' || typeof api.getBotChatMember !== 'function' || typeof api.getChatMembers !== 'function') {
    return { ok: false, error: 'verification_failed' };
  }

  try {
    const [chat, botMember, membersResponse] = await Promise.all([
      api.getChat({ botToken, chatId: safeChatId }),
      api.getBotChatMember({ botToken, chatId: safeChatId }),
      api.getChatMembers({ botToken, chatId: safeChatId, userIds: [safeRequesterId], count: 100 })
    ]);
    const members = membersFrom(membersResponse);
    if (!chat || !botMember || !members || !members.length) return { ok: false, error: 'verification_failed' };
    const requester = members.find((member) => memberUserId(member) === safeRequesterId);
    if (!requester) return { ok: false, error: 'verification_failed' };
    const role = memberRole(requester);
    if (!role) return { ok: false, error: 'verification_failed' };
    if (!ADMIN_ROLES.has(role)) return { ok: false, error: 'requester_not_admin' };
    return { ok: true, chatId: safeChatId, role };
  } catch {
    return { ok: false, error: 'verification_failed' };
  }
}

async function publishGroupPushInvite({ botToken, requesterId, chatId, title = '', api, buildInviteText, buildInviteKeyboard } = {}) {
  const permission = await verifyRequesterCanPublish({ botToken, requesterId, chatId, api });
  if (!permission.ok) return permission;
  if (typeof api?.sendMessage !== 'function' || typeof buildInviteText !== 'function' || typeof buildInviteKeyboard !== 'function') {
    return { ok: false, error: 'verification_failed' };
  }
  try {
    await api.sendMessage({
      botToken,
      chatId: permission.chatId,
      text: buildInviteText(clean(title)),
      attachments: buildInviteKeyboard()
    });
    return { ok: true, sent: true, chatId: permission.chatId };
  } catch {
    return { ok: false, error: 'publish_failed' };
  }
}

module.exports = {
  ADMIN_ROLES,
  NON_ADMIN_MESSAGE,
  VERIFICATION_FAILURE_MESSAGE,
  memberRole,
  memberUserId,
  verifyRequesterCanPublish,
  publishGroupPushInvite
};
