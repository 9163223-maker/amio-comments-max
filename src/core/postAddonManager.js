'use strict';

const db = require('../../cc5-db-core');
const accessManager = require('./accessManager');
const dataSafety = require('./dataSafety');

async function ensure() {
  return dataSafety.ensureCoreStorage();
}

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function postKey(ctx = {}) {
  return String(ctx.postId || ctx.payload?.postId || ctx.selected_post_id || ctx.session?.selected_post_id || ctx.post?.id || 'debug-post');
}

function channelKey(ctx = {}) {
  return String(ctx.channelId || ctx.payload?.channelId || ctx.selected_channel_id || ctx.session?.selected_channel_id || ctx.channel?.id || '');
}

function adminKey(ctx = {}) {
  return String(ctx.adminId || ctx.admin_id || '');
}

function humanPostTitle(ctx = {}) {
  return clean(ctx.postTitle || ctx.payload?.postTitle || ctx.session?.draft?.postTitle || ctx.draft?.postTitle || ctx.post?.title || '');
}

function humanChannelTitle(ctx = {}) {
  return clean(ctx.channelTitle || ctx.payload?.channelTitle || ctx.session?.draft?.channelTitle || ctx.draft?.channelTitle || ctx.channel?.title || '');
}

async function listButtons(ctx = {}) {
  await ensure();
  const { rows } = await db.query('select id, title, url, sort_order, is_enabled, meta from ak_post_buttons where post_id=$1 and is_enabled=true order by sort_order asc, id asc', [postKey(ctx)]);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    text: row.title,
    url: row.url,
    sortOrder: row.sort_order,
    isEnabled: row.is_enabled,
    meta: row.meta || {}
  }));
}

async function listLeadMagnets(ctx = {}) {
  await ensure();
  const { rows } = await db.query('select id, title, material_type, material_text, material_url, file_id, file_name, access_mode, conditions, sort_order, is_enabled, meta from ak_post_lead_magnets where post_id=$1 and is_enabled=true order by sort_order asc, id asc', [postKey(ctx)]);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    name: row.title,
    type: row.material_type,
    text: row.material_text,
    url: row.material_url,
    fileId: row.file_id,
    fileName: row.file_name,
    accessMode: row.access_mode,
    conditions: row.conditions || {},
    sortOrder: row.sort_order,
    isEnabled: row.is_enabled,
    meta: row.meta || {}
  }));
}

async function limits(ctx = {}) {
  const btn = await accessManager.can(ctx, 'buttons.max_per_post');
  const lead = await accessManager.can(ctx, 'lead_magnets.max_per_post');
  return {
    planCode: btn.plan || lead.plan,
    buttonsMaxPerPost: typeof btn.value === 'number' ? btn.value : 1,
    leadMagnetsMaxPerPost: typeof lead.value === 'number' ? lead.value : 1
  };
}

async function summarizePostAddons(ctx = {}) {
  const [buttons, leadMagnets, planLimits] = await Promise.all([
    listButtons(ctx),
    listLeadMagnets(ctx),
    limits(ctx)
  ]);
  return { postKey: postKey(ctx), channelKey: channelKey(ctx), adminKey: adminKey(ctx), buttons, leadMagnets, limits: planLimits };
}

async function addButton(ctx = {}, input = {}) {
  await ensure();
  const summary = await summarizePostAddons(ctx);
  if (summary.buttons.length >= summary.limits.buttonsMaxPerPost) return { ok: false, error: 'button_limit_reached', limit: summary.limits.buttonsMaxPerPost };
  const title = String(input.title || input.text || '').trim();
  const url = String(input.url || '').trim();
  if (!title || !url) return { ok: false, error: 'title_and_url_required' };
  const meta = {
    ...(input.meta || {}),
    ...(humanPostTitle(ctx) ? { postTitle: humanPostTitle(ctx) } : {}),
    ...(humanChannelTitle(ctx) ? { channelTitle: humanChannelTitle(ctx) } : {})
  };
  const { rows } = await dataSafety.safeQuery('insert into ak_post_buttons(admin_id, channel_id, post_id, title, url, sort_order, meta) values($1,$2,$3,$4,$5,$6,$7::jsonb) returning id, title, url, post_id, channel_id, meta', [adminKey(ctx), channelKey(ctx), postKey(ctx), title, url, summary.buttons.length + 1, JSON.stringify(meta)]);
  return { ok: true, button: rows[0], postId: postKey(ctx), channelId: channelKey(ctx), postTitle: humanPostTitle(ctx), channelTitle: humanChannelTitle(ctx) };
}

async function disableButton(ctx = {}, id) {
  await ensure();
  const { rows } = await dataSafety.safeQuery('update ak_post_buttons set is_enabled=false, updated_at=now() where id=$1 and post_id=$2 returning id, title', [id, postKey(ctx)]);
  return rows[0] ? { ok: true, button: rows[0] } : { ok: false, error: 'button_not_found' };
}

async function addLeadMagnet(ctx = {}, input = {}) {
  await ensure();
  const summary = await summarizePostAddons(ctx);
  if (summary.leadMagnets.length >= summary.limits.leadMagnetsMaxPerPost) return { ok: false, error: 'lead_magnet_limit_reached', limit: summary.limits.leadMagnetsMaxPerPost };
  const title = String(input.title || input.name || '').trim();
  const materialType = String(input.materialType || input.type || 'text').trim() || 'text';
  const materialText = String(input.text || input.materialText || '').trim();
  const materialUrl = String(input.url || input.materialUrl || '').trim();
  const accessMode = String(input.accessMode || 'subscribers_current_channel').trim();
  if (!title) return { ok: false, error: 'title_required' };
  if (!materialText && !materialUrl && !input.fileId) return { ok: false, error: 'material_required' };
  const meta = {
    ...(input.meta || {}),
    ...(humanPostTitle(ctx) ? { postTitle: humanPostTitle(ctx) } : {}),
    ...(humanChannelTitle(ctx) ? { channelTitle: humanChannelTitle(ctx) } : {})
  };
  const { rows } = await dataSafety.safeQuery('insert into ak_post_lead_magnets(admin_id, channel_id, post_id, title, material_type, material_text, material_url, file_id, file_name, access_mode, conditions, sort_order, meta) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb) returning id, title, material_type, material_url', [adminKey(ctx), channelKey(ctx), postKey(ctx), title, materialType, materialText, materialUrl, String(input.fileId || ''), String(input.fileName || ''), accessMode, JSON.stringify(input.conditions || {}), summary.leadMagnets.length + 1, JSON.stringify(meta)]);
  return { ok: true, leadMagnet: rows[0] };
}

async function disableLeadMagnet(ctx = {}, id) {
  await ensure();
  const { rows } = await dataSafety.safeQuery('update ak_post_lead_magnets set is_enabled=false, updated_at=now() where id=$1 and post_id=$2 returning id, title', [id, postKey(ctx)]);
  return rows[0] ? { ok: true, leadMagnet: rows[0] } : { ok: false, error: 'lead_magnet_not_found' };
}

module.exports = { ensure, postKey, channelKey, adminKey, humanPostTitle, humanChannelTitle, listButtons, listLeadMagnets, limits, summarizePostAddons, addButton, disableButton, addLeadMagnet, disableLeadMagnet };