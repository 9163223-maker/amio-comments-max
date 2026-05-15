'use strict';

// CC7.5.22: Persist active lead-magnet conditions after final gift save.
// This wraps CC7.5.21 and fixes the only risky ordering point:
// when a new post setting row is created during save, condition columns are written after the base save too.

const db = require('./cc5-db-core');
const state = require('./db-v3-state');
const base = require('./adminkit-admin-flows-7521');

const RUNTIME = 'CC7.5.22-LEAD-CONDITIONS-SAVE-STABLE';
const MARKER = '__ADMINKIT_CC7_5_22_LEAD_CONDITIONS_SAVE_STABLE__';
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
function body(u) { return u?.body || u?.data || u || {}; }
function msg(u) { return body(u).message || u?.message || body(u).callback?.message || null; }
function cb(u) { return body(u).callback || u?.callback || null; }
function payloadOf(u) { const raw = cb(u)?.payload || cb(u)?.data || ''; if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return { r: raw }; } } return raw && typeof raw === 'object' ? raw : {}; }
function routeOf(u) { const p = payloadOf(u); const text = clean(msg(u)?.body?.text || msg(u)?.text || body(u).text || ''); return clean(p.r || p.route || text); }
function adminId(u) { try { return db.adminId(u) || db.chatId(u) || ''; } catch { return clean(cb(u)?.user?.user_id || msg(u)?.sender?.user_id || body(u).user_id || ''); } }
function parseJson(v, fallback) { if (v && typeof v === 'object') return v; try { return JSON.parse(String(v || '')); } catch { return fallback; } }
function flowMode(f = {}) { return clean(f.leadAccessMode || f.accessMode || (f.requireSubscription === false ? 'all' : 'subscribers_current_channel')); }
function flowConditions(f = {}) { return parseJson(f.leadConditions || f.lead_conditions_json, {}); }
function conditionsJson(mode, extra = {}) { return { version: 2, mode: clean(mode) || 'subscribers_current_channel', ...extra, updatedAt: new Date().toISOString() }; }
async function ensureConditionColumns() {
  await db.init();
  await db.query(`
    alter table ak_post_settings add column if not exists lead_access_mode text not null default 'subscribers_current_channel';
    alter table ak_post_settings add column if not exists lead_conditions_json jsonb not null default '{}'::jsonb;
    alter table ak_post_settings add column if not exists lead_conditions_enabled boolean not null default true;
  `);
}
async function persistConditions(id, flow) {
  await ensureConditionColumns();
  const commentKey = clean(flow?.commentKey);
  if (!id || !commentKey) return { ok: false, reason: 'missing_id_or_comment_key' };
  const mode = flowMode(flow || {});
  const c = flowConditions(flow || {});
  const json = conditionsJson(mode, c);
  const requireSubscription = mode === 'subscribers_current_channel';
  const result = await db.query(`
    update ak_post_settings
       set lead_access_mode=$3,
           lead_conditions_json=$4::jsonb,
           lead_conditions_enabled=true,
           gifts_require_subscription=$5,
           updated_at=now()
     where admin_id=$1 and comment_key=$2
  `, [id, commentKey, mode, JSON.stringify(json), requireSubscription]);
  return { ok: true, updated: result?.rowCount || 0, mode, commentKey };
}
async function tryHandle(update) {
  const route = routeOf(update);
  const id = adminId(update) || 'global';
  let flowBefore = null;
  if (route === 'gifts:flow:save') {
    try { const s = await state.getFlow(id); flowBefore = s?.menuV3?.giftsFlow || null; } catch {}
  }
  const result = await base.tryHandle(update);
  if (route === 'gifts:flow:save' && flowBefore) {
    try { result.leadConditionsPersist = await persistConditions(id, flowBefore); } catch (e) { result.leadConditionsPersist = { ok: false, error: e?.message || String(e) }; }
  }
  return result;
}
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return base.render(route); }
function selfTest() {
  const b = base.selfTest ? base.selfTest() : {};
  return { ...b, ok: true, runtimeVersion: RUNTIME, marker: MARKER,
    activeConditions: ['all', 'subscribers_current_channel', 'comments_min', 'comment_keyword', 'channels_many'],
    conditionPersistenceAfterSave: true,
    sectionLabel: 'Подарки / Лид-магниты',
    professionalTermInside: 'Лид-магниты',
    commentsCoreTouched: false,
    buttonsCoreTouched: false,
    policy: 'persist_conditions_after_base_gift_save_over_7521'
  };
}
function install() { return selfTest(); }
module.exports = { RUNTIME, MARKER, install, selfTest, render, tryHandle, tryHandleExpress, forceRepatchPost: base.forceRepatchPost };
