'use strict';

const stateManager = require('./stateManager');
const definitions = require('./flowDefinitions');

const RUNTIME = 'ADMINKIT-CORE-FLOW-ENGINE-1.2-STALE-CALLBACK-GUARD';

function adminIdOf(ctx = {}) {
  return String(ctx.adminId || ctx.admin_id || 'debug-admin');
}

function mergeDraft(oldDraft = {}, patch = {}) {
  return { ...(oldDraft || {}), ...(patch || {}) };
}

function sessionPatchFromDraft(draft = {}) {
  const patch = {};
  if (draft.channelId || draft.selected_channel_id) patch.selected_channel_id = String(draft.channelId || draft.selected_channel_id || '');
  if (draft.postId || draft.selected_post_id) patch.selected_post_id = String(draft.postId || draft.selected_post_id || '');
  if (draft.commentKey || draft.selected_comment_key) patch.selected_comment_key = String(draft.commentKey || draft.selected_comment_key || '');
  return patch;
}

function valueFromCtx(ctx = {}, key, aliases = []) {
  for (const name of [key, ...aliases]) {
    const value = ctx[name] || ctx.payload?.[name] || ctx.update?.[name] || ctx.update?.query?.[name];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

async function getCurrent(ctx = {}) {
  const adminId = adminIdOf(ctx);
  const session = await stateManager.getSession(adminId);
  if (!session?.active_flow) return { ok: false, error: 'no_active_flow', session };
  const flow = definitions.getFlow(session.active_flow);
  const step = definitions.getStep(session.active_flow, session.active_step) || definitions.firstStep(session.active_flow);
  return { ok: !!flow, flow, step, session, draft: session?.draft || {} };
}

async function start(ctx = {}, flowId, draft = {}) {
  const flow = definitions.getFlow(flowId);
  if (!flow) return { ok: false, error: 'unknown_flow', flowId };
  const step = definitions.firstStep(flowId);
  const adminId = adminIdOf(ctx);
  const nextDraft = mergeDraft(draft, {
    runtimeVersion: RUNTIME,
    startedAt: new Date().toISOString()
  });
  const session = await stateManager.upsertSession(adminId, {
    active_section: flow.section,
    active_flow: flow.id,
    active_step: step.id,
    selected_channel_id: ctx.channelId || ctx.payload?.channelId || draft.channelId || '',
    selected_post_id: ctx.postId || ctx.payload?.postId || draft.postId || '',
    selected_comment_key: ctx.commentKey || ctx.payload?.commentKey || draft.commentKey || '',
    draft: nextDraft
  });
  return { ok: true, flow, step, session, draft: nextDraft };
}

async function patchDraft(ctx = {}, patch = {}) {
  const adminId = adminIdOf(ctx);
  const session = await stateManager.getSession(adminId);
  const nextDraft = mergeDraft(session?.draft || {}, patch);
  const next = await stateManager.upsertSession(adminId, { ...sessionPatchFromDraft(nextDraft), draft: nextDraft });
  return { ok: true, session: next, draft: nextDraft };
}

async function goTo(ctx = {}, stepId, patch = {}) {
  const current = await getCurrent(ctx);
  if (!current.ok) return current;
  const step = definitions.getStep(current.flow.id, stepId);
  if (!step) return { ok: false, error: 'unknown_step', flowId: current.flow.id, stepId };
  const adminId = adminIdOf(ctx);
  const nextDraft = mergeDraft(current.draft, patch);
  const session = await stateManager.upsertSession(adminId, { active_step: step.id, ...sessionPatchFromDraft(nextDraft), draft: nextDraft });
  return { ok: true, flow: current.flow, step, session, draft: nextDraft };
}

async function next(ctx = {}, patch = {}) {
  const current = await getCurrent(ctx);
  if (!current.ok) return current;
  const step = definitions.nextStep(current.flow.id, current.step?.id);
  if (!step) return { ok: false, error: 'flow_finished', flow: current.flow, session: current.session, draft: current.draft };
  const adminId = adminIdOf(ctx);
  const nextDraft = mergeDraft(current.draft, patch);
  const session = await stateManager.upsertSession(adminId, { active_step: step.id, ...sessionPatchFromDraft(nextDraft), draft: nextDraft });
  return { ok: true, flow: current.flow, step, session, draft: nextDraft };
}

async function selectPost(ctx = {}, explicitPostId = '', patch = {}) {
  const current = await getCurrent(ctx);
  if (!current.ok) return current;

  const requestedFlowId = valueFromCtx(ctx, 'flowId', ['activeFlow', 'active_flow']);
  if (requestedFlowId && requestedFlowId !== current.flow?.id) {
    return {
      ok: false,
      error: 'stale_flow_callback',
      expectedFlow: current.flow?.id || '',
      actualFlow: requestedFlowId,
      flow: current.flow,
      step: current.step,
      draft: current.draft
    };
  }

  if (current.step?.id !== 'select_post') {
    return { ok: false, error: 'unexpected_step', expected: 'select_post', actual: current.step?.id || '', flow: current.flow, step: current.step, draft: current.draft };
  }

  const postId = String(explicitPostId || valueFromCtx(ctx, 'postId', ['selectedPostId', 'id']) || '').trim();
  if (!postId) return { ok: false, error: 'post_required', flow: current.flow, step: current.step, draft: current.draft };

  const channelId = valueFromCtx(ctx, 'channelId', ['selectedChannelId']);
  const commentKey = valueFromCtx(ctx, 'commentKey', ['selectedCommentKey']);
  const postTitle = valueFromCtx(ctx, 'postTitle', ['title']);

  return next(ctx, {
    ...patch,
    postId,
    ...(channelId ? { channelId } : {}),
    ...(commentKey ? { commentKey } : {}),
    ...(postTitle ? { postTitle } : {}),
    postSelectedAt: new Date().toISOString()
  });
}

async function cancel(ctx = {}, reason = 'cancel') {
  const adminId = adminIdOf(ctx);
  const session = await stateManager.resetSession(adminId, reason);
  return { ok: true, session };
}

function selfTest() {
  const flows = definitions.listFlows();
  return {
    ok: flows.length >= 2 && flows.every((flow) => flow.id && flow.steps?.length),
    runtimeVersion: RUNTIME,
    supports: ['start', 'next', 'goTo', 'patchDraft', 'selectPost', 'staleFlowCallbackGuard', 'cancel'],
    guards: ['flowId_payload_must_match_active_flow'],
    flows: flows.map((flow) => ({ id: flow.id, section: flow.section, steps: flow.steps.map((s) => s.id) }))
  };
}

module.exports = { RUNTIME, start, getCurrent, patchDraft, goTo, next, selectPost, cancel, selfTest };