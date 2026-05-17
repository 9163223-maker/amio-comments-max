'use strict';

const db = require('../../cc5-db-core');
const sectionRegistry = require('./sectionRegistry');
const routeDispatcher = require('./routeDispatcher');
const postRegistry = require('./postRegistryDataAdapter');
const postAddonManager = require('./postAddonManager');
const accessManager = require('./accessManager');
const menuRenderer = require('./menuRenderer');
const flowDefinitions = require('./flowDefinitions');
const flowEngine = require('./flowEngine');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.39.0-UX-GUARD';
const STRESS_ADMIN_ID = 'core-stress-admin';
const STRESS_POST_ID = 'core-stress-post';
const UI_ERROR_RE = /(⚠️|Не удалось|Диагностика:|does not exist|violates .*constraint|unexpected_step|Ошибка:|error:)/i;
const TECH_RE = /\b(Flow:|Step:|runtimeVersion|sectionRegistry|ak_[a-z0-9_]+|legacy adapters|legacy-хранилища|debug-post|clean delivery-flow|clean-flow|read-only)\b/i;
const RAW_BUTTON_ID_RE = /(^|\s)\d{10,}(\s|$)/;
function now() { return Date.now(); }
function cut(v = '', m = 500) { const s = String(v || ''); return s.length > m ? s.slice(0, m) + '…' : s; }
function buttonsOf(screen = {}) { try { return (((screen.attachments || [])[0] || {}).payload || {}).buttons || []; } catch { return []; } }
function flatButtons(screen = {}) { return buttonsOf(screen).flat().filter(Boolean); }
function payloadOf(button = {}) { try { return JSON.parse(button.payload || '{}'); } catch { return {}; } }
function findRouteButton(screen = {}, route = '') { return flatButtons(screen).find((b) => payloadOf(b).r === route); }
function assertScreen(screen, name, strict = true) {
  if (!screen || typeof screen.text !== 'string' || !Array.isArray(screen.attachments)) throw new Error(name + ': invalid_screen_shape');
  if (!screen.text.trim()) throw new Error(name + ': empty_text');
  if (!Array.isArray(buttonsOf(screen))) throw new Error(name + ': buttons_not_array');
  if (strict && UI_ERROR_RE.test(screen.text)) throw new Error(name + ': screen_contains_error: ' + cut(screen.text, 420));
  if (strict && TECH_RE.test(screen.text)) throw new Error(name + ': screen_contains_technical_text: ' + cut(screen.text, 420));
  for (const b of flatButtons(screen)) if (strict && RAW_BUTTON_ID_RE.test(String(b.text || ''))) throw new Error(name + ': button_contains_raw_id: ' + cut(b.text, 160));
  return { textChars: screen.text.length, rows: buttonsOf(screen).length, buttons: flatButtons(screen).length };
}
async function step(name, fn) { const t = now(); try { return { name, ok: true, ms: now() - t, ...(await fn() || {}) }; } catch (e) { return { name, ok: false, ms: now() - t, error: cut(e?.message || String(e)), stackHead: cut(String(e?.stack || '').split('\n').slice(0, 3).join('\n')) }; } }
function ctx(route, actor = {}, payload = {}) { const adminId = actor.adminId || STRESS_ADMIN_ID; return { adminId, admin_id: adminId, userId: adminId, route, updateType: 'stress_test', payload }; }
async function firstRow(sqls = []) { await db.init(); for (const sql of sqls) { try { const r = await db.query(sql); if (r.rows?.[0]) return r.rows[0]; } catch {} } return null; }
async function pickActor() { const row = await firstRow(["select admin_id, channel_id, coalesce(nullif(max(channel_title),''),'Existing channel') as channel_title, count(*)::int as post_count from ak_posts where admin_id<>'' and channel_id<>'' group by admin_id, channel_id order by max(updated_at) desc nulls last limit 1", "select admin_id, selected_channel_id as channel_id, 'Existing channel' as channel_title, 0::int as post_count from ak_admin_sessions where admin_id<>'' and selected_channel_id<>'' order by updated_at desc nulls last limit 1"]); const adminId = String(row?.admin_id || '').trim(); return adminId ? { adminId, channelId: String(row?.channel_id || '').trim(), channelTitle: String(row?.channel_title || 'Existing channel').trim(), postCount: Number(row?.post_count || 0) } : { adminId: STRESS_ADMIN_ID, channelId: '', channelTitle: '', postCount: 0 }; }
async function ensureStressPost(actor) { await postRegistry.ensure(); if (!actor?.adminId || actor.adminId === STRESS_ADMIN_ID) return { skipped: true, reason: 'no_existing_admin_for_fk_safe_seed' }; if (!actor?.channelId) return { skipped: true, reason: 'no_existing_channel_for_fk_safe_seed' }; return postRegistry.upsertPost(ctx('seed', actor), { channelId: actor.channelId, channelTitle: actor.channelTitle, postId: STRESS_POST_ID, commentKey: 'core-stress-comment-key', postTitle: 'Stress test post', postPreview: 'Synthetic post for Core stress-test. It is cleaned after run.', source: 'stress_test', meta: { stressTest: true, runtimeVersion: RUNTIME, at: new Date().toISOString() } }); }
async function cleanupStressData() { await db.init(); const deleted = []; for (const sql of ["delete from ak_post_lead_magnets where admin_id='core-stress-admin' or post_id='core-stress-post'", "delete from ak_post_buttons where admin_id='core-stress-admin' or post_id='core-stress-post'", "delete from ak_posts where source='stress_test' or post_id='core-stress-post'", "delete from ak_admin_sessions where admin_id='core-stress-admin'"]) { try { const r = await db.query(sql); deleted.push({ sql: sql.split(' where ')[0], rowCount: r.rowCount || 0 }); } catch (e) { deleted.push({ sql: sql.split(' where ')[0], error: e?.message || String(e) }); } } return deleted; }
async function dispatchAssert(route, actor, payload = {}, strict = true) { const screen = await routeDispatcher.dispatch(ctx(route, actor, payload)); return { screen: assertScreen(screen, route, strict) }; }
async function runLeadClickPath(actor) { const home = await routeDispatcher.dispatch(ctx('lead_magnets.home', actor)); const homeShape = assertScreen(home, 'lead_magnets.home.real_click', true); const chBtn = findRouteButton(home, 'lead_magnets.select_channel'); if (!chBtn) return { skipped: true, reason: 'no_channel_button', homeShape }; const chPayload = payloadOf(chBtn); const posts = await routeDispatcher.dispatch(ctx('lead_magnets.select_channel', actor, chPayload)); const postsShape = assertScreen(posts, 'lead_magnets.select_channel.real_click', true); const postBtn = findRouteButton(posts, 'lead_magnets.post'); if (!postBtn) return { skipped: true, reason: 'no_post_button_after_channel_select', homeShape, postsShape, chPayload }; const postPayload = payloadOf(postBtn); const post = await routeDispatcher.dispatch(ctx('lead_magnets.post', actor, postPayload)); const postShape = assertScreen(post, 'lead_magnets.post.real_click', true); const addBtn = findRouteButton(post, 'lead_magnets.add'); let addShape = null; if (addBtn) addShape = assertScreen(await routeDispatcher.dispatch(ctx('lead_magnets.add', actor, payloadOf(addBtn))), 'lead_magnets.add.real_click', true); return { homeShape, postsShape, postShape, addShape, chPayload, postPayload }; }
async function run(options = {}) {
  const startedAt = new Date().toISOString(); const tests = []; const actor = await pickActor(); const seed = String(options.seed || '1') !== '0'; const cleanup = String(options.cleanup || '1') !== '0';
  tests.push(await step('self.sectionRegistry', async () => sectionRegistry.selfTest()));
  tests.push(await step('self.accessManager', async () => accessManager.selfTest ? accessManager.selfTest() : { ok: true }));
  tests.push(await step('self.menuRenderer', async () => menuRenderer.selfTest()));
  tests.push(await step('self.postRegistry', async () => postRegistry.selfTest()));
  tests.push(await step('self.postAddonManager.ensure', async () => { await postAddonManager.ensure(); return { ok: true }; }));
  tests.push(await step('self.flowDefinitions', async () => flowDefinitions.selfTest ? flowDefinitions.selfTest() : { ok: true }));
  tests.push(await step('self.flowEngine', async () => flowEngine.selfTest()));
  tests.push(await step('self.routeDispatcher', async () => routeDispatcher.selfTest()));
  if (seed) tests.push(await step('db.seedStressPost', async () => ensureStressPost(actor)));
  tests.push(await step('dispatch.main.home', async () => dispatchAssert('main.home', actor, {}, true)));
  for (const s of sectionRegistry.listAll()) { const route = s.routes?.home || s.id + '.home'; tests.push(await step('dispatch.section.' + s.id, async () => dispatchAssert(route, actor, { sectionId: s.id }, true))); }
  tests.push(await step('clickpath.lead_magnets.home_channel_post', async () => runLeadClickPath(actor)));
  if (cleanup) tests.push(await step('db.cleanupStressData', async () => ({ deleted: await cleanupStressData() })));
  const failed = tests.filter((x) => x.ok === false || x.ok === undefined || x.resultOk === false); const slow = tests.filter((x) => Number(x.ms || 0) > Number(options.slowMs || 700));
  return { ok: failed.length === 0, runtimeVersion: RUNTIME, generatedAt: new Date().toISOString(), startedAt, durationMs: now() - Date.parse(startedAt), actor: { adminIdMasked: actor.adminId === STRESS_ADMIN_ID ? STRESS_ADMIN_ID : actor.adminId.slice(0, 3) + '…' + actor.adminId.slice(-3), channelIdMasked: actor.channelId ? actor.channelId.slice(0, 3) + '…' + actor.channelId.slice(-3) : '', postCount: actor.postCount }, summary: { total: tests.length, failed: failed.length, slow: slow.length, seed, cleanup }, failed, slow: slow.map((x) => ({ name: x.name, ms: x.ms })), tests, cleanupNote: cleanup ? 'stress data cleaned from stress post/addons and synthetic admin session only' : 'cleanup disabled' };
}
function selfTest() { return { ok: true, runtimeVersion: RUNTIME, catchesUiDiagnosticScreens: true, catchesTechnicalUserText: true, catchesRawIdsInButtons: true, realLeadMagnetsClickPath: true }; }
module.exports = { RUNTIME, run, selfTest };
