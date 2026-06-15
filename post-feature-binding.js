'use strict';

const tenant = require('./tenant-scope');

function clean(value) { return String(value || '').trim(); }
function array(value) { return Array.isArray(value) ? value : []; }
function first(...values) { return clean(values.find((value) => clean(value)) || ''); }
function normalizePostFeatureIdentity(post = {}, userId = '') {
  const ctx = tenant.ensureTenantContext(userId);
  const channelId = first(post.channelId, post.requiredChatId, post.chatId, post.channel_id);
  const postId = first(post.postId, post.post_id, post.maxPostId);
  const postIdIsMessageId = post.postIdIsMessageId === true || post.post_id_is_message_id === true || post.raw?.postIdIsMessageId === true || post.raw?.post_id_is_message_id === true;
  const messageId = first(post.messageId, post.message_id, post.maxMessageId, post.mid, post.message?.id, post.raw?.messageId, post.raw?.message_id, post.raw?.sample?.message?.id, post.raw?.sample?.callback?.message?.id, post.raw?.sample?.message?.body?.mid, post.raw?.sample?.callback?.message?.body?.mid);
  const commentKey = first(post.commentKey, post.comment_key, channelId && postId ? `${channelId}:${postId}` : '');
  return tenant.stampRecord({
    tenantKey: ctx.tenantKey,
    ownerUserId: ctx.ownerUserId,
    adminUserId: clean(userId),
    channelId,
    requiredChatId: first(post.requiredChatId, channelId),
    postId,
    messageId,
    postIdIsMessageId,
    patchMessageId: messageId || (postIdIsMessageId ? postId : ''),
    commentKey,
    adminChannelPostKey: first(post.adminChannelPostKey, post.admin_channel_post_key, channelId && postId ? `${ctx.tenantKey}:${channelId}:${postId}` : ''),
    adminCommentUnique: first(post.adminCommentUnique, post.admin_comment_unique, commentKey ? `${ctx.tenantKey}:${commentKey}` : ''),
    title: first(post.title, post.postTitle, post.preview, post.originalText, post.text, post.caption),
    preview: first(post.preview, post.originalText, post.postText, post.text, post.caption, post.title)
  }, ctx, post);
}
function patchIdDiagnostics(identity = {}, storedPost = {}) {
  return {
    tenantKey: clean(identity.tenantKey),
    ownerUserId: clean(identity.ownerUserId),
    adminUserId: clean(identity.adminUserId),
    channelId: clean(identity.channelId || identity.requiredChatId),
    postId: clean(identity.postId),
    commentKey: clean(identity.commentKey),
    messageId: clean(identity.messageId),
    storedMessageId: clean(storedPost && storedPost.messageId),
    storedPostId: clean(storedPost && storedPost.postId),
    postIdIsMessageId: identity.postIdIsMessageId === true || storedPost?.postIdIsMessageId === true,
    selectedPatchIdField: first(identity.messageId) ? 'identity.messageId' : first(storedPost && storedPost.messageId) ? 'storedPost.messageId' : ((identity.postIdIsMessageId === true && first(identity.postId)) ? 'identity.postId' : ((storedPost?.postIdIsMessageId === true && first(storedPost && storedPost.postId)) ? 'storedPost.postId' : '')),
    patchMessageId: first(identity.messageId, storedPost && storedPost.messageId, identity.postIdIsMessageId === true ? identity.postId : '', storedPost?.postIdIsMessageId === true ? storedPost.postId : ''),
    missing: array(['messageId']).filter(() => !first(identity.messageId, storedPost && storedPost.messageId, identity.postIdIsMessageId === true ? identity.postId : '', storedPost?.postIdIsMessageId === true ? storedPost.postId : ''))
  };
}
function giftsParityContract(feature = 'gifts') {
  return { feature, requiredBinding: ['tenantKey', 'ownerUserId', 'adminUserId', 'channelId', 'postId', 'messageId', 'commentKey'], scope: 'admin/tenant -> channel -> post -> feature state' };
}
module.exports = { normalizePostFeatureIdentity, patchIdDiagnostics, giftsParityContract };
