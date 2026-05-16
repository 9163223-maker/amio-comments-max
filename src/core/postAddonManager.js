'use strict';

const accessManager = require('./accessManager');

function memoryStore(ctx = {}) {
  if (!ctx.__adminkitMemory) ctx.__adminkitMemory = { buttons: new Map(), leadMagnets: new Map() };
  return ctx.__adminkitMemory;
}

function postKey(ctx = {}) {
  return String(ctx.postId || ctx.payload?.postId || ctx.post?.id || 'debug-post');
}

async function listButtons(ctx = {}) {
  const key = postKey(ctx);
  const data = memoryStore(ctx).buttons.get(key) || [];
  return data.slice();
}

async function listLeadMagnets(ctx = {}) {
  const key = postKey(ctx);
  const data = memoryStore(ctx).leadMagnets.get(key) || [];
  return data.slice();
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
  return { postKey: postKey(ctx), buttons, leadMagnets, limits: planLimits };
}

module.exports = { postKey, listButtons, listLeadMagnets, limits, summarizePostAddons };
