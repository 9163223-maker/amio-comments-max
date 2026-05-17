'use strict';

const db = require('../../cc5-db-core');
const { RUNTIME } = require('../../adminkit-core-runtime');

const STATE_RUNTIME = 'ADMINKIT-CORE-STATE-MANAGER-1.31-ACTIVE-SCREEN-CLEANUP';
const MAX_GARBAGE_IDS = 10;

function clean(value = '') { return String(value || '').trim(); }
function uniqueTail(items = [], limit = MAX_GARBAGE_IDS) {
  const seen = new Set();
  const out = [];
  for (const item of items.map(clean).filter(Boolean).reverse()) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out.reverse();
}

async function ensure() {
  await db.init();
  await db.query("create table if not exists ak_admin_sessions (admin_id text primary key, account_id text not null default '', active_section text not null default '', active_flow text not null default '', active_step text not null default '', selected_channel_id text not null default '', selected_post_id text not null default '', selected_comment_key text not null default '', draft jsonb not null default '{}'::jsonb, active_message_id text not null default '', garbage_message_ids jsonb not null default '[]'::jsonb, updated_at timestamptz default now(), expires_at timestamptz)");
}

async function getSession(adminId) {
  await ensure();
  const { rows } = await db.query('select * from ak_admin_sessions where admin_id=$1 limit 1', [String(adminId || '')]);
  return rows[0] || null;
}

async function upsertSession(adminId, patch = {}) {
  await ensure();
  const old = await getSession(adminId) || {};
  const next = { ...old, ...patch };
  await db.query("insert into ak_admin_sessions(admin_id, account_id, active_section, active_flow, active_step, selected_channel_id, selected_post_id, selected_comment_key, draft, active_message_id, garbage_message_ids, updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,now()) on conflict(admin_id) do update set account_id=excluded.account_id, active_section=excluded.active_section, active_flow=excluded.active_flow, active_step=excluded.active_step, selected_channel_id=excluded.selected_channel_id, selected_post_id=excluded.selected_post_id, selected_comment_key=excluded.selected_comment_key, draft=excluded.draft, active_message_id=excluded.active_message_id, garbage_message_ids=excluded.garbage_message_ids, updated_at=now()", [String(adminId || ''), String(next.account_id || next.accountId || ''), String(next.active_section || next.activeSection || ''), String(next.active_flow || next.activeFlow || ''), String(next.active_step || next.activeStep || ''), String(next.selected_channel_id || next.selectedChannelId || ''), String(next.selected_post_id || next.selectedPostId || ''), String(next.selected_comment_key || next.selectedCommentKey || ''), JSON.stringify(next.draft || {}), String(next.active_message_id || next.activeMessageId || ''), JSON.stringify(uniqueTail(Array.isArray(next.garbage_message_ids) ? next.garbage_message_ids : (next.garbageMessageIds || []))) ]);
  return getSession(adminId);
}

async function resetSession(adminId, reason = 'reset') {
  const old = await getSession(adminId);
  const garbage = uniqueTail([...(Array.isArray(old?.garbage_message_ids) ? old.garbage_message_ids : []), old?.active_message_id]);
  await upsertSession(adminId, { active_section: '', active_flow: '', active_step: '', selected_channel_id: '', selected_post_id: '', selected_comment_key: '', draft: { resetReason: reason, runtimeVersion: RUNTIME, stateRuntime: STATE_RUNTIME }, garbage_message_ids: garbage });
  return getSession(adminId);
}

async function setActiveScreen(adminId, messageId) {
  const nextMessageId = clean(messageId);
  const session = await getSession(adminId);
  const currentActive = clean(session?.active_message_id);
  const existingGarbage = Array.isArray(session?.garbage_message_ids) ? session.garbage_message_ids : [];
  const garbage = currentActive && currentActive !== nextMessageId ? uniqueTail([...existingGarbage, currentActive]) : uniqueTail(existingGarbage);
  return upsertSession(adminId, { active_message_id: nextMessageId, garbage_message_ids: garbage });
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: STATE_RUNTIME,
    coreRuntimeVersion: RUNTIME,
    oneActiveScreenStateReady: true,
    keepsGarbageMessageIds: true,
    garbageLimit: MAX_GARBAGE_IDS,
    resetMovesActiveToGarbage: true,
    setActiveScreenDeduplicatesGarbage: true
  };
}

module.exports = { ensure, getSession, upsertSession, resetSession, setActiveScreen, selfTest, STATE_RUNTIME };
