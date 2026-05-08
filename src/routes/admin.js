'use strict';

const express = require('express');
const { query } = require('../db');

function auth(config, req, res, next) {
  if (!config.adminToken) return next();
  const bearer = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const token = String(req.get('x-admin-token') || bearer || req.query?.token || req.body?.token || '').trim();
  if (token === config.adminToken) return next();
  res.status(403).json({ ok: false, error: 'admin_forbidden', runtimeVersion: config.runtimeVersion });
}

function requireDb(req, res, next) {
  try {
    require('../db').getPool();
    next();
  } catch {
    res.status(503).json({ ok: false, error: 'database_not_configured' });
  }
}

function makeAdminRouter(config) {
  const router = express.Router();
  router.use((req, res, next) => auth(config, req, res, next));
  router.use(requireDb);

  router.get('/moderation/scopes', async (req, res) => {
    const channelId = String(req.query.channelId || '').trim();
    const posts = await query(
      `select comment_key, channel_id, post_id, original_text, updated_at
       from posts
       where ($1 = '' or channel_id = $1)
       order by updated_at desc
       limit 30`,
      [channelId]
    );
    res.json({
      ok: true,
      runtimeVersion: config.runtimeVersion,
      channel: channelId ? { scope: 'channel', scopeId: channelId, channelId, title: 'Весь канал' } : null,
      posts: posts.rows.map((post) => ({
        scope: 'post',
        scopeId: post.comment_key,
        commentKey: post.comment_key,
        channelId: post.channel_id,
        postId: post.post_id,
        title: String(post.original_text || 'Пост без текста').replace(/\s+/g, ' ').trim().slice(0, 90),
        updatedAt: post.updated_at
      }))
    });
  });

  router.get('/moderation/settings', async (req, res) => {
    const scopeType = String(req.query.scopeType || req.query.scope || 'channel').trim() === 'post' ? 'post' : 'channel';
    const scopeId = String(req.query.scopeId || req.query.commentKey || req.query.channelId || '').trim();
    const result = await query(
      `select * from moderation_settings where scope_type=$1 and scope_id=$2`,
      [scopeType, scopeId]
    );
    res.json({ ok: true, runtimeVersion: config.runtimeVersion, settings: result.rows[0] || null });
  });

  router.post('/moderation/settings', async (req, res) => {
    const scopeType = String(req.body?.scopeType || req.body?.scope || 'channel').trim() === 'post' ? 'post' : 'channel';
    const scopeId = String(req.body?.scopeId || req.body?.commentKey || req.body?.channelId || '').trim();
    if (!scopeId) {
      res.status(400).json({ ok: false, error: 'scope_id_required' });
      return;
    }
    const channelId = String(req.body?.channelId || '').trim();
    const customBlocklist = Array.isArray(req.body?.customBlocklist) ? req.body.customBlocklist : [];
    const result = await query(
      `insert into moderation_settings(scope_type, scope_id, channel_id, enabled, preset_common, block_links, block_invites, ai_enabled, custom_blocklist, updated_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now())
       on conflict(scope_type, scope_id) do update set
         channel_id=$3,
         enabled=$4,
         preset_common=$5,
         block_links=$6,
         block_invites=$7,
         ai_enabled=$8,
         custom_blocklist=$9::jsonb,
         updated_at=now()
       returning *`,
      [
        scopeType,
        scopeId,
        channelId,
        req.body?.enabled !== false,
        req.body?.presetCommon !== false,
        Boolean(req.body?.blockLinks),
        req.body?.blockInvites !== false,
        Boolean(req.body?.aiEnabled),
        JSON.stringify(customBlocklist.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))
      ]
    );
    res.json({ ok: true, runtimeVersion: config.runtimeVersion, settings: result.rows[0] });
  });

  return router;
}

module.exports = { makeAdminRouter };
