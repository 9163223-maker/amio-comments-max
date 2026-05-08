'use strict';

const { editMessage, buildCommentsKeyboard } = require('./maxApi');
const { countComments } = require('../repositories/postsRepo');

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function stripInlineKeyboard(attachments = []) {
  return (Array.isArray(attachments) ? cloneJson(attachments) : []).filter((item) => item?.type !== 'inline_keyboard');
}

async function patchPostCommentsButton({ config, post }) {
  if (!post?.message_id) {
    return { ok: false, reason: 'message_id_missing' };
  }
  const commentCount = await countComments(post.comment_key);
  const originalAttachments = stripInlineKeyboard(post.source_attachments || []);
  const keyboard = buildCommentsKeyboard({
    appBaseUrl: config.appBaseUrl,
    commentKey: post.comment_key,
    channelId: post.channel_id,
    postId: post.post_id,
    count: commentCount
  });
  const attachments = [...originalAttachments, ...keyboard];
  const payload = {
    botToken: config.botToken,
    messageId: post.message_id,
    attachments,
    notify: false
  };
  if (post.original_text) payload.text = post.original_text;
  if (post.original_link) payload.link = cloneJson(post.original_link);
  if (post.original_format !== undefined && post.original_format !== null) payload.format = cloneJson(post.original_format);

  try {
    const result = await editMessage(payload);
    return { ok: true, commentCount, result };
  } catch (error) {
    return {
      ok: false,
      commentCount,
      error: {
        status: error.status || 0,
        message: error.message || 'patch_failed',
        data: error.data || null
      }
    };
  }
}

module.exports = { patchPostCommentsButton };
