'use strict';

const RUNTIME = 'CC6.4';
const SOURCE = 'adminkit-CC6.4-moderation-db-truth';

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}
function tokenOk(req) {
  const expected = String(process.env.DEBUG_TOKEN || process.env.GIFT_ADMIN_TOKEN || 'admin');
  return String(req.query && req.query.token || '') === expected;
}
function norm(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function isIdLike(v) { return /^-?\d+$/.test(String(v || '').trim()); }
function humanTitle(value, channelId) {
  const title = norm(value);
  const id = norm(channelId);
  return Boolean(title && title !== id && !isIdLike(title));
}
function cut(v, n = 120) {
  const s = norm(v);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function tryResolveChannelTitle(channelId) {
  const id = norm(channelId);
  if (!id) return '';
  try {
    const api = require('./services/maxApi');
    const config = require('./config');
    const chat = await api.getChat({ botToken: config.botToken, chatId: id });
    return norm(chat && (chat.title || chat.name || chat.chat && (chat.chat.title || chat.chat.name)) || '');
  } catch (error) {
    return '';
  }
}

function installDbPatches() {
  const db = require('./cc5-db-core');
  if (db.__cc64DbPatchesInstalled) return db;
  db.__cc64DbPatchesInstalled = true;

  const originalGetChannels = db.getChannels.bind(db);
  const originalUpsertPost = db.upsertPost.bind(db);

  db.getChannels = async function cc64GetChannels(adminId) {
    const rows = await originalGetChannels(adminId);
    for (const row of rows) {
      const id = norm(row.channelId);
      const title = norm(row.title);
      if (!id || humanTitle(title, id)) continue;
      const liveTitle = await tryResolveChannelTitle(id);
      if (humanTitle(liveTitle, id)) {
        try { await db.upsertChannel(adminId, id, liveTitle, { source: 'cc64_title_repair_getChannels' }); } catch {}
        row.title = liveTitle;
        row.titleRepairedBy = RUNTIME;
      }
    }
    return rows;
  };

  db.upsertPost = async function cc64UpsertPost(adminId, channelId, postId, title, raw, messageIdValue) {
    const saved = await originalUpsertPost(adminId, channelId, postId, title, raw, messageIdValue);
    const rawTitle = norm(raw && (raw.channelTitle || raw.channel_title || raw.chatTitle || raw.chat_title || raw.channelName || raw.channel_name));
    if (humanTitle(rawTitle, channelId)) {
      try { await db.upsertChannel(adminId, channelId, rawTitle, { source: 'cc64_post_raw_channel_title', raw }); } catch {}
    }
    return saved;
  };
  return db;
}

async function collectTruth(req) {
  const db = installDbPatches();
  await db.init();
  const adminFilter = norm(req.query.adminId || req.query.admin || '');
  const channelFilter = norm(req.query.channelId || req.query.channel || '');
  const limit = Math.max(1, Math.min(Number(req.query.limit || 50) || 50, 200));

  const params = [];
  let adminWhere = '';
  if (adminFilter) { params.push(adminFilter); adminWhere = ` where admin_id=$${params.length}`; }
  const adminsQ = await db.query(`select admin_id as "adminId", display_name as "displayName", updated_at as "updatedAt" from ak_admins${adminWhere} order by updated_at desc limit ${limit}`, params);

  const channelParams = [];
  const channelWhere = [];
  if (channelFilter) { channelParams.push(channelFilter); channelWhere.push(`c.channel_id=$${channelParams.length}`); }
  if (adminFilter) { channelParams.push(adminFilter); channelWhere.push(`exists(select 1 from ak_admin_channels ac where ac.channel_id=c.channel_id and ac.admin_id=$${channelParams.length})`); }
  const channelsQ = await db.query(`select c.channel_id as "channelId", coalesce(c.title,c.channel_id) as title, c.updated_at as "updatedAt" from ak_channels c ${channelWhere.length ? 'where ' + channelWhere.join(' and ') : ''} order by c.updated_at desc limit ${limit}`, channelParams);

  const postsParams = [];
  const postsWhere = [];
  if (adminFilter) { postsParams.push(adminFilter); postsWhere.push(`p.admin_id=$${postsParams.length}`); }
  if (channelFilter) { postsParams.push(channelFilter); postsWhere.push(`p.channel_id=$${postsParams.length}`); }
  const postsQ = await db.query(`select p.admin_id as "adminId", p.channel_id as "channelId", coalesce(c.title,p.channel_id) as "channelTitle", p.post_id as "postId", p.message_id as "messageId", p.comment_key as "commentKey", p.title, p.updated_at as "updatedAt" from ak_posts p left join ak_channels c on c.channel_id=p.channel_id ${postsWhere.length ? 'where ' + postsWhere.join(' and ') : ''} order by p.updated_at desc limit ${limit}`, postsParams);

  const rulesParams = [];
  const rulesWhere = [];
  if (adminFilter) { rulesParams.push(adminFilter); rulesWhere.push(`r.admin_id=$${rulesParams.length}`); }
  if (channelFilter) { rulesParams.push(channelFilter); rulesWhere.push(`r.channel_id=$${rulesParams.length}`); }
  const rulesQ = await db.query(`select r.admin_id as "adminId", r.channel_id as "channelId", coalesce(c.title,r.channel_id) as "channelTitle", r.scope_type as "scopeType", r.post_id as "postId", p.comment_key as "commentKey", p.title as "postTitle", r.enabled, r.apply_preset_common as "applyPresetCommon", r.block_links as "blockLinks", r.block_invites as "blockInvites", r.ai_enabled as "aiEnabled", r.custom_blocklist as "customBlocklist", r.updated_at as "updatedAt" from ak_moderation_rules r left join ak_channels c on c.channel_id=r.channel_id left join ak_posts p on p.admin_id=r.admin_id and p.channel_id=r.channel_id and p.post_id=r.post_id ${rulesWhere.length ? 'where ' + rulesWhere.join(' and ') : ''} order by r.updated_at desc limit ${limit}`, rulesParams);

  const anomalies = [];
  for (const ch of channelsQ.rows) {
    if (!humanTitle(ch.title, ch.channelId)) anomalies.push({ type: 'channel_title_is_id', channelId: ch.channelId, title: ch.title, fix: 'need MAX getChat title or raw channelTitle from post registration' });
  }
  const postKeySet = new Set(postsQ.rows.map(p => `${p.adminId}|${p.channelId}|${p.postId}`));
  for (const r of rulesQ.rows) {
    if (r.scopeType === 'post' && !postKeySet.has(`${r.adminId}|${r.channelId}|${r.postId}`)) anomalies.push({ type: 'post_rule_without_post_record', adminId: r.adminId, channelId: r.channelId, postId: r.postId });
    if (r.scopeType === 'post' && !r.commentKey) anomalies.push({ type: 'post_rule_missing_comment_key_join', adminId: r.adminId, channelId: r.channelId, postId: r.postId });
  }
  const servicePostRe = /модерац|выберите область|выберите пост|выберите канал|правила всего канала|главное меню|помощь по/i;
  for (const p of postsQ.rows) {
    if (servicePostRe.test(String(p.title || ''))) anomalies.push({ type: 'service_menu_saved_as_post', adminId: p.adminId, channelId: p.channelId, postId: p.postId, title: cut(p.title) });
  }

  const summary = {
    admins: adminsQ.rows.length,
    channels: channelsQ.rows.length,
    posts: postsQ.rows.length,
    rules: rulesQ.rows.length,
    channelTitleIsId: anomalies.filter(a => a.type === 'channel_title_is_id').length,
    postRules: rulesQ.rows.filter(r => r.scopeType === 'post').length,
    channelRules: rulesQ.rows.filter(r => r.scopeType === 'channel').length,
    postRulesWithoutPost: anomalies.filter(a => a.type === 'post_rule_without_post_record').length,
    servicePosts: anomalies.filter(a => a.type === 'service_menu_saved_as_post').length
  };
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    filters: { adminId: adminFilter || null, channelId: channelFilter || null, limit },
    summary,
    admins: adminsQ.rows,
    channels: channelsQ.rows,
    posts: postsQ.rows,
    rules: rulesQ.rows,
    anomalies,
    verdict: anomalies.length ? 'needs_attention' : 'db_links_and_rules_look_consistent',
    generatedAt: Date.now()
  };
}

function install(app) {
  installDbPatches();
  if (!app || app.__cc64ModerationDbTruth) return app;
  app.__cc64ModerationDbTruth = true;
  app.get('/debug/mod-db-truth', async (req, res) => {
    noCache(res);
    if (!tokenOk(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
    try { res.json(await collectTruth(req)); }
    catch (error) { res.status(500).json({ ok: false, runtimeVersion: RUNTIME, sourceMarker: SOURCE, error: error && error.message ? error.message : String(error), generatedAt: Date.now() }); }
  });
  app.get('/debug/mod-db-truth-lite', async (req, res) => {
    noCache(res);
    if (!tokenOk(req)) return res.status(403).type('text/plain').send('forbidden\n');
    try {
      const truth = await collectTruth(req);
      const lines = [
        'OK: ' + (truth.verdict === 'db_links_and_rules_look_consistent' ? 'DB_TRUTH_READY' : 'WARNING'),
        'runtime: ' + RUNTIME,
        'sourceMarker: ' + SOURCE,
        'verdict: ' + truth.verdict,
        'admins: ' + truth.summary.admins,
        'channels: ' + truth.summary.channels,
        'posts: ' + truth.summary.posts,
        'rules: ' + truth.summary.rules,
        'channelRules: ' + truth.summary.channelRules,
        'postRules: ' + truth.summary.postRules,
        'channelTitleIsId: ' + truth.summary.channelTitleIsId,
        'postRulesWithoutPost: ' + truth.summary.postRulesWithoutPost,
        'servicePosts: ' + truth.summary.servicePosts,
        'latestChannel: ' + (truth.channels[0] ? `${truth.channels[0].title} (${truth.channels[0].channelId})` : 'none'),
        'latestPost: ' + (truth.posts[0] ? `${truth.posts[0].title} / ${truth.posts[0].commentKey}` : 'none'),
        'latestRule: ' + (truth.rules[0] ? `${truth.rules[0].scopeType} / ${truth.rules[0].postId || 'channel'} / ${JSON.stringify(truth.rules[0].customBlocklist || [])}` : 'none')
      ];
      res.type('text/plain').send(lines.join('\n') + '\n');
    } catch (error) {
      res.status(500).type('text/plain').send('ERROR: ' + (error && error.message ? error.message : String(error)) + '\n');
    }
  });
  return app;
}

module.exports = { RUNTIME, SOURCE, install, installDbPatches, collectTruth };
