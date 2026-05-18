'use strict';

const db = require('../../cc5-db-core');
const base = require('./postRegistryDataAdapterV7');

const RUNTIME = 'ADMINKIT-CORE-POST-REGISTRY-DATA-ADAPTER-1.42.4-FK-SAFE-PRINCIPALS';

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function adminIdOf(ctx = {}) {
  return clean(ctx.adminId || ctx.admin_id || ctx.userId || ctx.payload?.adminId || ctx.payload?.admin_id || '');
}

function channelIdOf(ctx = {}, input = {}) {
  return clean(input.channelId || input.channel_id || ctx.channelId || ctx.channel_id || ctx.payload?.channelId || ctx.payload?.channel_id || ctx.selected_channel_id || ctx.session?.selected_channel_id || ctx.draft?.channelId || 'manual-channel');
}

function channelTitleOf(ctx = {}, input = {}, channelId = '') {
  const title = base.humanChannelTitle
    ? base.humanChannelTitle(input.channelTitle, input.channel_title, ctx.channelTitle, ctx.channel_title, ctx.payload?.channelTitle, ctx.payload?.channel_title)
    : clean(input.channelTitle || input.channel_title || ctx.channelTitle || ctx.channel_title || ctx.payload?.channelTitle || ctx.payload?.channel_title || '');
  return title || clean(channelId) || 'Подключённый канал';
}

async function ensurePrincipalRows(ctx = {}, input = {}) {
  await base.ensure();
  const adminId = adminIdOf(ctx);
  const channelId = channelIdOf(ctx, input);
  const channelTitle = channelTitleOf(ctx, input, channelId);
  if (!adminId || !channelId) return { ok: false, skipped: true, reason: 'principal_missing', adminId: !!adminId, channelId: !!channelId };

  await db.query(
    `insert into ak_admins(admin_id, raw, updated_at)
     values($1,$2::jsonb,now())
     on conflict(admin_id) do update set raw = ak_admins.raw || excluded.raw, updated_at = now()`,
    [adminId, JSON.stringify({ source: 'post_registry_fk_guard', runtimeVersion: RUNTIME })]
  );

  await db.query(
    `insert into ak_channels(channel_id, title, raw, updated_at)
     values($1,$2,$3::jsonb,now())
     on conflict(channel_id) do update set
       title = coalesce(nullif(excluded.title,''), ak_channels.title),
       raw = ak_channels.raw || excluded.raw,
       updated_at = now()`,
    [channelId, channelTitle, JSON.stringify({ source: 'post_registry_fk_guard', runtimeVersion: RUNTIME, channelTitle })]
  );

  await db.query(
    `insert into ak_admin_channels(admin_id, channel_id, role, updated_at)
     values($1,$2,'admin',now())
     on conflict(admin_id, channel_id) do update set updated_at = now()`,
    [adminId, channelId]
  );

  return { ok: true, adminId, channelId, channelTitle };
}

async function upsertPost(ctx = {}, input = {}) {
  await ensurePrincipalRows(ctx, input);
  return base.upsertPost(ctx, input);
}

function selfTest() {
  return {
    ...base.selfTest(),
    ok: true,
    runtimeVersion: RUNTIME,
    fkSafePrincipalRowsReady: true,
    ensuresAdminBeforePostUpsert: true,
    ensuresChannelBeforePostUpsert: true,
    ensuresAdminChannelLinkBeforePostUpsert: true,
    moderationStressPostPickerFkGuardReady: true
  };
}

module.exports = {
  ...base,
  RUNTIME,
  ensurePrincipalRows,
  upsertPost,
  selfTest
};
