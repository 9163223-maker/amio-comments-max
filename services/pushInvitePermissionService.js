'use strict';

const maxApi = require('./maxApi');

const RESULT_ALLOWED = 'allowed';
const RESULT_NOT_ADMIN = 'not_admin';
const RESULT_UNVERIFIABLE = 'unverifiable';

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value;
  const normalized = clean(value).toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return null;
}

function memberUserId(member = {}) {
  return clean(
    member.user_id || member.userId || member.id ||
    member.user?.user_id || member.user?.userId || member.user?.id ||
    member.member?.user_id || member.member?.userId || member.member?.id
  );
}

function roleDecision(member = {}) {
  const sources = [member, member.permissions, member.role, member.member, member.user].filter((item) => item && typeof item === 'object');
  for (const source of sources) {
    for (const key of ['isOwner', 'is_owner', 'owner']) {
      const flag = normalizeBoolean(source[key]);
      if (flag === true) return true;
    }
    for (const key of ['isAdmin', 'is_admin', 'admin', 'administrator']) {
      const flag = normalizeBoolean(source[key]);
      if (flag === true) return true;
    }
  }

  const permissionValues = Array.isArray(member.permissions)
    ? member.permissions
    : (member.permissions && typeof member.permissions === 'object' ? Object.entries(member.permissions).filter(([, value]) => normalizeBoolean(value) === true).map(([key]) => key) : []);
  const roles = [member.role, member.member_role, member.memberRole, member.status, member.permissions?.role, ...permissionValues]
    .map((value) => clean(typeof value === 'object' ? value.name || value.type || value.value : value).toLowerCase())
    .filter(Boolean);
  if (roles.some((role) => ['owner', 'creator', 'admin', 'administrator', 'chat_admin', 'channel_admin', 'is_owner', 'is_admin'].includes(role))) return true;
  if (roles.some((role) => ['member', 'subscriber', 'participant', 'user', 'reader', 'viewer', 'guest'].includes(role))) return false;

  const explicitFlags = sources.flatMap((source) => ['isOwner', 'is_owner', 'owner', 'isAdmin', 'is_admin', 'admin', 'administrator'].map((key) => normalizeBoolean(source[key])));
  if (explicitFlags.some((flag) => flag === false)) return false;
  return null;
}

async function verifyPushInvitePermission({ requesterUserId, targetChatId, botToken, getChatMembers = maxApi.getChatMembers } = {}) {
  const requesterId = clean(requesterUserId);
  const chatId = clean(targetChatId);
  if (!requesterId || !chatId || !clean(botToken) || typeof getChatMembers !== 'function') {
    return { allowed: false, result: RESULT_UNVERIFIABLE };
  }

  try {
    const response = await getChatMembers({ botToken, chatId, userIds: [requesterId], count: 20 });
    const members = [response?.members, response?.items, response?.users, response?.data].find(Array.isArray);
    if (!members) return { allowed: false, result: RESULT_UNVERIFIABLE };
    const member = members.find((item) => memberUserId(item) === requesterId);
    if (!member) return { allowed: false, result: RESULT_NOT_ADMIN };
    const decision = roleDecision(member);
    if (decision === true) return { allowed: true, result: RESULT_ALLOWED };
    if (decision === false) return { allowed: false, result: RESULT_NOT_ADMIN };
    return { allowed: false, result: RESULT_UNVERIFIABLE };
  } catch {
    return { allowed: false, result: RESULT_UNVERIFIABLE };
  }
}

async function canPublishPushInvite(options = {}) {
  return (await verifyPushInvitePermission(options)).allowed;
}

module.exports = {
  RESULT_ALLOWED,
  RESULT_NOT_ADMIN,
  RESULT_UNVERIFIABLE,
  memberUserId,
  roleDecision,
  verifyPushInvitePermission,
  canPublishPushInvite
};
