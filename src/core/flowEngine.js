'use strict';

const stateManager = require('./stateManager');
const definitions = require('./flowDefinitions');
const conditionCatalog = require('./leadMagnetConditionCatalog');

const RUNTIME = 'ADMINKIT-CORE-FLOW-ENGINE-1.9-POST-CAPTURE-CONDITIONS';

function adminIdOf(ctx = {}) { return String(ctx.adminId || ctx.admin_id || 'debug-admin'); }
function cleanValue(value) { const raw = String(value ?? '').trim(); if (!raw) return ''; try { return decodeURIComponent(raw.replace(/\+/g, ' ')).trim(); } catch { return raw.replace(/\+/g, ' ').trim(); } }
function cut(value = '', max = 120) { const s = cleanValue(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function normalizeUrl(value) { const raw = cleanValue(value); if (!raw) return ''; if (/^https?:\/\//i.test(raw)) return raw; if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) return `https://${raw}`; return raw; }
function isValidHttpUrl(value) { const raw = normalizeUrl(value); try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && url.hostname.includes('.'); } catch { return false; } }
function mergeDraft(oldDraft = {}, patch = {}) { return { ...(oldDraft || {}), ...(patch || {}) }; }
function sessionPatchFromDraft(draft = {}) { const patch = {}; if (draft.channelId || draft.selected_channel_id) patch.selected_channel_id = String(draft.channelId || draft.selected_channel_id || ''); if (draft.postId || draft.selected_post_id) patch.selected_post_id = String(draft.postId || draft.selected_post_id || ''); if (draft.commentKey || draft.selected_comment_key) patch.selected_comment_key = String(draft.commentKey || draft.selected_comment_key || ''); return patch; }
function valueFromCtx(ctx = {}, key, aliases = []) { for (const name of [key, ...aliases]) { const value = ctx[name] || ctx.payload?.[name] || ctx.update?.[name] || ctx.update?.query?.[name] || ctx.update?.body?.[name]; const cleaned = cleanValue(value); if (cleaned) return cleaned; } return ''; }
function textInputFromCtx(ctx = {}) { return cleanValue(ctx.text || ctx.messageText || ctx.inputText || ctx.payload?.text || ctx.update?.text || ctx.update?.query?.text || ctx.update?.body?.text || ctx.update?.message?.text || ''); }

async function getCurrent(ctx = {}) { const adminId = adminIdOf(ctx); const session = await stateManager.getSession(adminId); if (!session?.active_flow) return { ok: false, error: 'no_active_flow', session }; const flow = definitions.getFlow(session.active_flow); const step = definitions.getStep(session.active_flow, session.active_step) || definitions.firstStep(session.active_flow); return { ok: !!flow, flow, step, session, draft: session?.draft || {} }; }
async function start(ctx = {}, flowId, draft = {}) { const flow = definitions.getFlow(flowId); if (!flow) return { ok: false, error: 'unknown_flow', flowId }; const step = definitions.firstStep(flowId); const adminId = adminIdOf(ctx); const nextDraft = mergeDraft(draft, { runtimeVersion: RUNTIME, startedAt: new Date().toISOString() }); const session = await stateManager.upsertSession(adminId, { active_section: flow.section, active_flow: flow.id, active_step: step.id, selected_channel_id: ctx.channelId || ctx.payload?.channelId || draft.channelId || '', selected_post_id: ctx.postId || ctx.payload?.postId || draft.postId || '', selected_comment_key: ctx.commentKey || ctx.payload?.commentKey || draft.commentKey || '', draft: nextDraft }); return { ok: true, flow, step, session, draft: nextDraft }; }
async function patchDraft(ctx = {}, patch = {}) { const adminId = adminIdOf(ctx); const session = await stateManager.getSession(adminId); const nextDraft = mergeDraft(session?.draft || {}, patch); const next = await stateManager.upsertSession(adminId, { ...sessionPatchFromDraft(nextDraft), draft: nextDraft }); return { ok: true, session: next, draft: nextDraft }; }
async function goTo(ctx = {}, stepId, patch = {}) { const current = await getCurrent(ctx); if (!current.ok) return current; const step = definitions.getStep(current.flow.id, stepId); if (!step) return { ok: false, error: 'unknown_step', flowId: current.flow.id, stepId }; const adminId = adminIdOf(ctx); const nextDraft = mergeDraft(current.draft, patch); const session = await stateManager.upsertSession(adminId, { active_step: step.id, ...sessionPatchFromDraft(nextDraft), draft: nextDraft }); return { ok: true, flow: current.flow, step, session, draft: nextDraft }; }
async function next(ctx = {}, patch = {}) { const current = await getCurrent(ctx); if (!current.ok) return current; const step = definitions.nextStep(current.flow.id, current.step?.id); if (!step) return { ok: false, error: 'flow_finished', flow: current.flow, session: current.session, draft: current.draft }; const adminId = adminIdOf(ctx); const nextDraft = mergeDraft(current.draft, patch); const session = await stateManager.upsertSession(adminId, { active_step: step.id, ...sessionPatchFromDraft(nextDraft), draft: nextDraft }); return { ok: true, flow: current.flow, step, session, draft: nextDraft }; }

async function selectPost(ctx = {}, explicitPostId = '', patch = {}) {
  const current = await getCurrent(ctx); if (!current.ok) return current;
  const requestedFlowId = valueFromCtx(ctx, 'flowId', ['activeFlow', 'active_flow']);
  if (requestedFlowId && requestedFlowId !== current.flow?.id) return { ok: false, error: 'stale_flow_callback', expectedFlow: current.flow?.id || '', actualFlow: requestedFlowId, flow: current.flow, step: current.step, draft: current.draft };
  if (current.step?.id !== 'select_post') return { ok: false, error: 'unexpected_step', expected: 'select_post', actual: current.step?.id || '', flow: current.flow, step: current.step, draft: current.draft };
  const postId = String(explicitPostId || valueFromCtx(ctx, 'postId', ['selectedPostId', 'id']) || '').trim(); if (!postId) return { ok: false, error: 'post_required', flow: current.flow, step: current.step, draft: current.draft };
  const channelId = valueFromCtx(ctx, 'channelId', ['selectedChannelId']); const commentKey = valueFromCtx(ctx, 'commentKey', ['selectedCommentKey']); const postTitle = valueFromCtx(ctx, 'postTitle', ['title', 'postPreview', 'displayTitle']); const channelTitle = valueFromCtx(ctx, 'channelTitle', ['channelName', 'channelDisplayName']);
  return next(ctx, { ...patch, postId, ...(channelId ? { channelId } : {}), ...(channelTitle ? { channelTitle } : {}), ...(commentKey ? { commentKey } : {}), ...(postTitle ? { postTitle } : {}), postSelectedAt: new Date().toISOString(), postSource: patch.postSource || 'registry_or_debug' });
}

async function capturePost(ctx = {}) {
  const current = await getCurrent(ctx); if (!current.ok) return current;
  const requestedFlowId = valueFromCtx(ctx, 'flowId', ['activeFlow', 'active_flow']);
  if (requestedFlowId && requestedFlowId !== current.flow?.id) return { ok: false, error: 'stale_flow_callback', expectedFlow: current.flow?.id || '', actualFlow: requestedFlowId, flow: current.flow, step: current.step, draft: current.draft };
  if (current.step?.id !== 'select_post') return { ok: false, error: 'unexpected_step', expected: 'select_post', actual: current.step?.id || '', flow: current.flow, step: current.step, draft: current.draft };
  const mode = valueFromCtx(ctx, 'captureMode', ['mode']) || 'forwarded_post';
  const label = mode === 'legacy_or_old_post' ? 'найти старый пост / переслать старый пост' : 'переслать пост из канала';
  return patchDraft(ctx, { captureMode: mode, captureModeLabel: label, postCaptureRequestedAt: new Date().toISOString(), postCaptureInstruction: 'Администратор должен переслать пост из канала; следующий clean adapter распознает payload и запишет post registry.' });
}

async function selectAccess(ctx = {}) {
  const current = await getCurrent(ctx); if (!current.ok) return current;
  const requestedFlowId = valueFromCtx(ctx, 'flowId', ['activeFlow', 'active_flow']);
  if (requestedFlowId && requestedFlowId !== current.flow?.id) return { ok: false, error: 'stale_flow_callback', expectedFlow: current.flow?.id || '', actualFlow: requestedFlowId, flow: current.flow, step: current.step, draft: current.draft };
  if (current.flow?.id !== 'lead_magnets.create' || current.step?.id !== 'select_access') return { ok: false, error: 'unexpected_step', expected: 'lead_magnets.create/select_access', actual: `${current.flow?.id || ''}/${current.step?.id || ''}`, flow: current.flow, step: current.step, draft: current.draft };
  const conditionId = valueFromCtx(ctx, 'conditionId', ['condition']);
  const accessMode = valueFromCtx(ctx, 'accessMode', ['mode']) || 'subscribers_current_channel';
  const verifier = valueFromCtx(ctx, 'verifier', ['conditionVerifier']);
  const catalogCondition = conditionCatalog.toCondition({ conditionId, accessMode, mode: accessMode, params: {} });
  const accessLabel = valueFromCtx(ctx, 'accessLabel', ['label']) || catalogCondition.title || accessMode;
  return next(ctx, { accessMode: catalogCondition.mode, accessLabel, conditionId: catalogCondition.id, conditionVerifier: verifier || catalogCondition.verifier, conditions: catalogCondition, accessSelectedAt: new Date().toISOString() });
}

function titlePatchForFlow(flowId, text) { if (flowId === 'buttons.create') return { title: text, buttonTitle: text, titleInputAt: new Date().toISOString() }; if (flowId === 'lead_magnets.create') return { title: text, leadMagnetTitle: text, titleInputAt: new Date().toISOString() }; return { title: text, titleInputAt: new Date().toISOString() }; }
function urlPatchForFlow(flowId, url) { if (flowId === 'buttons.create') return { buttonUrl: url, url: url, urlInputAt: new Date().toISOString() }; return { url: url, urlInputAt: new Date().toISOString() }; }
function materialPatchForFlow(flowId, text) { const normalized = normalizeUrl(text); const isUrl = isValidHttpUrl(normalized); return { materialType: isUrl ? 'url' : 'text', material: isUrl ? normalized : text, materialPreview: isUrl ? `ссылка: ${cut(normalized, 90)}` : `текст: ${cut(text, 90)}`, materialInputAt: new Date().toISOString() }; }

async function acceptInput(ctx = {}, explicitText = '') {
  const current = await getCurrent(ctx); if (!current.ok) return current;
  const text = cleanValue(explicitText || textInputFromCtx(ctx)); if (!text) return { ok: false, error: 'text_required', flow: current.flow, step: current.step, draft: current.draft };
  if (current.step?.id === 'input_title') { if (text.length > 64) return { ok: false, error: 'text_too_long', limit: 64, flow: current.flow, step: current.step, draft: current.draft }; return next(ctx, titlePatchForFlow(current.flow.id, text)); }
  if (current.step?.id === 'input_url') { if (current.flow.id !== 'buttons.create') return { ok: false, error: 'url_step_not_supported_for_flow', flow: current.flow, step: current.step, draft: current.draft }; const url = normalizeUrl(text); if (!isValidHttpUrl(url)) return { ok: false, error: 'url_invalid', flow: current.flow, step: current.step, draft: current.draft }; if (url.length > 500) return { ok: false, error: 'url_too_long', limit: 500, flow: current.flow, step: current.step, draft: current.draft }; return next(ctx, urlPatchForFlow(current.flow.id, url)); }
  if (current.step?.id === 'input_material') { if (current.flow.id !== 'lead_magnets.create') return { ok: false, error: 'material_step_not_supported_for_flow', flow: current.flow, step: current.step, draft: current.draft }; if (text.length > 2000) return { ok: false, error: 'material_too_long', limit: 2000, flow: current.flow, step: current.step, draft: current.draft }; return next(ctx, materialPatchForFlow(current.flow.id, text)); }
  return { ok: false, error: 'unexpected_input_step', expected: 'input_title_input_url_or_input_material', actual: current.step?.id || '', flow: current.flow, step: current.step, draft: current.draft };
}

async function cancel(ctx = {}, reason = 'cancel') { const adminId = adminIdOf(ctx); const session = await stateManager.resetSession(adminId, reason); return { ok: true, session }; }

function selfTest() { const flows = definitions.listFlows(); const catalog = conditionCatalog.selfTest(); return { ok: flows.length >= 2 && flows.every((flow) => flow.id && flow.steps?.length) && isValidHttpUrl('example.com') && catalog.ok === true, runtimeVersion: RUNTIME, supports: ['start', 'next', 'goTo', 'patchDraft', 'selectPost', 'capturePost', 'selectAccess', 'acceptInput', 'titleInput', 'urlInput', 'materialInput', 'staleFlowCallbackGuard', 'humanPostTitle', 'humanChannelTitle', 'cancel'], guards: ['flowId_payload_must_match_active_flow', 'title_required', 'title_max_64', 'url_required', 'url_must_be_http_or_https', 'url_max_500', 'material_required', 'material_max_2000', 'explicit_text_preferred_over_route'], postCaptureFlowReady: true, leadConditionCatalogReady: true, leadConditionCount: catalog.count, leadMagnetMaterialInputReady: true, leadMagnetAccessSelectReady: true, flows: flows.map((flow) => ({ id: flow.id, section: flow.section, steps: flow.steps.map((s) => s.id) })) }; }

module.exports = { RUNTIME, start, getCurrent, patchDraft, goTo, next, selectPost, capturePost, selectAccess, acceptInput, cancel, selfTest, cleanValue, textInputFromCtx, normalizeUrl, isValidHttpUrl };
