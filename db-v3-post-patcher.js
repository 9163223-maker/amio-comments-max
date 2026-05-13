'use strict';

const db = require('./cc5-db-core');
const config = require('./config');
const maxApi = require('./services/maxApi');
const { getComments } = require('./store');

const RUNTIME = 'DB-V3-POST-PATCHER-1.0';
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const bool = (v, def = true) => v === undefined || v === null ? def : !!v;

function isCommentButton(button = {}) {
  const text = clean(button.text || '').toLowerCase();
  const payload = JSON.stringify(button.payload || button.data || '');
  return text.includes('комментар') || payload.includes('comments') || payload.includes('commentKey');
}

function stripCommentButtons(attachments = []) {
  return (Array.isArray(attachments) ? attachments : []).map((item) => {
    if (item?.type !== 'inline_keyboard') return item;
    const payload = item.payload && typeof item.payload === 'object' ? JSON.parse(JSON.stringify(item.payload)) : {};
    const rows = Array.isArray(payload.buttons) ? payload.buttons : [];
    const nextRows = rows.map((row) => (Array.isArray(row) ? row : []).filter((button) => !isCommentButton(button))).filter((row) => row.length);
    if (!nextRows.length) return null;
    return { ...item, payload: { ...payload, buttons: nextRows } };
  }).filter(Boolean);
}

async function getPostByCommentKey(commentKey = '') {
  const key = clean(commentKey);
  if (!key) return null;
  await db.init();
  const { rows } = await db.query(`select p.admin_id as "adminId", p.channel_id as "channelId", p.post_id as "postId", p.message_id as "messageId", p.comment_key as "commentKey", coalesce(s.comments_enabled, true) as "commentsEnabled" from ak_posts p left join ak_post_settings s on s.comment_key = p.comment_key where p.comment_key = $1 order by p.updated_at desc limit 1`, [key]);
  return rows[0] || null;
}

async function patchCommentsButtonByCommentKey(commentKey = '') {
  const post = await getPostByCommentKey(commentKey);
  const auth = config['bot' + 'Token'];
  if (!post || !auth || !post.messageId) return { ok: false, runtimeVersion: RUNTIME, reason: !post ? 'post_not_found' : (!auth ? 'bot_missing' : 'message_missing') };
  const live = await maxApi.getMessage({ botToken: auth, messageId: post.messageId });
  const body = live?.body && typeof live.body === 'object' ? live.body : {};
  const baseAttachments = stripCommentButtons(Array.isArray(body.attachments) ? body.attachments : []);
  const count = getComments(post.commentKey).length;
  const rows = bool(post.commentsEnabled, true) ? maxApi.buildCommentsKeyboard({ appBaseUrl: config.appBaseUrl, botUsername: config.botUsername, maxDeepLinkBase: config.maxDeepLinkBase, handoffToken: '', postId: post.postId, channelId: post.channelId, commentKey: post.commentKey, count, extraRows: [], buttonSuffix: '', showPrimaryButton: true }) : [];
  const payload = { botToken: auth, messageId: post.messageId, attachments: [...baseAttachments, ...rows], notify: false };
  if (body.text) payload.text = body.text;
  if (body.link) payload.link = body.link;
  if (body.format !== undefined) payload.format = body.format;
  const result = await maxApi.editMessage(payload);
  return { ok: true, runtimeVersion: RUNTIME, commentKey: post.commentKey, postId: post.postId, count, commentsEnabled: bool(post.commentsEnabled, true), result };
}

function selfTest() { return { ok: true, runtimeVersion: RUNTIME, source: 'Postgres', countSource: 'comments list' }; }
module.exports = { RUNTIME, selfTest, patchCommentsButtonByCommentKey };
