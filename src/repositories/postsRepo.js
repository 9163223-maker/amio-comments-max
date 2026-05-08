'use strict';

const crypto = require('crypto');
const { query } = require('../db');

function makeCommentKey(channelId, postId) {
  return `${String(channelId || '').trim()}:${String(postId || '').trim()}`;
}

function makeHandoffToken(commentKey) {
  return `cc_${crypto.createHash('sha1').update(String(commentKey || '')).digest('hex').slice(0, 18)}`;
}

async function upsertPost({ channelId, postId, messageId = '', originalText = '', sourceAttachments = [], originalLink = null, originalFormat = null }) {
  const normalizedChannelId = String(channelId || '').trim();
  const normalizedPostId = String(postId || '').trim();
  if (!normalizedChannelId) throw new Error('channel_id_required');
  if (!normalizedPostId) throw new Error('post_id_required');
  const commentKey = makeCommentKey(normalizedChannelId, normalizedPostId);
  const handoffToken = makeHandoffToken(commentKey);
  const result = await query(
    `insert into posts(comment_key,channel_id,post_id,message_id,original_text,source_attachments,original_link,original_format,handoff_token,updated_at)
     values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,now())
     on conflict(comment_key) do update set
       message_id=coalesce(nullif($4,''), posts.message_id),
       original_text=$5,
       source_attachments=$6::jsonb,
       original_link=$7::jsonb,
       original_format=$8::jsonb,
       handoff_token=coalesce(nullif(posts.handoff_token,''), $9),
       updated_at=now()
     returning *`,
    [
      commentKey,
      normalizedChannelId,
      normalizedPostId,
      String(messageId || '').trim(),
      String(originalText || ''),
      JSON.stringify(Array.isArray(sourceAttachments) ? sourceAttachments : []),
      originalLink ? JSON.stringify(originalLink) : null,
      originalFormat !== undefined && originalFormat !== null ? JSON.stringify(originalFormat) : null,
      handoffToken
    ]
  );
  return result.rows[0];
}

async function getPost(commentKey) {
  const result = await query('select * from posts where comment_key=$1', [String(commentKey || '').trim()]);
  return result.rows[0] || null;
}

async function countComments(commentKey) {
  const result = await query('select count(*)::int as count from comments where comment_key=$1 and is_deleted=false', [String(commentKey || '').trim()]);
  return Number(result.rows[0]?.count || 0);
}

module.exports = { makeCommentKey, makeHandoffToken, upsertPost, getPost, countComments };
