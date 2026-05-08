'use strict';

const express = require('express');
const { query } = require('../db');

function requireDb(req, res, next) {
  try {
    require('../db').getPool();
    next();
  } catch {
    res.status(503).json({ ok: false, error: 'database_not_configured' });
  }
}

function normalizeText(value) {
  return String(value || '').trim();
}

function makeCommentsRouter(config) {
  const router = express.Router();
  router.use(requireDb);

  router.get('/:commentKey', async (req, res) => {
    const commentKey = String(req.params.commentKey || '').trim();
    const result = await query(
      `select id, comment_key, user_id, user_name, avatar_url, text, attachments, reply_to_id, created_at, edited_at
       from comments
       where comment_key = $1 and is_deleted = false
       order by created_at asc`,
      [commentKey]
    );
    res.json({ ok: true, runtimeVersion: config.runtimeVersion, comments: result.rows });
  });

  router.post('/:commentKey', async (req, res) => {
    const commentKey = String(req.params.commentKey || '').trim();
    const text = normalizeText(req.body?.text);
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
    if (!text && !attachments.length) {
      res.status(400).json({ ok: false, error: 'text_or_attachment_required' });
      return;
    }

    const result = await query(
      `insert into comments(comment_key, user_id, user_name, avatar_url, text, attachments, reply_to_id)
       values($1,$2,$3,$4,$5,$6::jsonb,$7)
       returning id, comment_key, user_id, user_name, avatar_url, text, attachments, reply_to_id, created_at, edited_at`,
      [
        commentKey,
        String(req.body?.userId || 'guest'),
        String(req.body?.userName || 'Гость'),
        String(req.body?.avatarUrl || ''),
        text,
        JSON.stringify(attachments.slice(0, 5)),
        req.body?.replyToId || null
      ]
    );
    res.json({ ok: true, runtimeVersion: config.runtimeVersion, comment: result.rows[0] });
  });

  router.post('/:commentKey/:commentId/react', async (req, res) => {
    const commentId = String(req.params.commentId || '').trim();
    const emoji = normalizeText(req.body?.emoji);
    const userId = String(req.body?.userId || 'guest').trim() || 'guest';
    if (!emoji) {
      res.status(400).json({ ok: false, error: 'emoji_required' });
      return;
    }
    const current = await query(
      `select active from comment_reactions where comment_id=$1 and user_id=$2 and emoji=$3`,
      [commentId, userId, emoji]
    );
    const nextActive = !Boolean(current.rows[0]?.active);
    await query(
      `insert into comment_reactions(comment_id,user_id,emoji,active,updated_at)
       values($1,$2,$3,$4,now())
       on conflict(comment_id,user_id,emoji) do update set active=$4, updated_at=now()`,
      [commentId, userId, emoji, nextActive]
    );
    res.json({ ok: true, runtimeVersion: config.runtimeVersion, active: nextActive });
  });

  return router;
}

module.exports = { makeCommentsRouter };
