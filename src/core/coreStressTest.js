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

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.38.3';

function now() { return Date.now(); }
function cut(value = '', max = 500) { const s = String(value || ''); return s.length > max ? `${s.slice(0, max)}…` : s; }
function hasScreen(screen) { return !!screen && typeof screen.text === 'string' && Array.isArray(screen.attachments); }
function buttonsOf(screen = {}) {
  try { return (((screen.attachments || [])[0] || {}).payload || {}).buttons || []; }
  catch { return []; }
}
function flatButtons(screen = {}) { return buttonsOf(screen).flat().filter(Boolean); }
function assertScreen(screen, name) {
  if (!hasScreen(screen)) throw new Error(`${name}: invalid_screen_shape`);
  if (!String(screen.text || '').trim()) throw new Error(`${name}: empty_text`);
  const buttons = buttonsOf(screen);
  if (!Array.isArray(buttons)) throw new Error(`${name}: buttons_not_array`);
  return { textChars: String(screen.text || '').length, rows: buttons.length, buttons: flatButtons(screen).length };
}
async function step(name, fn) {
  const started = now();
  try {
    const result = await fn();
    return { name, ok: true, ms: now() - started, ...(result || {}) };
  } catch (error) {
    return { name, ok: false, ms: now() - started, error: cut(error?.message || String(error)), stackHead: cut(String(error?.stack || '').split('\n').slice(0, 3).join('\n'), 600) };
  }
}
function stressCtx(extra = {}) {
  return {
    adminId: 'core-stress-admin',
    admin_id: 'core-stress-admin',
    userId: 'core-stress-admin',
    route: 'main.home',
    updateType: 'stress_test',
    payload: {},
    ...extra
  };
}
async function ensureStressPost() {
  await postRegistry.ensure();
  return postRegistry.upsertPost(stressCtx(), {
    channelId: 'core-stress-channel',
    channelTitle: 'Stress test channel',
    postId: 'core-stress-post',
    postTitle: 'Stress test post',
    postPreview: 'Synthetic post for Core stress-test. It is cleaned after run.',
    source: 'stress_test',
    meta: { stressTest: true, runtimeVersion: RUNTIME, at: new Date().toISOString() }
  });
}
async function cleanupStressData() {
  await db.init();
  const deleted = [];
  for (const sql of [
    "delete from ak_post_lead_magnets where admin_id='core-stress-admin' or post_id='core-stress-post'",
    "delete from ak_post_buttons where admin_id='core-stress-admin' or post_id='core-stress-post'",
    "delete from ak_posts where admin_id='core-stress-admin' or source='stress_test' or post_id='core-stress-post'",
    "delete from ak_admin_sessions where admin_id='core-stress-admin'"
  ]) {
    try { const r = await db.query(sql); deleted.push({ sql: sql.split(' where ')[0], rowCount: r.rowCount || 0 }); }
    catch (error) { deleted.push({ sql: sql.split(' where ')[0], error: error?.message || String(error) }); }
  }
  return deleted;
}
async function run(options = {}) {
  const startedAt = new Date().toISOString();
  const tests = [];
  const seed = String(options.seed || '1') !== '0';
  const cleanup = String(options.cleanup || '1') !== '0';

  tests.push(await step('self.sectionRegistry', async () => sectionRegistry.selfTest()));
  tests.push(await step('self.accessManager', async () => accessManager.selfTest ? accessManager.selfTest() : { ok: true, note: 'no selfTest' }));
  tests.push(await step('self.menuRenderer', async () => menuRenderer.selfTest()));
  tests.push(await step('self.postRegistry', async () => postRegistry.selfTest()));
  tests.push(await step('self.postAddonManager.ensure', async () => { await postAddonManager.ensure(); return { ok: true }; }));
  tests.push(await step('self.flowDefinitions', async () => flowDefinitions.selfTest ? flowDefinitions.selfTest() : { ok: true, note: 'no selfTest' }));
  tests.push(await step('self.flowEngine', async () => flowEngine.selfTest()));
  tests.push(await step('self.routeDispatcher', async () => routeDispatcher.selfTest()));

  if (seed) tests.push(await step('db.seedStressPost', async () => ensureStressPost()));

  tests.push(await step('dispatch.main.home', async () => {
    const screen = await routeDispatcher.dispatch(stressCtx({ route: 'main.home' }));
    return { screen: assertScreen(screen, 'main.home') };
  }));

  for (const section of sectionRegistry.listAll()) {
    const route = section.routes?.home || `${section.id}.home`;
    tests.push(await step(`dispatch.section.${section.id}`, async () => {
      const screen = await routeDispatcher.dispatch(stressCtx({ route, payload: { sectionId: section.id } }));
      return { route, screen: assertScreen(screen, route) };
    }));
  }

  tests.push(await step('dispatch.lead_magnets.select_channel', async () => {
    const screen = await routeDispatcher.dispatch(stressCtx({ route: 'lead_magnets.select_channel', payload: { channelId: 'core-stress-channel', channelTitle: 'Stress test channel' } }));
    return { screen: assertScreen(screen, 'lead_magnets.select_channel') };
  }));

  tests.push(await step('dispatch.lead_magnets.post', async () => {
    const screen = await routeDispatcher.dispatch(stressCtx({ route: 'lead_magnets.post', payload: { channelId: 'core-stress-channel', channelTitle: 'Stress test channel', postId: 'core-stress-post', postTitle: 'Stress test post' } }));
    return { screen: assertScreen(screen, 'lead_magnets.post') };
  }));

  tests.push(await step('dispatch.lead_magnets.add', async () => {
    const screen = await routeDispatcher.dispatch(stressCtx({ route: 'lead_magnets.add', payload: { channelId: 'core-stress-channel', channelTitle: 'Stress test channel', postId: 'core-stress-post', postTitle: 'Stress test post' } }));
    return { screen: assertScreen(screen, 'lead_magnets.add') };
  }));

  if (cleanup) tests.push(await step('db.cleanupStressData', async () => ({ deleted: await cleanupStressData() })));

  const failed = tests.filter((x) => x.ok === false || x.ok === undefined || x.resultOk === false);
  const slow = tests.filter((x) => Number(x.ms || 0) > Number(options.slowMs || 700));
  return {
    ok: failed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    startedAt,
    durationMs: now() - Date.parse(startedAt),
    summary: { total: tests.length, failed: failed.length, slow: slow.length, seed, cleanup },
    failed,
    slow: slow.map((x) => ({ name: x.name, ms: x.ms })),
    tests,
    cleanupNote: cleanup ? 'stress data cleaned from ak_posts/ak_post_buttons/ak_post_lead_magnets/ak_admin_sessions' : 'cleanup disabled by query param'
  };
}
function selfTest() { return { ok: true, runtimeVersion: RUNTIME, endpoint: '/debug/core-stress', noUserUxPollution: true, cleansStressData: true }; }
module.exports = { RUNTIME, run, selfTest };
