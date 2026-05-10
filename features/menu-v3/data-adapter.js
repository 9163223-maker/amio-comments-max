'use strict';

// AdminKIT V3 Data Adapter
// Safe Core Freeze: data bridge only. No boot, no express patching, no app.post, no webhook interception.

const db = require('../../cc5-db-core');

const VERSION = 'menu-v3-data-adapter-1';
const SOURCE = 'adminkit-menu-v3-data-adapter-safe-db-readonly';

function norm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function resolveAdminId(explicitAdminId) {
  const direct = norm(explicitAdminId);
  if (direct) return direct;
  const result = await db.query('select admin_id as "adminId" from ak_admins order by updated_at desc limit 1');
  return norm(result.rows && result.rows[0] && result.rows[0].adminId);
}

async function resolveChannel(adminId, explicitChannelId) {
  const direct = norm(explicitChannelId);
  if (direct) {
    const rows = await db.getChannels(adminId);
    return rows.find((row) => norm(row.channelId) === direct) || { channelId: direct, title: direct };
  }
  const rows = await db.getChannels(adminId);
  return rows[0] || null;
}

async function getPostContext(options = {}) {
  await db.init();
  const adminId = await resolveAdminId(options.adminId);
  if (!adminId) return { ok: false, reason: 'admin_not_found', posts: [] };
  const channel = await resolveChannel(adminId, options.channelId);
  if (!channel || !channel.channelId) return { ok: false, reason: 'channel_not_found', adminId, posts: [] };
  const posts = await db.getPosts(adminId, channel.channelId, options.limit || 20);
  return {
    ok: true,
    version: VERSION,
    sourceMarker: SOURCE,
    adminId,
    channelId: channel.channelId,
    channelTitle: channel.title || channel.channelId,
    posts: posts.map((post) => ({
      postId: post.postId,
      commentKey: post.commentKey,
      title: post.title || post.postId,
      messageId: post.messageId || '',
      updatedAt: post.updatedAt || '',
    })),
  };
}

async function selfTest(options = {}) {
  try {
    const context = await getPostContext(options);
    return {
      ok: Boolean(context.ok),
      version: VERSION,
      sourceMarker: SOURCE,
      safeCoreFreeze: true,
      touchesBoot: false,
      patchesExpress: false,
      patchesModuleLoad: false,
      patchesAppPost: false,
      touchesDebugStore: false,
      touchesDebugPing: false,
      attachedToWebhook: false,
      adminId: context.adminId || '',
      channelId: context.channelId || '',
      channelTitle: context.channelTitle || '',
      postsFound: Array.isArray(context.posts) ? context.posts.length : 0,
      reason: context.reason || '',
    };
  } catch (error) {
    return {
      ok: false,
      version: VERSION,
      sourceMarker: SOURCE,
      safeCoreFreeze: true,
      touchesBoot: false,
      patchesExpress: false,
      patchesModuleLoad: false,
      patchesAppPost: false,
      touchesDebugStore: false,
      touchesDebugPing: false,
      attachedToWebhook: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

module.exports = { VERSION, SOURCE, getPostContext, selfTest };
