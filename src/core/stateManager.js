'use strict';

const db = require('../../cc5-db-core');
const { RUNTIME } = require('../../adminkit-core-runtime');

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
  await db.query("insert into ak_admin_sessions(admin_id, account_id, active_section, active_flow, active_step, selected_channel_id, selected_post_id, selected_comment_key, draft, active_message_id, garbage_message_ids, updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,now()) on conflict(admin_id) do update set account_id=excluded.account_id, active_section=excluded.active_section, active_flow=excluded.active_flow, active_step=excluded.active_step, selected_channel_id=excluded.selected_channel_id, selected_post_id=excluded.selected_post_id, selected_comment_key=excluded.selected_comment_key, draft=excluded.draft, active_message_id=excluded.active_message_id, garbage_message_ids=excluded.garbage_message_ids, updated_at=now()", [String(adminId || ''), String(next.account_id || next.accountId || ''), String(next.active_section || next.activeSection || ''), String(next.active_flow || next.activeFlow || ''), String(next.active_step || next.activeStep || ''), String(next.selected_channel_id || next.selectedChannelId || ''), String(next.selected_post_id || next.selectedPostId || ''), String(next.selected_comment_key || next.selectedCommentKey || ''), JSON.stringify(next.draft || {}), String(next.active_message_id || next.activeMessageId || ''), JSON.stringify(Array.isArray(next.garbage_message_ids) ? next.garbage_message_ids : (next.garbageMessageIds || []))]);
  return getSession(adminId);
}

async function resetSession(adminId, reason = 'reset') {
  await upsertSession(adminId, { active_section: '', active_flow: '', active_step: '', selected_channel_id: '', selected_post_id: '', selected_comment_key: '', draft: { resetReason: reason, runtimeVersion: RUNTIME }, garbage_message_ids: [] });
  return getSession(adminId);
}

async function setActiveScreen(adminId, messageId) {
  const session = await getSession(adminId);
  const garbage = [];
  if (session && session.active_message_id && session.active_message_id !== String(messageId || '')) garbage.push(session.active_message_id);
  return upsertSession(adminId, { active_message_id: String(messageId || ''), garbage_message_ids: garbage });
}

module.exports = { ensure, getSession, upsertSession, resetSession, setActiveScreen };
